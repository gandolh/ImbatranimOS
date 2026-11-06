//! One desktop session (one browser tab): its own Wayland display, globals,
//! output, seat and clients, the X display its X11 apps get (`x11`), and its
//! text fields' state for the tab's hidden input (`text_input`).
//! Nothing here is shared with another session, so a client on tab A's
//! socket can never reach tab B.

mod text_input;
mod x11;

use std::borrow::Cow;
use std::collections::HashMap;
use std::io::PipeReader;
use std::os::fd::OwnedFd;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use smithay::delegate_compositor;
use smithay::delegate_cursor_shape;
use smithay::delegate_data_device;
use smithay::delegate_output;
use smithay::delegate_seat;
use smithay::delegate_shm;
use smithay::delegate_xdg_decoration;
use smithay::delegate_xdg_shell;
use smithay::input::keyboard::{FilterResult, KeyboardHandle, KeyboardTarget, KeysymHandle, ModifiersState, XkbConfig};
use smithay::input::pointer::{
    AxisFrame, ButtonEvent, CursorImageStatus, CursorImageSurfaceData, MotionEvent, PointerHandle,
};
use smithay::input::{Seat, SeatHandler, SeatState};
use smithay::output::{Mode, Output, PhysicalProperties, Scale, Subpixel};
use smithay::reexports::wayland_protocols::xdg::decoration::zv1::server::zxdg_toplevel_decoration_v1::Mode as DecorationMode;
use smithay::reexports::wayland_protocols::xdg::shell::server::xdg_toplevel;
use smithay::reexports::wayland_server::backend::{ClientData, ClientId, DisconnectReason, ObjectId};
use smithay::backend::input::{Axis, AxisSource, ButtonState, KeyState};
use smithay::reexports::wayland_server::protocol::{
    wl_buffer::WlBuffer, wl_output::WlOutput, wl_seat::WlSeat, wl_shm, wl_surface::WlSurface,
};
use smithay::reexports::calloop::LoopHandle;
use smithay::reexports::wayland_server::{Client, DisplayHandle, Resource};
use smithay::utils::{IsAlive, Logical, Point, Rectangle, Serial, Transform, SERIAL_COUNTER};
use smithay::wayland::buffer::BufferHandler;
use smithay::wayland::compositor::{
    get_parent, is_sync_subsurface, send_surface_state, with_states, with_surface_tree_downward,
    with_surface_tree_upward, BufferAssignment, CompositorClientState, CompositorHandler, CompositorState, Damage,
    SubsurfaceCachedState, SurfaceAttributes, SurfaceData, TraversalAction,
};
use smithay::wayland::cursor_shape::CursorShapeManagerState;
use smithay::wayland::fractional_scale::with_fractional_scale;
use smithay::wayland::output::OutputHandler;
use smithay::wayland::selection::data_device::{
    clear_data_device_selection, current_data_device_selection_userdata, request_data_device_client_selection,
    set_data_device_focus, set_data_device_selection, ClientDndGrabHandler, DataDeviceHandler, DataDeviceState,
    ServerDndGrabHandler,
};
use smithay::wayland::selection::{SelectionHandler, SelectionSource, SelectionTarget};
use smithay::wayland::shell::xdg::decoration::{XdgDecorationHandler, XdgDecorationState};
use smithay::wayland::shell::xdg::{
    PopupSurface, PositionerState, SurfaceCachedState, ToplevelSurface, XdgShellHandler, XdgShellState,
    XdgToplevelSurfaceData,
};
use smithay::wayland::shm::{with_buffer_contents, ShmHandler, ShmState};
use smithay::wayland::seat::WaylandFocus;
use smithay::wayland::tablet_manager::TabletSeatHandler;
use smithay::wayland::viewporter::ViewportCachedState;
use smithay::wayland::xwayland_shell::XWaylandShellState;
use smithay::xwayland::{X11Surface, XWaylandClientData};

use crate::clipboard::{
    paste_from, text_mime, HostSelection, PasteFrom, MAX_CLIPBOARD_BYTES, OFFERED_MIME_TYPES, X11_OFFERED_MIME_TYPES,
};
use crate::cursor::{Cursor, Shown};
use crate::pixels::{
    clip_signed, map_rect, output_scale, surface_size, window_scale, Canvas, Encoding, Layer, ShmFormat, SurfaceImage,
};
use crate::protocol::{encode_frame_body, Decorations, Geometry, Outbound, PopupInfo, Rect, ToplevelInfo};
use crate::xwayland::XwaylandConfig;

/// The keyboard layouts the tab may choose (Settings → Linux apps): the id it
/// sends, and the xkb layout and variant that build the keymap. Keys stay
/// physical (the tab sends evdev codes); the layout only decides the
/// characters. Romanian is the standard layout (ș and ț with a comma below).
pub const KEYBOARD_LAYOUTS: &[(&str, &str, &str)] = &[("us", "us", ""), ("ro", "ro", "std")];

/// The layout a session starts with.
pub const DEFAULT_LAYOUT: &str = "us";

/// The xkb names for a layout id, or None for one the host doesn't offer.
pub fn xkb_config(id: &str) -> Option<XkbConfig<'static>> {
    KEYBOARD_LAYOUTS
        .iter()
        .find(|(known, _, _)| *known == id)
        .map(|(_, layout, variant)| XkbConfig { layout, variant, ..XkbConfig::default() })
}

/// Key repeat the host announces (`wl_keyboard.repeat_info`). Apps repeat
/// keys themselves; the browser's own repeats are dropped before they get
/// here.
const REPEAT_DELAY_MS: i32 = 500;
const REPEAT_RATE_HZ: i32 = 25;

/// Per-client data smithay needs, and whether the client has gone.
#[derive(Default)]
pub struct ClientState {
    pub compositor: CompositorClientState,
    gone: AtomicBool,
}

impl ClientData for ClientState {
    fn initialized(&self, _client_id: ClientId) {}
    fn disconnected(&self, _client_id: ClientId, _reason: DisconnectReason) {
        self.gone.store(true, Ordering::Relaxed);
    }
}

/// Who a toplevel is: a Wayland app's xdg toplevel, or an X11 app's window
/// through Xwayland. Both become OS windows the same way.
enum ToplevelShell {
    Xdg(ToplevelSurface),
    X11(X11Surface),
}

/// Who a popup is: an xdg popup, or an X11 override-redirect window (a menu
/// or a tooltip that places itself).
enum PopupShell {
    Xdg(PopupSurface),
    X11(X11Surface),
}

/// What a window is to the app: a toplevel (an OS window) or a popup (a
/// menu, a dropdown, a tooltip) drawn above its parent.
enum Role {
    Toplevel {
        shell: ToplevelShell,
        title: String,
        app_id: String,
        decorations: Decorations,
        min: (u32, u32),
        max: (u32, u32),
        /// Where the tab shows the window geometry's top-left on the output,
        /// as it last said. Popups are kept on screen from it.
        origin: (i32, i32),
    },
    Popup {
        shell: PopupShell,
        /// The window (toplevel or popup) it opened from.
        parent: u32,
        /// Its window geometry's top-left, relative to the parent's.
        position: (i32, i32),
        /// It holds an explicit grab, so it has the keyboard.
        grab: bool,
    },
}

/// A toplevel or a popup: one root surface, its subsurfaces, and the image
/// the host sends for them.
struct Window {
    id: u32,
    root: WlSurface,
    role: Role,
    /// Its image's size in surface coordinates: the root surface's.
    size: (u32, u32),
    /// Image pixels per surface coordinate: the root surface's own scale (2
    /// when an app draws for a scale-2 output, 1 for one that doesn't). The
    /// canvas is `size × scale` pixels.
    scale: u32,
    canvas: Canvas,
    /// Announced to the backend: it has a buffer and the tab shows it.
    mapped: bool,
    /// A frame was sent and the backend hasn't acked it yet.
    in_flight: bool,
    /// `xdg_surface.set_window_geometry`, if the app set one.
    geometry: Option<Geometry>,
    /// The surfaces last composed, bottom to top, with their offsets and
    /// sizes. When this changes, the whole window is redrawn.
    layout: Vec<Placed>,
    /// Its OS window is showing (not minimized). A popup follows its toplevel.
    shown: bool,
}

#[derive(Clone, PartialEq)]
struct Placed {
    id: ObjectId,
    /// Its offset in the window and its size, in surface coordinates.
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    /// Its buffer's size, in pixels.
    pixels: (u32, u32),
}

impl Window {
    fn new(id: u32, root: WlSurface, role: Role) -> Window {
        Window {
            id,
            root,
            role,
            size: (0, 0),
            scale: 1,
            canvas: Canvas::default(),
            mapped: false,
            in_flight: false,
            geometry: None,
            layout: Vec::new(),
            shown: true,
        }
    }

    fn is_popup(&self) -> bool {
        matches!(self.role, Role::Popup { .. })
    }

    fn whole_geometry(&self) -> Geometry {
        let (width, height) = self.size;
        self.geometry.unwrap_or(Geometry {
            x: 0,
            y: 0,
            width,
            height,
        })
    }

    fn toplevel_info(&self) -> Option<ToplevelInfo> {
        let Role::Toplevel {
            title,
            app_id,
            decorations,
            min,
            max,
            ..
        } = &self.role
        else {
            return None;
        };
        Some(ToplevelInfo {
            toplevel: self.id,
            title: title.clone(),
            app_id: app_id.clone(),
            width: self.size.0,
            height: self.size.1,
            scale: self.scale,
            geometry: self.whole_geometry(),
            decorations: *decorations,
            min_width: min.0,
            min_height: min.1,
            max_width: max.0,
            max_height: max.1,
        })
    }

