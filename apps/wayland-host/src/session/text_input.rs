//! text-input-v3: how an app's text field tells the display about itself,
//! and how text that isn't key presses reaches it (a phone's keyboard:
//! composed words, swipe typing, autocorrect).
//!
//! The host speaks the protocol itself. smithay's `text_input` only relays
//! to an input-method-v2 client, and a session has none: the input method is
//! the tab's hidden input, over the control socket. For the field with the
//! keyboard, each state its app commits (enabled, purpose and hints, the text
//! around the cursor with the cursor and anchor, the cursor's rectangle) goes
//! to the backend as `text_input`, and the tab's `text_edit` comes back as
//! `delete_surrounding_text`, `commit_string` and `preedit_string`, then
//! `done` with the serial the app expects. Text-input focus follows the
//! keyboard's, on Wayland surfaces only: X11 apps get none.
//!
//! The text never reaches a log: refusals say what was wrong, not what was
//! sent.

use std::mem;

use smithay::reexports::wayland_protocols::wp::text_input::zv3::server::{
    zwp_text_input_manager_v3::{self, ZwpTextInputManagerV3},
    zwp_text_input_v3::{self, ZwpTextInputV3},
};
use smithay::reexports::wayland_server::backend::ClientId;
use smithay::reexports::wayland_server::protocol::wl_surface::WlSurface;
use smithay::reexports::wayland_server::{Client, DataInit, Dispatch, DisplayHandle, GlobalDispatch, New, Resource, WEnum};

use super::{KeyboardFocus, Role, SessionState};
use crate::protocol::{Outbound, TextDelete, TextInputInfo, TextPreedit, TextRect, MAX_TEXT_INPUT_BYTES};

/// The purposes a field may have, by their value in the protocol.
const PURPOSES: [&str; 14] = [
    "normal", "alpha", "digits", "number", "phone", "url", "email", "name", "password", "pin", "date", "time",
    "datetime", "terminal",
];

/// The content hints, by bit.
const HINTS: [&str; 10] = [
    "completion",
    "spellcheck",
    "auto_capitalization",
    "lowercase",
    "uppercase",
    "titlecase",
    "hidden_text",
    "sensitive_data",
    "latin",
    "multiline",
];

/// What changed the text last, by value.
const CAUSES: [&str; 2] = ["input_method", "other"];

/// The text around the cursor, with the cursor and the selection's anchor as
/// byte offsets on character boundaries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Surrounding {
    text: String,
    cursor: u32,
    anchor: u32,
}

impl Surrounding {
    /// Offsets past either end, or inside a character, are pulled back to
    /// the nearest boundary before them.
    fn new(text: String, cursor: i32, anchor: i32) -> Surrounding {
        let cursor = boundary(&text, cursor);
        let anchor = boundary(&text, anchor);
        Surrounding { text, cursor, anchor }
    }

    /// Bytes before the selection and after it: what a delete can reach.
    fn room(&self) -> (u32, u32) {
        let start = self.cursor.min(self.anchor);
        let end = self.cursor.max(self.anchor);
        (start, self.text.len() as u32 - end)
    }
}

fn boundary(text: &str, at: i32) -> u32 {
    let mut at = (at.max(0) as usize).min(text.len());
    while !text.is_char_boundary(at) {
        at -= 1;
    }
    at as u32
}

/// A field's state as its app last committed it.
#[derive(Debug, Default, Clone, PartialEq)]
pub(super) struct Committed {
    pub enabled: bool,
    pub surrounding: Option<Surrounding>,
    pub hint: u32,
    pub purpose: u32,
    pub rect: Option<TextRect>,
    /// What changed the text in this commit: 0 the input method, 1 anything
    /// else.
    pub cause: u32,
}

#[derive(Debug, Default)]
struct Pending {
    enable: Option<bool>,
    surrounding: Option<Surrounding>,
    content: Option<(u32, u32)>,
    rect: Option<TextRect>,
    cause: Option<u32>,
}

/// One text input's state, apart from its Wayland object. Every request but
/// `commit` is double-buffered: it waits until the app commits.
#[derive(Debug, Default)]
pub(super) struct Field {
    pending: Pending,
    pub current: Committed,
    /// Commit requests so far, applied or not: the serial `done` carries.
    pub commits: u32,
}

