//! X11 apps in a session: the X display reserved for them, Xwayland once the
//! first one connects, and the window manager that makes their windows the
//! session's windows, as Wayland apps' are. An X11 window becomes a toplevel
//! (an OS window: title, move, resize, close, focus, keys and the mouse); an
//! override-redirect one (a menu, a tooltip) becomes a popup of the X11
//! window it belongs to.
//!
//! Xwayland is one more Wayland client of the session, inserted by smithay.
//! Its X11 side runs on the session's own event loop (`handle`), whose data
//! is this session's state: smithay's window manager needs a loop of the type
//! that handles it, and the host's main loop is the host's. main.rs
//! dispatches that loop whenever it has events.
//!
//! The window manager also bridges the clipboard: an X11 app's `CLIPBOARD`
//! becomes the session's selection, and the session's (the tab's text or a
//! Wayland app's) becomes `CLIPBOARD` for X11 apps. Plain text only;
//! `PRIMARY` stays between X11 apps.

use std::mem;
use std::net::Shutdown;
use std::os::fd::{AsRawFd, OwnedFd};
use std::os::unix::net::UnixStream;
use std::process::Stdio;
use std::rc::Rc;

use smithay::delegate_xwayland_shell;
use smithay::reexports::calloop::generic::Generic;
use smithay::reexports::calloop::{Interest, LoopHandle, Mode, PostAction, RegistrationToken};
use smithay::reexports::wayland_server::protocol::wl_surface::WlSurface;
use smithay::reexports::wayland_server::Client;
use smithay::utils::{Logical, Point, Rectangle, Size};
use smithay::wayland::selection::SelectionTarget;
use smithay::wayland::xwayland_shell::{XWaylandShellHandler, XWaylandShellState};
use smithay::xwayland::xwm::{Reorder, ResizeEdge, WmWindowProperty, XwmId};
use smithay::xwayland::{X11Surface, X11Wm, XWayland, XWaylandEvent, XwmHandler};

use super::{PopupShell, Role, SessionState, ToplevelShell, Window};
use crate::clipboard::{text_mime, X11_OFFERED_MIME_TYPES};
use crate::protocol::Decorations;
use crate::xwayland::{set_inherited, Reservation, XwaylandConfig};

fn log(msg: &str) {
    eprintln!("wayland-host: {msg}");
}

/// A session's X11 side.
pub struct X11 {
    config: Option<Rc<XwaylandConfig>>,
    /// The session's own event loop, for Xwayland and its window manager.
    handle: Option<LoopHandle<'static, SessionState>>,
    /// The display the session's apps were given (`DISPLAY=:<n>`). It stays
    /// the same while the session lives, through Xwayland's restarts.
    display: Option<u32>,
    stage: Stage,
    /// Windows the window manager mapped, until Xwayland gives each its
    /// surface.
    managed: Vec<X11Surface>,
    /// The session is closing: Xwayland going away isn't waited for again.
    closing: bool,
}

enum Stage {
    /// No display: X11 is off, or none was free.
    Idle,
    /// The display is reserved and nothing runs. The first X client starts
    /// Xwayland.
    Waiting {
        reservation: Reservation,
        token: RegistrationToken,
    },
    /// Xwayland is starting (`wm` is None) or running.
    Running {
        /// The XWayland source in the session's loop. Removing it drops
        /// smithay's handle, which cuts Xwayland's Wayland connection and
        /// removes the display's lock file and socket.
        xwayland: RegistrationToken,
        client: Client,
        wm: Option<X11Wm>,
        /// The window manager's X11 connection, to shut it when the session
        /// closes.
        conn: Option<UnixStream>,
    },
}

impl X11 {
    pub fn new(x11: Option<(Rc<XwaylandConfig>, LoopHandle<'static, SessionState>)>) -> X11 {
        let (config, handle) = match x11 {
            Some((c, h)) => (Some(c), Some(h)),
            None => (None, None),
        };
        X11 {
            config,
            handle,
            display: None,
            stage: Stage::Idle,
            managed: Vec::new(),
            closing: false,
        }
    }
}

impl SessionState {
    /// The X display X11 apps of this session use, if it has one.
    pub fn x11_display(&self) -> Option<u32> {
        self.x11.display
    }

