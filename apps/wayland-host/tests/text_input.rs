//! The host's text-input-v3 end to end: the built binary, a fake backend on
//! its control socket, and a Wayland client that speaks the wire format by
//! hand (no client library is a dependency). It checks what the unit tests
//! can't: `enter` and `leave` following the keyboard, the state reaching the
//! backend after a commit, and an edit reaching the app with the right
//! serial.

use std::io::{ErrorKind, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const SID: &str = "abcdefghijklmnop";
const WAIT: Duration = Duration::from_secs(5);

/// zwp_text_input_v3 events, by opcode.
const ENTER: u16 = 0;
const LEAVE: u16 = 1;
const PREEDIT: u16 = 2;
const COMMIT: u16 = 3;
const DELETE: u16 = 4;
const DONE: u16 = 5;

/// The client's objects, by the ids it gives them; 3 is the first round
/// trip's callback.
const REGISTRY: u32 = 2;
const COMPOSITOR: u32 = 4;
const WM_BASE: u32 = 5;
const SEAT: u32 = 6;
const MANAGER: u32 = 7;
const SURFACE: u32 = 8;
const XDG_SURFACE: u32 = 9;
const TOPLEVEL: u32 = 10;
const TEXT_INPUT: u32 = 11;

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

    /// The next JSON message of type `ty`; others are skipped.
    fn recv(&mut self, ty: &str) -> Value {
        let end = Instant::now() + WAIT;
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
                        return v;
                    }
                }
            }
            assert!(Instant::now() < end, "no {ty} from the host");
            fill(&mut self.stream, &mut self.buf);
        }
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
    fn req(&mut self, obj: u32, op: u16, args: &[u8]) {
        let mut m = obj.to_le_bytes().to_vec();
        m.extend((((8 + args.len()) as u32) << 16 | op as u32).to_le_bytes());
        m.extend_from_slice(args);
        self.stream.write_all(&m).unwrap();
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
        let cb = self.next_id;
        self.next_id += 1;
        self.req(1, 0, &cb.to_le_bytes());
        self.until(|e| e.0 == cb && e.1 == 0)
    }

    /// The text input's events until `stop` among them.
    fn text_input_until(&mut self, stop: u16) -> Vec<(u16, Vec<u8>)> {
        let events = self.until(|e| e.0 == TEXT_INPUT && e.1 == stop);
        events.into_iter().filter(|e| e.0 == TEXT_INPUT).map(|e| (e.1, e.2)).collect()
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

/// A string argument and the offset after it.
fn read_string(a: &[u8]) -> (String, usize) {
    let n = u32::from_le_bytes(a[..4].try_into().unwrap()) as usize;
    let s = String::from_utf8(a[4..4 + n - 1].to_vec()).unwrap();
    (s, 4 + n.div_ceil(4) * 4)
}

fn ints(a: &[u8]) -> Vec<i32> {
    a.chunks(4).map(|c| i32::from_le_bytes(c.try_into().unwrap())).collect()
}

fn args(values: &[i32]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

fn start() -> (Host, Control, Client) {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("wh-text-input-{}-{nanos}", std::process::id()));
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
    assert_eq!(control.recv("hello")["version"], 9);
    control.send(json!({"type": "session_open", "session": SID, "width": 800, "height": 600, "ratio": 1}));
    let ready = control.recv("session_ready");
    let socket = dir.join(ready["display"].as_str().unwrap());
    let stream = UnixStream::connect(socket).unwrap();
    stream.set_read_timeout(Some(Duration::from_millis(100))).unwrap();
    let client = Client { stream, buf: Vec::new(), next_id: REGISTRY + 1 };
    (host, control, client)
}

/// Binds what the test needs and makes a toplevel (id 1 to the backend)
/// with a text input, which hears nothing until the keyboard comes.
fn toplevel_with_text_input(client: &mut Client) {
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
        ("wl_seat", 5, SEAT),
        ("zwp_text_input_manager_v3", 1, MANAGER),
    ] {
        let mut a = globals[iface].to_le_bytes().to_vec();
        a.extend(string(iface));
        a.extend(args(&[version, id as i32]));
        client.req(REGISTRY, 0, &a);
    }
    client.req(COMPOSITOR, 0, &SURFACE.to_le_bytes());
    client.req(WM_BASE, 2, &args(&[XDG_SURFACE as i32, SURFACE as i32]));
    client.req(XDG_SURFACE, 1, &TOPLEVEL.to_le_bytes());
    client.req(SURFACE, 6, &[]);
    client.req(MANAGER, 1, &args(&[TEXT_INPUT as i32, SEAT as i32]));
    client.next_id = TEXT_INPUT + 1;
    // An enable before `enter` is ignored, though its commit counts.
    client.req(TEXT_INPUT, 1, &[]);
    client.req(TEXT_INPUT, 7, &[]);
    let early: Vec<_> = client.roundtrip().into_iter().filter(|e| e.0 == TEXT_INPUT).collect();
    assert_eq!(early, vec![]);
}

