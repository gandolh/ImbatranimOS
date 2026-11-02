//! One desktop session (one browser tab): its own Wayland display, globals,
//! output and clients. Nothing here is shared with another session, so a
//! client on tab A's socket can never reach tab B.

use std::time::Instant;

use smithay::delegate_compositor;
use smithay::delegate_data_device;
use smithay::delegate_output;
use smithay::delegate_seat;
use smithay::delegate_shm;
use smithay::delegate_xdg_shell;
use smithay::input::{Seat, SeatHandler, SeatState};
use smithay::output::{Mode, Output, PhysicalProperties, Scale, Subpixel};
use smithay::reexports::wayland_server::backend::{ClientData, ClientId, DisconnectReason};
use smithay::reexports::wayland_server::protocol::{wl_buffer::WlBuffer, wl_seat::WlSeat, wl_shm, wl_surface::WlSurface};
use smithay::reexports::wayland_server::{Client, DisplayHandle, Resource};
use smithay::utils::{Serial, Transform};
use smithay::wayland::buffer::BufferHandler;
use smithay::wayland::compositor::{
    is_sync_subsurface, with_states, with_surface_tree_upward, BufferAssignment, CompositorClientState,
    CompositorHandler, CompositorState, Damage, SurfaceAttributes, TraversalAction,
};
use smithay::wayland::output::OutputHandler;
use smithay::wayland::selection::data_device::{
    ClientDndGrabHandler, DataDeviceHandler, DataDeviceState, ServerDndGrabHandler,
};
use smithay::wayland::selection::SelectionHandler;
use smithay::wayland::shell::xdg::{
    PopupSurface, PositionerState, ToplevelSurface, XdgShellHandler, XdgShellState, XdgToplevelSurfaceData,
};
use smithay::wayland::shm::{with_buffer_contents, ShmHandler, ShmState};

use crate::pixels::{clip_signed, Canvas, Encoding, ShmFormat};
use crate::protocol::{encode_frame_body, Outbound, Rect};

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
}

pub struct SessionState {
    pub id: String,
    compositor: CompositorState,
    xdg: XdgShellState,
    shm: ShmState,
    data_device: DataDeviceState,
    seat_state: SeatState<SessionState>,
    _seat: Seat<SessionState>,
    output: Output,
    toplevels: Vec<Toplevel>,
    next_toplevel: u32,
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
        let mut seat_state = SeatState::new();
        // Input devices come later; a seat with no capabilities is still a
        // seat, and clients expect one.
        let seat = seat_state.new_wl_seat(dh, "seat0");
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
            seat_state,
            _seat: seat,
            output,
            toplevels: Vec::new(),
            next_toplevel: 1,
            pending_callbacks: Vec::new(),
            outbox: Vec::new(),
            started,
        };
        state.set_output_size(width, height);
        state
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
        let time = self.started.elapsed().as_millis() as u32;
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

    fn announce(&mut self, index: usize, created: bool) {
        let t = &self.toplevels[index];
        let session = self.id.clone();
        let (toplevel, title, app_id, width, height) =
            (t.id, t.title.clone(), t.app_id.clone(), t.canvas.width, t.canvas.height);
        self.outbox.push(if created {
            Outbound::ToplevelCreated { session, toplevel, title, app_id, width, height }
        } else {
            Outbound::ToplevelUpdated { session, toplevel, title, app_id, width, height }
        });
    }

    fn unmap(&mut self, index: usize) {
        let t = &mut self.toplevels[index];
        if t.mapped {
            t.mapped = false;
            t.in_flight = false;
            let toplevel = t.id;
            self.outbox.push(Outbound::ToplevelDestroyed { session: self.id.clone(), toplevel });
        }
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
        self.toplevels.push(Toplevel {
            id,
            surface,
            title: String::new(),
            app_id: String::new(),
            canvas: Canvas::default(),
            mapped: false,
            in_flight: false,
        });
    }

    fn new_popup(&mut self, surface: PopupSurface, _positioner: PositionerState) {
        // Popups aren't shown yet. Configuring them keeps their app from
        // waiting on one forever.
        let _ = surface.send_configure();
    }

    fn grab(&mut self, _surface: PopupSurface, _seat: WlSeat, _serial: Serial) {}

    fn reposition_request(&mut self, _surface: PopupSurface, _positioner: PositionerState, _token: u32) {}

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
        if t.mapped {
            self.announce(i, false);
        }
    }
}

impl SeatHandler for SessionState {
    type KeyboardFocus = WlSurface;
    type PointerFocus = WlSurface;
    type TouchFocus = WlSurface;

    fn seat_state(&mut self) -> &mut SeatState<SessionState> {
        &mut self.seat_state
    }
}

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
delegate_seat!(SessionState);
delegate_output!(SessionState);
delegate_data_device!(SessionState);