    fn popup_info(&self) -> Option<PopupInfo> {
        let Role::Popup {
            parent, position, grab, ..
        } = &self.role
        else {
            return None;
        };
        Some(PopupInfo {
            popup: self.id,
            parent: *parent,
            x: position.0,
            y: position.1,
            width: self.size.0,
            height: self.size.1,
            scale: self.scale,
            geometry: self.whole_geometry(),
            grab: *grab,
        })
    }

    fn client(&self) -> Option<ClientId> {
        self.root.client().map(|c| c.id())
    }

    /// The X11 window behind it, for one that came through Xwayland.
    fn x11(&self) -> Option<&X11Surface> {
        match &self.role {
            Role::Toplevel { shell: ToplevelShell::X11(x), .. } | Role::Popup { shell: PopupShell::X11(x), .. } => Some(x),
            _ => None,
        }
    }

    /// What gets the keyboard when this window has it. An X11 window is
    /// focused in X as well, so Xwayland sends its keys to that window.
    fn keyboard_target(&self) -> KeyboardFocus {
        match self.x11() {
            Some(x) => KeyboardFocus::X11(x.clone()),
            None => KeyboardFocus::Wayland(self.root.clone()),
        }
    }
}

/// The keyboard's focus: a Wayland surface, or an X11 window (whose surface
/// is Xwayland's, and which X focuses as well).
#[derive(Debug, Clone, PartialEq)]
pub enum KeyboardFocus {
    Wayland(WlSurface),
    X11(X11Surface),
}

impl WaylandFocus for KeyboardFocus {
    fn wl_surface(&self) -> Option<Cow<'_, WlSurface>> {
        match self {
            KeyboardFocus::Wayland(s) => Some(Cow::Borrowed(s)),
            KeyboardFocus::X11(x) => x.wl_surface().map(Cow::Owned),
        }
    }
}

impl IsAlive for KeyboardFocus {
    fn alive(&self) -> bool {
        match self {
            KeyboardFocus::Wayland(s) => s.alive(),
            KeyboardFocus::X11(x) => x.alive(),
        }
    }
}

impl KeyboardTarget<SessionState> for KeyboardFocus {
    fn enter(&self, seat: &Seat<SessionState>, data: &mut SessionState, keys: Vec<KeysymHandle<'_>>, serial: Serial) {
        match self {
            KeyboardFocus::Wayland(s) => KeyboardTarget::enter(s, seat, data, keys, serial),
            KeyboardFocus::X11(x) => KeyboardTarget::enter(x, seat, data, keys, serial),
        }
    }

    fn leave(&self, seat: &Seat<SessionState>, data: &mut SessionState, serial: Serial) {
        match self {
            KeyboardFocus::Wayland(s) => KeyboardTarget::leave(s, seat, data, serial),
            KeyboardFocus::X11(x) => KeyboardTarget::leave(x, seat, data, serial),
        }
    }

    fn key(
        &self,
        seat: &Seat<SessionState>,
        data: &mut SessionState,
        key: KeysymHandle<'_>,
        state: KeyState,
        serial: Serial,
        time: u32,
    ) {
        match self {
            KeyboardFocus::Wayland(s) => KeyboardTarget::key(s, seat, data, key, state, serial, time),
            KeyboardFocus::X11(x) => KeyboardTarget::key(x, seat, data, key, state, serial, time),
        }
    }

    fn modifiers(&self, seat: &Seat<SessionState>, data: &mut SessionState, modifiers: ModifiersState, serial: Serial) {
        match self {
            KeyboardFocus::Wayland(s) => KeyboardTarget::modifiers(s, seat, data, modifiers, serial),
            KeyboardFocus::X11(x) => KeyboardTarget::modifiers(x, seat, data, modifiers, serial),
        }
    }
}

/// The surface tree's root: a toplevel's or a popup's surface.
fn root_of(surface: &WlSurface) -> WlSurface {
    let mut s = surface.clone();
    while let Some(p) = get_parent(&s) {
        s = p;
    }
    s
}

/// Tell a surface the output's scale, the ways apps listen for it: it is on
/// the output (`wl_surface.enter`, which GTK takes its scale from), the
/// preferred buffer scale (`wl_surface` 6), and the fractional scale (which
/// an app that binds it prefers to the others). Each goes once per value.
fn tell_scale(output: &Output, scale: u32, surface: &WlSurface, states: &SurfaceData) {
    output.enter(surface);
    send_surface_state(surface, states, scale as i32, Transform::Normal);
    with_fractional_scale(states, |fs| fs.set_preferred_scale(scale as f64));
}

/// A surface's viewport size, as last committed, if it set one.
fn viewport_size(states: &SurfaceData) -> Option<(i32, i32)> {
    let viewport = states.cached_state.get::<ViewportCachedState>().current().size();
    viewport.map(|v| (v.w, v.h))
}

/// Copy what a client's shm buffer changed into a surface's image, and set
/// its size in surface coordinates from its buffer scale and viewport.
/// Returns the changed rectangles in buffer pixels, or None when it can't be
/// read.
fn copy_buffer(
    buffer: &WlBuffer,
    damage: &[Damage],
    (buffer_scale, viewport): (i32, Option<(i32, i32)>),
    image: &mut SurfaceImage,
) -> Option<Vec<Rect>> {
    with_buffer_contents(buffer, |ptr, len, data| {
        let format = match data.format {
            wl_shm::Format::Argb8888 => ShmFormat::Argb8888,
            wl_shm::Format::Xrgb8888 => ShmFormat::Xrgb8888,
            _ => return None,
        };
        let (w, h) = (data.width.max(0) as u32, data.height.max(0) as u32);
        let (sw, sh) = surface_size((w, h), buffer_scale, viewport);
        let rects: Vec<Rect> = damage
            .iter()
            .filter_map(|d| match d {
                // In surface coordinates: the buffer pixels under them.
                Damage::Surface(r) => clip_signed(r.loc.x, r.loc.y, r.size.w, r.size.h, sw, sh)
                    .map(|r| map_rect(r, (sw, sh), (w, h))),
                Damage::Buffer(r) => clip_signed(r.loc.x, r.loc.y, r.size.w, r.size.h, w, h),
            })
            .collect();
        // SAFETY: smithay hands us the client's mapped pool for the
        // duration of this closure; we only read inside it.
        let pool = unsafe { std::slice::from_raw_parts(ptr, len) };
        let changed = image.copy_from_shm(
            pool,
            data.offset.max(0) as usize,
            w,
            h,
            data.stride.max(0) as usize,
            format,
            &rects,
        )?;
        image.surface_width = sw;
        image.surface_height = sh;
        Some(changed)
    })
    .ok()
    .flatten()
}

/// A surface's offset in its window: its parent's plus its own subsurface
/// position (zero for the root).
fn own_offset(parent: (i32, i32), states: &smithay::wayland::compositor::SurfaceData) -> (i32, i32) {
    let loc = states.cached_state.get::<SubsurfaceCachedState>().current().location;
    (parent.0 + loc.x, parent.1 + loc.y)
}

pub struct SessionState {
    pub id: String,
    compositor: CompositorState,
    xdg: XdgShellState,
    shm: ShmState,
    data_device: DataDeviceState,
    _decoration: XdgDecorationState,
    _cursor_shape: CursorShapeManagerState,
    stubs: crate::stubs::Stubs,
    xwayland_shell: XWaylandShellState,
    /// The X display for X11 apps, and Xwayland once one connects.
    x11: x11::X11,
    seat_state: SeatState<SessionState>,
    seat: Seat<SessionState>,
    dh: DisplayHandle,
    /// An app just set the clipboard and offered text in this type: read it
    /// once the selection is stored (smithay tells us before it stores it).
    clipboard_to_read: Option<String>,
    /// The text type the Wayland app holding the clipboard offered, for X11
    /// apps that paste it; None when it offered none or isn't holding it.
    clipboard_wayland_mime: Option<String>,
    keyboard: KeyboardHandle<SessionState>,
    /// The layout the keyboard's keymap was built from (`KEYBOARD_LAYOUTS`).
    layout_id: String,
    pointer: PointerHandle<SessionState>,
    output: Output,
    /// The output's size in surface coordinates: the tab's viewport in CSS
    /// pixels. Its mode is this times `output_scale`.
    output_size: (i32, i32),
    /// The output's scale: the ceiling of the tab's `devicePixelRatio`.
    /// Apps that follow it draw buffers this many times the window's size.
    output_scale: u32,
    /// Toplevels and popups, in the order they were made. Ids are shared, so
    /// a frame, an ack or an input event names either.
    windows: Vec<Window>,
    next_window: u32,
    /// Every surface's last buffer, by surface. A window's canvas is composed
    /// from its surfaces' images.
    images: HashMap<ObjectId, SurfaceImage>,
    /// The toplevel with keyboard focus, if a Linux window has it.
    focused: Option<u32>,
    /// Popups holding an explicit grab, oldest first. The newest has the
    /// keyboard.
    grabs: Vec<u32>,
    /// A press outside every Linux window took the keyboard from them.
    keyboard_away: bool,
    /// text-input-v3: the apps' text inputs and the field with focus.
    text_inputs: text_input::TextInputs,
    /// The processes connected to the socket: pid (0 when unknown) and
    /// whether each has gone.
    clients: Vec<(u32, Arc<ClientState>)>,
    /// The pids last sent in `clients`: the socket's clients and the X11
    /// apps with windows.
    announced_pids: Option<Vec<u32>>,
    /// The backend froze the session's apps under the cover screen.
    frozen: bool,
    /// The tab is showing; a hidden one gets no frames.
    visible: bool,
    /// What the session's apps last asked the cursor to be, and whether it
    /// (or the cursor surface's image) changed since the tab heard.
    cursor_status: CursorImageStatus,
    cursor_changed: bool,
    /// The cursor the tab has.
    cursor: Shown,
    /// Surfaces with frame callbacks waiting to be answered.
    pending_callbacks: Vec<WlSurface>,
    /// JSON messages for the backend, drained by the host.
    pub outbox: Vec<Outbound>,
    started: Instant,
}

