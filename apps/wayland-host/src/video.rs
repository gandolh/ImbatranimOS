//! A video region's stream: the part of a window that goes lossy (see
//! `pixels.rs`), sent as VP8 instead of a JPEG per frame when the tab can
//! decode it. Each frame then carries mostly what changed since the last
//! one. Measured on one CPU, VP8 at its fastest real-time speed costs about
//! what JPEG does per frame for under half the bytes at the same look
//! (corpus/wiki/research-video-in-linux-windows.md).
//!
//! The encoder is libvpx through a small C shim (`csrc/vp8.c`). A stream
//! covers one rectangle; a new rectangle (the video moved or was resized)
//! starts a new stream, whose first frame is a keyframe.

use std::ffi::c_void;
use std::ptr::NonNull;
use std::time::{Duration, Instant};

use crate::protocol::Rect;

#[repr(C)]
struct Vp8Encoder {
    _private: [u8; 0],
}

type Sink = extern "C" fn(*mut c_void, *const u8, usize);

extern "C" {
    fn imbatranim_vp8_new(width: i32, height: i32, kbps: i32) -> *mut Vp8Encoder;
    fn imbatranim_vp8_set_bitrate(e: *mut Vp8Encoder, kbps: i32) -> i32;
    fn imbatranim_vp8_encode(
        e: *mut Vp8Encoder,
        i420: *mut u8,
        pts_ms: i64,
        duration_ms: std::ffi::c_ulong,
        keyframe: i32,
        sink: Sink,
        user: *mut c_void,
    ) -> i32;
    fn imbatranim_vp8_free(e: *mut Vp8Encoder);
}

extern "C" fn collect(user: *mut c_void, data: *const u8, len: usize) {
    // SAFETY: `user` is the `Vec` `encode` passed, alive for the call, and
    // libvpx hands over `len` readable bytes at `data`.
    let out = unsafe { &mut *(user as *mut Vec<u8>) };
    out.extend_from_slice(unsafe { std::slice::from_raw_parts(data, len) });
}

/// Bits per pixel of the region for each frame: what VP8 needed to look as
/// good as JPEG at quality 80 on the measured clip (0.18 there), with a
/// little room for camera noise, which a synthetic clip lacks.
const BITS_PER_PIXEL: f64 = 0.2;
/// The frame interval assumed until two frames have gone: the host's tick.
const FIRST_INTERVAL_MS: f64 = 33.0;
/// The bitrate's bounds, in kbit/s.
const MIN_KBPS: u32 = 100;
const MAX_KBPS: u32 = 20_000;
/// A bitrate change smaller than this share of the current one waits.
const RETUNE: f64 = 0.1;

/// The window's video stream: one encoder for one rectangle.
pub struct Vp8Stream {
    encoder: NonNull<Vp8Encoder>,
    rect: Rect,
    i420: Vec<u8>,
    started: Instant,
    last: Option<Instant>,
    /// The time between frames, smoothed: the bitrate follows the frame
    /// rate, so a frame carries the same number of bits at any rate.
    interval_ms: f64,
    kbps: u32,
}

// SAFETY: the encoder is owned by its stream and used only through `&mut`;
// libvpx keeps no thread-bound state in it.
unsafe impl Send for Vp8Stream {}

impl Vp8Stream {
    /// A stream for `rect`, whose width and height are even. None when
    /// libvpx refuses it.
    pub fn new(rect: Rect, link: f64) -> Option<Vp8Stream> {
        if rect.w == 0 || rect.h == 0 || rect.w % 2 == 1 || rect.h % 2 == 1 {
            return None;
        }
        let kbps = target_kbps(rect, FIRST_INTERVAL_MS, link);
        // SAFETY: plain values; a null return is handled.
        let encoder = NonNull::new(unsafe { imbatranim_vp8_new(rect.w as i32, rect.h as i32, kbps as i32) })?;
        Some(Vp8Stream {
            encoder,
            rect,
            i420: vec![0; rect.w as usize * rect.h as usize * 3 / 2],
            started: Instant::now(),
            last: None,
            interval_ms: FIRST_INTERVAL_MS,
            kbps,
        })
    }