    /// Reserve the session's X display (`only`: the one its apps already
    /// have) and wait for an X client on it.
    pub(super) fn x11_reserve(&mut self, only: Option<u32>) {
        let (Some(config), Some(handle)) = (self.x11.config.clone(), self.x11.handle.clone()) else {
            return;
        };
        let reservation = match Reservation::claim(&config.dirs, only) {
            Ok(r) => r,
            Err(e) => {
                log(&format!("session {}…: no X display for X11 apps: {e}", &self.id[..8]));
                return;
            }
        };
        let watch = match reservation.listener().try_clone() {
            Ok(w) => w,
            Err(e) => {
                log(&format!("cannot watch the X11 socket: {e}"));
                return;
            }
        };
        let source = Generic::new(watch, Interest::READ, Mode::Level);
        match handle.insert_source(source, |_, _, state: &mut SessionState| Ok(state.x11_client_waiting())) {
            Ok(token) => {
                self.x11.display = Some(reservation.display());
                self.x11.stage = Stage::Waiting { reservation, token };
            }
            Err(e) => log(&format!("cannot watch the X11 socket: {}", e.error)),
        }
    }

    /// An X client is waiting on the reserved display: start Xwayland for it.
    /// Without Xwayland installed, the client is refused and the next one
    /// waited for.
    fn x11_client_waiting(&mut self) -> PostAction {
        let Some(config) = self.x11.config.clone() else {
            return PostAction::Remove;
        };
        if !config.binary.exists() {
            if let Stage::Waiting { reservation, .. } = &self.x11.stage {
                reservation.refuse_waiting();
            }
            log("an X11 app tried to connect, but Xwayland isn't installed: it comes with the first app that speaks X11");
            return PostAction::Continue;
        }
        let Stage::Waiting { reservation, .. } = mem::replace(&mut self.x11.stage, Stage::Idle) else {
            return PostAction::Remove;
        };
        let display = reservation.display();
        match self.x11_start(&config, reservation) {
            Ok(()) => log(&format!("session {}…: starting Xwayland on :{display}", &self.id[..8])),
            Err(e) => {
                log(&format!("session {}…: {e}", &self.id[..8]));
                self.x11_reserve_later();
            }
        }
        // This watch's socket now belongs to Xwayland, or a new one waits.
        PostAction::Remove
    }

    fn x11_start(&mut self, config: &XwaylandConfig, reservation: Reservation) -> Result<(), String> {
        let display = reservation.display();
        let handle = self.x11.handle.clone().ok_or("no event loop for X11")?;
        let listener = reservation.into_listener().map_err(|e| e.to_string())?;
        set_inherited(&listener, true).map_err(|e| e.to_string())?;
        let env = config.launch_env(listener.as_raw_fd());
        let spawned = XWayland::spawn(&self.dh, display, env, false, Stdio::null(), Stdio::inherit(), |_| ());
        // Xwayland holds its own copy now, or never started.
        drop(listener);
        let (xwayland, client) = spawned.map_err(|e| format!("cannot start Xwayland: {e}"))?;
        let token = handle
            .insert_source(xwayland, |event, _, state: &mut SessionState| state.x11_xwayland_event(event))
            .map_err(|e| e.error.to_string())?;
        self.x11.stage = Stage::Running {
            xwayland: token,
            client,
            wm: None,
            conn: None,
        };
        Ok(())
    }

    /// Xwayland is up: become its window manager.
    fn x11_xwayland_event(&mut self, event: XWaylandEvent) {
        let XWaylandEvent::Ready { x11_socket, display_number } = event else {
            log("Xwayland exited while starting");
            self.x11_stopped();
            return;
        };
        let (Some(handle), Stage::Running { client, .. }) = (self.x11.handle.clone(), &self.x11.stage) else {
            return;
        };
        let client = client.clone();
        let shutdown = x11_socket.try_clone().ok();
        match X11Wm::start_wm(handle, x11_socket, client) {
            Ok(started) => {
                if let Stage::Running { wm, conn, .. } = &mut self.x11.stage {
                    *wm = Some(started);
                    *conn = shutdown;
                }
                // X11 apps can paste what the session's clipboard already
                // holds.
                if self.clipboard_has_text_for_x11() {
                    self.x11_offer_clipboard(Some(&X11_OFFERED_MIME_TYPES));
                }
                log(&format!("session {}…: Xwayland is ready on :{display_number}", &self.id[..8]));
            }
            Err(e) => {
                log(&format!("cannot manage Xwayland's windows: {e}"));
                self.x11_stopped();
            }
        }
    }