impl SessionState {
    /// A session's state. With `x11`, it reserves an X display for X11 apps,
    /// handled on the session's own event loop (`x11_loop`); without, X11
    /// apps get none.
    pub fn new(
        id: String,
        dh: &DisplayHandle,
        width: u32,
        height: u32,
        ratio: f64,
        started: Instant,
        x11: Option<(Rc<XwaylandConfig>, LoopHandle<'static, SessionState>)>,
    ) -> SessionState {
        let compositor = CompositorState::new::<SessionState>(dh);
        let xdg = XdgShellState::new::<SessionState>(dh);
        let shm = ShmState::new::<SessionState>(dh, vec![]);
        // The clipboard: between the session's apps, and as plain text with
        // the tab's real clipboard (crate::clipboard). Some apps (foot)
        // refuse to start without this global.
        let data_device = DataDeviceState::new::<SessionState>(dh);
        let decoration = XdgDecorationState::new::<SessionState>(dh);
        let cursor_shape = CursorShapeManagerState::new::<SessionState>(dh);
        let stubs = crate::stubs::Stubs::new(dh);
        // Text fields: what the tab's hidden input needs, and its text back.
        SessionState::create_text_input_global(dh);
        // Only Xwayland's own client may bind it.
        let xwayland_shell = XWaylandShellState::new::<SessionState>(dh);
        let mut seat_state = SeatState::new();
        let mut seat = seat_state.new_wl_seat(dh, "seat0");
        // US until the tab says which layout its owner chose.
        let keyboard = seat
            .add_keyboard(xkb_config(DEFAULT_LAYOUT).expect("US is a layout"), REPEAT_DELAY_MS, REPEAT_RATE_HZ)
            .expect("the US keymap compiles");
        let pointer = seat.add_pointer();
        let output = Output::new(
            format!("imbatranim-{}", &id[..8]),
            PhysicalProperties {
                size: (0, 0).into(),
                subpixel: Subpixel::Unknown,
                make: "ImbatranimOS".into(),
                model: "Desktop".into(),
            },
        );
        let _global = output.create_global::<SessionState>(dh);
        let mut state = SessionState {
            id,
            compositor,
            xdg,
            shm,
            data_device,
            _decoration: decoration,
            _cursor_shape: cursor_shape,
            stubs,
            xwayland_shell,
            x11: x11::X11::new(x11),
            seat_state,
            seat,
            dh: dh.clone(),
            clipboard_to_read: None,
            clipboard_wayland_mime: None,
            keyboard,
            layout_id: DEFAULT_LAYOUT.to_string(),
            pointer,
            output,
            output_size: (1, 1),
            output_scale: output_scale(ratio),
            windows: Vec::new(),
            next_window: 1,
            images: HashMap::new(),
            focused: None,
            grabs: Vec::new(),
            keyboard_away: false,
            text_inputs: Default::default(),
            clients: Vec::new(),
            announced_pids: None,
            frozen: false,
            visible: true,
            cursor_status: CursorImageStatus::default_named(),
            cursor_changed: false,
            cursor: Shown::default(),
            pending_callbacks: Vec::new(),
            outbox: Vec::new(),
            started,
        };
        state.set_output(width, height, ratio);
        state.x11_reserve(None);
        state
    }

    fn now(&self) -> u32 {
        self.started.elapsed().as_millis() as u32
    }

    pub fn stubs_mut(&mut self) -> &mut crate::stubs::Stubs {
        &mut self.stubs
    }

    /// The output's scale.
    pub fn scale(&self) -> u32 {
        self.output_scale
    }

    /// The session's one output is the tab's viewport, at the ceiling of the
    /// tab's `devicePixelRatio`. Its mode is in device pixels (the viewport
    /// times the scale), so apps see the viewport as its logical size.
    pub fn set_output(&mut self, width: u32, height: u32, ratio: f64) {
        let size = (width.clamp(1, 16384) as i32, height.clamp(1, 16384) as i32);
        let scale = output_scale(ratio);
        self.output_size = size;
        let mode = Mode {
            size: (size.0 * scale as i32, size.1 * scale as i32).into(),
            refresh: 60_000,
        };
        self.output.change_current_state(
            Some(mode),
            Some(Transform::Normal),
            Some(Scale::Integer(scale as i32)),
            Some((0, 0).into()),
        );
        self.output.set_preferred(mode);
        if scale != self.output_scale {
            self.output_scale = scale;
            self.rescale_surfaces();
        }
    }

    /// The output's scale changed (the tab moved to another screen, or the
    /// page zoomed): every window's surfaces hear it. They leave the output
    /// and enter it again, so apps that only read the scale of the outputs
    /// they are on look again; they then draw at the new scale, and their
    /// windows are announced again with it.
    fn rescale_surfaces(&mut self) {
        for w in &self.windows {
            with_surface_tree_downward(
                &w.root,
                (),
                |_, _, _| TraversalAction::DoChildren(()),
                |surface, states, _| {
                    self.output.leave(surface);
                    tell_scale(&self.output, self.output_scale, surface, states);
                },
                |_, _, _| true,
            );
        }
    }

    // ── Frames ──────────────────────────────────────────────────────────

    /// The surfaces of a window, bottom to top, with their offsets: the
    /// layers its canvas is composed from. Surfaces with no buffer are left
    /// out.
    fn placements(&self, root: &WlSurface) -> Vec<Placed> {
        let mut out = Vec::new();
        with_surface_tree_upward(
            root,
            (0, 0),
            |_, states, parent| TraversalAction::DoChildren(own_offset(*parent, states)),
            |surf, states, parent| {
                let (x, y) = own_offset(*parent, states);
                if let Some(img) = self.images.get(&surf.id()) {
                    if !img.is_empty() {
                        out.push(Placed {
                            id: surf.id(),
                            x,
                            y,
                            width: img.surface_width,
                            height: img.surface_height,
                            pixels: (img.width, img.height),
                        });
                    }
                }
            },
            |_, _, _| true,
        );
        out
    }

    /// Encode every window that has damage and no frame in flight. Each one
    /// sent is in flight until the backend acks it.
    pub fn take_frames(&mut self, encoding: Encoding) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        let quiet: Vec<bool> = (0..self.windows.len()).map(|i| !self.is_live(i)).collect();
        let images = &self.images;
        for (i, w) in self.windows.iter_mut().enumerate() {
            // A region sent lossy that has gone still gets its lossless frame.
            w.canvas.tick();
            if !w.mapped || w.in_flight || quiet[i] || !w.canvas.has_damage() {
                continue;
            }
            // Each surface where it sits at the window's scale; one drawn at
            // another scale is resampled to it.
            let s = w.scale;
            let layers: Vec<Layer> = w
                .layout
                .iter()
                .filter_map(|p| {
                    images.get(&p.id).map(|image| Layer {
                        x: p.x * s as i32,
                        y: p.y * s as i32,
                        width: p.width * s,
                        height: p.height * s,
                        image,
                    })
                })
                .collect();
            let rects = w.canvas.take_frame(&layers, encoding);
            out.push(encode_frame_body(w.id, w.canvas.width, w.canvas.height, &rects));
            w.in_flight = true;
        }
        out
    }

    /// The backend passed a frame on and has room for the next one. The
    /// window's waiting frame callbacks go now, so the app draws its next
    /// frame in time for the next tick.
    pub fn ack(&mut self, id: u32) {
        let Some(w) = self.windows.iter_mut().find(|w| w.id == id) else {
            return;
        };
        w.in_flight = false;
        let root = w.root.clone();
        self.fire_callbacks(|s| root_of(s) == root);
    }

    /// Answer frame callbacks for every surface whose window isn't waiting
    /// on an ack. Holding them while a frame is in flight is what slows an
    /// app down when the tab's connection can't keep up.
    ///
    /// A frozen or hidden session, and a minimized window, get none: a
    /// well-behaved app then stops drawing until it is shown again.
    pub fn fire_idle_callbacks(&mut self) {
        if self.frozen || !self.visible {
            return;
        }
        let held: Vec<WlSurface> = (0..self.windows.len())
            .filter(|&i| self.windows[i].in_flight || !self.is_live(i))
            .map(|i| self.windows[i].root.clone())
            .collect();
        self.fire_callbacks(|s| !held.contains(&root_of(s)));
    }

