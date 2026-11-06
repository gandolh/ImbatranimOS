//! The cursor the tab shows over a session's Linux windows. An app names one
//! (cursor-shape-v1, a CSS cursor name), hides it, or draws its own on a
//! cursor surface, as every X11 app (through Xwayland) and GTK 3 apps do:
//! that surface's image goes to the tab as a PNG with its hotspot, and the
//! tab shows it as `cursor: url(...) x y, default`.

use crate::pixels::{deflate, window_scale, SurfaceImage};
use crate::protocol::CursorImage;

/// The largest cursor image sent, in image pixels each way; a bigger one
/// shows the default arrow. Browsers show no bigger CSS cursor.
pub const MAX_CURSOR_SIZE: u32 = 128;

/// What the tab shows: a CSS cursor name, and the image an app drew.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cursor {
    pub name: String,
    pub image: Option<CursorImage>,
}

impl Cursor {
    pub fn named(name: &str) -> Cursor {
        Cursor { name: name.to_string(), image: None }
    }

    /// A cursor surface's: its image (None or empty when it has no buffer,
    /// which hides the cursor) and its hotspot in surface coordinates, as
    /// the app set it. Over [`MAX_CURSOR_SIZE`] it is the default arrow.
    pub fn drawn(image: Option<&SurfaceImage>, hotspot: (i32, i32)) -> Cursor {
        let Some(image) = image.filter(|i| !i.is_empty()) else {
            return Cursor::named("none");
        };
        if image.width > MAX_CURSOR_SIZE || image.height > MAX_CURSOR_SIZE {
            return Cursor::named("default");
        }
        let scale = window_scale(image.width, image.surface_width);
        // The app's hotspot may be anywhere; a browser ignores one outside
        // the image as it shows it, its pixels over its scale.
        let inside = |at: i32, pixels: u32| (at.max(0) as u32).min(pixels.div_ceil(scale).saturating_sub(1));
        let straight = unpremultiply(image.rgba());
        Cursor {
            name: "default".into(),
            image: Some(CursorImage {
                png: base64(&png(&straight, image.width, image.height)),
                width: image.width,
                height: image.height,
                scale,
                hotspot_x: inside(hotspot.0, image.width),
                hotspot_y: inside(hotspot.1, image.height),
            }),
        }
    }
}

/// The cursor the tab has, so an unchanged one isn't sent again: apps set
/// theirs again on every enter, and Xwayland on every frame of an animated
/// one.
pub struct Shown(Cursor);

impl Default for Shown {
    fn default() -> Shown {
        Shown(Cursor::named("default"))
    }
}

impl Shown {
    /// `next`, when it differs from what the tab has.
    pub fn change(&mut self, next: Cursor) -> Option<&Cursor> {
        if next == self.0 {
            return None;
        }
        self.0 = next;
        Some(&self.0)
    }

    /// What the tab has, for a resync.
    pub fn current(&self) -> &Cursor {
        &self.0
    }
}

