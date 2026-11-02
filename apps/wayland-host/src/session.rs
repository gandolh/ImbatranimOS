//! One desktop session (one browser tab): its own Wayland display, globals,
//! output, seat and clients. Nothing here is shared with another session, so
//! a client on tab A's socket can never reach tab B.

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
use smithay::reexports::wayland_server::backend::{ClientData, ClientId, DisconnectReason};
use smithay::backend::input::{Axis, AxisSource, ButtonState, KeyState};
use smithay::reexports::wayland_server::protocol::{
    wl_buffer::WlBuffer, wl_output::WlOutput, wl_seat::WlSeat, wl_shm, wl_surface::WlSurface,
};
use smithay::reexports::wayland_server::{Client, DisplayHandle, Resource};
use smithay::utils::{Serial, Transform, SERIAL_COUNTER};
use smithay::wayland::buffer::BufferHandler;
use smithay::wayland::compositor::{
    is_sync_subsurface, with_states, with_surface_tree_upward, BufferAssignment, CompositorClientState,
    CompositorHandler, CompositorState, Damage, SurfaceAttributes, TraversalAction,
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

use crate::pixels::{clip_signed, Canvas, Encoding, ShmFormat};
use crate::protocol::{encode_frame_body, Decorations, Geometry, Outbound, Rect, ToplevelInfo};

/// Key repeat the host announces (`wl_keyboard.repeat_info`). Apps repeat
/// keys themselves; the browser's own repeats are dropped before they get
/// here.
const REPEAT_DELAY_MS: i32 = 500;
const REPEAT_RATE_HZ: i32 = 25;

/// Per-client data smithay needs.
#[derive(Default)]
pub struct ClientState {
    pub compositor: CompositorClientState,
}

impl ClientData for ClientState {
    fn initialized(&self, _client_id: ClientId) {}
    fn disconnected(&self, _client_id: ClientId, _reason: DisconnectReason) {}
}

struct Toplevel {
    id: u32,
    surface: ToplevelSurface,
    title: String,
    app_id: String,
    canvas: Canvas,
    /// Announced to the backend: it has a buffer and an OS window.
    mapped: bool,
    /// A frame was sent and the backend hasn't acked it yet.
    in_flight: bool,
    decorations: Decorations,
    /// `xdg_surface.set_window_geometry`, if the app set one.
    geometry: Option<Geometry>,
    min: (u32, u32),
    max: (u32, u32),
}

impl Toplevel {
    fn info(&self) -> ToplevelInfo {
        let (width, height) = (self.canvas.width, self.canvas.height);
        ToplevelInfo {
            toplevel: self.id,
            title: self.title.clone(),
            app_id: self.app_id.clone(),
            width,
            height,
            geometry: self.geometry.unwrap_or(Geometry { x: 0, y: 0, width, height }),
            decorations: self.decorations,
            min_width: self.min.0,
            min_height: self.min.1,
            max_width: self.max.0,
            max_height: self.max.1,
        }
    }
}

pub struct SessionState {
    pub id: String,
    compositor: CompositorState,
    xdg: XdgShellState,
    shm: ShmState,
    data_device: DataDeviceState,
    _decoration: XdgDecorationState,
    _cursor_shape: CursorShapeManagerState,
    seat_state: SeatState<SessionState>,
    _seat: Seat<SessionState>,
    keyboard: KeyboardHandle<SessionState>,
    pointer: PointerHandle<SessionState>,
    output: Output,
    toplevels: Vec<Toplevel>,
    next_toplevel: u32,
    /// The toplevel with keyboard focus, if a Linux window has it.
    focused: Option<u32>,
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
        let mut seat_state = SeatState::new();
        let mut seat = seat_state.new_wl_seat(dh, "seat0");
        // A US keymap; a layout setting is later work.
        let keyboard = seat
            .add_keyboard(XkbConfig::default(), REPEAT_DELAY_MS, REPEAT_RATE_HZ)
            .expect("the default US keymap compiles");
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
            seat_state,
            _seat: seat,
            keyboard,
            pointer,
            output,
            toplevels: Vec::new(),
            next_toplevel: 1,
            focused: None,
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

    /// The session's one output is the tab's viewport.
    pub fn set_output_size(&mut self, width: u32, height: u32) {
        let mode = Mode {
            size: (width.clamp(1, 16384) as i32, height.clamp(1, 16384) as i32).into(),
            refresh: 60_000,
        };
        self.output
            .change_current_state(Some(mode), Some(Transform::Normal), Some(Scale::Integer(1)), Some((0, 0).into()));
        self.output.set_preferred(mode);
    }

    /// Encode every toplevel that has damage and no frame in flight. Each one
    /// sent is in flight until the backend acks it.
    pub fn take_frames(&mut self, encoding: Encoding) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        for t in self.toplevels.iter_mut() {
            if !t.mapped || t.in_flight || !t.canvas.has_damage() {
                continue;
            }
            let rects = t.canvas.take_frame(encoding);
            out.push(encode_frame_body(t.id, t.canvas.width, t.canvas.height, &rects));
            t.in_flight = true;
        }
        out
    }

    /// The backend passed a frame on and has room for the next one. The
    /// toplevel's waiting frame callbacks go now, so the app draws its next
    /// frame in time for the next tick.
    pub fn ack(&mut self, toplevel: u32) {
        let surface = match self.toplevels.iter_mut().find(|t| t.id == toplevel) {
            Some(t) => {
                t.in_flight = false;
                t.surface.wl_surface().clone()
            }
            None => return,
        };
        self.fire_callbacks(|s| s == &surface);
    }

    /// Answer frame callbacks for every surface whose toplevel isn't waiting
    /// on an ack. Holding them while a frame is in flight is what slows an
    /// app down when the tab's connection can't keep up.
    pub fn fire_idle_callbacks(&mut self) {
        let busy: Vec<WlSurface> = self
            .toplevels
            .iter()
            .filter(|t| t.in_flight)
            .map(|t| t.surface.wl_surface().clone())
            .collect();
        self.fire_callbacks(|s| !busy.contains(s));
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

    fn toplevel_index(&self, surface: &WlSurface) -> Option<usize> {
        self.toplevels.iter().position(|t| t.surface.wl_surface() == surface)
    }

    fn by_id(&self, id: u32) -> Option<&Toplevel> {
        self.toplevels.iter().find(|t| t.id == id)
    }

    fn announce(&mut self, index: usize, created: bool) {
        let info = self.toplevels[index].info();
        let session = self.id.clone();
        self.outbox.push(if created {
            Outbound::ToplevelCreated { session, info }
        } else {
            Outbound::ToplevelUpdated { session, info }
        });
    }

    fn announce_if_mapped(&mut self, index: usize) {
        if self.toplevels[index].mapped {
            self.announce(index, false);
        }
    }

    fn unmap(&mut self, index: usize) {
        let t = &mut self.toplevels[index];
        if t.mapped {
            t.mapped = false;
            t.in_flight = false;
            let toplevel = t.id;
            self.outbox.push(Outbound::ToplevelDestroyed { session: self.id.clone(), toplevel });
        }
        if self.focused == Some(self.toplevels[index].id) {
            self.focused = None;
        }
    }

    fn request(&mut self, surface: &ToplevelSurface, action: &str, edges: Option<String>) {
        let Some(i) = self.toplevel_index(surface.wl_surface()) else { return };
        let toplevel = self.toplevels[i].id;
        self.outbox.push(Outbound::Request { session: self.id.clone(), toplevel, action: action.into(), edges });
    }

    /// A toplevel's root surface got a new buffer: copy what changed.
    fn take_toplevel_buffer(&mut self, index: usize, buffer: &WlBuffer, damage: &[Damage]) {
        let t = &mut self.toplevels[index];
        let before = (t.canvas.width, t.canvas.height);
        let copied = with_buffer_contents(buffer, |ptr, len, data| {
            let format = match data.format {
                wl_shm::Format::Argb8888 => ShmFormat::Argb8888,
                wl_shm::Format::Xrgb8888 => ShmFormat::Xrgb8888,
                _ => return false,
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
            t.canvas.copy_from_shm(
                pool,
                data.offset.max(0) as usize,
                w,
                h,
                data.stride.max(0) as usize,
                format,
                &rects,
            )
        })
        .unwrap_or(false);
        if !copied {
            return;
        }
        let resized = before != (t.canvas.width, t.canvas.height);
        if !t.mapped {
            t.mapped = true;
            self.announce(index, true);
        } else if resized {
            self.announce(index, false);
        }
    }

    /// The window geometry and size limits the app set with its last commit.
    fn read_cached(&mut self, index: usize) {
        let surface = self.toplevels[index].surface.wl_surface().clone();
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
        let t = &mut self.toplevels[index];
        if t.geometry != geometry || t.min != min || t.max != max {
            t.geometry = geometry;
            t.min = min;
            t.max = max;
            self.announce_if_mapped(index);
        }
    }

    fn set_decorations(&mut self, surface: &ToplevelSurface, mode: DecorationMode) {
        surface.with_pending_state(|s| s.decoration_mode = Some(mode));
        if surface.is_initial_configure_sent() {
            surface.send_pending_configure();
        }
        if let Some(i) = self.toplevel_index(surface.wl_surface()) {
            let d = if mode == DecorationMode::ServerSide { Decorations::Server } else { Decorations::Client };
            if self.toplevels[i].decorations != d {
                self.toplevels[i].decorations = d;
                self.announce_if_mapped(i);
            }
        }
    }

    // ── Input from the tab ──────────────────────────────────────────────

    /// Keyboard focus follows the OS window the owner raised. Only one Linux
    /// window in the session has it; the rest lose `activated`.
    pub fn focus(&mut self, toplevel: Option<u32>) {
        let target = toplevel.and_then(|id| self.by_id(id)).map(|t| (t.id, t.surface.wl_surface().clone()));
        self.focused = target.as_ref().map(|(id, _)| *id);
        let keyboard = self.keyboard.clone();
        keyboard.set_focus(self, target.map(|(_, s)| s), SERIAL_COUNTER.next_serial());
        let focused = self.focused;
        for t in &self.toplevels {
            let changed = t.surface.with_pending_state(|s| {
                if Some(t.id) == focused {
                    s.states.set(xdg_toplevel::State::Activated)
                } else {
                    s.states.unset(xdg_toplevel::State::Activated)
                }
            });
            if changed && t.surface.is_initial_configure_sent() {
                t.surface.send_pending_configure();
            }
        }
    }

    pub fn pointer_motion(&mut self, toplevel: u32, x: f64, y: f64) {
        let Some(surface) = self.by_id(toplevel).map(|t| t.surface.wl_surface().clone()) else { return };
        let event = MotionEvent { location: (x, y).into(), serial: SERIAL_COUNTER.next_serial(), time: self.now() };
        let pointer = self.pointer.clone();
        pointer.motion(self, Some((surface, (0.0, 0.0).into())), &event);
        pointer.frame(self);
    }

    pub fn pointer_button(&mut self, toplevel: u32, button: u32, pressed: bool) {
        if self.by_id(toplevel).is_none() {
            return;
        }
        let state = if pressed { ButtonState::Pressed } else { ButtonState::Released };
        let event = ButtonEvent { serial: SERIAL_COUNTER.next_serial(), time: self.now(), button, state };
        let pointer = self.pointer.clone();
        pointer.button(self, &event);
        pointer.frame(self);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn pointer_axis(&mut self, toplevel: u32, dx: f64, dy: f64, v120x: i32, v120y: i32, wheel: bool) {
        if self.by_id(toplevel).is_none() {
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
        let event = MotionEvent { location, serial: SERIAL_COUNTER.next_serial(), time: self.now() };
        let pointer = self.pointer.clone();
        pointer.motion(self, None, &event);
        pointer.frame(self);
    }

    /// A key on the focused toplevel. `keycode` is the Linux (evdev) code;
    /// xkb's are 8 higher. The host's xkb state tracks the modifiers.
    pub fn key(&mut self, keycode: u32, pressed: bool) {
        if self.focused.is_none() || keycode == 0 || keycode > 767 {
            return;
        }
        let state = if pressed { KeyState::Pressed } else { KeyState::Released };
        let keyboard = self.keyboard.clone();
        let time = self.now();
        keyboard.input::<(), _>(self, (keycode + 8).into(), state, SERIAL_COUNTER.next_serial(), time, |_, _, _| {
            FilterResult::Forward
        });
    }

    /// The OS window's size and state, as `xdg_toplevel.configure`, within
    /// the app's own limits. The app answers with an ack and a new buffer.
    pub fn configure(&mut self, toplevel: u32, width: u32, height: u32, maximized: bool) {
        let Some(t) = self.by_id(toplevel) else { return };
        let clamp = |v: u32, min: u32, max: u32| {
            let v = v.max(min).max(1);
            if max > 0 {
                v.min(max)
            } else {
                v
            }
        };
        let w = clamp(width, t.min.0, t.max.0).min(16384) as i32;
        let h = clamp(height, t.min.1, t.max.1).min(16384) as i32;
        t.surface.with_pending_state(|s| {
            s.size = Some((w, h).into());
            if maximized {
                s.states.set(xdg_toplevel::State::Maximized);
            } else {
                s.states.unset(xdg_toplevel::State::Maximized);
            }
        });
        if t.surface.is_initial_configure_sent() {
            t.surface.send_pending_configure();
        }
    }

    /// The OS close button. The app decides: it may close, ask to save, or
    /// refuse. The OS window closes when the toplevel goes, not here.
    pub fn close(&mut self, toplevel: u32) {
        if let Some(t) = self.by_id(toplevel) {
            t.surface.send_close();
        }
    }
}

impl CompositorHandler for SessionState {
    fn compositor_state(&mut self) -> &mut CompositorState {
        &mut self.compositor
    }

    fn client_compositor_state<'a>(&self, client: &'a Client) -> &'a CompositorClientState {
        &client.get_data::<ClientState>().expect("every client is inserted with ClientState").compositor
    }

    fn commit(&mut self, surface: &WlSurface) {
        // xdg-shell: the first commit of a new toplevel waits for a configure.
        // No size: the app picks its own until the window manager resizes it.
        if let Some(i) = self.toplevel_index(surface) {
            if !self.toplevels[i].surface.is_initial_configure_sent() {
                self.toplevels[i].surface.send_configure();
            }
        }
        // A synchronized subsurface's state applies with its parent's commit,
        // which walks it below.
        if is_sync_subsurface(surface) {
            return;
        }
        let mut committed: Vec<(WlSurface, Option<BufferAssignment>, Vec<Damage>, bool)> = Vec::new();
        with_surface_tree_upward(
            surface,
            (),
            |_, _, _| TraversalAction::DoChildren(()),
            |surf, states, _| {
                let mut attrs = states.cached_state.get::<SurfaceAttributes>();
                let current = attrs.current();
                committed.push((
                    surf.clone(),
                    current.buffer.take(),
                    std::mem::take(&mut current.damage),
                    !current.frame_callbacks.is_empty(),
                ));
            },
            |_, _, _| true,
        );
        for (surf, buffer, damage, wants_frame) in committed {
            let index = self.toplevel_index(&surf);
            match buffer {
                Some(BufferAssignment::NewBuffer(buffer)) => {
                    if let Some(i) = index {
                        self.take_toplevel_buffer(i, &buffer, &damage);
                    }
                    // Copied (or not shown at all, for now: subsurfaces and
                    // cursors); either way the client may reuse it.
                    buffer.release();
                }
                Some(BufferAssignment::Removed) => {
                    if let Some(i) = index {
                        self.unmap(i);
                    }
                }
                None => {}
            }
            if let Some(i) = index {
                self.read_cached(i);
            }
            if wants_frame && !self.pending_callbacks.contains(&surf) {
                self.pending_callbacks.push(surf);
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
        let id = self.next_toplevel;
        self.next_toplevel = self.next_toplevel.wrapping_add(1).max(1);
        // The window manager can maximize and minimize; it has no
        // fullscreen of its own, so a fullscreen request maximizes.
        surface.with_pending_state(|s| {
            s.capabilities.set(xdg_toplevel::WmCapabilities::Maximize);
            s.capabilities.set(xdg_toplevel::WmCapabilities::Minimize);
            s.capabilities.set(xdg_toplevel::WmCapabilities::Fullscreen);
        });
        self.toplevels.push(Toplevel {
            id,
            surface,
            title: String::new(),
            app_id: String::new(),
            canvas: Canvas::default(),
            mapped: false,
            in_flight: false,
            // Until the app asks for the OS title bar, it draws its own.
            decorations: Decorations::Client,
            geometry: None,
            min: (0, 0),
            max: (0, 0),
        });
    }

    fn new_popup(&mut self, surface: PopupSurface, _positioner: PositionerState) {
        // Popups aren't shown yet. Configuring them keeps their app from
        // waiting on one forever.
        let _ = surface.send_configure();
    }

    fn grab(&mut self, _surface: PopupSurface, _seat: WlSeat, _serial: Serial) {}

    fn reposition_request(&mut self, _surface: PopupSurface, _positioner: PositionerState, _token: u32) {}

    fn move_request(&mut self, surface: ToplevelSurface, _seat: WlSeat, _serial: Serial) {
        self.request(&surface, "move", None);
    }

    fn resize_request(&mut self, surface: ToplevelSurface, _seat: WlSeat, _serial: Serial, edges: xdg_toplevel::ResizeEdge) {
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
        if let Some(i) = self.toplevel_index(surface.wl_surface()) {
            self.unmap(i);
            self.toplevels.remove(i);
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
        let Some(i) = self.toplevel_index(surface.wl_surface()) else { return };
        let (title, app_id) = with_states(surface.wl_surface(), |states| {
            let data = states
                .data_map
                .get::<XdgToplevelSurfaceData>()
                .expect("a toplevel has toplevel data")
                .lock()
                .expect("toplevel data lock");
            (data.title.clone().unwrap_or_default(), data.app_id.clone().unwrap_or_default())
        });
        let t = &mut self.toplevels[i];
        if t.title == title && t.app_id == app_id {
            return;
        }
        t.title = title;
        t.app_id = app_id;
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