    pub fn rect(&self) -> Rect {
        self.rect
    }

    /// Encode the stream's rectangle of `rgba` (opaque premultiplied RGBA
    /// rows of `stride` pixels), a keyframe if this is the stream's first
    /// frame. `link` scales the bitrate down while the tab's link is slow
    /// ([`Link`]). None when libvpx fails or gives nothing.
    pub fn encode(&mut self, rgba: &[u8], stride: usize, link: f64) -> Option<Vec<u8>> {
        let now = Instant::now();
        let first = self.last.is_none();
        let duration = match self.last {
            Some(last) => {
                let ms = now.duration_since(last).as_secs_f64() * 1000.0;
                self.interval_ms += (ms.clamp(1.0, 1000.0) - self.interval_ms) * 0.25;
                ms.max(1.0)
            }
            None => FIRST_INTERVAL_MS,
        };
        self.last = Some(now);
        let kbps = target_kbps(self.rect, self.interval_ms, link);
        if (kbps as f64 - self.kbps as f64).abs() > self.kbps as f64 * RETUNE {
            // SAFETY: the encoder is alive while the stream is.
            if unsafe { imbatranim_vp8_set_bitrate(self.encoder.as_ptr(), kbps as i32) } == 0 {
                self.kbps = kbps;
            }
        }
        rgba_to_i420(rgba, stride, self.rect, &mut self.i420);
        let pts = now.duration_since(self.started).as_millis() as i64;
        let mut out: Vec<u8> = Vec::new();
        // SAFETY: the I420 buffer is the size the encoder was made for, and
        // `out` outlives the call, which is all `collect` touches.
        let rc = unsafe {
            imbatranim_vp8_encode(
                self.encoder.as_ptr(),
                self.i420.as_mut_ptr(),
                pts,
                duration.round() as std::ffi::c_ulong,
                first as i32,
                collect,
                &mut out as *mut Vec<u8> as *mut c_void,
            )
        };
        (rc == 0 && !out.is_empty()).then_some(out)
    }
}

impl Drop for Vp8Stream {
    fn drop(&mut self) {
        // SAFETY: made by `imbatranim_vp8_new`, freed once.
        unsafe { imbatranim_vp8_free(self.encoder.as_ptr()) };
    }
}

/// The bitrate for `rect` at a frame every `interval_ms`, scaled by `link`.
fn target_kbps(rect: Rect, interval_ms: f64, link: f64) -> u32 {
    let bits_per_frame = BITS_PER_PIXEL * rect.w as f64 * rect.h as f64;
    // Bits per millisecond are kbit/s.
    let kbps = bits_per_frame / interval_ms.max(1.0) * link;
    (kbps.round() as u32).clamp(MIN_KBPS, MAX_KBPS)
}

/// A window's link to the tab, as its acks tell it: how long the backend
/// took to pass a frame on and have room for the next. A slow ack means the
/// tab's socket is backed up, and the video's bitrate drops; fast acks let
/// it climb back. One frame in flight stays the rule either way.
#[derive(Debug, Clone, Copy)]
pub struct Link {
    factor: f64,
}

/// Slower than this, the socket was over the backend's low-water mark (the
/// backend checks every 50 ms).
const ACK_SLOW: Duration = Duration::from_millis(50);
/// Faster than this, the frame went straight through.
const ACK_FAST: Duration = Duration::from_millis(20);
const LINK_DOWN: f64 = 0.8;
const LINK_UP: f64 = 1.05;
const LINK_FLOOR: f64 = 0.15;

impl Default for Link {
    fn default() -> Self {
        Link { factor: 1.0 }
    }
}

impl Link {
    pub fn factor(&self) -> f64 {
        self.factor
    }

    pub fn on_ack(&mut self, delay: Duration) {
        if delay >= ACK_SLOW {
            self.factor = (self.factor * LINK_DOWN).max(LINK_FLOOR);
        } else if delay < ACK_FAST {
            self.factor = (self.factor * LINK_UP).min(1.0);
        }
    }
}