    /// The window's frames and frame callbacks flow: the session is neither
    /// frozen nor hidden, and its toplevel's OS window isn't minimized.
    fn is_live(&self, index: usize) -> bool {
        if self.frozen || !self.visible {
            return false;
        }
        let mut i = index;
        for _ in 0..64 {
            let w = &self.windows[i];
            if !w.shown {
                return false;
            }
            match &w.role {
                Role::Toplevel { .. } => return true,
                Role::Popup { parent, .. } => match self.index_of(*parent) {
                    Some(p) => i = p,
                    None => return true,
                },
            }
        }
        true
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    pub fn add_client(&mut self, pid: u32, data: Arc<ClientState>) {
        self.clients.push((pid, data));
        self.announce_clients();
    }

    /// Forget clients that have gone, and say so if any had.
    pub fn prune_clients(&mut self) {
        let before = self.clients.len();
        self.clients.retain(|(_, c)| !c.gone.load(Ordering::Relaxed));
        if self.clients.len() != before {
            self.announce_clients();
        }
    }

    /// The session's app processes: those connected to the socket, and the
    /// X11 apps with a window (by their `_NET_WM_PID`), whose connection is to
    /// Xwayland. The backend freezes and stops them with the session.
    fn client_pids(&self) -> Vec<u32> {
        let wayland = self.clients.iter().map(|(p, _)| *p);
        let x11 = self.windows.iter().filter_map(|w| w.x11().and_then(|x| x.pid()));
        let mut pids: Vec<u32> = wayland.chain(x11).filter(|p| *p != 0).collect();
        pids.sort_unstable();
        pids.dedup();
        pids
    }

    fn announce_clients(&mut self) {
        let pids = self.client_pids();
        self.announced_pids = Some(pids.clone());
        self.outbox.push(Outbound::Clients { session: self.id.clone(), pids });
    }

    /// Announce the pids again if an X11 window's coming or going changed them.
    fn refresh_clients(&mut self) {
        if self.announced_pids.as_ref() != Some(&self.client_pids()) {
            self.announce_clients();
        }
    }

    /// A tab took the session back (after a reload): every window is
    /// announced again, toplevels before popups, and sent whole, and the
    /// focused text field's state after them.
    pub fn resync(&mut self) {
        for popups in [false, true] {
            for i in 0..self.windows.len() {
                if self.windows[i].mapped && self.windows[i].is_popup() == popups {
                    self.announce(i, true);
                }
            }
        }
        for w in self.windows.iter_mut() {
            w.in_flight = false;
            w.shown = true;
            w.canvas.damage_all();
        }
        self.visible = true;
        let cursor = self.cursor.current().clone();
        self.send_cursor(cursor);
        self.announce_clients();
        self.text_input_resync();
    }

    /// Everything is drawn again when the session comes back to life.
    fn redraw_all(&mut self) {
        for w in self.windows.iter_mut() {
            w.canvas.damage_all();
        }
    }

    pub fn set_frozen(&mut self, frozen: bool) {
        if self.frozen == frozen {
            return;
        }
        self.frozen = frozen;
        if !frozen {
            self.redraw_all();
        }
    }

    /// Switch the session's keyboard to the layout `id`. smithay builds the
    /// keymap and sends it to every client (`wl_keyboard.keymap`), so running
    /// apps type the new characters without a restart. An id the host doesn't
    /// offer, or a keymap that doesn't build, leaves the keyboard as it was.
    pub fn set_keyboard_layout(&mut self, id: &str) {
        if self.layout_id == id {
            return;
        }
        let Some(config) = xkb_config(id) else {
            eprintln!("wayland-host: ignored an unknown keyboard layout {id:?}");
            return;
        };
        let keyboard = self.keyboard.clone();
        match keyboard.set_xkb_config(self, config) {
            Ok(()) => self.layout_id = id.to_string(),
            Err(_) => eprintln!("wayland-host: the {id} keymap did not build"),
        }
    }

    pub fn set_visible(&mut self, visible: bool) {
        if self.visible == visible {
            return;
        }
        self.visible = visible;
        if visible {
            self.redraw_all();
        }
    }

    /// A minimized OS window (or one shown again): it and its popups.
    pub fn set_toplevel_visible(&mut self, toplevel: u32, visible: bool) {
        let Some(i) = self.index_of(toplevel) else { return };
        if self.windows[i].shown == visible {
            return;
        }
        self.windows[i].shown = visible;
        if visible {
            for j in 0..self.windows.len() {
                let own = j == i || matches!(self.windows[j].role, Role::Popup { parent, .. } if parent == toplevel);
                if own {
                    self.windows[j].canvas.damage_all();
                }
            }
        }
    }

    fn fire_callbacks(&mut self, pick: impl Fn(&WlSurface) -> bool) {
        let time = self.now();
        let mut keep = Vec::new();
        for surface in std::mem::take(&mut self.pending_callbacks) {
            if !surface.is_alive() {
                continue;
            }
            if !pick(&surface) {
                keep.push(surface);
                continue;
            }
            with_states(&surface, |states| {
                let mut attrs = states.cached_state.get::<SurfaceAttributes>();
                for callback in attrs.current().frame_callbacks.drain(..) {
                    callback.done(time);
                }
            });
        }
        self.pending_callbacks = keep;
    }

    // ── Windows ─────────────────────────────────────────────────────────

    fn index_of_root(&self, root: &WlSurface) -> Option<usize> {
        self.windows.iter().position(|w| &w.root == root)
    }

    fn index_of(&self, id: u32) -> Option<usize> {
        self.windows.iter().position(|w| w.id == id)
    }

    fn new_id(&mut self) -> u32 {
        let id = self.next_window;
        self.next_window = self.next_window.wrapping_add(1).max(1);
        id
    }

    fn announce(&mut self, index: usize, created: bool) {
        let session = self.id.clone();
        let w = &self.windows[index];
        let msg = if let Some(info) = w.toplevel_info() {
            if created {
                Outbound::ToplevelCreated { session, info }
            } else {
                Outbound::ToplevelUpdated { session, info }
            }
        } else if let Some(info) = w.popup_info() {
            if created {
                Outbound::PopupCreated { session, info }
            } else {
                Outbound::PopupUpdated { session, info }
            }
        } else {
            return;
        };
        self.outbox.push(msg);
    }

    fn announce_if_mapped(&mut self, index: usize) {
        if self.windows[index].mapped {
            self.announce(index, false);
        }
    }

    fn unmap(&mut self, index: usize) {
        let w = &mut self.windows[index];
        if w.mapped {
            w.mapped = false;
            w.in_flight = false;
            let (id, popup) = (w.id, w.is_popup());
            let session = self.id.clone();
            self.outbox.push(if popup {
                Outbound::PopupDestroyed { session, popup: id }
            } else {
                Outbound::ToplevelDestroyed { session, toplevel: id }
            });
        }
        if self.focused == Some(self.windows[index].id) {
            self.focused = None;
        }
    }

    fn remove_window(&mut self, index: usize) {
        self.unmap(index);
        let id = self.windows[index].id;
        self.windows.remove(index);
        if self.grabs.contains(&id) {
            self.grabs.retain(|g| *g != id);
            self.keyboard_to_grab_or_focus();
        }
        // The keyboard may still name the window's surface, now gone.
        self.text_input_follow_keyboard();
    }

    fn request(&mut self, surface: &ToplevelSurface, action: &str, edges: Option<String>) {
        let Some(i) = self.index_of_root(surface.wl_surface()) else {
            return;
        };
        self.request_at(i, action, edges);
    }

    /// Pass a toplevel's request (move, resize, maximize...) to the window
    /// manager in the tab.
    fn request_at(&mut self, i: usize, action: &str, edges: Option<String>) {
        let toplevel = self.windows[i].id;
        self.outbox.push(Outbound::Request {
            session: self.id.clone(),
            toplevel,
            action: action.into(),
            edges,
        });
    }

    /// After a commit in a window's surface tree: lay its surfaces out again,
    /// damage what changed, and map, resize or unmap it.
    fn refresh_window(&mut self, index: usize, changed: &[(ObjectId, Vec<Rect>)]) {
        let root = self.windows[index].root.clone();
        let layout = self.placements(&root);
        let root_size = self
            .images
            .get(&root.id())
            .filter(|i| !i.is_empty())
            .map(|i| ((i.surface_width, i.surface_height), window_scale(i.width, i.surface_width)));
        let Some((size, scale)) = root_size else {
            // No buffer on the root: the app hid the window.
            self.windows[index].layout = layout;
            self.unmap(index);
            return;
        };
        let w = &mut self.windows[index];
        let before = (w.size, w.scale);
        w.size = size;
        w.scale = scale;
        w.canvas.resize(size.0 * scale, size.1 * scale);
        if w.layout != layout || before.1 != scale {
            w.canvas.damage_all();
        } else {
            for (id, rects) in changed {
                if let Some(p) = layout.iter().find(|p| &p.id == id) {
                    // From the surface's buffer pixels to where the window draws them.
                    let drawn = (p.width * scale, p.height * scale);
                    for r in rects {
                        let r = map_rect(*r, p.pixels, drawn);
                        w.canvas.damage(p.x * scale as i32 + r.x as i32, p.y * scale as i32 + r.y as i32, r.w, r.h);
                    }
                }
            }
        }
        w.layout = layout;
        let resized = before != (size, scale);
        if !w.mapped {
            w.mapped = true;
            self.announce(index, true);
        } else if resized {
            self.announce(index, false);
        }
    }

    /// The window geometry and size limits the app set with its last commit.
    /// An X11 window's come from X instead (`x11.rs`).
    fn read_cached(&mut self, index: usize) {
        if self.windows[index].x11().is_some() {
            return;
        }
        let surface = self.windows[index].root.clone();
        let (geometry, min, max) = with_states(&surface, |states| {
            let mut cached = states.cached_state.get::<SurfaceCachedState>();
            let c = cached.current();
            (c.geometry, c.min_size, c.max_size)
        });
        let geometry = geometry.filter(|g| g.size.w > 0 && g.size.h > 0).map(|g| Geometry {
            x: g.loc.x,
            y: g.loc.y,
            width: g.size.w as u32,
            height: g.size.h as u32,
        });
        let min = (min.w.max(0) as u32, min.h.max(0) as u32);
        let max = (max.w.max(0) as u32, max.h.max(0) as u32);
        let w = &mut self.windows[index];
        let mut changed = w.geometry != geometry;
        w.geometry = geometry;
        if let Role::Toplevel { min: m, max: x, .. } = &mut w.role {
            changed |= *m != min || *x != max;
            *m = min;
            *x = max;
        }
        if changed {
            self.announce_if_mapped(index);
        }
    }

    fn set_decorations(&mut self, surface: &ToplevelSurface, mode: DecorationMode) {
        surface.with_pending_state(|s| s.decoration_mode = Some(mode));
        if surface.is_initial_configure_sent() {
            surface.send_pending_configure();
        }
        if let Some(i) = self.index_of_root(surface.wl_surface()) {
            let d = if mode == DecorationMode::ServerSide {
                Decorations::Server
            } else {
                Decorations::Client
            };
            if let Role::Toplevel { decorations, .. } = &mut self.windows[i].role {
                if *decorations != d {
                    *decorations = d;
                    self.announce_if_mapped(i);
                }
            }
        }
    }

    // ── Popups ──────────────────────────────────────────────────────────

    /// Where a window's geometry starts on the output: a toplevel's from
    /// the tab, a popup's from its parent's plus its own position.
    fn screen_origin(&self, id: u32) -> (i32, i32) {
        let mut at = (0, 0);
        let mut next = Some(id);
        // A chain is short; the bound guards against a cycle.
        for _ in 0..64 {
            let Some(i) = next.and_then(|id| self.index_of(id)) else {
                break;
            };
            match &self.windows[i].role {
                Role::Toplevel { origin, .. } => {
                    return (at.0 + origin.0, at.1 + origin.1);
                }
                Role::Popup { parent, position, .. } => {
                    at = (at.0 + position.0, at.1 + position.1);
                    next = Some(*parent);
                }
            }
        }
        at
    }

    /// The positioner's rectangle, flipped, slid or resized to stay on the
    /// output, relative to the parent's window geometry.
    fn place_popup(&self, parent: u32, positioner: PositionerState) -> Rectangle<i32, Logical> {
        let (ox, oy) = self.screen_origin(parent);
        let (w, h) = self.output_size;
        let target = Rectangle::new(Point::from((-ox, -oy)), (w, h).into());
        positioner.get_unconstrained_geometry(target)
    }

    /// Close the popups that hold an explicit grab, and every popup opened
    /// from one, newest first: the app gets `popup_done` and destroys them.
    /// With `keep`, that client's stay.
    fn dismiss_grabbed(&mut self, keep: Option<ClientId>) {
        let grabbed = |w: &Window| matches!(w.role, Role::Popup { grab: true, .. });
        let mut doomed: Vec<usize> = Vec::new();
        for i in (0..self.windows.len()).rev() {
            if !self.windows[i].is_popup() || (keep.is_some() && self.windows[i].client() == keep) {
                continue;
            }
            // A grabbing popup, or one with a grabbing popup above it in its chain.
            let mut cur = Some(i);
            for _ in 0..64 {
                let Some(j) = cur else { break };
                if grabbed(&self.windows[j]) {
                    doomed.push(i);
                    break;
                }
                cur = match &self.windows[j].role {
                    Role::Popup { parent, .. } => self.index_of(*parent),
                    Role::Toplevel { .. } => None,
                };
            }
        }
        if doomed.is_empty() {
            return;
        }
        let mut ids = Vec::new();
        for i in doomed {
            if let Role::Popup { shell: PopupShell::Xdg(surface), .. } = &self.windows[i].role {
                surface.send_popup_done();
            }
            ids.push(self.windows[i].id);
        }
        self.grabs.retain(|g| !ids.contains(g));
        self.keyboard_to_grab_or_focus();
    }

    /// The owner pressed outside every Linux window. As on any desktop, the
    /// keyboard leaves the apps, so an app closes the menus it tracks itself
    /// (Firefox takes no grab for its menus and closes them when its window
    /// loses the keyboard), and popups holding a grab get `popup_done`. The
    /// keyboard comes back with the next press in a Linux window or the next
    /// focus change.
    pub fn press_outside(&mut self) {
        self.keyboard_away = true;
        self.dismiss_grabbed(None);
        self.keyboard_to_grab_or_focus();
    }

    /// The keyboard goes to the newest grabbing popup, else to the focused
    /// toplevel.
    fn keyboard_to_grab_or_focus(&mut self) {
        let target = if self.keyboard_away {
            None
        } else {
            self.grabs
                .last()
                .copied()
                .or(self.focused)
                .and_then(|id| self.index_of(id))
                .map(|i| self.windows[i].keyboard_target())
        };
        let keyboard = self.keyboard.clone();
        if keyboard.current_focus() != target {
            keyboard.set_focus(self, target, SERIAL_COUNTER.next_serial());
        }
        self.text_input_follow_keyboard();
    }

    // ── Input from the tab ──────────────────────────────────────────────

    /// The tab moved a toplevel's OS window: its geometry now starts here on
    /// the output.
    pub fn position(&mut self, toplevel: u32, x: i32, y: i32) {
        if let Some(i) = self.index_of(toplevel) {
            if let Role::Toplevel { origin, shell, .. } = &mut self.windows[i].role {
                *origin = (x, y);
                // X11 apps place their menus in screen coordinates, so X
                // learns where the window is.
                if let ToplevelShell::X11(window) = shell {
                    x11::move_to(window, (x, y));
                }
            }
        }
    }

    /// Keyboard focus follows the OS window the owner raised. Only one Linux
    /// window in the session has it; the rest lose `activated`. Focus moving
    /// to another app's window, or off Linux windows, ends the grabs of the
    /// apps that lost it.
    pub fn focus(&mut self, toplevel: Option<u32>) {
        let target = toplevel
            .and_then(|id| self.index_of(id))
            .filter(|i| !self.windows[*i].is_popup())
            .map(|i| (self.windows[i].id, self.windows[i].client()));
        if target.as_ref().map(|t| t.0) != self.focused {
            // Another window took the keyboard: the grabs of the apps that
            // lost it end.
            self.dismiss_grabbed(target.as_ref().and_then(|t| t.1.clone()));
        }
        self.keyboard_away = false;
        self.focused = target.map(|(id, _)| id);
        self.keyboard_to_grab_or_focus();
        let focused = self.focused;
        for w in &self.windows {
            let active = Some(w.id) == focused;
            match &w.role {
                Role::Toplevel { shell: ToplevelShell::Xdg(surface), .. } => {
                    let changed = surface.with_pending_state(|s| {
                        if active {
                            s.states.set(xdg_toplevel::State::Activated)
                        } else {
                            s.states.unset(xdg_toplevel::State::Activated)
                        }
                    });
                    if changed && surface.is_initial_configure_sent() {
                        surface.send_pending_configure();
                    }
                }
                Role::Toplevel { shell: ToplevelShell::X11(window), .. } => {
                    if window.is_activated() != active {
                        let _ = window.set_activated(active);
                    }
                }
                Role::Popup { .. } => {}
            }
        }
        self.x11_raise_focused();
    }

    /// The surface of window `id` under a point in the window's root surface
    /// coordinates, with that surface's offset: the topmost one whose bounds
    /// and input region hold the point.
    fn surface_under(&self, id: u32, x: f64, y: f64) -> Option<(WlSurface, (f64, f64))> {
        let w = &self.windows[self.index_of(id)?];
        let mut hit = None;
        let point = (x.floor() as i32, y.floor() as i32);
        with_surface_tree_upward(
            &w.root,
            (0, 0),
            |_, states, parent| TraversalAction::DoChildren(own_offset(*parent, states)),
            |surf, states, parent| {
                let (ox, oy) = own_offset(*parent, states);
                let Some(img) = self.images.get(&surf.id()).filter(|i| !i.is_empty()) else {
                    return;
                };
                let local = (point.0 - ox, point.1 - oy);
                let (w, h) = (img.surface_width as i32, img.surface_height as i32);
                if local.0 < 0 || local.1 < 0 || local.0 >= w || local.1 >= h {
                    return;
                }
                let mut attrs = states.cached_state.get::<SurfaceAttributes>();
                let accepts = attrs.current().input_region.as_ref().is_none_or(|r| r.contains(local));
                if accepts {
                    // Later surfaces are nearer: the last hit wins.
                    hit = Some((surf.clone(), (ox as f64, oy as f64)));
                }
            },
            |_, _, _| true,
        );
        hit.or_else(|| Some((w.root.clone(), (0.0, 0.0))))
    }

    pub fn pointer_motion(&mut self, id: u32, x: f64, y: f64) {
        let Some(focus) = self.surface_under(id, x, y) else {
            return;
        };
        let event = MotionEvent {
            location: (x, y).into(),
            serial: SERIAL_COUNTER.next_serial(),
            time: self.now(),
        };
        let pointer = self.pointer.clone();
        pointer.motion(self, Some((focus.0, focus.1.into())), &event);
        pointer.frame(self);
    }

    pub fn pointer_button(&mut self, id: u32, button: u32, pressed: bool) {
        let Some(i) = self.index_of(id) else { return };
        // A press in one app's window ends the other apps' grabs, and gives
        // the keyboard back if a press outside took it.
        if pressed {
            let client = self.windows[i].client();
            self.dismiss_grabbed(client);
            if self.keyboard_away {
                self.keyboard_away = false;
                self.keyboard_to_grab_or_focus();
            }
        }
        let state = if pressed {
            ButtonState::Pressed
        } else {
            ButtonState::Released
        };
        let event = ButtonEvent {
            serial: SERIAL_COUNTER.next_serial(),
            time: self.now(),
            button,
            state,
        };
        let pointer = self.pointer.clone();
        pointer.button(self, &event);
        pointer.frame(self);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn pointer_axis(&mut self, id: u32, dx: f64, dy: f64, v120x: i32, v120y: i32, wheel: bool) {
        if self.index_of(id).is_none() {
            return;
        }
        let mut frame = AxisFrame::new(self.now()).source(if wheel { AxisSource::Wheel } else { AxisSource::Finger });
        if dx != 0.0 {
            frame = frame.value(Axis::Horizontal, dx);
            if wheel && v120x != 0 {
                frame = frame.v120(Axis::Horizontal, v120x);
            }
        }
        if dy != 0.0 {
            frame = frame.value(Axis::Vertical, dy);
            if wheel && v120y != 0 {
                frame = frame.v120(Axis::Vertical, v120y);
            }
        }
        let pointer = self.pointer.clone();
        pointer.axis(self, frame);
        pointer.frame(self);
    }

    pub fn pointer_leave(&mut self) {
        let location = self.pointer.current_location();
        let event = MotionEvent {
            location,
            serial: SERIAL_COUNTER.next_serial(),
            time: self.now(),
        };
        let pointer = self.pointer.clone();
        pointer.motion(self, None, &event);
        pointer.frame(self);
    }

    /// A key, to the newest grabbing popup or the focused toplevel.
    /// `keycode` is the Linux (evdev) code; xkb's are 8 higher. The host's
    /// xkb state tracks the modifiers.
    pub fn key(&mut self, keycode: u32, pressed: bool) {
        if (self.focused.is_none() && self.grabs.is_empty()) || keycode == 0 || keycode > 767 {
            return;
        }
        let state = if pressed { KeyState::Pressed } else { KeyState::Released };
        let keyboard = self.keyboard.clone();
        let time = self.now();
        keyboard.input::<(), _>(
            self,
            (keycode + 8).into(),
            state,
            SERIAL_COUNTER.next_serial(),
            time,
            |_, _, _| FilterResult::Forward,
        );
    }

    /// The OS window's size and state, as `xdg_toplevel.configure`, within
    /// the app's own limits. The app answers with an ack and a new buffer.
    pub fn configure(&mut self, toplevel: u32, width: u32, height: u32, maximized: bool) {
        let Some(i) = self.index_of(toplevel) else {
            return;
        };
        let Role::Toplevel { shell, min, max, origin, .. } = &self.windows[i].role else {
            return;
        };
        let clamp = |v: u32, min: u32, max: u32| {
            let v = v.max(min).max(1);
            if max > 0 {
                v.min(max)
            } else {
                v
            }
        };
        let w = clamp(width, min.0, max.0).min(16384) as i32;
        let h = clamp(height, min.1, max.1).min(16384) as i32;
        let surface = match shell {
            ToplevelShell::Xdg(surface) => surface,
            ToplevelShell::X11(window) => {
                x11::resize(window, *origin, (w, h), maximized);
                return;
            }
        };
        surface.with_pending_state(|s| {
            s.size = Some((w, h).into());
            if maximized {
                s.states.set(xdg_toplevel::State::Maximized);
            } else {
                s.states.unset(xdg_toplevel::State::Maximized);
            }
        });
        if surface.is_initial_configure_sent() {
            surface.send_pending_configure();
        }
    }

    /// The OS close button. The app decides: it may close, ask to save, or
    /// refuse. The OS window closes when the toplevel goes, not here.
    pub fn close(&mut self, toplevel: u32) {
        match self.index_of(toplevel).map(|i| &self.windows[i].role) {
            Some(Role::Toplevel { shell: ToplevelShell::Xdg(surface), .. }) => surface.send_close(),
            // WM_DELETE_WINDOW, or the window is destroyed when it doesn't take it.
            Some(Role::Toplevel { shell: ToplevelShell::X11(window), .. }) => {
                let _ = window.close();
            }
            _ => {}
        }
    }
}

impl CompositorHandler for SessionState {
    fn compositor_state(&mut self) -> &mut CompositorState {
        &mut self.compositor
    }

    fn client_compositor_state<'a>(&self, client: &'a Client) -> &'a CompositorClientState {
        // Xwayland is a client smithay inserts with its own data.
        if let Some(xwayland) = client.get_data::<XWaylandClientData>() {
            return &xwayland.compositor_state;
        }
        &client
            .get_data::<ClientState>()
            .expect("every client is inserted with ClientState")
            .compositor
    }