    /// Xwayland is gone: it exited (it does once its last X client leaves),
    /// failed to start, or its window manager's connection closed. Its
    /// windows go, and unless the session is closing, the display is
    /// reserved again for the next X client.
    fn x11_stopped(&mut self) {
        if let Stage::Running { xwayland, wm, conn, .. } = mem::replace(&mut self.x11.stage, Stage::Idle) {
            drop(wm);
            drop(conn);
            if let Some(handle) = &self.x11.handle {
                handle.remove(xwayland);
            }
        }
        self.x11.managed.clear();
        self.x11_clipboard_gone();
        for i in (0..self.windows.len()).rev() {
            if self.windows[i].x11().is_some() {
                self.remove_window(i);
            }
        }
        self.refresh_clients();
        if !self.x11.closing {
            self.x11_reserve_later();
        }
    }

    /// Reserve the display again once this round of events is over: smithay
    /// lets go of its lock file only when its XWayland source is dropped,
    /// which waits for the source's own callback to return.
    fn x11_reserve_later(&mut self) {
        let Some(handle) = self.x11.handle.clone() else { return };
        let display = self.x11.display;
        handle.insert_idle(move |state: &mut SessionState| {
            if !state.x11.closing && matches!(state.x11.stage, Stage::Idle) {
                state.x11_reserve(display);
            }
        });
    }

    /// The session is closing. True while Xwayland's window manager is
    /// connected: its connection is shut, and the caller dispatches the
    /// session's loop until [`Self::x11_wm_closed`], so the window manager's
    /// event source (which holds that loop) goes with it.
    pub fn x11_begin_shutdown(&mut self) -> bool {
        self.x11.closing = true;
        match &self.x11.stage {
            Stage::Running { wm: Some(_), conn: Some(conn), .. } => {
                let _ = conn.shutdown(Shutdown::Both);
                true
            }
            _ => false,
        }
    }

    pub fn x11_wm_closed(&self) -> bool {
        !matches!(self.x11.stage, Stage::Running { wm: Some(_), .. })
    }

    /// Let go of the display and Xwayland, whatever stage they are in.
    pub fn x11_finish_shutdown(&mut self) {
        self.x11.closing = true;
        let handle = self.x11.handle.clone();
        match mem::replace(&mut self.x11.stage, Stage::Idle) {
            Stage::Idle => {}
            Stage::Waiting { reservation, token } => {
                if let Some(h) = &handle {
                    h.remove(token);
                }
                drop(reservation);
            }
            Stage::Running { xwayland, wm, conn, .. } => {
                drop(wm);
                drop(conn);
                if let Some(h) = &handle {
                    h.remove(xwayland);
                }
            }
        }
    }

    // ── Clipboard ───────────────────────────────────────────────────────

    /// Tell X11 apps what the session's clipboard holds: these text types,
    /// none (`Some(&[])`: not text, an empty `CLIPBOARD` to them), or
    /// nothing at all (None: the window manager lets `CLIPBOARD` go, if it
    /// held it). Never called for an X11 app's own copy, which would take
    /// `CLIPBOARD` from it.
    pub(super) fn x11_offer_clipboard(&mut self, mime_types: Option<&[&str]>) {
        let Stage::Running { wm: Some(wm), .. } = &mut self.x11.stage else {
            return;
        };
        let offer = mime_types.map(|types| types.iter().map(|m| m.to_string()).collect());
        if let Err(e) = wm.new_selection(SelectionTarget::Clipboard, offer) {
            log(&format!("cannot offer the clipboard to X11 apps: {e}"));
            return;
        }
        // smithay only queues the change of owner on the window manager's
        // connection, unsent. Wait until X has made it: a request with a
        // reply, answered only after everything sent before it. A paste key
        // forwarded next then reaches an X11 app after it heard it lost
        // CLIPBOARD; one that still thinks it owns CLIPBOARD (xterm after a
        // selection) pastes its own copy without asking anyone. The request
        // itself (the primary output's name) only reads.
        if let Err(e) = wm.get_randr_primary_output() {
            log(&format!("cannot offer the clipboard to X11 apps: {e}"));
        }
    }