impl Field {
    pub fn enable(&mut self, on: bool) {
        self.pending.enable = Some(on);
    }

    pub fn set_surrounding(&mut self, text: String, cursor: i32, anchor: i32) {
        self.pending.surrounding = Some(Surrounding::new(text, cursor, anchor));
    }

    pub fn set_content(&mut self, hint: u32, purpose: u32) {
        self.pending.content = Some((hint, purpose));
    }

    pub fn set_rect(&mut self, rect: TextRect) {
        self.pending.rect = Some(rect);
    }

    pub fn set_cause(&mut self, cause: u32) {
        self.pending.cause = Some(cause);
    }

    /// An enable is waiting for the next commit.
    pub fn enabling(&self) -> bool {
        self.pending.enable == Some(true)
    }

    /// The app's commit. It always counts toward the serial; its state
    /// applies only when `apply` (the field has text-input focus). An enable
    /// or a disable starts over from the initial state, then the commit's own
    /// values apply; the change cause holds for this commit only.
    pub fn commit(&mut self, apply: bool) {
        self.commits = self.commits.wrapping_add(1);
        let p = mem::take(&mut self.pending);
        if !apply {
            return;
        }
        if let Some(enabled) = p.enable {
            self.current = Committed { enabled, ..Committed::default() };
        }
        if let Some(s) = p.surrounding {
            self.current.surrounding = Some(s);
        }
        if let Some((hint, purpose)) = p.content {
            self.current.hint = hint;
            self.current.purpose = purpose;
        }
        if let Some(rect) = p.rect {
            self.current.rect = Some(rect);
        }
        self.current.cause = p.cause.unwrap_or(0);
    }

    /// Focus left the field: it starts over, as after a disable. The serial
    /// goes on counting.
    pub fn reset(&mut self) {
        self.pending = Pending::default();
        self.current = Committed::default();
    }
}

/// What the backend hears about a field in `toplevel`, its rectangle moved
/// by `offset` from the focused surface into the toplevel's coordinates.
pub(super) fn info(toplevel: u32, offset: (i32, i32), field: &Committed) -> TextInputInfo {
    if !field.enabled {
        return TextInputInfo::disabled(toplevel);
    }
    let name = |names: &[&str], i: u32| names.get(i as usize).copied().unwrap_or(names[0]).to_string();
    let hints = HINTS
        .iter()
        .enumerate()
        .filter(|(bit, _)| field.hint & (1 << bit) != 0)
        .map(|(_, n)| n.to_string())
        .collect();
    let s = field.surrounding.as_ref();
    TextInputInfo {
        toplevel,
        enabled: true,
        purpose: name(&PURPOSES, field.purpose),
        hints,
        text: s.map(|s| s.text.clone()),
        cursor: s.map_or(0, |s| s.cursor),
        anchor: s.map_or(0, |s| s.anchor),
        rect: field.rect.map(|r| TextRect { x: r.x.saturating_add(offset.0), y: r.y.saturating_add(offset.1), ..r }),
        cause: name(&CAUSES, field.cause),
    }
}

/// One event an edit from the tab becomes, before `done`.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Event {
    Delete(u32, u32),
    Commit(String),
    Preedit(String, i32, i32),
}

/// Why an edit from the tab was refused.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Refused {
    TooLong,
    /// A NUL byte, which a Wayland string can't carry.
    Nul,
}

/// The events an edit becomes, in the order the app applies them: the
/// delete, then the commit, then the new preedit. Empty parts are left out
/// (the preedit clears itself on `done`). A delete is cut to what lies
/// around the selection, when the app said what does. A preedit cursor
/// outside the text, or inside a character, goes to its end.
pub(super) fn edit_events(
    commit: Option<String>,
    preedit: Option<TextPreedit>,
    delete: Option<TextDelete>,
    surrounding: Option<&Surrounding>,
) -> Result<Vec<Event>, Refused> {
    for text in [commit.as_deref(), preedit.as_ref().map(|p| p.text.as_str())].into_iter().flatten() {
        if text.len() > MAX_TEXT_INPUT_BYTES {
            return Err(Refused::TooLong);
        }
        if text.contains('\0') {
            return Err(Refused::Nul);
        }
    }
    let mut events = Vec::new();
    if let Some(TextDelete { before, after }) = delete {
        let limit = MAX_TEXT_INPUT_BYTES as u32;
        let (room_before, room_after) = surrounding.map_or((limit, limit), Surrounding::room);
        let (before, after) = (before.min(room_before), after.min(room_after));
        if before > 0 || after > 0 {
            events.push(Event::Delete(before, after));
        }
    }
    if let Some(text) = commit.filter(|t| !t.is_empty()) {
        events.push(Event::Commit(text));
    }
    if let Some(p) = preedit.filter(|p| !p.text.is_empty()) {
        let end = p.text.len() as i32;
        let cursor = |c: Option<i32>| match c {
            Some(-1) => -1,
            Some(c) if c >= 0 && c <= end && p.text.is_char_boundary(c as usize) => c,
            _ => end,
        };
        let (begin, end) = (cursor(p.cursor_begin), cursor(p.cursor_end));
        events.push(Event::Preedit(p.text, begin, end));
    }
    Ok(events)
}

