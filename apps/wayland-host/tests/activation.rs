//! An app's activation request (xdg-activation-v1) end to end: the built binary, a fake backend on its control
//! socket, and a Wayland client that speaks the wire format by hand. A request on a mapped toplevel reaches the
//! backend as `request` with `attention`; one on a surface that is no toplevel's sends nothing. Nothing is raised.

use std::io::{ErrorKind, IoSlice, Read, Write};
use std::mem::MaybeUninit;
use std::os::fd::AsFd;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use rustix::net::{sendmsg, SendAncillaryBuffer, SendAncillaryMessage, SendFlags};
use serde_json::{json, Value};

const SID: &str = "abcdefghijklmnop";
const WAIT: Duration = Duration::from_secs(5);

/// The client's objects, by the ids it gives them, in the order it makes them; 3 is the first round trip's
/// callback.
const REGISTRY: u32 = 2;
const COMPOSITOR: u32 = 4;
const WM_BASE: u32 = 5;
const SHM: u32 = 6;
const ACTIVATION: u32 = 7;
const SURFACE: u32 = 8;
const XDG_SURFACE: u32 = 9;
const TOPLEVEL: u32 = 10;

struct Host {
    child: Child,
    dir: PathBuf,
}

impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// The backend's end of the control socket.
struct Control {
    stream: UnixStream,
    buf: Vec<u8>,
}

impl Control {
    fn send(&mut self, v: Value) {
        let j = serde_json::to_vec(&v).unwrap();
        let mut m = ((j.len() + 1) as u32).to_le_bytes().to_vec();
        m.push(1);
        m.extend(j);
        self.stream.write_all(&m).unwrap();
    }

    /// The next JSON message of type `ty` within `wait`; others are skipped.
    fn next(&mut self, ty: &str, wait: Duration) -> Option<Value> {
        let end = Instant::now() + wait;
        loop {
            while self.buf.len() >= 4 {
                let n = u32::from_le_bytes(self.buf[..4].try_into().unwrap()) as usize;
                if self.buf.len() < 4 + n {
                    break;
                }
                let msg: Vec<u8> = self.buf.drain(..4 + n).collect();
                if msg[4] == 1 {
                    let v: Value = serde_json::from_slice(&msg[5..]).unwrap();
                    if v["type"] == ty {
                        return Some(v);
                    }
                }
            }
            if Instant::now() >= end {
                return None;
            }
            fill(&mut self.stream, &mut self.buf);
        }
    }

    fn recv(&mut self, ty: &str) -> Value {
        self.next(ty, WAIT).unwrap_or_else(|| panic!("no {ty} from the host"))
    }
}

fn fill(stream: &mut UnixStream, buf: &mut Vec<u8>) {
    let mut b = [0u8; 65536];
    match stream.read(&mut b) {
        Ok(0) => panic!("the host closed its socket"),
        Ok(n) => buf.extend_from_slice(&b[..n]),
        Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
        Err(e) => panic!("read failed: {e}"),
    }
}

type Event = (u32, u16, Vec<u8>);

/// A Wayland client on the session's socket.
struct Client {
    stream: UnixStream,
    buf: Vec<u8>,
    /// New ids must come in order: the next free one.
    next_id: u32,
}

impl Client {
    fn message(obj: u32, op: u16, args: &[u8]) -> Vec<u8> {
        let mut m = obj.to_le_bytes().to_vec();
        m.extend((((8 + args.len()) as u32) << 16 | op as u32).to_le_bytes());
        m.extend_from_slice(args);
        m
    }

    fn req(&mut self, obj: u32, op: u16, args: &[u8]) {
        self.stream.write_all(&Client::message(obj, op, args)).unwrap();
    }