    fn commit(&mut self, surface: &WlSurface) {
        // xdg-shell: the first commit of a new toplevel or popup waits for a
        // configure. No size for a toplevel: the app picks its own until the
        // window manager resizes it.
        if let Some(i) = self.index_of_root(surface) {
            match &self.windows[i].role {
                Role::Toplevel { shell: ToplevelShell::Xdg(t), .. } if !t.is_initial_configure_sent() => {
                    t.send_configure();
                }
                Role::Popup { shell: PopupShell::Xdg(p), .. } if !p.is_initial_configure_sent() => {
                    let _ = p.send_configure();
                }
                _ => {}
            }
        }
        // A synchronized subsurface's state applies with its parent's commit,
        // which walks it below.
        if is_sync_subsurface(surface) {
            return;
        }
        let mut changed: Vec<(ObjectId, Vec<Rect>)> = Vec::new();
        let mut wants_frame: Vec<WlSurface> = Vec::new();
        let images = &mut self.images;
        let (output, scale) = (&self.output, self.output_scale);
        with_surface_tree_upward(
            surface,
            (),
            |_, _, _| TraversalAction::DoChildren(()),
            |surf, states, _| {
                tell_scale(output, scale, surf, states);
                let viewport = viewport_size(states);
                let mut attrs = states.cached_state.get::<SurfaceAttributes>();
                let current = attrs.current();
                let buffer = current.buffer.take();
                let damage = std::mem::take(&mut current.damage);
                let buffer_scale = current.buffer_scale;
                if !current.frame_callbacks.is_empty() {
                    wants_frame.push(surf.clone());
                }
                match buffer {
                    Some(BufferAssignment::NewBuffer(buffer)) => {
                        let image = images.entry(surf.id()).or_default();
                        if let Some(rects) = copy_buffer(&buffer, &damage, (buffer_scale, viewport), image) {
                            changed.push((surf.id(), rects));
                        }
                        // Copied (or unreadable); either way the client may
                        // reuse it.
                        buffer.release();
                    }
                    Some(BufferAssignment::Removed) => {
                        images.remove(&surf.id());
                    }
                    None => {
                        // A new buffer scale or viewport on the same buffer:
                        // the same pixels at another size, which relays the
                        // window out.
                        if let Some(image) = images.get_mut(&surf.id()).filter(|i| !i.is_empty()) {
                            let size = surface_size((image.width, image.height), buffer_scale, viewport);
                            (image.surface_width, image.surface_height) = size;
                        }
                    }
                }
            },
            |_, _, _| true,
        );
        // A cursor surface's new image goes to the tab after this round.
        if matches!(&self.cursor_status, CursorImageStatus::Surface(c) if c == surface) {
            self.cursor_changed = true;
        }
        // Surfaces that belong to no window (cursors, a popup's parent gone)
        // keep only their frame callbacks.
        if let Some(i) = self.index_of_root(&root_of(surface)) {
            // The geometry first: a window is announced with the geometry
            // committed with its first buffer, so its OS window opens at the
            // app's size, not the size of its image with the shadows.
            self.read_cached(i);
            self.refresh_window(i, &changed);
        }
        for surf in wants_frame {
            if !self.pending_callbacks.contains(&surf) {
                self.pending_callbacks.push(surf);
            }
        }
    }

