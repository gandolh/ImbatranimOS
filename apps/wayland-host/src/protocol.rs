//! The framed protocol between the backend and the host, over the control
//! socket. PROTOCOL.md is the description both sides follow; the fixtures in
//! `protocol-fixtures/` are encoded here and decoded by the backend's tests.

use serde::{Deserialize, Serialize};

/// Every message: `u32` little-endian length of what follows, then a kind
/// byte, then the payload.
pub const KIND_JSON: u8 = 1;
pub const KIND_FRAME: u8 = 2;
/// A session's sound: one Opus packet.
pub const KIND_AUDIO: u8 = 3;

/// Refuse anything larger: a full 4K frame deflated is far below this.
pub const MAX_MESSAGE: usize = 64 * 1024 * 1024;

pub const PROTOCOL_VERSION: u32 = 7;

/// Pixel encodings of a frame's rectangles.
pub const ENC_DEFLATE_RGBA: u8 = 1;
pub const ENC_WEBP_LOSSLESS: u8 = 2;
/// A JPEG: a large region that changes on most frames (a video), sent lossy.
pub const ENC_JPEG: u8 = 3;

/// Backend to host.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Inbound {
    /// A desktop session (one tab) wants Linux apps: listen on its socket.
    /// `ratio` is the tab's `devicePixelRatio`; the output's scale is its
    /// ceiling (`pixels::output_scale`).
    SessionOpen {
        session: String,
        width: u32,
        height: u32,
        #[serde(default = "one")]
        ratio: f64,
    },
    /// The tab went away: disconnect its clients and remove its socket.
    SessionClose { session: String },
    /// The tab's viewport changed size, or its `devicePixelRatio` changed
    /// (another screen, a page zoom); the session's output follows it.
    Output {
        session: String,
        width: u32,
        height: u32,
        #[serde(default = "one")]
        ratio: f64,
    },
    /// The backend has passed a frame to the WebSocket and the socket has
    /// room again: the toplevel may send its next one.
    FrameAck { session: String, toplevel: u32 },
    /// Keyboard focus moved to this toplevel's OS window, or (None) to a
    /// window that isn't a Linux app's.
    Focus { session: String, toplevel: Option<u32> },
    /// The pointer is over a toplevel, at surface coordinates.
    PointerMotion {
        session: String,
        toplevel: u32,
        x: f64,
        y: f64,
    },
    /// A Linux button code (BTN_LEFT is 0x110).
    PointerButton {
        session: String,
        toplevel: u32,
        button: u32,
        pressed: bool,
    },
    /// Scrolling, in surface pixels, plus wheel steps in 120ths of a notch
    /// when it came from a wheel.
    PointerAxis {
        session: String,
        toplevel: u32,
        dx: f64,
        dy: f64,
        v120x: i32,
        v120y: i32,
        wheel: bool,
    },
    /// The pointer left the session's Linux windows.
    PointerLeave { session: String },
    /// A key, as a Linux (evdev) key code.
    Key {
        session: String,
        keycode: u32,
        pressed: bool,
    },
    /// The OS window's size and state changed: tell the app.
    Configure {
        session: String,
        toplevel: u32,
        width: u32,
        height: u32,
        maximized: bool,
    },
    /// The OS window's close button: ask the app to close.
    Close { session: String, toplevel: u32 },
    /// The OS window moved or resized: its toplevel's window geometry now
    /// starts here on the output. Popups are kept on the output from it.
    Position {
        session: String,
        toplevel: u32,
        x: i32,
        y: i32,
    },
    /// The owner pressed outside every Linux window: the keyboard leaves the
    /// session's apps (they close the menus they track themselves) and popups
    /// holding a grab close, until the next press in a Linux window or focus
    /// change.
    PressOutside { session: String },
    /// A tab took the session back after a reload: announce every window
    /// again and send each one whole.
    Resync { session: String },
    /// The backend froze (or woke) the session's apps under the cover
    /// screen: no frames and no frame callbacks meanwhile, everything
    /// redrawn after.
    Freeze { session: String, frozen: bool },
    /// The tab was hidden or shown again: a hidden session gets no frames
    /// and its apps no frame callbacks.
    Visibility { session: String, visible: bool },
    /// The toplevel's OS window was minimized (or shown): the same, for it
    /// and its popups.
    ToplevelVisible {
        session: String,
        toplevel: u32,
        visible: bool,
    },
    /// The keyboard layout chosen in Settings → Linux apps, by its id (see
    /// `session::KEYBOARD_LAYOUTS`): the session's apps get its keymap.
    KeyboardLayout { session: String, layout: String },
    /// The tab read its clipboard for a paste key in a Linux window: offer
    /// this text as the session's selection. The key follows.
    Clipboard { session: String, text: String },
}