    /// Ask the X11 app holding `CLIPBOARD` to write it into `fd`, in `mime`
    /// (as smithay names its X11 targets). The window manager copies it over
    /// on the session's loop and closes `fd` when done. False when it can't.
    pub(super) fn x11_read_clipboard(&mut self, mime: String, fd: OwnedFd) -> bool {
        let (Some(handle), Stage::Running { wm: Some(wm), .. }) = (self.x11.handle.clone(), &mut self.x11.stage) else {
            return false;
        };
        match wm.send_selection(SelectionTarget::Clipboard, mime, fd, handle) {
            Ok(()) => true,
            Err(e) => {
                log(&format!("cannot read an X11 app's clipboard: {e}"));
                false
            }
        }
    }

    // ── Windows ─────────────────────────────────────────────────────────

    fn index_of_x11(&self, window: &X11Surface) -> Option<usize> {
        self.windows.iter().position(|w| w.x11() == Some(window))
    }

    /// Make an X11 window one of the session's windows, once it is mapped
    /// and Xwayland has given it a surface (either can come first).
    fn x11_adopt(&mut self, window: &X11Surface) {
        let Some(root) = window.wl_surface() else { return };
        if self.index_of_root(&root).is_some() || self.index_of_x11(window).is_some() {
            return;
        }
        let at = window.geometry().loc;
        let role = if window.is_override_redirect() {
            let Some(parent) = self.x11_popup_parent(window) else { return };
            Role::Popup {
                shell: PopupShell::X11(window.clone()),
                parent,
                position: self.x11_relative(parent, at),
                grab: false,
            }
        } else if self.x11.managed.contains(window) {
            Role::Toplevel {
                shell: ToplevelShell::X11(window.clone()),
                title: window.title(),
                app_id: app_id(&window.class()),
                decorations: decorations(window),
                min: limit(window.min_size()),
                max: limit(window.max_size()),
                origin: (at.x, at.y),
            }
        } else {
            return;
        };
        let id = self.new_id();
        self.windows.push(Window::new(id, root, role));
        // Its surface may hold a buffer already: X named the window after
        // Xwayland committed it.
        self.refresh_window(self.windows.len() - 1, &[]);
        self.refresh_clients();
    }

    /// The window an override-redirect window (a menu, a tooltip) belongs
    /// to: the one it says it is transient for, else the X11 window with the
    /// keyboard, else the newest X11 window.
    fn x11_popup_parent(&self, window: &X11Surface) -> Option<u32> {
        let toplevels: Vec<(u32, &X11Surface)> = self
            .windows
            .iter()
            .filter_map(|w| match &w.role {
                Role::Toplevel { shell: ToplevelShell::X11(x), .. } => Some((w.id, x)),
                _ => None,
            })
            .collect();
        if let Some(owner) = window.is_transient_for() {
            let named = toplevels.iter().find(|(_, x)| x.window_id() == owner || x.mapped_window_id() == Some(owner));
            if let Some((id, _)) = named {
                return Some(*id);
            }
        }
        if let Some(focused) = self.focused.filter(|f| toplevels.iter().any(|(id, _)| id == f)) {
            return Some(focused);
        }
        toplevels.last().map(|(id, _)| *id)
    }

    /// A point on the X screen, relative to window `parent`'s top-left there.
    fn x11_relative(&self, parent: u32, at: Point<i32, Logical>) -> (i32, i32) {
        let origin = self
            .index_of(parent)
            .and_then(|i| self.windows[i].x11())
            .map(|x| x.geometry().loc)
            .unwrap_or_default();
        (at.x - origin.x, at.y - origin.y)
    }

    fn x11_forget(&mut self, window: &X11Surface) {
        self.x11.managed.retain(|w| w != window);
        if let Some(i) = self.index_of_x11(window) {
            self.remove_window(i);
            self.refresh_clients();
        }
    }

    /// X stacks the window with the keyboard on top, as the tab shows it, so
    /// its dialogs and menus come up over it.
    pub(super) fn x11_raise_focused(&mut self) {
        let window = self
            .focused
            .and_then(|id| self.index_of(id))
            .and_then(|i| self.windows[i].x11().cloned());
        if let (Some(window), Stage::Running { wm: Some(wm), .. }) = (window, &mut self.x11.stage) {
            let _ = wm.raise_window(&window);
        }
    }