    /// A surface went away. If it was part of a window's picture, the window
    /// is drawn again without it.
    fn destroyed(&mut self, surface: &WlSurface) {
        let id = surface.id();
        self.images.remove(&id);
        if matches!(&self.cursor_status, CursorImageStatus::Surface(c) if c == surface) {
            self.cursor_changed = true;
        }
        for w in self.windows.iter_mut() {
            if w.layout.iter().any(|p| p.id == id) {
                w.layout.retain(|p| p.id != id);
                w.canvas.damage_all();
            }
        }
    }
}

impl BufferHandler for SessionState {
    fn buffer_destroyed(&mut self, _buffer: &WlBuffer) {}
}

impl ShmHandler for SessionState {
    fn shm_state(&self) -> &ShmState {
        &self.shm
    }
}

impl XdgShellHandler for SessionState {
    fn xdg_shell_state(&mut self) -> &mut XdgShellState {
        &mut self.xdg
    }

    fn new_toplevel(&mut self, surface: ToplevelSurface) {
        let id = self.new_id();
        // The window manager can maximize and minimize; it has no
        // fullscreen of its own, so a fullscreen request maximizes.
        surface.with_pending_state(|s| {
            s.capabilities.set(xdg_toplevel::WmCapabilities::Maximize);
            s.capabilities.set(xdg_toplevel::WmCapabilities::Minimize);
            s.capabilities.set(xdg_toplevel::WmCapabilities::Fullscreen);
        });
        let root = surface.wl_surface().clone();
        let role = Role::Toplevel {
            shell: ToplevelShell::Xdg(surface),
            title: String::new(),
            app_id: String::new(),
            // Until the app asks for the OS title bar, it draws its own.
            decorations: Decorations::Client,
            min: (0, 0),
            max: (0, 0),
            origin: (0, 0),
        };
        self.windows.push(Window::new(id, root, role));
    }

    /// A menu, dropdown or tooltip. It is placed from its positioner, kept
    /// on the output, and configured on its first commit.
    fn new_popup(&mut self, surface: PopupSurface, positioner: PositionerState) {
        let parent = surface
            .get_parent_surface()
            .and_then(|p| self.index_of_root(&p))
            .map(|i| self.windows[i].id);
        let Some(parent) = parent else {
            // Its parent isn't a window here: configure it anyway, so the
            // app doesn't wait forever, but never show it.
            let _ = surface.send_configure();
            return;
        };
        let geometry = self.place_popup(parent, positioner);
        surface.with_pending_state(|s| {
            s.geometry = geometry;
            s.positioner = positioner;
        });
        let id = self.new_id();
        let root = surface.wl_surface().clone();
        let role = Role::Popup {
            shell: PopupShell::Xdg(surface),
            parent,
            position: (geometry.loc.x, geometry.loc.y),
            grab: false,
        };
        self.windows.push(Window::new(id, root, role));
    }

    /// A menu takes the keyboard and closes when the owner clicks outside
    /// the app.
    fn grab(&mut self, surface: PopupSurface, _seat: WlSeat, _serial: Serial) {
        let Some(i) = self.index_of_root(surface.wl_surface()) else {
            return;
        };
        let id = self.windows[i].id;
        if let Role::Popup { grab, .. } = &mut self.windows[i].role {
            *grab = true;
        }
        if !self.grabs.contains(&id) {
            self.grabs.push(id);
        }
        self.keyboard_to_grab_or_focus();
        self.announce_if_mapped(i);
    }

