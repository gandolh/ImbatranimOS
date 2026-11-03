//! The Wayland host: the display Linux apps connect to.
//!
//! One process per machine, started by the backend, which listens on the
//! control socket and passes its path. Each desktop session (one browser tab)
//! gets its own Wayland display and its own socket,
//! `$XDG_RUNTIME_DIR/wayland-<session id>`. Windows go to the backend as
//! images; the backend relays them to the tab over the signed-in WebSocket.
//! PROTOCOL.md describes the control socket.

mod pixels;
mod protocol;
mod session;
mod stubs;

use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::os::unix::net::UnixStream;
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use smithay::reexports::calloop::generic::Generic;
use smithay::reexports::calloop::timer::{TimeoutAction, Timer};
use smithay::reexports::calloop::{EventLoop, Interest, LoopHandle, LoopSignal, Mode, PostAction, RegistrationToken};
use smithay::reexports::wayland_server::Display;
use smithay::wayland::socket::ListeningSocketSource;

use pixels::Encoding;
use protocol::{encode_frame, encode_json, valid_session_id, Decoder, Inbound, Outbound, PROTOCOL_VERSION};
use session::{ClientState, SessionState};

/// Frames go out at most this often per window: about 30 per second.
const TICK: Duration = Duration::from_millis(33);

struct Session {
    display: Display<SessionState>,
    state: SessionState,
    tokens: Vec<RegistrationToken>,
}

struct Host {
    sessions: HashMap<String, Rc<RefCell<Session>>>,
    control: UnixStream,
    decoder: Decoder,
    out: Vec<u8>,
    encoding: Encoding,
    started: Instant,
    handle: LoopHandle<'static, Host>,
    signal: LoopSignal,
}

fn log(msg: &str) {
    eprintln!("wayland-host: {msg}");
}

impl Host {
    fn send(&mut self, msg: &Outbound) {
        self.out.extend_from_slice(&encode_json(msg));
    }

    fn handle(&mut self, msg: Inbound) {
        match msg {
            Inbound::SessionOpen { session, width, height } => self.open(session, width, height),
            Inbound::SessionClose { session } => self.close(&session),
            Inbound::Output { session, width, height } => {
                self.with(&session, |s| s.set_output_size(width, height))
            }
            Inbound::FrameAck { session, toplevel } => self.with(&session, |s| s.ack(toplevel)),
            Inbound::Focus { session, toplevel } => self.with(&session, |s| s.focus(toplevel)),
            Inbound::PointerMotion { session, toplevel, x, y } => {
                self.with(&session, |s| s.pointer_motion(toplevel, x, y))
            }
            Inbound::PointerButton { session, toplevel, button, pressed } => {
                self.with(&session, |s| s.pointer_button(toplevel, button, pressed))
            }
            Inbound::PointerAxis { session, toplevel, dx, dy, v120x, v120y, wheel } => {
                self.with(&session, |s| s.pointer_axis(toplevel, dx, dy, v120x, v120y, wheel))
            }
            Inbound::PointerLeave { session } => self.with(&session, |s| s.pointer_leave()),
            Inbound::Key { session, keycode, pressed } => self.with(&session, |s| s.key(keycode, pressed)),
            Inbound::Configure { session, toplevel, width, height, maximized } => {
                self.with(&session, |s| s.configure(toplevel, width, height, maximized))
            }
            Inbound::Close { session, toplevel } => self.with(&session, |s| s.close(toplevel)),
            Inbound::Position { session, toplevel, x, y } => self.with(&session, |s| s.position(toplevel, x, y)),
            Inbound::PressOutside { session } => self.with(&session, |s| s.press_outside()),
            Inbound::Resync { session } => self.with(&session, |s| s.resync()),
            Inbound::Freeze { session, frozen } => self.with(&session, |s| s.set_frozen(frozen)),
            Inbound::Visibility { session, visible } => self.with(&session, |s| s.set_visible(visible)),
            Inbound::ToplevelVisible { session, toplevel, visible } => {
                self.with(&session, |s| s.set_toplevel_visible(toplevel, visible))
            }
        }
    }

    /// Run `f` on a session's state, if the session is open.
    fn with(&mut self, session: &str, f: impl FnOnce(&mut SessionState)) {
        if let Some(s) = self.sessions.get(session) {
            f(&mut s.borrow_mut().state);
        }
    }

    fn open(&mut self, id: String, width: u32, height: u32) {
        if !valid_session_id(&id) {
            log("refused a session with an invalid id");
            return;
        }
        if self.sessions.contains_key(&id) {
            let display = format!("wayland-{id}");
            self.send(&Outbound::SessionReady { session: id, display });
            return;
        }
        match self.try_open(&id, width, height) {
            Ok(display) => self.send(&Outbound::SessionReady { session: id, display }),
            Err(reason) => {
                log(&format!("session {}…: {reason}", &id[..8]));
                self.send(&Outbound::SessionFailed { session: id, reason });
            }
        }
    }