    /// A request that passes a file descriptor alongside its arguments.
    fn req_with_fd(&mut self, obj: u32, op: u16, args: &[u8], fd: impl AsFd) {
        let msg = Client::message(obj, op, args);
        let mut space = [MaybeUninit::<u8>::uninit(); rustix::cmsg_space!(ScmRights(1))];
        let mut cmsg = SendAncillaryBuffer::new(&mut space);
        let fds = [fd.as_fd()];
        assert!(cmsg.push(SendAncillaryMessage::ScmRights(&fds)));
        sendmsg(&self.stream, &[IoSlice::new(&msg)], &mut cmsg, SendFlags::empty()).unwrap();
    }

    fn new_id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    /// Events until one matches `stop`, which is the last returned.
    fn until(&mut self, stop: impl Fn(&Event) -> bool) -> Vec<Event> {
        let end = Instant::now() + WAIT;
        let mut out = Vec::new();
        loop {
            while self.buf.len() >= 8 {
                let obj = u32::from_le_bytes(self.buf[..4].try_into().unwrap());
                let so = u32::from_le_bytes(self.buf[4..8].try_into().unwrap());
                let size = (so >> 16) as usize;
                if self.buf.len() < size {
                    break;
                }
                let e = (obj, (so & 0xffff) as u16, self.buf[8..size].to_vec());
                self.buf.drain(..size);
                if e.0 == 1 && e.1 == 0 {
                    panic!("protocol error: {:?}", read_string(&e.2[8..]).0);
                }
                let last = stop(&e);
                out.push(e);
                if last {
                    return out;
                }
            }
            assert!(Instant::now() < end, "timed out; got {out:?}");
            fill(&mut self.stream, &mut self.buf);
        }
    }

    /// A round trip: every event the host had for us before it.
    fn roundtrip(&mut self) -> Vec<Event> {
        let cb = self.new_id();
        self.req(1, 0, &cb.to_le_bytes());
        self.until(|e| e.0 == cb && e.1 == 0)
    }

    /// An activation token, made with no serial or surface (a launcher's).
    fn token(&mut self) -> String {
        let token = self.new_id();
        self.req(ACTIVATION, 1, &token.to_le_bytes());
        self.req(token, 3, &[]);
        let done = self.until(|e| e.0 == token && e.1 == 0);
        read_string(&done.last().unwrap().2).0
    }

    fn activate(&mut self, surface: u32) {
        let token = self.token();
        let mut a = string(&token);
        a.extend(surface.to_le_bytes());
        self.req(ACTIVATION, 2, &a);
    }
}

fn string(s: &str) -> Vec<u8> {
    let mut b = ((s.len() + 1) as u32).to_le_bytes().to_vec();
    b.extend_from_slice(s.as_bytes());
    b.push(0);
    while !b.len().is_multiple_of(4) {
        b.push(0);
    }
    b
}

fn read_string(a: &[u8]) -> (String, usize) {
    let n = u32::from_le_bytes(a[..4].try_into().unwrap()) as usize;
    let s = String::from_utf8(a[4..4 + n - 1].to_vec()).unwrap();
    (s, 4 + n.div_ceil(4) * 4)
}