    fn reposition_request(&mut self, surface: PopupSurface, positioner: PositionerState, token: u32) {
        let Some(i) = self.index_of_root(surface.wl_surface()) else {
            return;
        };
        let Role::Popup { parent, .. } = self.windows[i].role else {
            return;
        };
        let geometry = self.place_popup(parent, positioner);
        surface.with_pending_state(|s| {
            s.geometry = geometry;
            s.positioner = positioner;
        });
        surface.send_repositioned(token);
        if let Role::Popup { position, .. } = &mut self.windows[i].role {
            *position = (geometry.loc.x, geometry.loc.y);
        }
        self.announce_if_mapped(i);
    }

    fn popup_destroyed(&mut self, surface: PopupSurface) {
        if let Some(i) = self.index_of_root(surface.wl_surface()) {
            self.remove_window(i);
        }
    }

    fn move_request(&mut self, surface: ToplevelSurface, _seat: WlSeat, _serial: Serial) {
        self.request(&surface, "move", None);
    }

    fn resize_request(
        &mut self,
        surface: ToplevelSurface,
        _seat: WlSeat,
        _serial: Serial,
        edges: xdg_toplevel::ResizeEdge,
    ) {
        let edges = match edges {
            xdg_toplevel::ResizeEdge::Top => "n",
            xdg_toplevel::ResizeEdge::Bottom => "s",
            xdg_toplevel::ResizeEdge::Left => "w",
            xdg_toplevel::ResizeEdge::Right => "e",
            xdg_toplevel::ResizeEdge::TopLeft => "nw",
            xdg_toplevel::ResizeEdge::TopRight => "ne",
            xdg_toplevel::ResizeEdge::BottomLeft => "sw",
            xdg_toplevel::ResizeEdge::BottomRight => "se",
            _ => return,
        };
        self.request(&surface, "resize", Some(edges.into()));
    }

    fn maximize_request(&mut self, surface: ToplevelSurface) {
        self.request(&surface, "maximize", None);
    }

    fn unmaximize_request(&mut self, surface: ToplevelSurface) {
        self.request(&surface, "unmaximize", None);
    }

    fn minimize_request(&mut self, surface: ToplevelSurface) {
        self.request(&surface, "minimize", None);
    }

    fn fullscreen_request(&mut self, surface: ToplevelSurface, _output: Option<WlOutput>) {
        self.request(&surface, "fullscreen", None);
    }

    fn unfullscreen_request(&mut self, surface: ToplevelSurface) {
        self.request(&surface, "unfullscreen", None);
    }

    // `show_window_menu` is left to its default: ignored.

    fn toplevel_destroyed(&mut self, surface: ToplevelSurface) {
        if let Some(i) = self.index_of_root(surface.wl_surface()) {
            self.remove_window(i);
        }
    }

    fn title_changed(&mut self, surface: ToplevelSurface) {
        self.read_names(&surface);
    }

    fn app_id_changed(&mut self, surface: ToplevelSurface) {
        self.read_names(&surface);
    }
}

impl SessionState {
    fn read_names(&mut self, surface: &ToplevelSurface) {
        let Some(i) = self.index_of_root(surface.wl_surface()) else {
            return;
        };
        let (new_title, new_app_id) = with_states(surface.wl_surface(), |states| {
            let data = states
                .data_map
                .get::<XdgToplevelSurfaceData>()
                .expect("a toplevel has toplevel data")
                .lock()
                .expect("toplevel data lock");
            (
                data.title.clone().unwrap_or_default(),
                data.app_id.clone().unwrap_or_default(),
            )
        });
        let Role::Toplevel { title, app_id, .. } = &mut self.windows[i].role else {
            return;
        };
        if *title == new_title && *app_id == new_app_id {
            return;
        }
        *title = new_title;
        *app_id = new_app_id;
        self.announce_if_mapped(i);
    }
}

/// The clipboard bridge with the tab and with X11 apps. Plain text only
/// (crate::clipboard).
impl SessionState {
    /// The app that just set the clipboard offered text: ask it to write the
    /// text into a pipe, and return the end the host reads. Called after a
    /// round of dispatch, when smithay has stored the new selection.
    pub fn start_clipboard_read(&mut self) -> Option<PipeReader> {
        let mime = self.clipboard_to_read.take()?;
        let (reader, writer) = std::io::pipe().ok()?;
        match self.host_selection() {
            None => request_data_device_client_selection(&self.seat, mime, OwnedFd::from(writer)).ok()?,
            Some(HostSelection::X11 { .. }) => {
                if !self.x11_read_clipboard(mime, OwnedFd::from(writer)) {
                    return None;
                }
            }
            // The tab's own text took its place this round.
            Some(HostSelection::Tab(_)) => return None,
        }
        Some(reader)
    }

    /// The tab read its clipboard for a paste: offer the text as the
    /// session's selection, to the app with the keyboard, to whichever app
    /// takes it next, and to X11 apps. Larger than the limit, nothing
    /// changes.
    pub fn set_clipboard(&mut self, text: String) {
        if text.is_empty() || text.len() > MAX_CLIPBOARD_BYTES {
            return;
        }
        self.set_host_selection(HostSelection::Tab(Arc::from(text)));
        self.x11_offer_clipboard(Some(&X11_OFFERED_MIME_TYPES));
    }

    /// The session's selection, when the host set it rather than a Wayland
    /// app.
    fn host_selection(&self) -> Option<HostSelection> {
        current_data_device_selection_userdata(&self.seat).map(|held| held.clone())
    }

    fn set_host_selection(&mut self, held: HostSelection) {
        self.clipboard_wayland_mime = None;
        let mime_types = OFFERED_MIME_TYPES.iter().map(|m| m.to_string()).collect();
        set_data_device_selection(&self.dh, &self.seat, mime_types, held);
    }

    /// Whether X11 apps should see text on the clipboard when Xwayland
    /// starts: the tab's, or a Wayland app's that offered some.
    fn clipboard_has_text_for_x11(&self) -> bool {
        match self.host_selection() {
            Some(HostSelection::Tab(_)) => true,
            Some(HostSelection::X11 { .. }) => false,
            None => self.clipboard_wayland_mime.is_some(),
        }
    }

    /// An X11 app took `CLIPBOARD`. Offering text (`mime`), it becomes the
    /// session's selection, which Wayland apps paste through the window
    /// manager, and its text goes to the tab after this round. Offering
    /// none (an image), the session's selection empties: only text crosses.
    fn x11_took_clipboard(&mut self, mime: Option<String>) {
        self.clipboard_to_read = mime.clone();
        match mime {
            Some(mime) => self.set_host_selection(HostSelection::X11 { mime }),
            None => {
                self.clipboard_wayland_mime = None;
                clear_data_device_selection(&self.dh, &self.seat);
            }
        }
    }

    /// The X11 app that had `CLIPBOARD` let it go, or Xwayland went: a
    /// session selection that was its copy empties.
    fn x11_clipboard_gone(&mut self) {
        if matches!(self.host_selection(), Some(HostSelection::X11 { .. })) {
            clear_data_device_selection(&self.dh, &self.seat);
        }
    }

    /// Write the clipboard's text into an app's pipe, from wherever it is.
    /// A write of the host's own text runs on a thread of its own, so an app
    /// that reads slowly (or never) can't stall the session.
    fn paste(&mut self, from: PasteFrom, fd: OwnedFd) {
        match from {
            PasteFrom::Text(text) => {
                std::thread::spawn(move || write_within(fd, text.as_bytes(), PASTE_WRITE_TIMEOUT));
            }
            PasteFrom::WaylandApp(mime) => {
                let _ = request_data_device_client_selection(&self.seat, mime, fd);
            }
            PasteFrom::X11App(mime) => {
                self.x11_read_clipboard(mime, fd);
            }
            // Dropping the fd closes the app's pipe: an empty paste.
            PasteFrom::Nothing => {}
        }
    }

    /// An X11 app pastes `CLIPBOARD` while the session's clipboard isn't an
    /// X11 app's.
    fn x11_paste(&mut self, fd: OwnedFd, target: &str) {
        let held = self.host_selection();
        let from = paste_from(held.as_ref(), self.clipboard_wayland_mime.as_deref(), true);
        match from {
            PasteFrom::Text(text) if is_latin1_target(target) => {
                let bytes = latin1_bytes(&text);
                std::thread::spawn(move || write_within(fd, &bytes, PASTE_WRITE_TIMEOUT));
            }
            from => self.paste(from, fd),
        }
    }
}

/// The cursor the tab shows (crate::cursor).
impl SessionState {
    /// Tell the tab the cursor, if it changed this round: a name, or the
    /// cursor surface's image and hotspot.
    pub fn flush_cursor(&mut self) {
        if !std::mem::take(&mut self.cursor_changed) {
            return;
        }
        let next = match &self.cursor_status {
            CursorImageStatus::Hidden => Cursor::named("none"),
            CursorImageStatus::Named(icon) => Cursor::named(icon.name()),
            CursorImageStatus::Surface(surface) if surface.is_alive() => {
                let hotspot = with_states(surface, |states| {
                    states
                        .data_map
                        .get::<CursorImageSurfaceData>()
                        .and_then(|data| data.lock().ok().map(|d| d.hotspot))
                })
                .unwrap_or_default();
                Cursor::drawn(self.images.get(&surface.id()), (hotspot.x, hotspot.y))
            }
            // Its surface is gone: the app will set another.
            CursorImageStatus::Surface(_) => Cursor::named("default"),
        };
        if let Some(changed) = self.cursor.change(next) {
            let changed = changed.clone();
            self.send_cursor(changed);
        }
    }

    fn send_cursor(&mut self, cursor: Cursor) {
        self.outbox.push(Outbound::Cursor { session: self.id.clone(), name: cursor.name, image: cursor.image });
    }
}