    fn try_open(&mut self, id: &str, width: u32, height: u32) -> Result<String, String> {
        let mut display: Display<SessionState> = Display::new().map_err(|e| e.to_string())?;
        let state = SessionState::new(id.to_string(), &display.handle(), width, height, self.started);
        let name = format!("wayland-{id}");
        let listener = ListeningSocketSource::with_name(&name).map_err(|e| e.to_string())?;
        let poll_fd = display.backend().poll_fd().try_clone_to_owned().map_err(|e| e.to_string())?;
        let session = Rc::new(RefCell::new(Session { display, state, tokens: Vec::new() }));

        let for_clients = Rc::clone(&session);
        let listen_token = self
            .handle
            .insert_source(listener, move |stream, _, _host| {
                let mut guard = for_clients.borrow_mut();
                let s = &mut *guard;
                let data = Arc::new(ClientState::default());
                match s.display.handle().insert_client(stream, data.clone()) {
                    // Who connected, for the backend to stop with the
                    // session or freeze under the cover screen.
                    Ok(client) => {
                        let pid = client.get_credentials(&s.display.handle()).map(|c| c.pid as u32).unwrap_or(0);
                        s.state.add_client(pid, data);
                    }
                    Err(e) => log(&format!("could not add a client: {e}")),
                }
            })
            .map_err(|e| e.error.to_string())?;

        let for_dispatch = Rc::clone(&session);
        let dispatch_token = self
            .handle
            .insert_source(Generic::new(poll_fd, Interest::READ, Mode::Level), move |_, _, _host| {
                let mut guard = for_dispatch.borrow_mut();
                let s = &mut *guard;
                if let Err(e) = s.display.dispatch_clients(&mut s.state) {
                    log(&format!("dispatch failed: {e}"));
                }
                Ok(PostAction::Continue)
            })
            .map_err(|e| e.error.to_string())?;

        session.borrow_mut().tokens = vec![listen_token, dispatch_token];
        self.sessions.insert(id.to_string(), session);
        Ok(name)
    }

    /// Removing the sources drops the listening socket (which unlinks it) and
    /// the display, which disconnects every client of the session.
    fn close(&mut self, id: &str) {
        if let Some(session) = self.sessions.remove(id) {
            for token in session.borrow_mut().tokens.drain(..) {
                self.handle.remove(token);
            }
        }
    }

    fn tick(&mut self) {
        let mut frames = Vec::new();
        for (id, session) in &self.sessions {
            let mut s = session.borrow_mut();
            s.state.prune_clients();
            s.state.fire_idle_callbacks();
            for body in s.state.take_frames(self.encoding) {
                frames.push(encode_frame(id, &body));
            }
        }
        for f in frames {
            self.out.extend_from_slice(&f);
        }
    }

    /// After every round of events: flush the clients, collect what the
    /// sessions want to say, write as much as the control socket takes.
    fn after_dispatch(&mut self) {
        let mut outbound = Vec::new();
        for session in self.sessions.values() {
            let mut s = session.borrow_mut();
            let _ = s.display.flush_clients();
            outbound.append(&mut s.state.outbox);
        }
        for msg in outbound {
            self.send(&msg);
        }
        self.flush_control();
    }

    fn flush_control(&mut self) {
        while !self.out.is_empty() {
            match self.control.write(&self.out) {
                Ok(0) => break,
                Ok(n) => {
                    self.out.drain(..n);
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                Err(e) => {
                    log(&format!("control socket write failed: {e}"));
                    self.signal.stop();
                    break;
                }
            }
        }
    }

    fn read_control(&mut self) {
        let mut buf = [0u8; 64 * 1024];
        loop {
            match self.control.read(&mut buf) {
                Ok(0) => {
                    // The backend went away; nothing left to serve.
                    self.signal.stop();
                    return;
                }
                Ok(n) => self.decoder.push(&buf[..n]),
                Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                Err(e) => {
                    log(&format!("control socket read failed: {e}"));
                    self.signal.stop();
                    return;
                }
            }
        }
        loop {
            match self.decoder.next_inbound() {
                Ok(Some(msg)) => self.handle(msg),
                Ok(None) => break,
                Err(e) => {
                    log(&format!("bad control message: {e:?}"));
                    self.signal.stop();
                    return;
                }
            }
        }
    }
}

struct Args {
    control: String,
    encoding: Encoding,
}

fn parse_args() -> Result<Args, String> {
    let mut control = None;
    let mut encoding = Encoding::Deflate;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--control" => control = args.next(),
            "--encoding" => {
                let v = args.next().unwrap_or_default();
                encoding = Encoding::parse(&v).ok_or(format!("unknown encoding {v}"))?;
            }
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(Args { control: control.ok_or("--control <socket path> is required")?, encoding })
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            log(&e);
            std::process::exit(2);
        }
    };
    if std::env::var_os("XDG_RUNTIME_DIR").is_none() {
        log("XDG_RUNTIME_DIR is not set");
        std::process::exit(2);
    }
    let control = match UnixStream::connect(&args.control) {
        Ok(s) => s,
        Err(e) => {
            log(&format!("cannot connect to {}: {e}", args.control));
            std::process::exit(1);
        }
    };
    let reader = control.try_clone().expect("clone the control socket");
    control.set_nonblocking(true).expect("non-blocking control socket");

    let mut event_loop: EventLoop<'static, Host> = EventLoop::try_new().expect("event loop");
    let mut host = Host {
        sessions: HashMap::new(),
        control,
        decoder: Decoder::default(),
        out: Vec::new(),
        encoding: args.encoding,
        started: Instant::now(),
        handle: event_loop.handle(),
        signal: event_loop.get_signal(),
    };
    host.send(&Outbound::Hello { version: PROTOCOL_VERSION });

    event_loop
        .handle()
        .insert_source(Generic::new(reader, Interest::READ, Mode::Level), |_, _, host: &mut Host| {
            host.read_control();
            Ok(PostAction::Continue)
        })
        .expect("watch the control socket");
    event_loop
        .handle()
        .insert_source(Timer::from_duration(TICK), |_, _, host: &mut Host| {
            host.tick();
            TimeoutAction::ToDuration(TICK)
        })
        .expect("frame timer");

    event_loop
        .run(None, &mut host, |host| host.after_dispatch())
        .expect("event loop");
    let ids: Vec<String> = host.sessions.keys().cloned().collect();
    for id in ids {
        host.close(&id);
    }
}