fn args(values: &[i32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

fn start() -> (Host, Control, Client) {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("wh-activation-{}-{nanos}", std::process::id()));
    let control_dir = dir.join("imbatranim-wayland");
    std::fs::create_dir_all(&control_dir).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    let control_path = control_dir.join("control.sock");
    let listener = UnixListener::bind(&control_path).unwrap();
    let child = Command::new(env!("CARGO_BIN_EXE_imbatranim-wayland-host"))
        .arg("--control")
        .arg(&control_path)
        .env("XDG_RUNTIME_DIR", &dir)
        .spawn()
        .unwrap();
    let host = Host { child, dir: dir.clone() };
    let (stream, _) = listener.accept().unwrap();
    stream.set_read_timeout(Some(Duration::from_millis(100))).unwrap();
    let mut control = Control { stream, buf: Vec::new() };
    control.recv("hello");
    control.send(json!({"type": "session_open", "session": SID, "width": 800, "height": 600, "ratio": 1}));
    let ready = control.recv("session_ready");
    let socket = dir.join(ready["display"].as_str().unwrap());
    let stream = UnixStream::connect(socket).unwrap();
    stream.set_read_timeout(Some(Duration::from_millis(100))).unwrap();
    let client = Client { stream, buf: Vec::new(), next_id: REGISTRY + 1 };
    (host, control, client)
}

/// Binds what the test needs and maps a 4 by 4 toplevel from a shared-memory buffer.
fn mapped_toplevel(client: &mut Client) {
    client.req(1, 1, &REGISTRY.to_le_bytes());
    let mut globals = std::collections::HashMap::new();
    for (obj, op, a) in client.roundtrip() {
        if obj == REGISTRY && op == 0 {
            let (iface, _) = read_string(&a[4..]);
            globals.insert(iface, u32::from_le_bytes(a[..4].try_into().unwrap()));
        }
    }
    for (iface, version, id) in [
        ("wl_compositor", 4, COMPOSITOR),
        ("xdg_wm_base", 1, WM_BASE),
        ("wl_shm", 1, SHM),
        ("xdg_activation_v1", 1, ACTIVATION),
    ] {
        let mut a = globals[iface].to_le_bytes().to_vec();
        a.extend(string(iface));
        a.extend(args(&[version, id as i32]));
        client.req(REGISTRY, 0, &a);
    }
    client.next_id = SURFACE;
    let surface = client.new_id();
    client.req(COMPOSITOR, 0, &surface.to_le_bytes());
    let xdg_surface = client.new_id();
    client.req(WM_BASE, 2, &args(&[xdg_surface as i32, surface as i32]));
    let toplevel = client.new_id();
    client.req(XDG_SURFACE, 1, &toplevel.to_le_bytes());
    assert_eq!((surface, xdg_surface, toplevel), (SURFACE, XDG_SURFACE, TOPLEVEL));
    client.req(SURFACE, 6, &[]);
    // The first configure, acked before a buffer goes on.
    let configure = client.until(|e| e.0 == XDG_SURFACE && e.1 == 0);
    let serial = &configure.last().unwrap().2;
    client.req(XDG_SURFACE, 4, serial);

    let (w, h) = (4, 4);
    let fd = rustix::fs::memfd_create("buffer", rustix::fs::MemfdFlags::CLOEXEC).unwrap();
    rustix::fs::ftruncate(&fd, (w * h * 4) as u64).unwrap();
    let pool = client.new_id();
    client.req_with_fd(SHM, 0, &args(&[pool as i32, w * h * 4]), &fd);
    let buffer = client.new_id();
    client.req(pool, 0, &args(&[buffer as i32, 0, w, h, w * 4, 1]));
    client.req(SURFACE, 1, &args(&[buffer as i32, 0, 0]));
    client.req(SURFACE, 2, &args(&[0, 0, w, h]));
    client.req(SURFACE, 6, &[]);
}

#[test]
fn an_activation_request_asks_for_attention_and_raises_nothing() {
    let (_host, mut control, mut client) = start();
    mapped_toplevel(&mut client);
    let created = control.recv("toplevel_created");
    let toplevel = created["toplevel"].clone();

    client.activate(SURFACE);
    assert_eq!(
        control.recv("request"),
        json!({"type": "request", "session": SID, "toplevel": toplevel, "action": "attention"})
    );
    // No keyboard came with it: the host focuses nothing on its own.
    let none: Vec<_> = client.roundtrip().into_iter().filter(|e| e.1 == 1 && e.0 != REGISTRY).collect();
    assert!(none.iter().all(|e| e.0 != TOPLEVEL), "{none:?}");
}

#[test]
fn an_activation_request_for_no_toplevel_sends_nothing() {
    let (_host, mut control, mut client) = start();
    mapped_toplevel(&mut client);
    control.recv("toplevel_created");

    // A surface with no role: no window of the session's.
    let stray = client.new_id();
    client.req(COMPOSITOR, 0, &stray.to_le_bytes());
    client.activate(stray);
    client.roundtrip();
    assert_eq!(control.next("request", Duration::from_millis(600)), None);
}
