//! A window's pixels: the RGBA copy the host keeps of each toplevel, the
//! damage waiting to be sent, and the two lossless encodings.

use std::io::Write;

use crate::protocol::{EncodedRect, Rect, ENC_DEFLATE_RGBA, ENC_WEBP_LOSSLESS};

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

/// The last image a toplevel committed, as RGBA, and what changed since the
/// last frame went out.
#[derive(Default)]
pub struct Canvas {
    pub width: u32,
    pub height: u32,
    rgba: Vec<u8>,
    damage: Vec<Rect>,
}

impl Canvas {
    pub fn has_damage(&self) -> bool {
        !self.damage.is_empty()
    }

    /// Copy `damage` (buffer pixels; empty means all of it) out of a client's
    /// shm buffer. A buffer of a new size replaces the canvas and damages it
    /// all.
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
    ) -> bool {
        if width == 0 || height == 0 || stride < width as usize * 4 {
            return false;
        }
        let needed = offset + stride * (height as usize - 1) + width as usize * 4;
        if pool.len() < needed {
            return false;
        }
        let resized = width != self.width || height != self.height;
        if resized {
            self.width = width;
            self.height = height;
            self.rgba = vec![0; width as usize * height as usize * 4];
        }
        let full = Rect { x: 0, y: 0, w: width, h: height };
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
        if resized {
            self.damage = vec![full];
        } else {
            for r in rects {
                self.add_damage(r);
            }
        }
        true
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

    /// Take the damage and encode each rectangle of it.
    pub fn take_frame(&mut self, encoding: Encoding) -> Vec<EncodedRect> {
        let rects = std::mem::take(&mut self.damage);
        rects
            .into_iter()
            .map(|rect| {
                let pixels = self.extract(rect);
                match encoding {
                    Encoding::Deflate => EncodedRect { rect, encoding: ENC_DEFLATE_RGBA, data: deflate(&pixels) },
                    Encoding::Webp => EncodedRect {
                        rect,
                        encoding: ENC_WEBP_LOSSLESS,
                        data: webp_lossless(&pixels, rect.w, rect.h),
                    },
                }
            })
            .collect()
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

fn contains(outer: Rect, inner: Rect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.w <= outer.x + outer.w
        && inner.y + inner.h <= outer.y + outer.h
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

    #[test]
    fn a_first_buffer_damages_everything_then_only_what_changed() {
        let pool = bgra_pool(4, 3, 20, |x, y| [x as u8, y as u8, 9, 255]);
        let mut c = Canvas::default();
        assert!(c.copy_from_shm(&pool, 0, 4, 3, 20, ShmFormat::Argb8888, &[Rect { x: 1, y: 1, w: 1, h: 1 }]));
        let frame = c.take_frame(Encoding::Deflate);
        assert_eq!(frame.len(), 1);
        assert_eq!(frame[0].rect, Rect { x: 0, y: 0, w: 4, h: 3 });
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(&frame[0].data[..]).read_to_end(&mut raw).unwrap();
        assert_eq!(raw.len(), 4 * 3 * 4);
        // pixel (2, 1): B=2, G=1, R=9 in the pool
        let o = (4 + 2) * 4;
        assert_eq!(&raw[o..o + 4], &[9, 1, 2, 255]);
        assert!(!c.has_damage());

        assert!(c.copy_from_shm(&pool, 0, 4, 3, 20, ShmFormat::Argb8888, &[Rect { x: 1, y: 1, w: 2, h: 1 }]));
        let frame = c.take_frame(Encoding::Webp);
        assert_eq!(frame[0].rect, Rect { x: 1, y: 1, w: 2, h: 1 });
        assert_eq!(&frame[0].data[0..4], b"RIFF");
    }

    #[test]
    fn a_short_pool_is_refused() {
        let mut c = Canvas::default();
        assert!(!c.copy_from_shm(&[0; 10], 0, 4, 3, 16, ShmFormat::Argb8888, &[]));
    }

    #[test]
    fn damage_is_clipped_merged_and_collapsed() {
        assert_eq!(clip_signed(-5, -5, 10, 10, 4, 4), Some(Rect { x: 0, y: 0, w: 4, h: 4 }));
        assert_eq!(clip_signed(10, 10, 10, 10, 4, 4), None);
        assert_eq!(clip_signed(0, 0, i32::MAX, i32::MAX, 4, 4), Some(Rect { x: 0, y: 0, w: 4, h: 4 }));

        let pool = bgra_pool(64, 64, 256, |_, _| [0, 0, 0, 255]);
        let mut c = Canvas::default();
        c.copy_from_shm(&pool, 0, 64, 64, 256, ShmFormat::Xrgb8888, &[]);
        c.take_frame(Encoding::Deflate);
        // A rectangle inside an earlier one adds nothing.
        c.copy_from_shm(&pool, 0, 64, 64, 256, ShmFormat::Xrgb8888, &[Rect { x: 0, y: 0, w: 10, h: 10 }]);
        c.copy_from_shm(&pool, 0, 64, 64, 256, ShmFormat::Xrgb8888, &[Rect { x: 2, y: 2, w: 2, h: 2 }]);
        assert_eq!(c.damage.len(), 1);
        // Too many separate rectangles collapse to their bounding box.
        let many: Vec<Rect> = (0..20).map(|i| Rect { x: i * 3, y: i * 3, w: 1, h: 1 }).collect();
        c.copy_from_shm(&pool, 0, 64, 64, 256, ShmFormat::Xrgb8888, &many);
        assert_eq!(c.damage.len(), 1);
        assert_eq!(c.damage[0], Rect { x: 0, y: 0, w: 58, h: 58 });
    }
}