/// A ratio the backend left out: a scale-1 screen.
fn one() -> f64 {
    1.0
}

/// How a toplevel's title bar is drawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Decorations {
    /// The app asked the display to draw it: the OS title bar.
    Server,
    /// The app draws its own: the OS window is a frame only.
    Client,
}

/// The part of a toplevel's image that is the window (without shadows).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// What a toplevel is, as the backend and the tab see it.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct ToplevelInfo {
    pub toplevel: u32,
    pub title: String,
    pub app_id: String,
    /// The image's size, in surface coordinates (CSS pixels in the tab).
    pub width: u32,
    pub height: u32,
    /// Image pixels per surface coordinate: a frame is `width × scale` by
    /// `height × scale` pixels. 1 unless the app draws for a HiDPI output.
    pub scale: u32,
    pub geometry: Geometry,
    pub decorations: Decorations,
    /// The app's limits on its window geometry; 0 means none.
    pub min_width: u32,
    pub min_height: u32,
    pub max_width: u32,
    pub max_height: u32,
}

/// What a popup is, as the backend and the tab see it. Its id shares the
/// toplevels' id space: frames and input name it the same way.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct PopupInfo {
    pub popup: u32,
    /// The toplevel or popup it opened from.
    pub parent: u32,
    /// Its window geometry's top-left, relative to the parent's window
    /// geometry, after it was kept on the output.
    pub x: i32,
    pub y: i32,
    /// The image's size, in surface coordinates.
    pub width: u32,
    pub height: u32,
    /// Image pixels per surface coordinate, as for a toplevel.
    pub scale: u32,
    /// The part of the image that is the popup (without shadows).
    pub geometry: Geometry,
    /// It holds an explicit grab: it has the keyboard, and a press outside
    /// its app closes it.
    pub grab: bool,
}

/// Host to backend (JSON kind). Frames travel as [`KIND_FRAME`].
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Outbound {
    Hello {
        version: u32,
    },
    SessionReady {
        session: String,
        display: String,
        /// The X display the session reserved for X11 apps (`DISPLAY=:<n>`),
        /// or None when it has none. Xwayland starts on its first client.
        x11_display: Option<u32>,
    },
    SessionFailed {
        session: String,
        reason: String,
    },
    ToplevelCreated {
        session: String,
        #[serde(flatten)]
        info: ToplevelInfo,
    },
    ToplevelUpdated {
        session: String,
        #[serde(flatten)]
        info: ToplevelInfo,
    },
    ToplevelDestroyed {
        session: String,
        toplevel: u32,
    },
    PopupCreated {
        session: String,
        #[serde(flatten)]
        info: PopupInfo,
    },
    PopupUpdated {
        session: String,
        #[serde(flatten)]
        info: PopupInfo,
    },
    PopupDestroyed {
        session: String,
        popup: u32,
    },
    /// The processes connected to the session's socket, by pid (from
    /// `SO_PEERCRED`), whenever one connects or goes.
    Clients {
        session: String,
        pids: Vec<u32>,
    },
    /// The cursor the app asked for, as a CSS cursor name.
    Cursor {
        session: String,
        name: String,
    },
    /// The app asked the window manager for something: `move` and `resize`
    /// (with `edges`) start the OS window's own drag; `maximize`,
    /// `unmaximize`, `minimize`, `fullscreen` and `unfullscreen` map to its
    /// actions.
    Request {
        session: String,
        toplevel: u32,
        action: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        edges: Option<String>,
    },
    /// An app copied text: the tab writes it to its clipboard.
    Clipboard {
        session: String,
        text: String,
    },
}

/// A rectangle in buffer pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// One encoded rectangle of a frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedRect {
    pub rect: Rect,
    pub encoding: u8,
    pub data: Vec<u8>,
}

