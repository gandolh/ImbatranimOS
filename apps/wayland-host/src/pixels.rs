//! A window's pixels: the RGBA copy the host keeps of each toplevel, the
//! damage waiting to be sent, the two lossless encodings, and the lossy one a
//! region that keeps changing (a video) is sent in.

use std::io::Write;

use crate::protocol::{EncodedRect, Rect, ENC_DEFLATE_RGBA, ENC_JPEG, ENC_WEBP_LOSSLESS};

/// `wl_shm` formats the host reads. Both are little-endian 32-bit words, so
/// the bytes in memory are B, G, R, A (or B, G, R, unused).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShmFormat {
    Argb8888,
    Xrgb8888,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Encoding {
    Deflate,
    Webp,
}

impl Encoding {
    pub fn parse(s: &str) -> Option<Encoding> {
        match s {
            "deflate" => Some(Encoding::Deflate),
            "webp" => Some(Encoding::Webp),
            _ => None,
        }
    }
}

/// More rectangles than this and the damage collapses to its bounding box:
/// past a handful, the per-rectangle overhead costs more than it saves.
const MAX_RECTS: usize = 16;

// When a region goes lossy (the WebP path only; deflate stays as it is).
//
// A video playing in a window sends the same large rectangle on almost every
// frame, and lossless WebP of camera pixels is several times a JPEG's size
// (239 kB/s for a 480 px synthetic video at 28 frames a second, measured
// 2026-11-03; a real film costs more). Text and UI change in small pieces,
// or in large ones only now and then, and stay lossless.

/// "Large": at least this many pixels, about a 240×135 thumbnail. Smaller
/// changes (a caret, a spinner, a typed line) aren't worth the artifacts.
const LOSSY_MIN_AREA: u64 = 240 * 135;
/// "Changes on most frames": the region was redrawn in at least this many of
/// the window's last eight frames. A burst of two or three (a page loading, a
/// menu opening) stays lossless.
const LOSSY_HOT_FRAMES: u32 = 6;
/// A redraw counts as the same region when it covers at least half of it.
const LOSSY_SAME_REGION: f64 = 0.5;
/// A redraw of the region at most this much larger becomes the region (a
/// video that moved or grew); a larger one is the region merged with other
/// damage (text beside it), and the region keeps its bounds, so the text
/// stays lossless.
const LOSSY_FOLLOW_GROWTH: f64 = 1.5;
/// Ticks (33 ms each) the region must stay still after a lossy frame before
/// it is sent once more, lossless, so a paused video ends up sharp: about a
/// quarter of a second.
const LOSSY_SETTLE_TICKS: u32 = 8;
/// JPEG quality: high enough that faces and gradients hold up.
const JPEG_QUALITY: u8 = 80;

/// A large region of the window that is being redrawn again and again.
#[derive(Debug, Clone, Copy)]
struct Hot {
    rect: Rect,
    /// One bit per frame, newest lowest: was the region redrawn in it.
    history: u8,
    /// Ticks since it was last redrawn.
    quiet: u32,
    /// Part of it went out lossy since it was last sent lossless.
    lossy_sent: bool,
}

impl Hot {
    fn is_hot(&self) -> bool {
        self.history.count_ones() >= LOSSY_HOT_FRAMES
    }
}

/// One surface's last committed buffer, as premultiplied RGBA. Every surface
/// of a window (its root, its subsurfaces) keeps one; the window's [`Canvas`]
/// is composed from them.
#[derive(Default)]
pub struct SurfaceImage {
    /// The buffer's size, in pixels.
    pub width: u32,
    pub height: u32,
    /// Its size in surface coordinates, the units of window geometry and
    /// input (CSS pixels in the tab): the buffer's size over its scale, or
    /// its viewport's (see [`surface_size`]). The buffer's size at scale 1.
    pub surface_width: u32,
    pub surface_height: u32,
    rgba: Vec<u8>,
}

impl SurfaceImage {
    pub fn is_empty(&self) -> bool {
        self.width == 0 || self.height == 0
    }

    /// Copy `damage` (buffer pixels; empty means all of it) out of a client's
    /// shm buffer. Returns what changed, in surface pixels: all of it when
    /// the size changed. None when the buffer can't be read.
    #[allow(clippy::too_many_arguments)]
    pub fn copy_from_shm(
        &mut self,
        pool: &[u8],
        offset: usize,
        width: u32,
        height: u32,
        stride: usize,
        format: ShmFormat,
        damage: &[Rect],
    ) -> Option<Vec<Rect>> {
        if width == 0 || height == 0 || stride < width as usize * 4 {
            return None;
        }
        let needed = offset + stride * (height as usize - 1) + width as usize * 4;
        if pool.len() < needed {
            return None;
        }
        let resized = width != self.width || height != self.height;
        if resized {
            self.width = width;
            self.height = height;
            self.surface_width = width;
            self.surface_height = height;
            self.rgba = vec![0; width as usize * height as usize * 4];
        }
        let full = Rect {
            x: 0,
            y: 0,
            w: width,
            h: height,
        };
        let rects: Vec<Rect> = if resized || damage.is_empty() {
            vec![full]
        } else {
            damage.iter().filter_map(|r| clip(*r, width, height)).collect()
        };
        for r in &rects {
            for row in r.y..r.y + r.h {
                let src_start = offset + row as usize * stride + r.x as usize * 4;
                let src = &pool[src_start..src_start + r.w as usize * 4];
                let dst_start = (row as usize * width as usize + r.x as usize) * 4;
                let dst = &mut self.rgba[dst_start..dst_start + r.w as usize * 4];
                convert_row(src, dst, format);
            }
        }
        Some(rects)
    }
}