/// `rect` of opaque RGBA rows (`stride` pixels each) as I420 in `out`: the
/// BT.601 matrix, limited range, each chroma sample the average of its 2×2
/// pixels. The rectangle's width and height are even. VP8 frames can't say
/// which matrix they use, and Chrome guesses BT.709 for them, so the tab's
/// decoder config names this one (`frames.ts`): keep the two in step.
pub fn rgba_to_i420(rgba: &[u8], stride: usize, rect: Rect, out: &mut [u8]) {
    let (w, h) = (rect.w as usize, rect.h as usize);
    let (y_plane, chroma) = out.split_at_mut(w * h);
    let (u_plane, v_plane) = chroma.split_at_mut(w * h / 4);
    let luma = |p: &[u8]| (((66 * p[0] as i32 + 129 * p[1] as i32 + 25 * p[2] as i32 + 128) >> 8) + 16) as u8;
    for row in 0..h / 2 {
        let top_at = ((rect.y as usize + row * 2) * stride + rect.x as usize) * 4;
        let bottom_at = top_at + stride * 4;
        let top = &rgba[top_at..top_at + w * 4];
        let bottom = &rgba[bottom_at..bottom_at + w * 4];
        let (y_top, y_bottom) = y_plane[row * 2 * w..(row * 2 + 2) * w].split_at_mut(w);
        let u_row = &mut u_plane[row * w / 2..(row + 1) * w / 2];
        let v_row = &mut v_plane[row * w / 2..(row + 1) * w / 2];
        let pairs = top.chunks_exact(8).zip(bottom.chunks_exact(8));
        let ys = y_top.chunks_exact_mut(2).zip(y_bottom.chunks_exact_mut(2));
        for (((t, b), (yt, yb)), (u, v)) in pairs.zip(ys).zip(u_row.iter_mut().zip(v_row.iter_mut())) {
            yt[0] = luma(&t[0..4]);
            yt[1] = luma(&t[4..8]);
            yb[0] = luma(&b[0..4]);
            yb[1] = luma(&b[4..8]);
            let r = (t[0] as i32 + t[4] as i32 + b[0] as i32 + b[4] as i32 + 2) >> 2;
            let g = (t[1] as i32 + t[5] as i32 + b[1] as i32 + b[5] as i32 + 2) >> 2;
            let bl = (t[2] as i32 + t[6] as i32 + b[2] as i32 + b[6] as i32 + 2) >> 2;
            *u = (((-38 * r - 74 * g + 112 * bl + 128) >> 8) + 128) as u8;
            *v = (((112 * r - 94 * g - 18 * bl + 128) >> 8) + 128) as u8;
        }
    }
}