/// Premultiplied RGBA (as `wl_shm` buffers hold it) to straight, as PNG
/// wants it.
fn unpremultiply(rgba: &[u8]) -> Vec<u8> {
    let mut out = rgba.to_vec();
    for px in out.chunks_exact_mut(4) {
        let a = px[3] as u32;
        if a == 0 {
            px.copy_from_slice(&[0, 0, 0, 0]);
        } else if a < 255 {
            for c in &mut px[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    out
}

/// A PNG of straight RGBA pixels: 8 bits per channel, no filters.
pub fn png(rgba: &[u8], width: u32, height: u32) -> Vec<u8> {
    let row = width as usize * 4;
    let mut raw = Vec::with_capacity((row + 1) * height as usize);
    for line in rgba.chunks_exact(row.max(1)).take(height as usize) {
        raw.push(0);
        raw.extend_from_slice(line);
    }
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    // 8 bits, RGBA, deflate, adaptive filtering, no interlace.
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    chunk(&mut out, b"IHDR", &header);
    chunk(&mut out, b"IDAT", &deflate(&raw));
    chunk(&mut out, b"IEND", &[]);
    out
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    let mut crc = flate2::Crc::new();
    crc.update(kind);
    crc.update(data);
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc.sum().to_be_bytes());
}

/// Standard base64, padded: what a `data:` URL takes.
pub fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for group in bytes.chunks(3) {
        let b = |i: usize| group.get(i).copied().unwrap_or(0) as u32;
        let n = (b(0) << 16) | (b(1) << 8) | b(2);
        let digit = |shift: u32| ALPHABET[((n >> shift) & 63) as usize] as char;
        out.push(digit(18));
        out.push(digit(12));
        out.push(if group.len() > 1 { digit(6) } else { '=' });
        out.push(if group.len() > 2 { digit(0) } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixels::ShmFormat;
    use std::io::Read;

    /// A surface image from BGRA words (as `wl_shm` lays out ARGB8888), at
    /// `scale` buffer pixels per surface pixel.
    fn image(width: u32, height: u32, scale: u32, px: impl Fn(u32, u32) -> [u8; 4]) -> SurfaceImage {
        let mut pool = Vec::new();
        for y in 0..height {
            for x in 0..width {
                pool.extend_from_slice(&px(x, y));
            }
        }
        let mut img = SurfaceImage::default();
        img.copy_from_shm(&pool, 0, width, height, width as usize * 4, ShmFormat::Argb8888, &[]).unwrap();
        img.surface_width = width / scale;
        img.surface_height = height / scale;
        img
    }

    fn unbase64(s: &str) -> Vec<u8> {
        let value = |c: u8| match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            _ => 63,
        };
        let mut out = Vec::new();
        for quad in s.as_bytes().chunks(4) {
            let n = quad.iter().filter(|&&c| c != b'=').fold(0u32, |n, &c| (n << 6) | value(c) as u32);
            let len = quad.iter().filter(|&&c| c != b'=').count();
            let n = n << (6 * (4 - len));
            out.extend_from_slice(&n.to_be_bytes()[1..len]);
        }
        out
    }

    /// A PNG's chunks, each checked against its CRC.
    fn chunks(png: &[u8]) -> Vec<([u8; 4], Vec<u8>)> {
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        let mut out = Vec::new();
        let mut at = 8;
        while at < png.len() {
            let len = u32::from_be_bytes(png[at..at + 4].try_into().unwrap()) as usize;
            let kind: [u8; 4] = png[at + 4..at + 8].try_into().unwrap();
            let data = png[at + 8..at + 8 + len].to_vec();
            let mut crc = flate2::Crc::new();
            crc.update(&kind);
            crc.update(&data);
            let stored = u32::from_be_bytes(png[at + 8 + len..at + 12 + len].try_into().unwrap());
            assert_eq!(crc.sum(), stored, "{:?}'s CRC", std::str::from_utf8(&kind));
            out.push((kind, data));
            at += 12 + len;
        }
        out
    }

    #[test]
    fn base64_matches_the_standard_vectors() {
        let cases =
            [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("foobar", "Zm9vYmFy")];
        for (plain, encoded) in cases {
            assert_eq!(base64(plain.as_bytes()), encoded);
        }
        assert_eq!(base64(&[0xfb, 0xff, 0xbf]), "+/+/");
    }

    #[test]
    fn a_cursor_surface_goes_as_a_png_with_its_hotspot() {
        // Opaque red, then half-transparent green premultiplied (0x80 of 0xff
        // at alpha 0x80), then nothing.
        let img = image(3, 2, 1, |x, _| match x {
            0 => [0, 0, 0xff, 0xff],
            1 => [0, 0x80, 0, 0x80],
            _ => [0, 0, 0, 0],
        });
        let cursor = Cursor::drawn(Some(&img), (1, 1));
        assert_eq!(cursor.name, "default");
        let shown = cursor.image.expect("an image");
        assert_eq!((shown.width, shown.height, shown.scale), (3, 2, 1));
        assert_eq!((shown.hotspot_x, shown.hotspot_y), (1, 1));

        let png = unbase64(&shown.png);
        let parts = chunks(&png);
        let kinds: Vec<&[u8; 4]> = parts.iter().map(|(k, _)| k).collect();
        assert_eq!(kinds, [b"IHDR", b"IDAT", b"IEND"]);
        assert_eq!(parts[0].1, [0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(&parts[1].1[..]).read_to_end(&mut raw).unwrap();
        // Each row: filter 0, then straight RGBA.
        let row = [0, 0xff, 0, 0, 0xff, 0, 0xff, 0, 0x80, 0, 0, 0, 0];
        assert_eq!(raw, [row, row].concat());
    }

    #[test]
    fn a_hidpi_cursor_keeps_its_scale_and_a_hotspot_in_css_pixels() {
        let img = image(48, 48, 2, |_, _| [0xff, 0xff, 0xff, 0xff]);
        let shown = Cursor::drawn(Some(&img), (4, 20)).image.unwrap();
        assert_eq!((shown.width, shown.height, shown.scale), (48, 48, 2));
        assert_eq!((shown.hotspot_x, shown.hotspot_y), (4, 20));
    }

    #[test]
    fn a_hotspot_outside_the_image_is_kept_inside_it() {
        let img = image(24, 24, 1, |_, _| [0, 0, 0, 0xff]);
        let shown = Cursor::drawn(Some(&img), (-7, i32::MAX)).image.unwrap();
        assert_eq!((shown.hotspot_x, shown.hotspot_y), (0, 23));
    }

    #[test]
    fn a_cursor_over_128_pixels_is_the_default_arrow() {
        let at_limit = image(128, 128, 1, |_, _| [0, 0, 0, 0xff]);
        assert!(Cursor::drawn(Some(&at_limit), (0, 0)).image.is_some());
        let wide = image(129, 16, 1, |_, _| [0, 0, 0, 0xff]);
        assert_eq!(Cursor::drawn(Some(&wide), (0, 0)), Cursor::named("default"));
        let tall = image(16, 129, 1, |_, _| [0, 0, 0, 0xff]);
        assert_eq!(Cursor::drawn(Some(&tall), (0, 0)), Cursor::named("default"));
    }

    #[test]
    fn a_cursor_surface_without_a_buffer_hides_the_cursor() {
        assert_eq!(Cursor::drawn(None, (0, 0)), Cursor::named("none"));
        assert_eq!(Cursor::drawn(Some(&SurfaceImage::default()), (0, 0)), Cursor::named("none"));
    }

    #[test]
    fn an_unchanged_cursor_isnt_sent_again() {
        let mut shown = Shown::default();
        assert_eq!(shown.change(Cursor::named("default")), None);
        assert_eq!(shown.change(Cursor::named("text")), Some(&Cursor::named("text")));
        assert_eq!(shown.change(Cursor::named("text")), None);

        let img = image(16, 16, 1, |x, y| [x as u8, y as u8, 0, 0xff]);
        let drawn = Cursor::drawn(Some(&img), (2, 3));
        assert!(shown.change(drawn.clone()).is_some());
        // The same pixels and hotspot again (an app re-setting its cursor).
        assert_eq!(shown.change(Cursor::drawn(Some(&img), (2, 3))), None);
        // The hotspot moved: sent.
        assert!(shown.change(Cursor::drawn(Some(&img), (3, 3))).is_some());
        // The pointer left: the default arrow, then the image again on enter.
        assert!(shown.change(Cursor::named("default")).is_some());
        assert!(shown.change(drawn.clone()).is_some());
        assert_eq!(shown.current(), &drawn);
    }
}