/// xdg-decoration: an app that asks gets the OS title bar; one that asks to
/// draw its own, or never asks, gets a frame. With no preference stated, the
/// host picks the OS title bar.
impl XdgDecorationHandler for SessionState {
    fn new_decoration(&mut self, toplevel: ToplevelSurface) {
        self.set_decorations(&toplevel, DecorationMode::ServerSide);
    }

    fn request_mode(&mut self, toplevel: ToplevelSurface, mode: DecorationMode) {
        self.set_decorations(&toplevel, mode);
    }

    fn unset_mode(&mut self, toplevel: ToplevelSurface) {
        self.set_decorations(&toplevel, DecorationMode::ServerSide);
    }
}

impl SeatHandler for SessionState {
    type KeyboardFocus = KeyboardFocus;
    type PointerFocus = WlSurface;
    type TouchFocus = WlSurface;

    fn seat_state(&mut self) -> &mut SeatState<SessionState> {
        &mut self.seat_state
    }

    /// The clipboard follows the keyboard: the app with focus is offered the
    /// current selection, and only it may set a new one.
    fn focus_changed(&mut self, seat: &Seat<Self>, focused: Option<&KeyboardFocus>) {
        let client = focused
            .and_then(WaylandFocus::wl_surface)
            .and_then(|surface| self.dh.get_client(surface.id()).ok());
        set_data_device_focus(&self.dh, seat, client);
    }

    /// An app named a cursor (cursor-shape-v1), hid it, or set a cursor
    /// surface; smithay sets the default one when the pointer leaves an
    /// app. The tab hears after this round (`flush_cursor`), so a surface
    /// set and drawn in one go is sent once.
    fn cursor_image(&mut self, _seat: &Seat<Self>, image: CursorImageStatus) {
        self.cursor_status = image;
        self.cursor_changed = true;
    }
}

impl TabletSeatHandler for SessionState {}

impl OutputHandler for SessionState {}

impl SelectionHandler for SessionState {
    /// The selection the host set: the tab's text, or an X11 app's copy.
    type SelectionUserData = HostSelection;

    /// A Wayland app set the clipboard. When it offers text, the host reads
    /// it after this round (see `start_clipboard_read`) and sends it to the
    /// tab, and X11 apps are offered it; otherwise X11 apps see an empty
    /// clipboard.
    fn new_selection(&mut self, ty: SelectionTarget, source: Option<SelectionSource>, _seat: Seat<Self>) {
        if ty != SelectionTarget::Clipboard {
            return;
        }
        let set = source.is_some();
        let mime = source.and_then(|s| text_mime(&s.mime_types()));
        self.clipboard_to_read = mime.clone();
        self.clipboard_wayland_mime = mime.clone();
        match (set, mime.is_some()) {
            (false, _) => self.x11_offer_clipboard(None),
            (true, true) => self.x11_offer_clipboard(Some(&X11_OFFERED_MIME_TYPES)),
            (true, false) => self.x11_offer_clipboard(Some(&[])),
        }
    }

    /// A Wayland app pastes the host's selection: the tab's text, or an X11
    /// app's, read from it as it goes.
    fn send_selection(
        &mut self,
        ty: SelectionTarget,
        mime_type: String,
        fd: OwnedFd,
        _seat: Seat<Self>,
        user_data: &HostSelection,
    ) {
        if ty != SelectionTarget::Clipboard || !OFFERED_MIME_TYPES.contains(&mime_type.as_str()) {
            return;
        }
        let from = paste_from(Some(user_data), None, false);
        self.paste(from, fd);
    }
}

impl DataDeviceHandler for SessionState {
    fn data_device_state(&self) -> &DataDeviceState {
        &self.data_device
    }
}

impl ClientDndGrabHandler for SessionState {}
impl ServerDndGrabHandler for SessionState {}

delegate_compositor!(SessionState);
delegate_shm!(SessionState);
delegate_xdg_shell!(SessionState);
delegate_xdg_decoration!(SessionState);
delegate_cursor_shape!(SessionState);
delegate_seat!(SessionState);
delegate_output!(SessionState);
delegate_data_device!(SessionState);

/// How long a paste may wait on an app that stopped reading its pipe.
const PASTE_WRITE_TIMEOUT: Duration = Duration::from_secs(5);

/// Write `data` into an app's pipe without blocking: when the pipe is full,
/// wait for room until `timeout` has passed since the start, then give up and
/// close it. An app that closes its end early (EPIPE) or any other error also
/// ends the write. (The pipe stays non-blocking, as the window manager's
/// pipe for an X11 app is.)
fn write_within(fd: OwnedFd, data: &[u8], timeout: Duration) {
    use rustix::event::{poll, PollFd, PollFlags};
    use rustix::io::Errno;
    let deadline = Instant::now() + timeout;
    let mut rest = data;
    while !rest.is_empty() {
        match rustix::io::write(&fd, rest) {
            Ok(0) => return,
            Ok(n) => rest = &rest[n..],
            Err(Errno::INTR) => {}
            Err(Errno::AGAIN) => {
                let left = deadline.saturating_duration_since(Instant::now());
                if left.is_zero() {
                    return;
                }
                let wait = rustix::event::Timespec { tv_sec: left.as_secs() as _, tv_nsec: left.subsec_nanos() as _ };
                let mut fds = [PollFd::new(&fd, PollFlags::OUT)];
                match poll(&mut fds, Some(&wait)) {
                    Ok(_) | Err(Errno::INTR) => {}
                    Err(_) => return,
                }
            }
            Err(_) => return,
        }
    }
}

/// X11's `STRING` target is Latin-1; the other text targets are UTF-8.
fn is_latin1_target(target: &str) -> bool {
    target == "STRING"
}

/// Text as Latin-1: U+0000 to U+00FF as single bytes, anything else as `?`.
fn latin1_bytes(text: &str) -> Vec<u8> {
    text.chars().map(|c| u8::try_from(u32::from(c)).unwrap_or(b'?')).collect()
}

#[cfg(test)]
mod tests {
    use super::{is_latin1_target, latin1_bytes, write_within, xkb_config, KEYBOARD_LAYOUTS};
    use smithay::input::keyboard::xkb;
    use std::time::{Duration, Instant};

    fn nonblocking_pipe() -> (std::io::PipeReader, std::io::PipeWriter) {
        let (reader, writer) = std::io::pipe().unwrap();
        rustix::io::ioctl_fionbio(&writer, true).unwrap();
        (reader, writer)
    }

    #[test]
    fn string_target_is_latin1() {
        assert!(is_latin1_target("STRING"));
        for t in ["UTF8_STRING", "TEXT", "text/plain", "text/plain;charset=utf-8"] {
            assert!(!is_latin1_target(t));
        }
        assert_eq!(latin1_bytes("aé\u{ff}\u{100}€😀"), vec![b'a', 0xe9, 0xff, b'?', b'?', b'?']);
    }

    #[test]
    fn a_stalled_reader_is_abandoned_at_the_deadline() {
        let (reader, writer) = nonblocking_pipe();
        let start = Instant::now();
        // Far more than a pipe holds; the reader never reads but stays open.
        write_within(writer.into(), &vec![b'x'; 4 * 1024 * 1024], Duration::from_millis(200));
        let took = start.elapsed();
        assert!(took >= Duration::from_millis(150) && took < Duration::from_secs(3), "{took:?}");
        drop(reader);
    }

    #[test]
    fn a_normal_paste_is_written_whole() {
        use std::io::Read;
        let (reader, writer) = nonblocking_pipe();
        write_within(writer.into(), b"hello", Duration::from_secs(1));
        let mut got = String::new();
        let mut reader = reader;
        reader.read_to_string(&mut got).unwrap();
        assert_eq!(got, "hello");
    }

    /// What a key types in a layout's keymap: the evdev code, plus Shift.
    fn types(layout: &str, evdev: u32, shift: bool) -> String {
        let config = xkb_config(layout).expect("a layout the host offers");
        let context = xkb::Context::new(xkb::CONTEXT_NO_FLAGS);
        let keymap = xkb::Keymap::new_from_names(
            &context,
            config.rules,
            config.model,
            config.layout,
            config.variant,
            config.options.clone(),
            xkb::KEYMAP_COMPILE_NO_FLAGS,
        )
        .expect("the keymap builds");
        let mut state = xkb::State::new(&keymap);
        // xkb's key codes are the evdev ones plus 8.
        const KEY_LEFTSHIFT: u32 = 42;
        if shift {
            state.update_key((KEY_LEFTSHIFT + 8).into(), xkb::KeyDirection::Down);
        }
        state.key_get_utf8((evdev + 8).into())
    }

    #[test]
    fn every_layout_offered_builds_its_keymap() {
        for (id, _, _) in KEYBOARD_LAYOUTS {
            assert_eq!(types(id, 30, false), "a", "{id}: KEY_A types a");
        }
        assert!(xkb_config("xx").is_none());
    }

    #[test]
    fn romanian_types_its_letters_on_the_same_physical_keys() {
        // KEY_SEMICOLON, KEY_APOSTROPHE, KEY_LEFTBRACE, KEY_RIGHTBRACE, KEY_BACKSLASH.
        let keys = [39, 40, 26, 27, 43];
        let lower: Vec<String> = keys.iter().map(|&k| types("ro", k, false)).collect();
        let upper: Vec<String> = keys.iter().map(|&k| types("ro", k, true)).collect();
        assert_eq!(lower, ["ș", "ț", "ă", "î", "â"]);
        assert_eq!(upper, ["Ș", "Ț", "Ă", "Î", "Â"]);
        // US on the same keys, unchanged.
        let us: Vec<String> = keys.iter().map(|&k| types("us", k, false)).collect();
        assert_eq!(us, [";", "'", "[", "]", "\\"]);
    }
}