/// A client's text input: its object, its field, and the surface it was
/// sent `enter` for, until `leave`.
struct Instance {
    resource: ZwpTextInputV3,
    field: Field,
    entered: Option<WlSurface>,
}

/// The session's text inputs.
#[derive(Default)]
pub(super) struct TextInputs {
    instances: Vec<Instance>,
    /// The surface text-input focus is on: the keyboard's, when that is a
    /// Wayland surface.
    focus: Option<WlSurface>,
    /// What the backend was last told.
    sent: Option<TextInputInfo>,
    /// Something changed since then.
    dirty: bool,
}

impl SessionState {
    /// The text-input global, one of the session's.
    pub(super) fn create_text_input_global(dh: &DisplayHandle) {
        dh.create_global::<SessionState, ZwpTextInputManagerV3, _>(1, ());
    }

    /// The enabled text input on the focused surface.
    fn active_text_input(&self) -> Option<&Instance> {
        let focus = self.text_inputs.focus.as_ref()?;
        self.text_inputs
            .instances
            .iter()
            .find(|t| t.field.current.enabled && t.entered.as_ref() == Some(focus))
    }

    /// The toplevel a window's surface belongs to, and the offset from that
    /// surface's coordinates to the toplevel's: a popup's position plus the
    /// parent's geometry, less its own geometry, up the chain.
    fn text_input_owner(&self, surface: &WlSurface) -> Option<(u32, (i32, i32))> {
        let mut i = self.index_of_root(surface)?;
        let mut offset = (0, 0);
        // A chain is short; the bound guards against a cycle.
        for _ in 0..64 {
            let w = &self.windows[i];
            match &w.role {
                Role::Toplevel { .. } => return Some((w.id, offset)),
                Role::Popup { parent, position, .. } => {
                    let own = w.whole_geometry();
                    let p = self.index_of(*parent)?;
                    let theirs = self.windows[p].whole_geometry();
                    offset.0 = offset
                        .0
                        .saturating_add(position.0.saturating_sub(own.x).saturating_add(theirs.x));
                    offset.1 = offset
                        .1
                        .saturating_add(position.1.saturating_sub(own.y).saturating_add(theirs.y));
                    i = p;
                }
            }
        }
        None
    }

    fn text_input_created(&mut self, resource: ZwpTextInputV3) {
        let mut entered = None;
        // An app that binds after its surface has the keyboard hears at once.
        if let Some(focus) = &self.text_inputs.focus {
            if resource.id().same_client_as(&focus.id()) {
                resource.enter(focus);
                entered = Some(focus.clone());
            }
        }
        self.text_inputs.instances.push(Instance { resource, field: Field::default(), entered });
    }