/// One surface of a window, where it sits in the window's image and the size
/// it is drawn at there, both in window pixels. A surface drawn at another
/// size than its buffer's (a subsurface at another scale than its window) is
/// resampled, nearest pixel.
pub struct Layer<'a> {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub image: &'a SurfaceImage,
}

#[cfg(test)]
impl<'a> Layer<'a> {
    /// A surface drawn one buffer pixel to one window pixel.
    pub fn at(x: i32, y: i32, image: &'a SurfaceImage) -> Layer<'a> {
        Layer { x, y, width: image.width, height: image.height, image }
    }
}

/// A window's image (a toplevel's or a popup's): its surfaces composed in
/// stacking order, and what changed since the last frame went out. The root
/// surface's buffer sets its size; subsurfaces are clipped to it.
#[derive(Default)]
pub struct Canvas {
    pub width: u32,
    pub height: u32,
    rgba: Vec<u8>,
    damage: Vec<Rect>,
    /// The region being watched for going lossy, if any.
    hot: Option<Hot>,
    /// The next frame goes all lossless: a lossy region settled.
    settle: bool,
}

impl Canvas {
    pub fn has_damage(&self) -> bool {
        !self.damage.is_empty()
    }

    /// The root surface's size. A new size clears the canvas and damages it
    /// all; the same size does nothing.
    pub fn resize(&mut self, width: u32, height: u32) {
        if width == self.width && height == self.height {
            return;
        }
        self.width = width;
        self.height = height;
        self.rgba = vec![0; width as usize * height as usize * 4];
        self.damage = vec![Rect {
            x: 0,
            y: 0,
            w: width,
            h: height,
        }];
        self.hot = None;
        self.settle = false;
    }

    /// One tick of the host's frame clock went by. A region sent lossy that
    /// has been still for a while is damaged once more, to go out lossless:
    /// a paused video ends up sharp.
    pub fn tick(&mut self) {
        let Some(hot) = self.hot.as_mut() else { return };
        hot.quiet = hot.quiet.saturating_add(1);
        if hot.lossy_sent && hot.quiet >= LOSSY_SETTLE_TICKS {
            let rect = hot.rect;
            self.hot = None;
            self.settle = true;
            self.add_damage(rect);
        }
    }

    /// Watch this frame's damage for a large region that keeps being redrawn,
    /// and say which part of the window to send lossy, if any.
    fn observe(&mut self, rects: &[Rect]) -> Option<Rect> {
        let big = rects.iter().copied().filter(|r| area(*r) >= LOSSY_MIN_AREA).max_by_key(|r| area(*r));
        match (&mut self.hot, big) {
            (Some(hot), Some(b)) if overlap(hot.rect, b) >= LOSSY_SAME_REGION => {
                hot.history = (hot.history << 1) | 1;
                if area(b) as f64 <= area(hot.rect) as f64 * LOSSY_FOLLOW_GROWTH {
                    hot.rect = b;
                }
                hot.quiet = 0;
            }
            (Some(hot), b) => {
                hot.history <<= 1;
                // A new large region takes the place of one that went cold
                // without having been sent lossy.
                if let Some(b) = b {
                    if !hot.lossy_sent && !hot.is_hot() {
                        *hot = Hot { rect: b, history: 1, quiet: 0, lossy_sent: false };
                    }
                }
            }
            (None, Some(b)) => {
                self.hot = Some(Hot { rect: b, history: 1, quiet: 0, lossy_sent: false });
            }
            (None, None) => {}
        }
        self.hot.filter(|h| h.is_hot()).map(|h| h.rect)
    }

    /// Whether every pixel of `r` is opaque. A JPEG has no alpha.
    fn opaque(&self, r: Rect) -> bool {
        (r.y..r.y + r.h).all(|row| {
            let start = (row as usize * self.width as usize + r.x as usize) * 4;
            self.rgba[start..start + r.w as usize * 4].chunks_exact(4).all(|p| p[3] == 255)
        })
    }

    pub fn damage_all(&mut self) {
        if self.width > 0 && self.height > 0 {
            self.damage = vec![Rect {
                x: 0,
                y: 0,
                w: self.width,
                h: self.height,
            }];
        }
    }

    /// Damage a rectangle given in window pixels, which may start outside it.
    pub fn damage(&mut self, x: i32, y: i32, w: u32, h: u32) {
        if let Some(r) = clip_signed(x, y, w as i32, h as i32, self.width, self.height) {
            self.add_damage(r);
        }
    }