    fn x11_toplevel(&self, window: &X11Surface) -> Option<usize> {
        self.index_of_x11(window).filter(|&i| !self.windows[i].is_popup())
    }
}

/// Move an X11 window to where the tab shows it, keeping its size.
pub(super) fn move_to(window: &X11Surface, at: (i32, i32)) {
    let mut geometry = window.geometry();
    if (geometry.loc.x, geometry.loc.y) != at {
        geometry.loc = at.into();
        let _ = window.configure(geometry);
    }
}

/// Give an X11 window the OS window's size, where the tab shows it.
pub(super) fn resize(window: &X11Surface, origin: (i32, i32), size: (i32, i32), maximized: bool) {
    let _ = window.configure(Rectangle::new(origin.into(), size.into()));
    if window.is_maximized() != maximized {
        let _ = window.set_maximized(maximized);
    }
}

/// An X11 window's app id: its `WM_CLASS` class in lower case, which names
/// its desktop file more often than the instance does (`XTerm` is
/// `xterm.desktop`; Firefox's instance is `Navigator`).
fn app_id(class: &str) -> String {
    class.to_lowercase()
}

/// An X11 window gets the OS title bar unless it asked for no decorations
/// (Motif hints), as apps that draw their own do.
fn decorations(window: &X11Surface) -> Decorations {
    if window.is_decorated() {
        Decorations::Client
    } else {
        Decorations::Server
    }
}

fn limit(size: Option<Size<i32, Logical>>) -> (u32, u32) {
    size.map(|s| (s.w.max(0) as u32, s.h.max(0) as u32)).unwrap_or((0, 0))
}

fn edges(edge: ResizeEdge) -> &'static str {
    match edge {
        ResizeEdge::Top => "n",
        ResizeEdge::Bottom => "s",
        ResizeEdge::Left => "w",
        ResizeEdge::Right => "e",
        ResizeEdge::TopLeft => "nw",
        ResizeEdge::TopRight => "ne",
        ResizeEdge::BottomLeft => "sw",
        ResizeEdge::BottomRight => "se",
    }
}

impl XwmHandler for SessionState {
    fn xwm_state(&mut self, _xwm: XwmId) -> &mut X11Wm {
        match &mut self.x11.stage {
            Stage::Running { wm: Some(wm), .. } => wm,
            _ => panic!("X11 events come only while the window manager runs"),
        }
    }

    fn new_window(&mut self, _xwm: XwmId, _window: X11Surface) {}

    fn new_override_redirect_window(&mut self, _xwm: XwmId, _window: X11Surface) {}

    /// A window asks to be shown: it is, at its own size; where it sits is
    /// the tab's to say (`position`).
    fn map_window_request(&mut self, _xwm: XwmId, window: X11Surface) {
        if window.set_mapped(true).is_err() {
            return;
        }
        let size = window.geometry().size;
        let _ = window.configure(Rectangle::new((0, 0).into(), size));
        if !self.x11.managed.contains(&window) {
            self.x11.managed.push(window.clone());
        }
        self.x11_adopt(&window);
    }

    fn mapped_override_redirect_window(&mut self, _xwm: XwmId, window: X11Surface) {
        self.x11_adopt(&window);
    }

    fn unmapped_window(&mut self, _xwm: XwmId, window: X11Surface) {
        self.x11_forget(&window);
        if !window.is_override_redirect() {
            let _ = window.set_mapped(false);
        }
    }

    fn destroyed_window(&mut self, _xwm: XwmId, window: X11Surface) {
        self.x11_forget(&window);
    }

    /// The app may pick its own size; where it sits is the tab's call.
    fn configure_request(
        &mut self,
        _xwm: XwmId,
        window: X11Surface,
        _x: Option<i32>,
        _y: Option<i32>,
        w: Option<u32>,
        h: Option<u32>,
        _reorder: Option<Reorder>,
    ) {
        let mut geometry = window.geometry();
        if let Some(w) = w {
            geometry.size.w = w.min(16384) as i32;
        }
        if let Some(h) = h {
            geometry.size.h = h.min(16384) as i32;
        }
        let _ = window.configure(geometry);
    }

    /// An override-redirect window (a menu, a tooltip) placed itself.
    fn configure_notify(
        &mut self,
        _xwm: XwmId,
        window: X11Surface,
        geometry: Rectangle<i32, Logical>,
        _above: Option<u32>,
    ) {
        let Some(i) = self.index_of_x11(&window) else { return };
        let Role::Popup { parent, position, .. } = self.windows[i].role else {
            return;
        };
        let now = self.x11_relative(parent, geometry.loc);
        if now != position {
            if let Role::Popup { position, .. } = &mut self.windows[i].role {
                *position = now;
            }
            self.announce_if_mapped(i);
        }
    }