    fn text_input_request(&mut self, resource: &ZwpTextInputV3, request: zwp_text_input_v3::Request) {
        let ti = &mut self.text_inputs;
        let Some(i) = ti.instances.iter().position(|t| &t.resource == resource) else {
            return;
        };
        let field = &mut ti.instances[i].field;
        match request {
            zwp_text_input_v3::Request::Enable => field.enable(true),
            zwp_text_input_v3::Request::Disable => field.enable(false),
            zwp_text_input_v3::Request::SetSurroundingText { text, cursor, anchor } => {
                field.set_surrounding(text, cursor, anchor)
            }
            // An unknown cause is the default: the input method.
            zwp_text_input_v3::Request::SetTextChangeCause { cause: WEnum::Value(c) } => field.set_cause(u32::from(c)),
            zwp_text_input_v3::Request::SetContentType { hint, purpose } => {
                let hint = match hint {
                    WEnum::Value(h) => h.bits(),
                    WEnum::Unknown(bits) => bits,
                };
                let purpose = match purpose {
                    WEnum::Value(p) => u32::from(p),
                    WEnum::Unknown(_) => 0,
                };
                field.set_content(hint, purpose);
            }
            zwp_text_input_v3::Request::SetCursorRectangle { x, y, width, height } => {
                field.set_rect(TextRect { x, y, width, height })
            }
            zwp_text_input_v3::Request::Commit => {
                // Requests are ignored after `leave` until the next `enter`,
                // and only one text input of the seat may be enabled.
                let focused = ti.instances[i].entered.is_some() && ti.instances[i].entered == ti.focus;
                let taken = ti.instances.iter().enumerate().any(|(j, t)| j != i && t.field.current.enabled);
                let field = &mut ti.instances[i].field;
                let refused = field.enabling() && taken;
                field.commit(focused && !refused);
                ti.dirty = true;
            }
            _ => {}
        }
    }

    fn text_input_destroyed(&mut self, resource: &ZwpTextInputV3) {
        self.text_inputs.instances.retain(|t| &t.resource != resource);
        self.text_inputs.dirty = true;
    }

    /// Text-input focus follows the keyboard: the instances of the app that
    /// lost it hear `leave` and start over, and those of the app that has it
    /// now hear `enter`. Called after every keyboard focus change.
    pub(super) fn text_input_follow_keyboard(&mut self) {
        let focus = match self.keyboard.current_focus() {
            Some(KeyboardFocus::Wayland(s)) if s.is_alive() => Some(s),
            _ => None,
        };
        let ti = &mut self.text_inputs;
        if ti.focus == focus {
            return;
        }
        if let Some(old) = ti.focus.take() {
            for t in ti.instances.iter_mut().filter(|t| t.entered.as_ref() == Some(&old)) {
                if old.is_alive() {
                    t.resource.leave(&old);
                }
                t.entered = None;
                t.field.reset();
            }
        }
        if let Some(new) = &focus {
            for t in ti.instances.iter_mut().filter(|t| t.resource.id().same_client_as(&new.id())) {
                t.resource.enter(new);
                t.entered = Some(new.clone());
            }
        }
        ti.focus = focus;
        ti.dirty = true;
    }

    /// The tab's hidden input changed the text of the field in `toplevel`.
    /// Dropped when that field no longer has text-input focus, or the edit is
    /// malformed.
    pub fn text_edit(
        &mut self,
        toplevel: u32,
        commit: Option<String>,
        preedit: Option<TextPreedit>,
        delete: Option<TextDelete>,
    ) {
        let Some(focus) = self.text_inputs.focus.clone() else {
            return;
        };
        if self.text_input_owner(&focus).map(|(t, _)| t) != Some(toplevel) {
            return;
        }
        let Some(t) = self.active_text_input() else {
            return;
        };
        let events = match edit_events(commit, preedit, delete, t.field.current.surrounding.as_ref()) {
            Ok(events) => events,
            Err(why) => {
                eprintln!("wayland-host: refused a text edit: {why:?}");
                return;
            }
        };
        for event in events {
            match event {
                Event::Delete(before, after) => t.resource.delete_surrounding_text(before, after),
                Event::Commit(text) => t.resource.commit_string(Some(text)),
                Event::Preedit(text, begin, end) => t.resource.preedit_string(Some(text), begin, end),
            }
        }
        t.resource.done(t.field.commits);
    }

    /// A tab took the session back: the field's state goes again.
    pub(super) fn text_input_resync(&mut self) {
        self.text_inputs.sent = None;
        self.text_inputs.dirty = true;
    }

