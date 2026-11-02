//! The framed protocol between the backend and the host, over the control
//! socket. PROTOCOL.md is the description both sides follow; the fixtures in
//! `protocol-fixtures/` are encoded here and decoded by the backend's tests.

use serde::{Deserialize, Serialize};

/// Every message: `u32` little-endian length of what follows, then a kind
/// byte, then the payload.
pub const KIND_JSON: u8 = 1;
pub const KIND_FRAME: u8 = 2;

/// Refuse anything larger: a full 4K frame deflated is far below this.
pub const MAX_MESSAGE: usize = 64 * 1024 * 1024;

pub const PROTOCOL_VERSION: u32 = 1;

/// Pixel encodings of a frame's rectangles.
pub const ENC_DEFLATE_RGBA: u8 = 1;
pub const ENC_WEBP_LOSSLESS: u8 = 2;

/// Backend to host.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Inbound {
    /// A desktop session (one tab) wants Linux apps: listen on its socket.
    SessionOpen {
        session: String,
        width: u32,
        height: u32,
    },
    /// The tab went away: disconnect its clients and remove its socket.
    SessionClose { session: String },
    /// The tab's viewport changed size; the session's output follows it.
    Output {
        session: String,
        width: u32,
        height: u32,
    },
    /// The backend has passed a frame to the WebSocket and the socket has
    /// room again: the toplevel may send its next one.
    FrameAck { session: String, toplevel: u32 },
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
    },
    SessionFailed {
        session: String,
        reason: String,
    },
    ToplevelCreated {
        session: String,
        toplevel: u32,
        title: String,
        app_id: String,
        width: u32,
        height: u32,
    },
    ToplevelUpdated {
        session: String,
        toplevel: u32,
        title: String,
        app_id: String,
        width: u32,
        height: u32,
    },
    ToplevelDestroyed {
        session: String,
        toplevel: u32,
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
    let sid = session.as_bytes();
    let sid_len = u8::try_from(sid.len()).expect("session ids are at most 64 bytes");
    let mut payload = Vec::with_capacity(1 + sid.len() + body.len());
    payload.push(sid_len);
    payload.extend_from_slice(sid);
    payload.extend_from_slice(body);
    let mut out = Vec::with_capacity(payload.len() + 5);
    push_message(&mut out, KIND_FRAME, &payload);
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
            toplevel: 7,
            title: "foot".into(),
            app_id: "foot".into(),
            width: 640,
            height: 480,
        })
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
                height: 720
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
        let cases = [("frame.bin", sample_frame()), ("toplevel-created.bin", sample_created())];
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