    fn add_damage(&mut self, r: Rect) {
        if self.damage.iter().any(|d| contains(*d, r)) {
            return;
        }
        self.damage.retain(|d| !contains(r, *d));
        self.damage.push(r);
        if self.damage.len() > MAX_RECTS {
            let all = self.damage.iter().copied().reduce(union).expect("non-empty");
            self.damage = vec![all];
        }
    }

    /// Redraw the damaged rectangles from `layers`, bottom to top, then take
    /// the damage and encode each rectangle of it. With WebP, the part of a
    /// rectangle inside a region that keeps changing goes lossy (JPEG), and
    /// the rest of it lossless; a window that isn't playing anything is
    /// lossless, byte for byte, as before.
    pub fn take_frame(&mut self, layers: &[Layer], encoding: Encoding) -> Vec<EncodedRect> {
        let rects = std::mem::take(&mut self.damage);
        for r in &rects {
            self.compose(*r, layers);
        }
        let lossy = if encoding == Encoding::Webp && !std::mem::take(&mut self.settle) {
            self.observe(&rects)
        } else {
            None
        };
        let mut out = Vec::with_capacity(rects.len());
        for rect in rects {
            let inside = lossy.and_then(|h| intersect(rect, h)).filter(|r| self.opaque(*r));
            match inside {
                Some(part) => {
                    out.push(EncodedRect { rect: part, encoding: ENC_JPEG, data: jpeg(&self.extract(part), part.w, part.h) });
                    for rest in subtract(rect, part) {
                        out.push(self.encode_lossless(rest, encoding));
                    }
                    if let Some(hot) = self.hot.as_mut() {
                        hot.lossy_sent = true;
                    }
                }
                None => out.push(self.encode_lossless(rect, encoding)),
            }
        }
        out
    }

    fn encode_lossless(&self, rect: Rect, encoding: Encoding) -> EncodedRect {
        let pixels = self.extract(rect);
        match encoding {
            Encoding::Deflate => EncodedRect {
                rect,
                encoding: ENC_DEFLATE_RGBA,
                data: deflate(&pixels),
            },
            Encoding::Webp => EncodedRect {
                rect,
                encoding: ENC_WEBP_LOSSLESS,
                data: webp_lossless(&pixels, rect.w, rect.h),
            },
        }
    }

    /// Clear `r` and paint each layer over it. Pixels are premultiplied, as
    /// clients hand them over, so "over" is `src + dst * (1 - src alpha)`.
    fn compose(&mut self, r: Rect, layers: &[Layer]) {
        let w = self.width as usize;
        for row in r.y..r.y + r.h {
            let start = (row as usize * w + r.x as usize) * 4;
            self.rgba[start..start + r.w as usize * 4].fill(0);
        }
        let mut scaled_row = Vec::new();
        for (i, layer) in layers.iter().enumerate() {
            let img = layer.image;
            if img.is_empty() || layer.width == 0 || layer.height == 0 {
                continue;
            }
            // The layer's rectangle in window pixels, cut to `r`.
            let x0 = (layer.x.max(r.x as i32)) as i64;
            let y0 = (layer.y.max(r.y as i32)) as i64;
            let x1 = (layer.x as i64 + layer.width as i64).min((r.x + r.w) as i64);
            let y1 = (layer.y as i64 + layer.height as i64).min((r.y + r.h) as i64);
            if x1 <= x0 || y1 <= y0 {
                continue;
            }
            let span = (x1 - x0) as usize * 4;
            let exact = layer.width == img.width && layer.height == img.height;
            for y in y0..y1 {
                let src: &[u8] = if exact {
                    let sy = (y - layer.y as i64) as usize;
                    let sx = (x0 - layer.x as i64) as usize;
                    let src_start = (sy * img.width as usize + sx) * 4;
                    &img.rgba[src_start..src_start + span]
                } else {
                    // Nearest pixel: the buffer pixel under each window pixel.
                    let sy = ((y - layer.y as i64) * img.height as i64 / layer.height as i64) as usize;
                    scaled_row.clear();
                    for x in x0..x1 {
                        let sx = ((x - layer.x as i64) * img.width as i64 / layer.width as i64) as usize;
                        let at = (sy * img.width as usize + sx) * 4;
                        scaled_row.extend_from_slice(&img.rgba[at..at + 4]);
                    }
                    &scaled_row
                };
                let dst_start = (y as usize * w + x0 as usize) * 4;
                let dst = &mut self.rgba[dst_start..dst_start + span];
                if i == 0 {
                    // The bottom layer lands on a cleared canvas: a copy.
                    dst.copy_from_slice(src);
                } else {
                    blend_over(src, dst);
                }
            }
        }
    }

    fn extract(&self, r: Rect) -> Vec<u8> {
        let mut out = Vec::with_capacity(r.w as usize * r.h as usize * 4);
        for row in r.y..r.y + r.h {
            let start = (row as usize * self.width as usize + r.x as usize) * 4;
            out.extend_from_slice(&self.rgba[start..start + r.w as usize * 4]);
        }
        out
    }
}

/// `src` over `dst`, both premultiplied RGBA rows of the same length.
fn blend_over(src: &[u8], dst: &mut [u8]) {
    for (s, d) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
        let a = s[3] as u32;
        if a == 255 {
            d.copy_from_slice(s);
        } else if a != 0 || s[0] | s[1] | s[2] != 0 {
            let keep = 255 - a;
            for c in 0..4 {
                d[c] = (s[c] as u32 + (d[c] as u32 * keep + 127) / 255).min(255) as u8;
            }
        }
    }
}