    /// Tell the backend the field with text-input focus, when it changed
    /// since the last time: called once per round of events, so a disable
    /// and an enable in the same round (focus moving between two fields)
    /// arrive as the new field alone.
    pub fn flush_text_input(&mut self) {
        if !mem::take(&mut self.text_inputs.dirty) {
            return;
        }
        let now = self.active_text_input().and_then(|t| {
            let focus = self.text_inputs.focus.as_ref()?;
            let (toplevel, offset) = self.text_input_owner(focus)?;
            Some(info(toplevel, offset, &t.field.current))
        });
        let info = match (now, &self.text_inputs.sent) {
            (Some(info), _) => info,
            (None, Some(sent)) if sent.enabled => TextInputInfo::disabled(sent.toplevel),
            (None, _) => return,
        };
        if self.text_inputs.sent.as_ref() == Some(&info) {
            return;
        }
        self.text_inputs.sent = Some(info.clone());
        self.outbox.push(Outbound::TextInput { session: self.id.clone(), info });
    }
}

impl GlobalDispatch<ZwpTextInputManagerV3, ()> for SessionState {
    fn bind(
        _state: &mut Self,
        _dh: &DisplayHandle,
        _client: &Client,
        resource: New<ZwpTextInputManagerV3>,
        _data: &(),
        data_init: &mut DataInit<'_, Self>,
    ) {
        data_init.init(resource, ());
    }
}

impl Dispatch<ZwpTextInputManagerV3, ()> for SessionState {
    fn request(
        state: &mut Self,
        _client: &Client,
        _manager: &ZwpTextInputManagerV3,
        request: zwp_text_input_manager_v3::Request,
        _data: &(),
        _dh: &DisplayHandle,
        data_init: &mut DataInit<'_, Self>,
    ) {
        // A session has one seat, so the seat it names is that one.
        if let zwp_text_input_manager_v3::Request::GetTextInput { id, .. } = request {
            let resource = data_init.init(id, ());
            state.text_input_created(resource);
        }
    }
}

impl Dispatch<ZwpTextInputV3, ()> for SessionState {
    fn request(
        state: &mut Self,
        _client: &Client,
        resource: &ZwpTextInputV3,
        request: zwp_text_input_v3::Request,
        _data: &(),
        _dh: &DisplayHandle,
        _data_init: &mut DataInit<'_, Self>,
    ) {
        state.text_input_request(resource, request);
    }

    fn destroyed(state: &mut Self, _client: ClientId, resource: &ZwpTextInputV3, _data: &()) {
        state.text_input_destroyed(resource);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: i32, y: i32) -> TextRect {
        TextRect { x, y, width: 2, height: 18 }
    }

    /// An app focusing an email field, as GTK does: enable, then the field's
    /// state, then one commit.
    fn email_field() -> Field {
        let mut f = Field::default();
        f.enable(true);
        f.set_content(0x1 | 0x2, 6);
        f.set_surrounding("ana@".into(), 4, 4);
        f.set_rect(rect(30, 4));
        f.commit(true);
        f
    }

    #[test]
    fn requests_wait_for_the_commit() {
        let mut f = email_field();
        f.set_surrounding("ana@ex".into(), 6, 6);
        assert_eq!(f.current.surrounding.as_ref().map(|s| s.cursor), Some(4));
        f.commit(true);
        assert_eq!(f.current.surrounding.as_ref().map(|s| s.cursor), Some(6));
        // Content type and rectangle stay until the next enable or disable.
        assert_eq!((f.current.purpose, f.current.rect), (6, Some(rect(30, 4))));
    }

    #[test]
    fn an_enable_starts_the_field_over() {
        let mut f = email_field();
        f.enable(true);
        f.set_content(0, 0);
        f.commit(true);
        assert!(f.current.enabled);
        assert_eq!((f.current.surrounding.clone(), f.current.rect), (None, None));
        f.enable(false);
        f.commit(true);
        assert_eq!(f.current, Committed::default());
    }

    #[test]
    fn every_commit_counts_toward_the_serial_applied_or_not() {
        let mut f = email_field();
        f.set_surrounding("ignored".into(), 1, 1);
        // Without text-input focus: counted, not applied.
        f.commit(false);
        assert_eq!(f.commits, 2);
        assert_eq!(f.current.surrounding.as_ref().map(|s| s.text.as_str()), Some("ana@"));
        // And the ignored state doesn't come back with the next commit.
        f.commit(true);
        assert_eq!(f.current.surrounding.as_ref().map(|s| s.text.as_str()), Some("ana@"));
        assert_eq!(f.commits, 3);
    }

    #[test]
    fn the_change_cause_holds_for_one_commit() {
        let mut f = email_field();
        f.set_cause(1);
        f.commit(true);
        assert_eq!(f.current.cause, 1);
        f.commit(true);
        assert_eq!(f.current.cause, 0);
    }