/// A session id: what names the socket, so it must be safe in a file name.
pub fn valid_session_id(id: &str) -> bool {
    (16..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn push_message(out: &mut Vec<u8>, kind: u8, payload: &[u8]) {
    let len = u32::try_from(payload.len() + 1).expect("message under 4 GiB");
    out.extend_from_slice(&len.to_le_bytes());
    out.push(kind);
    out.extend_from_slice(payload);
}

/// Encode a JSON message, framed.
pub fn encode_json(msg: &Outbound) -> Vec<u8> {
    let json = serde_json::to_vec(msg).expect("outbound messages serialize");
    let mut out = Vec::with_capacity(json.len() + 5);
    push_message(&mut out, KIND_JSON, &json);
    out
}

/// The part of a frame message the backend forwards to the WebSocket after
/// its own kind byte: toplevel, window size, then the rectangles.
pub fn encode_frame_body(toplevel: u32, width: u32, height: u32, rects: &[EncodedRect]) -> Vec<u8> {
    let size: usize = 14 + rects.iter().map(|r| 21 + r.data.len()).sum::<usize>();
    let mut body = Vec::with_capacity(size);
    body.extend_from_slice(&toplevel.to_le_bytes());
    body.extend_from_slice(&width.to_le_bytes());
    body.extend_from_slice(&height.to_le_bytes());
    let count = u16::try_from(rects.len()).expect("at most 65535 rectangles");
    body.extend_from_slice(&count.to_le_bytes());
    for r in rects {
        for v in [r.rect.x, r.rect.y, r.rect.w, r.rect.h] {
            body.extend_from_slice(&v.to_le_bytes());
        }
        body.push(r.encoding);
        let len = u32::try_from(r.data.len()).expect("rectangle under 4 GiB");
        body.extend_from_slice(&len.to_le_bytes());
        body.extend_from_slice(&r.data);
    }
    body
}

/// Encode a frame message, framed: the session id (one length byte, then the
/// id) and the body from [`encode_frame_body`].
pub fn encode_frame(session: &str, body: &[u8]) -> Vec<u8> {
    encode_for_session(KIND_FRAME, session, body)
}

/// Encode a sound message, framed like a frame: the session id, then the
/// body (the packet's sequence number, `u32`, and the Opus packet), which the
/// backend forwards to the WebSocket after its own kind byte.
pub fn encode_audio(session: &str, body: &[u8]) -> Vec<u8> {
    encode_for_session(KIND_AUDIO, session, body)
}

fn encode_for_session(kind: u8, session: &str, body: &[u8]) -> Vec<u8> {
    let sid = session.as_bytes();
    let sid_len = u8::try_from(sid.len()).expect("session ids are at most 64 bytes");
    let mut payload = Vec::with_capacity(1 + sid.len() + body.len());
    payload.push(sid_len);
    payload.extend_from_slice(sid);
    payload.extend_from_slice(body);
    let mut out = Vec::with_capacity(payload.len() + 5);
    push_message(&mut out, kind, &payload);
    out
}

#[derive(Debug, PartialEq)]
pub enum DecodeError {
    TooLarge(usize),
    Empty,
    UnknownKind(u8),
    BadJson(String),
}

/// Reads framed messages out of a byte stream as they arrive.
#[derive(Default)]
pub struct Decoder {
    buf: Vec<u8>,
}

impl Decoder {
    pub fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// The next complete inbound message, if one has fully arrived. Only JSON
    /// travels backend to host.
    pub fn next_inbound(&mut self) -> Result<Option<Inbound>, DecodeError> {
        if self.buf.len() < 4 {
            return Ok(None);
        }
        let len = u32::from_le_bytes([self.buf[0], self.buf[1], self.buf[2], self.buf[3]]) as usize;
        if len > MAX_MESSAGE {
            return Err(DecodeError::TooLarge(len));
        }
        if len == 0 {
            return Err(DecodeError::Empty);
        }
        if self.buf.len() < 4 + len {
            return Ok(None);
        }
        let kind = self.buf[4];
        let payload: Vec<u8> = self.buf[5..4 + len].to_vec();
        self.buf.drain(..4 + len);
        if kind != KIND_JSON {
            return Err(DecodeError::UnknownKind(kind));
        }
        serde_json::from_slice(&payload)
            .map(Some)
            .map_err(|e| DecodeError::BadJson(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixtures_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("protocol-fixtures")
    }

    fn sample_frame() -> Vec<u8> {
        let body = encode_frame_body(
            7,
            640,
            480,
            &[EncodedRect {
                rect: Rect { x: 1, y: 2, w: 3, h: 4 },
                encoding: ENC_DEFLATE_RGBA,
                data: vec![0xde, 0xad, 0xbe, 0xef],
            }],
        );
        encode_frame("abcdefghijklmnop", &body)
    }

    fn sample_created() -> Vec<u8> {
        encode_json(&Outbound::ToplevelCreated {
            session: "abcdefghijklmnop".into(),
            info: ToplevelInfo {
                toplevel: 7,
                title: "foot".into(),
                app_id: "foot".into(),
                width: 640,
                height: 480,
                scale: 1,
                geometry: Geometry { x: 0, y: 0, width: 640, height: 480 },
                decorations: Decorations::Server,
                min_width: 0,
                min_height: 0,
                max_width: 0,
                max_height: 0,
            },
        })
    }

    fn sample_audio() -> Vec<u8> {
        let mut body = 513u32.to_le_bytes().to_vec();
        body.extend_from_slice(&[0xfc, 0xff, 0xfe]);
        encode_audio("abcdefghijklmnop", &body)
    }

    fn sample_clipboard() -> Vec<u8> {
        encode_json(&Outbound::Clipboard { session: "abcdefghijklmnop".into(), text: "copied ș\n\"x\"".into() })
    }

    fn sample_popup() -> Vec<u8> {
        encode_json(&Outbound::PopupCreated {
            session: "abcdefghijklmnop".into(),
            info: PopupInfo {
                popup: 9,
                parent: 7,
                x: 12,
                y: -4,
                width: 200,
                height: 120,
                scale: 2,
                geometry: Geometry {
                    x: 8,
                    y: 8,
                    width: 184,
                    height: 104,
                },
                grab: true,
            },
        })
    }

    #[test]
    fn input_messages_decode() {
        let mut d = Decoder::default();
        let mut bytes = Vec::new();
        for json in [
            r#"{"type":"focus","session":"abcdefghijklmnop","toplevel":null}"#,
            r#"{"type":"pointer_axis","session":"abcdefghijklmnop","toplevel":2,"dx":0,"dy":15,"v120x":0,"v120y":120,"wheel":true}"#,
            r#"{"type":"key","session":"abcdefghijklmnop","keycode":30,"pressed":true}"#,
            r#"{"type":"position","session":"abcdefghijklmnop","toplevel":2,"x":-30,"y":40}"#,
            r#"{"type":"press_outside","session":"abcdefghijklmnop"}"#,
            r#"{"type":"freeze","session":"abcdefghijklmnop","frozen":true}"#,
            r#"{"type":"toplevel_visible","session":"abcdefghijklmnop","toplevel":4,"visible":false}"#,
            r#"{"type":"keyboard_layout","session":"abcdefghijklmnop","layout":"ro"}"#,
            r#"{"type":"clipboard","session":"abcdefghijklmnop","text":"pasted ș\n"}"#,
            r#"{"type":"output","session":"abcdefghijklmnop","width":800,"height":600,"ratio":2.5}"#,
        ] {
            push_message(&mut bytes, KIND_JSON, json.as_bytes());
        }
        d.push(&bytes);
        assert_eq!(
            d.next_inbound(),
            Ok(Some(Inbound::Focus { session: "abcdefghijklmnop".into(), toplevel: None }))
        );
        assert!(matches!(d.next_inbound(), Ok(Some(Inbound::PointerAxis { v120y: 120, wheel: true, .. }))));
        assert!(matches!(d.next_inbound(), Ok(Some(Inbound::Key { keycode: 30, pressed: true, .. }))));
        assert!(matches!(d.next_inbound(), Ok(Some(Inbound::Position { toplevel: 2, x: -30, y: 40, .. }))));
        assert!(matches!(d.next_inbound(), Ok(Some(Inbound::PressOutside { .. }))));
        assert!(matches!(d.next_inbound(), Ok(Some(Inbound::Freeze { frozen: true, .. }))));
        assert!(matches!(d.next_inbound(), Ok(Some(Inbound::ToplevelVisible { toplevel: 4, visible: false, .. }))));
        assert_eq!(
            d.next_inbound(),
            Ok(Some(Inbound::KeyboardLayout { session: "abcdefghijklmnop".into(), layout: "ro".into() }))
        );
        assert_eq!(
            d.next_inbound(),
            Ok(Some(Inbound::Clipboard { session: "abcdefghijklmnop".into(), text: "pasted ș\n".into() }))
        );
        assert_eq!(
            d.next_inbound(),
            Ok(Some(Inbound::Output { session: "abcdefghijklmnop".into(), width: 800, height: 600, ratio: 2.5 }))
        );
    }

    #[test]
    fn session_ids_are_file_name_safe() {
        assert!(valid_session_id("abcdefghijklmnop"));
        assert!(valid_session_id("A-b_c0123456789xyzXYZ"));
        assert!(!valid_session_id("short"));
        assert!(!valid_session_id("abcdefghijklmnop/../x"));
        assert!(!valid_session_id(&"a".repeat(65)));
    }

    #[test]
    fn frames_have_the_documented_layout() {
        let msg = sample_frame();
        let len = u32::from_le_bytes(msg[0..4].try_into().unwrap()) as usize;
        assert_eq!(len, msg.len() - 4);
        assert_eq!(msg[4], KIND_FRAME);
        assert_eq!(msg[5], 16);
        assert_eq!(&msg[6..22], b"abcdefghijklmnop");
        let body = &msg[22..];
        assert_eq!(u32::from_le_bytes(body[0..4].try_into().unwrap()), 7);
        assert_eq!(u32::from_le_bytes(body[4..8].try_into().unwrap()), 640);
        assert_eq!(u32::from_le_bytes(body[8..12].try_into().unwrap()), 480);
        assert_eq!(u16::from_le_bytes(body[12..14].try_into().unwrap()), 1);
        assert_eq!(body[30], ENC_DEFLATE_RGBA);
        assert_eq!(u32::from_le_bytes(body[31..35].try_into().unwrap()), 4);
        assert_eq!(&body[35..], &[0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn sound_messages_have_the_documented_layout() {
        let msg = sample_audio();
        let len = u32::from_le_bytes(msg[0..4].try_into().unwrap()) as usize;
        assert_eq!(len, msg.len() - 4);
        assert_eq!(msg[4], KIND_AUDIO);
        assert_eq!(msg[5], 16);
        assert_eq!(&msg[6..22], b"abcdefghijklmnop");
        assert_eq!(u32::from_le_bytes(msg[22..26].try_into().unwrap()), 513);
        assert_eq!(&msg[26..], &[0xfc, 0xff, 0xfe]);
    }

    #[test]
    fn inbound_messages_decode_across_split_reads() {
        let json = br#"{"type":"session_open","session":"abcdefghijklmnop","width":1280,"height":720}"#;
        let mut bytes = Vec::new();
        push_message(&mut bytes, KIND_JSON, json);
        push_message(&mut bytes, KIND_JSON, br#"{"type":"frame_ack","session":"abcdefghijklmnop","toplevel":3}"#);
        let mut d = Decoder::default();
        d.push(&bytes[..7]);
        assert_eq!(d.next_inbound(), Ok(None));
        d.push(&bytes[7..]);
        assert_eq!(
            d.next_inbound(),
            Ok(Some(Inbound::SessionOpen {
                session: "abcdefghijklmnop".into(),
                width: 1280,
                height: 720,
                // Left out: a scale-1 screen.
                ratio: 1.0,
            }))
        );
        assert_eq!(
            d.next_inbound(),
            Ok(Some(Inbound::FrameAck {
                session: "abcdefghijklmnop".into(),
                toplevel: 3
            }))
        );
        assert_eq!(d.next_inbound(), Ok(None));
    }

    #[test]
    fn oversized_and_unknown_messages_are_refused() {
        let mut d = Decoder::default();
        d.push(&(MAX_MESSAGE as u32 + 1).to_le_bytes());
        assert!(matches!(d.next_inbound(), Err(DecodeError::TooLarge(_))));
        let mut d = Decoder::default();
        let mut bytes = Vec::new();
        push_message(&mut bytes, 9, b"x");
        d.push(&bytes);
        assert_eq!(d.next_inbound(), Err(DecodeError::UnknownKind(9)));
    }

    /// The backend's tests decode these same bytes; a change to the layout
    /// fails one side or the other until both and PROTOCOL.md agree.
    #[test]
    fn fixtures_match_the_encoder() {
        let cases = [
            ("frame.bin", sample_frame()),
            ("toplevel-created.bin", sample_created()),
            ("popup-created.bin", sample_popup()),
            ("clipboard.bin", sample_clipboard()),
            ("audio.bin", sample_audio()),
        ];
        for (name, bytes) in cases {
            let path = fixtures_dir().join(name);
            if std::env::var_os("UPDATE_FIXTURES").is_some() {
                std::fs::create_dir_all(fixtures_dir()).unwrap();
                std::fs::write(&path, &bytes).unwrap();
            }
            let on_disk = std::fs::read(&path).unwrap_or_else(|_| panic!("missing fixture {name}"));
            assert_eq!(on_disk, bytes, "{name} differs from the encoder");
        }
    }
}
