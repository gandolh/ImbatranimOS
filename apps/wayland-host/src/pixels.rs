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

/// One surface's last committed buffer, as premultiplied RGBA. Every surface
/// of a window (its root, its subsurfaces) keeps one; the window's [`Canvas`]
/// is composed from them.
#[derive(Default)]
pub struct SurfaceImage {
    pub width: u32,
    pub height: u32,
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

/// One surface of a window, where it sits in the window's image.
pub struct Layer<'a> {
    pub x: i32,
    pub y: i32,
    pub image: &'a SurfaceImage,
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
    /// the damage and encode each rectangle of it.
    pub fn take_frame(&mut self, layers: &[Layer], encoding: Encoding) -> Vec<EncodedRect> {
        let rects = std::mem::take(&mut self.damage);
        for r in &rects {
            self.compose(*r, layers);
        }
        rects
            .into_iter()
            .map(|rect| {
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
            })
            .collect()
    }

    /// Clear `r` and paint each layer over it. Pixels are premultiplied, as
    /// clients hand them over, so "over" is `src + dst * (1 - src alpha)`.
    fn compose(&mut self, r: Rect, layers: &[Layer]) {
        let w = self.width as usize;
        for row in r.y..r.y + r.h {
            let start = (row as usize * w + r.x as usize) * 4;
            self.rgba[start..start + r.w as usize * 4].fill(0);
        }
        for (i, layer) in layers.iter().enumerate() {
            let img = layer.image;
            if img.is_empty() {
                continue;
            }
            // The layer's rectangle in window pixels, cut to `r`.
            let x0 = (layer.x.max(r.x as i32)) as i64;
            let y0 = (layer.y.max(r.y as i32)) as i64;
            let x1 = (layer.x as i64 + img.width as i64).min((r.x + r.w) as i64);
            let y1 = (layer.y as i64 + img.height as i64).min((r.y + r.h) as i64);
            if x1 <= x0 || y1 <= y0 {
                continue;
            }
            let span = (x1 - x0) as usize * 4;
            for y in y0..y1 {
                let sy = (y - layer.y as i64) as usize;
                let sx = (x0 - layer.x as i64) as usize;
                let src_start = (sy * img.width as usize + sx) * 4;
                let src = &img.rgba[src_start..src_start + span];
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
            &[Layer {
                x: 0,
                y: 0,
                image: &img,
            }],
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
            &[Layer {
                x: 0,
                y: 0,
                image: &img,
            }],
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
            &[Layer {
                x: 0,
                y: 0,
                image: &img,
            }],
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
            &[Layer {
                x: 0,
                y: 0,
                image: &img,
            }],
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
            Layer {
                x: 0,
                y: 0,
                image: &root,
            },
            Layer {
                x: 3,
                y: 3,
                image: &red,
            },
            Layer {
                x: 0,
                y: 0,
                image: &veil,
            },
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
}