    #[test]
    fn offsets_land_on_character_boundaries_inside_the_text() {
        // "ș" is two bytes: 2 is inside it.
        let s = Surrounding::new("aș".into(), 2, 99);
        assert_eq!((s.cursor, s.anchor), (1, 3));
        assert_eq!(Surrounding::new("x".into(), -4, 0).cursor, 0);
    }

    #[test]
    fn the_state_names_purpose_and_hints_in_the_toplevels_coordinates() {
        let mut f = email_field();
        f.set_cause(1);
        f.commit(true);
        let i = info(7, (12, -3), &f.current);
        assert_eq!(
            i,
            TextInputInfo {
                toplevel: 7,
                enabled: true,
                purpose: "email".into(),
                hints: vec!["completion".into(), "spellcheck".into()],
                text: Some("ana@".into()),
                cursor: 4,
                anchor: 4,
                rect: Some(TextRect { x: 42, y: 1, width: 2, height: 18 }),
                cause: "other".into(),
            }
        );
        let mut secret = Field::default();
        secret.enable(true);
        secret.set_content(0x40 | 0x80 | 0x200 | 0x8000, 8);
        secret.commit(true);
        let i = info(7, (0, 0), &secret.current);
        assert_eq!((i.purpose.as_str(), i.text, i.rect), ("password", None, None));
        // Unknown bits are left out.
        assert_eq!(i.hints, ["hidden_text", "sensitive_data", "multiline"]);
        assert_eq!(info(7, (0, 0), &Committed::default()), TextInputInfo::disabled(7));
    }

    #[test]
    fn an_edit_becomes_delete_commit_and_preedit_in_that_order() {
        let preedit = |text: &str, b, e| Some(TextPreedit { text: text.into(), cursor_begin: b, cursor_end: e });
        let surrounding = Surrounding::new("helo wor".into(), 8, 8);
        // Autocorrect: the last word goes, the right one comes, and the
        // next word is still being composed.
        assert_eq!(
            edit_events(
                Some("hello ".into()),
                preedit("wor", None, None),
                Some(TextDelete { before: 5, after: 0 }),
                Some(&surrounding)
            ),
            Ok(vec![Event::Delete(5, 0), Event::Commit("hello ".into()), Event::Preedit("wor".into(), 3, 3)])
        );
        // Empty parts send nothing; an empty edit is a bare `done`, which
        // clears the preedit.
        assert_eq!(
            edit_events(Some(String::new()), preedit("", Some(0), Some(0)), Some(TextDelete { before: 0, after: 0 }), None),
            Ok(vec![])
        );
        // The cursor: hidden, inside a character, past the end.
        assert_eq!(edit_events(None, preedit("ș", Some(-1), Some(-1)), None, None), Ok(vec![Event::Preedit("ș".into(), -1, -1)]));
        assert_eq!(edit_events(None, preedit("ș", Some(1), Some(9)), None, None), Ok(vec![Event::Preedit("ș".into(), 2, 2)]));
    }

    #[test]
    fn a_delete_reaches_no_further_than_the_text_around_the_selection() {
        // "ab[cd]ef": two bytes before the selection, two after.
        let s = Surrounding::new("abcdef".into(), 4, 2);
        assert_eq!(
            edit_events(None, None, Some(TextDelete { before: 9, after: 9 }), Some(&s)),
            Ok(vec![Event::Delete(2, 2)])
        );
        // Without the app's text, up to the limit.
        assert_eq!(
            edit_events(None, None, Some(TextDelete { before: 99_999, after: 1 }), None),
            Ok(vec![Event::Delete(4000, 1)])
        );
    }

    #[test]
    fn an_edit_over_the_limit_or_with_a_nul_is_refused() {
        let long = "ă".repeat(2001);
        assert_eq!(edit_events(Some(long), None, None, None), Err(Refused::TooLong));
        assert_eq!(edit_events(Some("a\0b".into()), None, None, None), Err(Refused::Nul));
        let preedit = Some(TextPreedit { text: "\0".into(), cursor_begin: None, cursor_end: None });
        assert_eq!(edit_events(None, preedit, None, None), Err(Refused::Nul));
        assert!(edit_events(Some("a".repeat(4000)), None, None, None).is_ok());
    }
}