#[test]
fn a_field_with_the_keyboard_reaches_the_backend_and_its_edits_reach_the_app() {
    let (_host, mut control, mut client) = start();
    toplevel_with_text_input(&mut client);

    control.send(json!({"type": "focus", "session": SID, "toplevel": 1}));
    let enter = client.text_input_until(ENTER);
    assert_eq!(enter, vec![(ENTER, SURFACE.to_le_bytes().to_vec())]);

    // An email field: enable, content type, text, cursor rectangle, commit.
    client.req(TEXT_INPUT, 1, &[]);
    client.req(TEXT_INPUT, 5, &args(&[0x1 | 0x2, 6]));
    let mut surrounding = string("ana@ș");
    surrounding.extend(args(&[6, 6]));
    client.req(TEXT_INPUT, 3, &surrounding);
    client.req(TEXT_INPUT, 6, &args(&[30, 4, 2, 18]));
    client.req(TEXT_INPUT, 7, &[]);
    assert_eq!(
        control.recv("text_input"),
        json!({"type": "text_input", "session": SID, "toplevel": 1, "enabled": true, "purpose": "email",
               "hints": ["completion", "spellcheck"], "text": "ana@ș", "cursor": 6, "anchor": 6,
               "rect": {"x": 30, "y": 4, "width": 2, "height": 18}, "cause": "input_method"})
    );

    // An edit: the delete cut to the six bytes before the cursor, then the
    // commit, the preedit with its cursor at the end, and done with the two
    // commits the app made.
    control.send(json!({"type": "text_edit", "session": SID, "toplevel": 1,
                        "delete": {"before": 99, "after": 0}, "commit": "x", "preedit": {"text": "zi"}}));
    let ev = client.text_input_until(DONE);
    assert_eq!(ev.iter().map(|e| e.0).collect::<Vec<_>>(), [DELETE, COMMIT, PREEDIT, DONE]);
    assert_eq!(ints(&ev[0].1), [6, 0]);
    assert_eq!(read_string(&ev[1].1).0, "x");
    let (preedit, at) = read_string(&ev[2].1);
    assert_eq!((preedit.as_str(), ints(&ev[2].1[at..])), ("zi", vec![2, 2]));
    assert_eq!(ints(&ev[3].1), [2]);

    // A NUL is refused and the host lives on; an edit for another toplevel
    // is dropped; a bare edit is a lone done, which clears the preedit.
    control.send(json!({"type": "text_edit", "session": SID, "toplevel": 1, "commit": "a\u{0}b"}));
    control.send(json!({"type": "text_edit", "session": SID, "toplevel": 99, "commit": "c"}));
    control.send(json!({"type": "text_edit", "session": SID, "toplevel": 1}));
    assert_eq!(client.text_input_until(DONE), vec![(DONE, 2u32.to_le_bytes().to_vec())]);

    // A commit that changes nothing sends nothing: the next text_input is
    // the disable when the keyboard leaves.
    client.req(TEXT_INPUT, 7, &[]);
    client.roundtrip();
    control.send(json!({"type": "focus", "session": SID, "toplevel": null}));
    assert_eq!(client.text_input_until(LEAVE), vec![(LEAVE, SURFACE.to_le_bytes().to_vec())]);
    let off = control.recv("text_input");
    assert_eq!((off["toplevel"].clone(), off["enabled"].clone(), off["text"].clone()), (json!(1), json!(false), json!(null)));

    // The keyboard back: enter again, and the field starts over.
    control.send(json!({"type": "focus", "session": SID, "toplevel": 1}));
    client.text_input_until(ENTER);
    client.req(TEXT_INPUT, 1, &[]);
    client.req(TEXT_INPUT, 7, &[]);
    let fresh = control.recv("text_input");
    assert_eq!(
        (fresh["enabled"].clone(), fresh["purpose"].clone(), fresh["text"].clone(), fresh["rect"].clone()),
        (json!(true), json!("normal"), json!(null), json!(null))
    );

    // A resync tells the state again; destroying the text input disables it.
    control.send(json!({"type": "resync", "session": SID}));
    assert_eq!(control.recv("text_input")["enabled"], json!(true));
    client.req(TEXT_INPUT, 0, &[]);
    assert_eq!(control.recv("text_input")["enabled"], json!(false));
}