    fn property_notify(&mut self, _xwm: XwmId, window: X11Surface, property: WmWindowProperty) {
        if property == WmWindowProperty::Pid {
            self.refresh_clients();
            return;
        }
        let Some(i) = self.x11_toplevel(&window) else { return };
        let Role::Toplevel { title, app_id: id, decorations: d, min, max, .. } = &mut self.windows[i].role else {
            return;
        };
        let before = (title.clone(), id.clone(), *d, *min, *max);
        match property {
            WmWindowProperty::Title | WmWindowProperty::Class => {
                *title = window.title();
                *id = app_id(&window.class());
            }
            WmWindowProperty::NormalHints => {
                *min = limit(window.min_size());
                *max = limit(window.max_size());
            }
            WmWindowProperty::MotifHints => *d = decorations(&window),
            _ => return,
        }
        let changed = before != (title.clone(), id.clone(), *d, *min, *max);
        if changed {
            self.announce_if_mapped(i);
        }
    }

    fn resize_request(&mut self, _xwm: XwmId, window: X11Surface, _button: u32, edge: ResizeEdge) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "resize", Some(edges(edge).into()));
        }
    }

    fn move_request(&mut self, _xwm: XwmId, window: X11Surface, _button: u32) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "move", None);
        }
    }

    fn maximize_request(&mut self, _xwm: XwmId, window: X11Surface) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "maximize", None);
        }
    }

    fn unmaximize_request(&mut self, _xwm: XwmId, window: X11Surface) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "unmaximize", None);
        }
    }

    fn fullscreen_request(&mut self, _xwm: XwmId, window: X11Surface) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "fullscreen", None);
        }
    }

    fn unfullscreen_request(&mut self, _xwm: XwmId, window: X11Surface) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "unfullscreen", None);
        }
    }

    fn minimize_request(&mut self, _xwm: XwmId, window: X11Surface) {
        if let Some(i) = self.x11_toplevel(&window) {
            self.request_at(i, "minimize", None);
        }
    }

    /// X11 apps may read `CLIPBOARD` from the window manager when it holds
    /// it for the session; `PRIMARY` stays between X11 apps.
    fn allow_selection_access(&mut self, _xwm: XwmId, selection: SelectionTarget) -> bool {
        selection == SelectionTarget::Clipboard
    }

    /// An X11 app pastes the session's clipboard.
    fn send_selection(&mut self, _xwm: XwmId, selection: SelectionTarget, mime_type: String, fd: OwnedFd) {
        if selection == SelectionTarget::Clipboard {
            self.x11_paste(fd, &mime_type);
        }
    }

    /// An X11 app took `CLIPBOARD` (smithay names its text targets as mime
    /// types: `UTF8_STRING` is `text/plain;charset=utf-8`).
    fn new_selection(&mut self, _xwm: XwmId, selection: SelectionTarget, mime_types: Vec<String>) {
        if selection == SelectionTarget::Clipboard {
            self.x11_took_clipboard(text_mime(&mime_types));
        }
    }

    fn cleared_selection(&mut self, _xwm: XwmId, selection: SelectionTarget) {
        if selection == SelectionTarget::Clipboard {
            self.x11_clipboard_gone();
        }
    }

    fn disconnected(&mut self, _xwm: XwmId) {
        self.x11_stopped();
    }
}

impl XWaylandShellHandler for SessionState {
    fn xwayland_shell_state(&mut self) -> &mut XWaylandShellState {
        &mut self.xwayland_shell
    }

    fn surface_associated(&mut self, _xwm: XwmId, _surface: WlSurface, window: X11Surface) {
        self.x11_adopt(&window);
    }
}

delegate_xwayland_shell!(SessionState);

#[cfg(test)]
mod tests {
    use super::{app_id, limit};
    use smithay::utils::Size;

    #[test]
    fn an_x11_app_id_is_its_class_in_lower_case() {
        assert_eq!(app_id("XTerm"), "xterm");
        assert_eq!(app_id("firefox"), "firefox");
        assert_eq!(app_id(""), "");
    }

    #[test]
    fn size_limits_read_as_the_protocol_wants() {
        assert_eq!(limit(None), (0, 0));
        assert_eq!(limit(Some(Size::from((200, 100)))), (200, 100));
    }
}
