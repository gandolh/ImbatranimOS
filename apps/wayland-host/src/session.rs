//! One desktop session (one browser tab): its own Wayland display, globals,
//! output, seat and clients. Nothing here is shared with another session, so
//! a client on tab A's socket can never reach tab B.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use smithay::delegate_compositor;
use smithay::delegate_cursor_shape;
use smithay::delegate_data_device;
use smithay::delegate_output;
use smithay::delegate_seat;
use smithay::delegate_shm;
use smithay::delegate_xdg_decoration;
use smithay::delegate_xdg_shell;
use smithay::input::keyboard::{FilterResult, KeyboardHandle, XkbConfig};
use smithay::input::pointer::{
    AxisFrame, ButtonEvent, CursorImageStatus, MotionEvent, PointerHandle,
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
use smithay::reexports::wayland_server::{Client, DisplayHandle, Resource};
use smithay::utils::{Logical, Point, Rectangle, Serial, Transform, SERIAL_COUNTER};
use smithay::wayland::buffer::BufferHandler;
use smithay::wayland::compositor::{
    get_parent, is_sync_subsurface, with_states, with_surface_tree_upward, BufferAssignment, CompositorClientState,
    CompositorHandler, CompositorState, Damage, SubsurfaceCachedState, SurfaceAttributes, TraversalAction,
};
use smithay::wayland::cursor_shape::CursorShapeManagerState;
use smithay::wayland::output::OutputHandler;
use smithay::wayland::selection::data_device::{
    ClientDndGrabHandler, DataDeviceHandler, DataDeviceState, ServerDndGrabHandler,
};
use smithay::wayland::selection::SelectionHandler;
use smithay::wayland::shell::xdg::decoration::{XdgDecorationHandler, XdgDecorationState};
use smithay::wayland::shell::xdg::{
    PopupSurface, PositionerState, SurfaceCachedState, ToplevelSurface, XdgShellHandler, XdgShellState,
    XdgToplevelSurfaceData,
};
use smithay::wayland::shm::{with_buffer_contents, ShmHandler, ShmState};
use smithay::wayland::tablet_manager::TabletSeatHandler;

use crate::pixels::{clip_signed, Canvas, Encoding, Layer, ShmFormat, SurfaceImage};
use crate::protocol::{encode_frame_body, Decorations, Geometry, Outbound, PopupInfo, Rect, ToplevelInfo};

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

/// What a window is to the app: a toplevel (an OS window) or a popup (a
/// menu, a dropdown, a tooltip) drawn above its parent.
enum Role {
    Toplevel {
        surface: ToplevelSurface,
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
        surface: PopupSurface,
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
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl Window {
    fn is_popup(&self) -> bool {
        matches!(self.role, Role::Popup { .. })
    }

    fn whole_geometry(&self) -> Geometry {
        let (width, height) = (self.canvas.width, self.canvas.height);
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
            width: self.canvas.width,
            height: self.canvas.height,
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
            width: self.canvas.width,
            height: self.canvas.height,
            geometry: self.whole_geometry(),
            grab: *grab,
        })
    }

    fn client(&self) -> Option<ClientId> {
        self.root.client().map(|c| c.id())
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

/// Copy what a client's shm buffer changed into a surface's image. Returns
/// the changed rectangles in surface pixels, or None when it can't be read.
fn copy_buffer(buffer: &WlBuffer, damage: &[Damage], image: &mut SurfaceImage) -> Option<Vec<Rect>> {
    with_buffer_contents(buffer, |ptr, len, data| {
        let format = match data.format {
            wl_shm::Format::Argb8888 => ShmFormat::Argb8888,
            wl_shm::Format::Xrgb8888 => ShmFormat::Xrgb8888,
            _ => return None,
        };
        let (w, h) = (data.width.max(0) as u32, data.height.max(0) as u32);
        let rects: Vec<Rect> = damage
            .iter()
            .filter_map(|d| match d {
                Damage::Surface(r) => clip_signed(r.loc.x, r.loc.y, r.size.w, r.size.h, w, h),
                Damage::Buffer(r) => clip_signed(r.loc.x, r.loc.y, r.size.w, r.size.h, w, h),
            })
            .collect();
        // SAFETY: smithay hands us the client's mapped pool for the
        // duration of this closure; we only read inside it.
        let pool = unsafe { std::slice::from_raw_parts(ptr, len) };
        image.copy_from_shm(
            pool,
            data.offset.max(0) as usize,
            w,
            h,
            data.stride.max(0) as usize,
            format,
            &rects,
        )
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
    seat_state: SeatState<SessionState>,
    _seat: Seat<SessionState>,
    keyboard: KeyboardHandle<SessionState>,
    /// The layout the keyboard's keymap was built from (`KEYBOARD_LAYOUTS`).
    layout_id: String,
    pointer: PointerHandle<SessionState>,
    output: Output,
    output_size: (i32, i32),
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
    /// The processes connected to the socket: pid (0 when unknown) and
    /// whether each has gone.
    clients: Vec<(u32, Arc<ClientState>)>,
    /// The backend froze the session's apps under the cover screen.
    frozen: bool,
    /// The tab is showing; a hidden one gets no frames.
    visible: bool,
    cursor: String,
    /// Surfaces with frame callbacks waiting to be answered.
    pending_callbacks: Vec<WlSurface>,
    /// JSON messages for the backend, drained by the host.
    pub outbox: Vec<Outbound>,
    started: Instant,
}

impl SessionState {
    pub fn new(id: String, dh: &DisplayHandle, width: u32, height: u32, started: Instant) -> SessionState {
        let compositor = CompositorState::new::<SessionState>(dh);
        let xdg = XdgShellState::new::<SessionState>(dh);
        let shm = ShmState::new::<SessionState>(dh, vec![]);
        // Copy and paste between the session's own Linux apps only; the
        // desktop's clipboard is a later piece of work. Some apps (foot)
        // refuse to start without this global.
        let data_device = DataDeviceState::new::<SessionState>(dh);
        let decoration = XdgDecorationState::new::<SessionState>(dh);
        let cursor_shape = CursorShapeManagerState::new::<SessionState>(dh);
        let stubs = crate::stubs::Stubs::new(dh);
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
            seat_state,
            _seat: seat,
            keyboard,
            layout_id: DEFAULT_LAYOUT.to_string(),
            pointer,
            output,
            output_size: (1, 1),
            windows: Vec::new(),
            next_window: 1,
            images: HashMap::new(),
            focused: None,
            grabs: Vec::new(),
            keyboard_away: false,
            clients: Vec::new(),
            frozen: false,
            visible: true,
            cursor: "default".into(),
            pending_callbacks: Vec::new(),
            outbox: Vec::new(),
            started,
        };
        state.set_output_size(width, height);
        state
    }

    fn now(&self) -> u32 {
        self.started.elapsed().as_millis() as u32
    }

    pub fn stubs_mut(&mut self) -> &mut crate::stubs::Stubs {
        &mut self.stubs
    }

    /// The session's one output is the tab's viewport.
    pub fn set_output_size(&mut self, width: u32, height: u32) {
        let size = (width.clamp(1, 16384) as i32, height.clamp(1, 16384) as i32);
        self.output_size = size;
        let mode = Mode {
            size: size.into(),
            refresh: 60_000,
        };
        self.output.change_current_state(
            Some(mode),
            Some(Transform::Normal),
            Some(Scale::Integer(1)),
            Some((0, 0).into()),
        );
        self.output.set_preferred(mode);
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
                            width: img.width,
                            height: img.height,
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
            if !w.mapped || w.in_flight || quiet[i] || !w.canvas.has_damage() {
                continue;
            }
            let layers: Vec<Layer> = w
                .layout
                .iter()
                .filter_map(|p| images.get(&p.id).map(|image| Layer { x: p.x, y: p.y, image }))
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

    fn announce_clients(&mut self) {
        let mut pids: Vec<u32> = self.clients.iter().map(|(p, _)| *p).filter(|p| *p != 0).collect();
        pids.sort_unstable();
        pids.dedup();
        self.outbox.push(Outbound::Clients { session: self.id.clone(), pids });
    }

    /// A tab took the session back (after a reload): every window is
    /// announced again, toplevels before popups, and sent whole.
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
        let name = self.cursor.clone();
        self.outbox.push(Outbound::Cursor { session: self.id.clone(), name });
        self.announce_clients();
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
    }

    fn request(&mut self, surface: &ToplevelSurface, action: &str, edges: Option<String>) {
        let Some(i) = self.index_of_root(surface.wl_surface()) else {
            return;
        };
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
            .map(|i| (i.width, i.height));
        let Some((width, height)) = root_size else {
            // No buffer on the root: the app hid the window.
            self.windows[index].layout = layout;
            self.unmap(index);
            return;
        };
        let w = &mut self.windows[index];
        let before = (w.canvas.width, w.canvas.height);
        w.canvas.resize(width, height);
        if w.layout != layout {
            w.canvas.damage_all();
        } else {
            for (id, rects) in changed {
                if let Some(p) = layout.iter().find(|p| &p.id == id) {
                    for r in rects {
                        w.canvas.damage(p.x + r.x as i32, p.y + r.y as i32, r.w, r.h);
                    }
                }
            }
        }
        w.layout = layout;
        let resized = before != (width, height);
        if !w.mapped {
            w.mapped = true;
            self.announce(index, true);
        } else if resized {
            self.announce(index, false);
        }
    }

    /// The window geometry and size limits the app set with its last commit.
    fn read_cached(&mut self, index: usize) {
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
            if let Role::Popup { surface, .. } = &self.windows[i].role {
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
                .map(|i| self.windows[i].root.clone())
        };
        let keyboard = self.keyboard.clone();
        if keyboard.current_focus() != target {
            keyboard.set_focus(self, target, SERIAL_COUNTER.next_serial());
        }
    }

    // ── Input from the tab ──────────────────────────────────────────────

    /// The tab moved a toplevel's OS window: its geometry now starts here on
    /// the output.
    pub fn position(&mut self, toplevel: u32, x: i32, y: i32) {
        if let Some(i) = self.index_of(toplevel) {
            if let Role::Toplevel { origin, .. } = &mut self.windows[i].role {
                *origin = (x, y);
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
            let Role::Toplevel { surface, .. } = &w.role else {
                continue;
            };
            let changed = surface.with_pending_state(|s| {
                if Some(w.id) == focused {
                    s.states.set(xdg_toplevel::State::Activated)
                } else {
                    s.states.unset(xdg_toplevel::State::Activated)
                }
            });
            if changed && surface.is_initial_configure_sent() {
                surface.send_pending_configure();
            }
        }
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
                if local.0 < 0 || local.1 < 0 || local.0 >= img.width as i32 || local.1 >= img.height as i32 {
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
        let Role::Toplevel { surface, min, max, .. } = &self.windows[i].role else {
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
        if let Some(Role::Toplevel { surface, .. }) = self.index_of(toplevel).map(|i| &self.windows[i].role) {
            surface.send_close();
        }
    }
}

impl CompositorHandler for SessionState {
    fn compositor_state(&mut self) -> &mut CompositorState {
        &mut self.compositor
    }

    fn client_compositor_state<'a>(&self, client: &'a Client) -> &'a CompositorClientState {
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
                Role::Toplevel { surface: t, .. } if !t.is_initial_configure_sent() => {
                    t.send_configure();
                }
                Role::Popup { surface: p, .. } if !p.is_initial_configure_sent() => {
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
        with_surface_tree_upward(
            surface,
            (),
            |_, _, _| TraversalAction::DoChildren(()),
            |surf, states, _| {
                let mut attrs = states.cached_state.get::<SurfaceAttributes>();
                let current = attrs.current();
                let buffer = current.buffer.take();
                let damage = std::mem::take(&mut current.damage);
                if !current.frame_callbacks.is_empty() {
                    wants_frame.push(surf.clone());
                }
                match buffer {
                    Some(BufferAssignment::NewBuffer(buffer)) => {
                        let image = images.entry(surf.id()).or_default();
                        if let Some(rects) = copy_buffer(&buffer, &damage, image) {
                            changed.push((surf.id(), rects));
                        }
                        // Copied (or unreadable); either way the client may
                        // reuse it.
                        buffer.release();
                    }
                    Some(BufferAssignment::Removed) => {
                        images.remove(&surf.id());
                    }
                    None => {}
                }
            },
            |_, _, _| true,
        );
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
        self.windows.push(Window {
            id,
            root: surface.wl_surface().clone(),
            role: Role::Toplevel {
                surface,
                title: String::new(),
                app_id: String::new(),
                // Until the app asks for the OS title bar, it draws its own.
                decorations: Decorations::Client,
                min: (0, 0),
                max: (0, 0),
                origin: (0, 0),
            },
            canvas: Canvas::default(),
            mapped: false,
            in_flight: false,
            geometry: None,
            layout: Vec::new(),
            shown: true,
        });
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
        self.windows.push(Window {
            id,
            root: surface.wl_surface().clone(),
            role: Role::Popup {
                surface,
                parent,
                position: (geometry.loc.x, geometry.loc.y),
                grab: false,
            },
            canvas: Canvas::default(),
            mapped: false,
            in_flight: false,
            geometry: None,
            layout: Vec::new(),
            shown: true,
        });
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
    type KeyboardFocus = WlSurface;
    type PointerFocus = WlSurface;
    type TouchFocus = WlSurface;

    fn seat_state(&mut self) -> &mut SeatState<SessionState> {
        &mut self.seat_state
    }

    /// cursor-shape-v1 names a cursor; the tab shows it as a CSS cursor. An
    /// app that draws its own cursor surface gets the default arrow.
    fn cursor_image(&mut self, _seat: &Seat<Self>, image: CursorImageStatus) {
        let name = match image {
            CursorImageStatus::Hidden => "none".to_string(),
            CursorImageStatus::Named(icon) => icon.name().to_string(),
            CursorImageStatus::Surface(_) => "default".to_string(),
        };
        if name != self.cursor {
            self.cursor = name.clone();
            self.outbox.push(Outbound::Cursor { session: self.id.clone(), name });
        }
    }
}

impl TabletSeatHandler for SessionState {}

impl OutputHandler for SessionState {}

impl SelectionHandler for SessionState {
    type SelectionUserData = ();
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

#[cfg(test)]
mod tests {
    use super::{xkb_config, KEYBOARD_LAYOUTS};
    use smithay::input::keyboard::xkb;

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