/// Whether a VP8 frame is a keyframe: bit 0 of its frame tag is clear.
#[cfg(test)]
pub fn is_keyframe(frame: &[u8]) -> bool {
    frame.first().is_some_and(|b| b & 1 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: Rect = Rect { x: 0, y: 0, w: 64, h: 48 };

    fn gradient(w: usize, h: usize, shift: usize) -> Vec<u8> {
        let mut px = vec![255u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let o = (y * w + x) * 4;
                px[o] = ((x + shift) * 4) as u8;
                px[o + 1] = (y * 5) as u8;
                px[o + 2] = ((x ^ y) * 3) as u8;
            }
        }
        px
    }

    #[test]
    fn grey_converts_to_mid_chroma_and_black_and_white_to_the_limited_range() {
        let mut px = vec![255u8; 4 * 2 * 4];
        for (i, p) in px.chunks_exact_mut(4).enumerate() {
            let v = if i % 2 == 0 { 0 } else { 255 };
            p[..3].fill(v);
        }
        let mut out = vec![0u8; 4 * 2 * 3 / 2];
        rgba_to_i420(&px, 4, Rect { x: 0, y: 0, w: 4, h: 2 }, &mut out);
        assert_eq!(&out[..8], &[16, 235, 16, 235, 16, 235, 16, 235]);
        // The average of black and white is grey: no colour.
        assert_eq!(&out[8..], &[128, 128, 128, 128]);
    }

    #[test]
    fn a_rectangle_inside_a_wider_image_reads_its_own_pixels() {
        let whole = gradient(10, 6, 0);
        let mut inner = vec![0u8; 4 * 2 * 3 / 2];
        rgba_to_i420(&whole, 10, Rect { x: 2, y: 2, w: 4, h: 2 }, &mut inner);
        let mut cut = Vec::new();
        for y in 2..4 {
            cut.extend_from_slice(&whole[(y * 10 + 2) * 4..(y * 10 + 6) * 4]);
        }
        let mut alone = vec![0u8; 4 * 2 * 3 / 2];
        rgba_to_i420(&cut, 4, Rect { x: 0, y: 0, w: 4, h: 2 }, &mut alone);
        assert_eq!(inner, alone);
    }

    #[test]
    fn a_stream_starts_with_a_keyframe_then_sends_deltas() {
        let mut s = Vp8Stream::new(R, 1.0).expect("libvpx makes an encoder");
        let first = s.encode(&gradient(64, 48, 0), 64, 1.0).expect("a frame");
        assert!(is_keyframe(&first));
        for shift in 1..5 {
            let next = s.encode(&gradient(64, 48, shift), 64, 1.0).expect("a frame");
            assert!(!is_keyframe(&next), "frame {shift} is a delta");
        }
        // A new stream (a moved or resized region) starts with a keyframe.
        let mut again = Vp8Stream::new(R, 1.0).unwrap();
        assert!(is_keyframe(&again.encode(&gradient(64, 48, 9), 64, 1.0).unwrap()));
    }

    #[test]
    fn odd_or_empty_rectangles_get_no_stream() {
        assert!(Vp8Stream::new(Rect { x: 0, y: 0, w: 63, h: 48 }, 1.0).is_none());
        assert!(Vp8Stream::new(Rect { x: 0, y: 0, w: 64, h: 0 }, 1.0).is_none());
    }

    #[test]
    fn the_bitrate_follows_the_area_the_frame_rate_and_the_link() {
        let hd = Rect { x: 0, y: 0, w: 1280, h: 720 };
        // 0.2 bits a pixel, 30 frames a second: about 5.5 Mbit/s.
        assert_eq!(target_kbps(hd, 1000.0 / 30.0, 1.0), 5530);
        // Half the frame rate, half the bits a second: each frame the same.
        assert_eq!(target_kbps(hd, 2000.0 / 30.0, 1.0), 2765);
        assert_eq!(target_kbps(hd, 1000.0 / 30.0, 0.5), 2765);
        assert_eq!(target_kbps(Rect { x: 0, y: 0, w: 16, h: 16 }, 33.0, 1.0), MIN_KBPS);
    }

    #[test]
    fn slow_acks_lower_the_link_and_fast_ones_bring_it_back() {
        let mut link = Link::default();
        link.on_ack(Duration::from_millis(5));
        assert_eq!(link.factor(), 1.0, "never above the full rate");
        link.on_ack(Duration::from_millis(120));
        link.on_ack(Duration::from_millis(120));
        assert!((link.factor() - 0.64).abs() < 1e-9);
        // In between: held.
        link.on_ack(Duration::from_millis(30));
        assert!((link.factor() - 0.64).abs() < 1e-9);
        for _ in 0..100 {
            link.on_ack(Duration::from_millis(300));
        }
        assert_eq!(link.factor(), LINK_FLOOR);
        for _ in 0..100 {
            link.on_ack(Duration::from_millis(2));
        }
        assert_eq!(link.factor(), 1.0);
    }

    #[test]
    fn keyframes_are_told_by_the_frame_tag() {
        assert!(is_keyframe(&[0x10, 0x02]));
        assert!(!is_keyframe(&[0x11, 0x02]));
        assert!(!is_keyframe(&[]));
    }
}