/// B, G, R, A words to R, G, B, A bytes; X becomes opaque.
pub fn convert_row(src: &[u8], dst: &mut [u8], format: ShmFormat) {
    for (s, d) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
        d[0] = s[2];
        d[1] = s[1];
        d[2] = s[0];
        d[3] = match format {
            ShmFormat::Argb8888 => s[3],
            ShmFormat::Xrgb8888 => 0xff,
        };
    }
}

pub fn clip(r: Rect, width: u32, height: u32) -> Option<Rect> {
    let x0 = r.x.min(width);
    let y0 = r.y.min(height);
    let x1 = r.x.saturating_add(r.w).min(width);
    let y1 = r.y.saturating_add(r.h).min(height);
    (x1 > x0 && y1 > y0).then_some(Rect { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
}

/// Clip a rectangle that may start at negative coordinates (as clients send
/// damage) to the buffer.
pub fn clip_signed(x: i32, y: i32, w: i32, h: i32, width: u32, height: u32) -> Option<Rect> {
    if w <= 0 || h <= 0 {
        return None;
    }
    let x0 = x.max(0) as u32;
    let y0 = y.max(0) as u32;
    let x1 = (x.saturating_add(w)).max(0) as u32;
    let y1 = (y.saturating_add(h)).max(0) as u32;
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    clip(Rect { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, width, height)
}

// ── Scale ───────────────────────────────────────────────────────────────

/// The highest output scale the host advertises. A phone's ratio of 3.5 asks
/// for 4; above it, frames would cost far more than a screen shows.
pub const MAX_SCALE: u32 = 4;

/// The output scale for a tab's `devicePixelRatio`: its ceiling, so an app
/// draws at least as many pixels as the screen shows, at most [`MAX_SCALE`].
/// A ratio a hair above a whole number (float noise) counts as that number.
pub fn output_scale(ratio: f64) -> u32 {
    if !ratio.is_finite() || ratio <= 1.0 {
        return 1;
    }
    ((ratio - 0.01).ceil() as u32).clamp(1, MAX_SCALE)
}

/// A surface's size in surface coordinates: its viewport's destination when
/// it set one (an app drawing at the fractional scale's preferred scale),
/// else its buffer's size over its buffer scale.
pub fn surface_size(buffer: (u32, u32), buffer_scale: i32, viewport: Option<(i32, i32)>) -> (u32, u32) {
    if let Some((w, h)) = viewport.filter(|(w, h)| *w > 0 && *h > 0) {
        return (w as u32, h as u32);
    }
    let s = buffer_scale.max(1) as u32;
    ((buffer.0 / s).max(1), (buffer.1 / s).max(1))
}

/// A window's image pixels per surface coordinate: its root buffer's width
/// over its surface width, rounded, from 1 to [`MAX_SCALE`].
pub fn window_scale(buffer_width: u32, surface_width: u32) -> u32 {
    if surface_width == 0 {
        return 1;
    }
    ((buffer_width as f64 / surface_width as f64).round() as u32).clamp(1, MAX_SCALE)
}

/// `r`, in a space `from` in size, on a space `to` in size, grown to whole
/// pixels: damage in surface coordinates in buffer pixels, or a surface's
/// changed pixels where its window draws them.
pub fn map_rect(r: Rect, from: (u32, u32), to: (u32, u32)) -> Rect {
    if from == to || from.0 == 0 || from.1 == 0 {
        return r;
    }
    let (fw, fh, tw, th) = (from.0 as u64, from.1 as u64, to.0 as u64, to.1 as u64);
    let x0 = r.x as u64 * tw / fw;
    let y0 = r.y as u64 * th / fh;
    let x1 = ((r.x as u64 + r.w as u64) * tw).div_ceil(fw);
    let y1 = ((r.y as u64 + r.h as u64) * th).div_ceil(fh);
    Rect { x: x0 as u32, y: y0 as u32, w: (x1 - x0) as u32, h: (y1 - y0) as u32 }
}

fn contains(outer: Rect, inner: Rect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.w <= outer.x + outer.w
        && inner.y + inner.h <= outer.y + outer.h
}

fn area(r: Rect) -> u64 {
    r.w as u64 * r.h as u64
}

fn intersect(a: Rect, b: Rect) -> Option<Rect> {
    let x0 = a.x.max(b.x);
    let y0 = a.y.max(b.y);
    let x1 = (a.x + a.w).min(b.x + b.w);
    let y1 = (a.y + a.h).min(b.y + b.h);
    // Lazily: for disjoint rectangles the widths would underflow.
    (x1 > x0 && y1 > y0).then(|| Rect { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
}

/// How much of `a` the rectangle `b` covers, from 0 to 1.
fn overlap(a: Rect, b: Rect) -> f64 {
    match (intersect(a, b), area(a)) {
        (Some(i), total) if total > 0 => area(i) as f64 / total as f64,
        _ => 0.0,
    }
}

/// `outer` minus `inner` (which lies inside it): up to four rectangles, the
/// bands above and below it and the pieces to its left and right.
fn subtract(outer: Rect, inner: Rect) -> Vec<Rect> {
    let mut out = Vec::with_capacity(4);
    let (ox1, oy1) = (outer.x + outer.w, outer.y + outer.h);
    let (ix1, iy1) = (inner.x + inner.w, inner.y + inner.h);
    if inner.y > outer.y {
        out.push(Rect { x: outer.x, y: outer.y, w: outer.w, h: inner.y - outer.y });
    }
    if iy1 < oy1 {
        out.push(Rect { x: outer.x, y: iy1, w: outer.w, h: oy1 - iy1 });
    }
    if inner.x > outer.x {
        out.push(Rect { x: outer.x, y: inner.y, w: inner.x - outer.x, h: inner.h });
    }
    if ix1 < ox1 {
        out.push(Rect { x: ix1, y: inner.y, w: ox1 - ix1, h: inner.h });
    }
    out
}

fn union(a: Rect, b: Rect) -> Rect {
    let x0 = a.x.min(b.x);
    let y0 = a.y.min(b.y);
    let x1 = (a.x + a.w).max(b.x + b.w);
    let y1 = (a.y + a.h).max(b.y + b.h);
    Rect { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/// zlib-wrapped deflate, what the browser's `DecompressionStream('deflate')`
/// reads. Level 1: a window's pixels compress well even at the fastest level.
pub fn deflate(pixels: &[u8]) -> Vec<u8> {
    let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::fast());
    enc.write_all(pixels).expect("writing to a Vec");
    enc.finish().expect("writing to a Vec")
}

/// A JPEG of opaque RGBA pixels (the alpha is dropped), which the browser's
/// `createImageBitmap` reads as it reads WebP.
pub fn jpeg(pixels: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::new();
    jpeg_encoder::Encoder::new(&mut out, JPEG_QUALITY)
        .encode(pixels, width as u16, height as u16, jpeg_encoder::ColorType::Rgba)
        .expect("RGBA8 of the stated size encodes");
    out
}

/// Lossless WebP, what the browser's `createImageBitmap` reads.
pub fn webp_lossless(pixels: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::new();
    image_webp::WebPEncoder::new(&mut out)
        .encode(pixels, width, height, image_webp::ColorType::Rgba8)
        .expect("RGBA8 of the stated size encodes");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn bgra_pool(width: u32, height: u32, stride: usize, f: impl Fn(u32, u32) -> [u8; 4]) -> Vec<u8> {
        let mut pool = vec![0u8; stride * height as usize];
        for y in 0..height {
            for x in 0..width {
                let o = y as usize * stride + x as usize * 4;
                pool[o..o + 4].copy_from_slice(&f(x, y));
            }
        }
        pool
    }

    #[test]
    fn shm_words_become_rgba() {
        let mut dst = [0u8; 8];
        convert_row(&[1, 2, 3, 4, 5, 6, 7, 8], &mut dst, ShmFormat::Argb8888);
        assert_eq!(dst, [3, 2, 1, 4, 7, 6, 5, 8]);
        convert_row(&[1, 2, 3, 4, 5, 6, 7, 8], &mut dst, ShmFormat::Xrgb8888);
        assert_eq!(dst, [3, 2, 1, 255, 7, 6, 5, 255]);
    }

    /// A root of `w`×`h` from `pool`, copied, with the canvas sized to it.
    fn one_layer(pool: &[u8], w: u32, h: u32, stride: usize) -> (SurfaceImage, Canvas) {
        let mut img = SurfaceImage::default();
        img.copy_from_shm(pool, 0, w, h, stride, ShmFormat::Argb8888, &[])
            .unwrap();
        let mut c = Canvas::default();
        c.resize(w, h);
        (img, c)
    }

    #[test]
    fn a_first_buffer_damages_everything_then_only_what_changed() {
        let pool = bgra_pool(4, 3, 20, |x, y| [x as u8, y as u8, 9, 255]);
        let mut img = SurfaceImage::default();
        let rects = img.copy_from_shm(
            &pool,
            0,
            4,
            3,
            20,
            ShmFormat::Argb8888,
            &[Rect { x: 1, y: 1, w: 1, h: 1 }],
        );
        assert_eq!(rects, Some(vec![Rect { x: 0, y: 0, w: 4, h: 3 }]));
        let mut c = Canvas::default();
        c.resize(4, 3);
        let frame = c.take_frame(
            &[Layer::at(0, 0, &img)],
            Encoding::Deflate,
        );
        assert_eq!(frame.len(), 1);
        assert_eq!(frame[0].rect, Rect { x: 0, y: 0, w: 4, h: 3 });
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(&frame[0].data[..])
            .read_to_end(&mut raw)
            .unwrap();
        assert_eq!(raw.len(), 4 * 3 * 4);
        // pixel (2, 1): B=2, G=1, R=9 in the pool
        let o = (4 + 2) * 4;
        assert_eq!(&raw[o..o + 4], &[9, 1, 2, 255]);
        assert!(!c.has_damage());

        let rects = img.copy_from_shm(
            &pool,
            0,
            4,
            3,
            20,
            ShmFormat::Argb8888,
            &[Rect { x: 1, y: 1, w: 2, h: 1 }],
        );
        assert_eq!(rects, Some(vec![Rect { x: 1, y: 1, w: 2, h: 1 }]));
        c.damage(1, 1, 2, 1);
        let frame = c.take_frame(
            &[Layer::at(0, 0, &img)],
            Encoding::Webp,
        );
        assert_eq!(frame[0].rect, Rect { x: 1, y: 1, w: 2, h: 1 });
        assert_eq!(&frame[0].data[0..4], b"RIFF");
    }

    #[test]
    fn a_short_pool_is_refused() {
        let mut img = SurfaceImage::default();
        assert!(img
            .copy_from_shm(&[0; 10], 0, 4, 3, 16, ShmFormat::Argb8888, &[])
            .is_none());
    }

    #[test]
    fn damage_is_clipped_merged_and_collapsed() {
        assert_eq!(clip_signed(-5, -5, 10, 10, 4, 4), Some(Rect { x: 0, y: 0, w: 4, h: 4 }));
        assert_eq!(clip_signed(10, 10, 10, 10, 4, 4), None);
        assert_eq!(
            clip_signed(0, 0, i32::MAX, i32::MAX, 4, 4),
            Some(Rect { x: 0, y: 0, w: 4, h: 4 })
        );

        let pool = bgra_pool(64, 64, 256, |_, _| [0, 0, 0, 255]);
        let (img, mut c) = one_layer(&pool, 64, 64, 256);
        c.take_frame(
            &[Layer::at(0, 0, &img)],
            Encoding::Deflate,
        );
        // A rectangle inside an earlier one adds nothing.
        c.damage(0, 0, 10, 10);
        c.damage(2, 2, 2, 2);
        assert_eq!(c.damage.len(), 1);
        // Too many separate rectangles collapse to their bounding box.
        for i in 0..20 {
            c.damage(i * 3, i * 3, 1, 1);
        }
        assert_eq!(c.damage.len(), 1);
        assert_eq!(
            c.damage[0],
            Rect {
                x: 0,
                y: 0,
                w: 58,
                h: 58
            }
        );
        // Damage that starts outside the window is cut to it.
        c.take_frame(
            &[Layer::at(0, 0, &img)],
            Encoding::Deflate,
        );
        c.damage(-10, 60, 20, 20);
        assert_eq!(
            c.damage,
            vec![Rect {
                x: 0,
                y: 60,
                w: 10,
                h: 4
            }]
        );
    }

    #[test]
    fn subsurfaces_are_composed_over_the_root_in_order_and_clipped() {
        // A 4×4 opaque blue root, an opaque red 2×2 child at (3, 3) (half
        // outside), and a half-transparent white 1×1 at (0, 0) above it.
        let root_pool = bgra_pool(4, 4, 16, |_, _| [255, 0, 0, 255]);
        let red_pool = bgra_pool(2, 2, 8, |_, _| [0, 0, 255, 255]);
        let veil_pool = bgra_pool(1, 1, 4, |_, _| [128, 128, 128, 128]);
        let (root, mut c) = one_layer(&root_pool, 4, 4, 16);
        let mut red = SurfaceImage::default();
        red.copy_from_shm(&red_pool, 0, 2, 2, 8, ShmFormat::Argb8888, &[])
            .unwrap();
        let mut veil = SurfaceImage::default();
        veil.copy_from_shm(&veil_pool, 0, 1, 1, 4, ShmFormat::Argb8888, &[])
            .unwrap();
        let layers = [
            Layer::at(0, 0, &root),
            Layer::at(3, 3, &red),
            Layer::at(0, 0, &veil),
        ];
        let frame = c.take_frame(&layers, Encoding::Deflate);
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(&frame[0].data[..])
            .read_to_end(&mut raw)
            .unwrap();
        let px = |x: usize, y: usize| &raw[(y * 4 + x) * 4..(y * 4 + x) * 4 + 4];
        assert_eq!(px(1, 1), &[0, 0, 255, 255]);
        assert_eq!(px(3, 3), &[255, 0, 0, 255]);
        // 128 premultiplied white over blue: 128 + 255 * 127 / 255.
        assert_eq!(px(0, 0), &[128, 128, 255, 255]);
    }

    #[test]
    fn a_surface_at_a_lower_scale_than_its_window_is_drawn_larger() {
        // A 2×2 checker (red, blue / blue, red) at scale 1 in a scale-2
        // window: each buffer pixel covers 2×2 window pixels.
        let checker = bgra_pool(2, 2, 8, |x, y| if (x + y) % 2 == 0 { [0, 0, 255, 255] } else { [255, 0, 0, 255] });
        let mut img = SurfaceImage::default();
        img.copy_from_shm(&checker, 0, 2, 2, 8, ShmFormat::Argb8888, &[]).unwrap();
        let mut c = Canvas::default();
        c.resize(4, 4);
        let frame = c.take_frame(&[Layer { x: 0, y: 0, width: 4, height: 4, image: &img }], Encoding::Deflate);
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(&frame[0].data[..]).read_to_end(&mut raw).unwrap();
        let red = |x: usize, y: usize| raw[(y * 4 + x) * 4] == 255;
        for (x, y) in [(0, 0), (1, 0), (0, 1), (1, 1), (2, 2), (3, 3)] {
            assert!(red(x, y), "({x}, {y}) is red");
        }
        for (x, y) in [(2, 0), (3, 1), (0, 2), (1, 3)] {
            assert!(!red(x, y), "({x}, {y}) is blue");
        }
    }

    #[test]
    fn the_output_scale_is_the_ratios_ceiling() {
        for (ratio, scale) in [
            (1.0, 1),
            (0.5, 1),
            (f64::NAN, 1),
            (1.000_000_1, 1),
            (1.1, 2),
            (1.25, 2),
            (1.5, 2),
            (2.0, 2),
            (2.000_001, 2),
            (2.625, 3),
            (3.5, 4),
            (8.0, MAX_SCALE),
        ] {
            assert_eq!(output_scale(ratio), scale, "ratio {ratio}");
        }
    }

    #[test]
    fn a_surfaces_size_is_its_buffer_over_its_scale_or_its_viewport() {
        assert_eq!(surface_size((200, 100), 1, None), (200, 100));
        assert_eq!(surface_size((200, 100), 2, None), (100, 50));
        // A broken scale counts as 1; a buffer smaller than its scale, as 1×1.
        assert_eq!(surface_size((200, 100), 0, None), (200, 100));
        assert_eq!(surface_size((1, 1), 2, None), (1, 1));
        // A viewport's destination wins over the buffer scale.
        assert_eq!(surface_size((200, 100), 1, Some((100, 50))), (100, 50));
        assert_eq!(surface_size((200, 100), 2, Some((0, 50))), (100, 50));
    }

    #[test]
    fn a_windows_scale_is_its_root_buffer_over_its_surface() {
        assert_eq!(window_scale(640, 640), 1);
        assert_eq!(window_scale(1280, 640), 2);
        assert_eq!(window_scale(1921, 640), 3);
        assert_eq!(window_scale(9000, 640), MAX_SCALE);
        assert_eq!(window_scale(640, 0), 1);
    }

    #[test]
    fn rectangles_map_between_scales_grown_to_whole_pixels() {
        let r = Rect { x: 1, y: 1, w: 1, h: 1 };
        assert_eq!(map_rect(r, (10, 10), (10, 10)), r);
        // Surface damage at scale 2 covers twice the buffer pixels.
        assert_eq!(map_rect(r, (10, 10), (20, 20)), Rect { x: 2, y: 2, w: 2, h: 2 });
        // A ratio that isn't whole grows outward: 1..2 of 3 is 1.33..2.67 of 4.
        assert_eq!(map_rect(r, (3, 3), (4, 4)), Rect { x: 1, y: 1, w: 2, h: 2 });
        // Down: two buffer pixels of a scale-2 surface are one window pixel.
        assert_eq!(map_rect(Rect { x: 2, y: 2, w: 2, h: 2 }, (20, 20), (10, 10)), r);
    }

    // ── Lossy regions ───────────────────────────────────────────────────────

    /// A 640×480 window, opaque, its first frame (everything) already sent.
    fn video_window(alpha: u8) -> (SurfaceImage, Canvas) {
        let pool = bgra_pool(640, 480, 640 * 4, |x, y| [(x * 7) as u8, (y * 3) as u8, (x ^ y) as u8, alpha]);
        let (img, mut c) = one_layer(&pool, 640, 480, 640 * 4);
        c.tick();
        let first = c.take_frame(&[Layer::at(0, 0, &img)], Encoding::Webp);
        assert!(first.iter().all(|r| r.encoding == ENC_WEBP_LOSSLESS));
        (img, c)
    }

    /// The video's rectangle: 480×270 at (80, 60).
    const VIDEO: Rect = Rect { x: 80, y: 60, w: 480, h: 270 };

    /// One tick of the clock with `damage` drawn, as the session runs it.
    fn frame(c: &mut Canvas, img: &SurfaceImage, damage: &[Rect]) -> Vec<EncodedRect> {
        c.tick();
        for r in damage {
            c.damage(r.x as i32, r.y as i32, r.w, r.h);
        }
        c.take_frame(&[Layer::at(0, 0, img)], Encoding::Webp)
    }

    fn encodings(frame: &[EncodedRect]) -> Vec<u8> {
        frame.iter().map(|r| r.encoding).collect()
    }

    #[test]
    fn a_window_that_isnt_playing_anything_stays_lossless_byte_for_byte() {
        let (img, mut c) = video_window(255);
        // A typed line, then a caret, again and again: small.
        for _ in 0..12 {
            let f = frame(&mut c, &img, &[Rect { x: 10, y: 400, w: 300, h: 18 }]);
            assert_eq!(encodings(&f), [ENC_WEBP_LOSSLESS]);
            assert_eq!(f[0].data, webp_lossless(&c.extract(f[0].rect), f[0].rect.w, f[0].rect.h));
        }
        // A page loading: a large redraw now and then, not on most frames.
        for i in 0..12 {
            let damage = if i % 4 == 0 { vec![VIDEO] } else { vec![] };
            for r in frame(&mut c, &img, &damage) {
                assert_eq!(r.encoding, ENC_WEBP_LOSSLESS);
            }
        }
        // Still: nothing more is sent.
        for _ in 0..20 {
            assert!(frame(&mut c, &img, &[]).is_empty());
        }
    }

    #[test]
    fn a_large_region_redrawn_on_most_frames_goes_lossy() {
        let (img, mut c) = video_window(255);
        let sent: Vec<Vec<u8>> = (0..8).map(|_| encodings(&frame(&mut c, &img, &[VIDEO]))).collect();
        // Lossless until it has changed in six of the last eight frames.
        assert_eq!(sent[..5], vec![vec![ENC_WEBP_LOSSLESS]; 5]);
        assert_eq!(sent[5..], vec![vec![ENC_JPEG]; 3]);
        let f = frame(&mut c, &img, &[VIDEO]);
        assert_eq!(f[0].rect, VIDEO);
        assert_eq!(&f[0].data[..2], &[0xff, 0xd8], "a JPEG");
        let lossless = webp_lossless(&c.extract(VIDEO), VIDEO.w, VIDEO.h);
        assert!(f[0].data.len() < lossless.len());
    }

    #[test]
    fn text_beside_a_video_stays_lossless() {
        let (img, mut c) = video_window(255);
        for _ in 0..6 {
            frame(&mut c, &img, &[VIDEO]);
        }
        // The video and a line of text below it, merged into one rectangle.
        let merged = Rect { x: 0, y: 40, w: 640, h: 330 };
        let f = frame(&mut c, &img, &[merged]);
        let jpeg: Vec<Rect> = f.iter().filter(|r| r.encoding == ENC_JPEG).map(|r| r.rect).collect();
        assert_eq!(jpeg, [VIDEO]);
        // Everything else in the rectangle went out, lossless.
        let rest: u64 = f.iter().filter(|r| r.encoding == ENC_WEBP_LOSSLESS).map(|r| area(r.rect)).sum();
        assert_eq!(rest + area(VIDEO), area(merged));
        assert!(f.iter().filter(|r| r.encoding != ENC_JPEG).all(|r| intersect(r.rect, VIDEO).is_none()));
    }

    #[test]
    fn a_region_that_stops_changing_is_sent_once_more_lossless() {
        let (img, mut c) = video_window(255);
        for _ in 0..8 {
            frame(&mut c, &img, &[VIDEO]);
        }
        // Paused: nothing is drawn. A quarter of a second later, one frame.
        for _ in 0..LOSSY_SETTLE_TICKS - 1 {
            assert!(frame(&mut c, &img, &[]).is_empty());
        }
        let sharp = frame(&mut c, &img, &[]);
        assert_eq!(encodings(&sharp), [ENC_WEBP_LOSSLESS]);
        assert_eq!(sharp[0].rect, VIDEO);
        assert_eq!(sharp[0].data, webp_lossless(&c.extract(VIDEO), VIDEO.w, VIDEO.h));
        // Then quiet, and a new play starts from lossless again.
        for _ in 0..20 {
            assert!(frame(&mut c, &img, &[]).is_empty());
        }
        assert_eq!(encodings(&frame(&mut c, &img, &[VIDEO])), [ENC_WEBP_LOSSLESS]);
    }

    #[test]
    fn a_region_with_transparency_or_on_deflate_stays_lossless() {
        let (img, mut c) = video_window(200);
        for _ in 0..10 {
            assert_eq!(encodings(&frame(&mut c, &img, &[VIDEO])), [ENC_WEBP_LOSSLESS]);
        }
        let pool = bgra_pool(640, 480, 640 * 4, |_, _| [1, 2, 3, 255]);
        let (img, mut c) = one_layer(&pool, 640, 480, 640 * 4);
        for _ in 0..10 {
            c.tick();
            c.damage(VIDEO.x as i32, VIDEO.y as i32, VIDEO.w, VIDEO.h);
            let f = c.take_frame(&[Layer::at(0, 0, &img)], Encoding::Deflate);
            assert!(f.iter().all(|r| r.encoding == ENC_DEFLATE_RGBA));
        }
    }

    #[test]
    fn subtracting_a_rectangle_leaves_the_rest_whole() {
        let outer = Rect { x: 0, y: 0, w: 100, h: 50 };
        let inner = Rect { x: 20, y: 10, w: 30, h: 20 };
        let parts = subtract(outer, inner);
        assert_eq!(parts.iter().map(|r| area(*r)).sum::<u64>() + area(inner), area(outer));
        for (i, a) in parts.iter().enumerate() {
            assert!(intersect(*a, inner).is_none());
            for b in &parts[i + 1..] {
                assert!(intersect(*a, *b).is_none());
            }
        }
        assert!(subtract(outer, outer).is_empty());
    }
}
