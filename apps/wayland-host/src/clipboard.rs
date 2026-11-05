//! The clipboard bridge's pure parts: which of an app's offered types is
//! text, how much text crosses, and how the bytes become a string.
//!
//! Plain text only, both ways. Copying in a Linux app sends the text to the
//! tab, which writes the real clipboard; a paste key in a Linux window makes
//! the tab read the real clipboard and hand the text to the host, which
//! offers it as the session's selection before the key reaches the app.

/// The text types an app may offer, in the order the host prefers to read
/// them. `text/plain;charset=utf-8` is the modern one; the others are what
/// X11-era toolkits still announce.
const READ_PREFERENCE: [&str; 5] = ["text/plain;charset=utf-8", "UTF8_STRING", "text/plain", "TEXT", "STRING"];

/// What the host offers when it sets the selection from the tab's text.
pub const OFFERED_MIME_TYPES: [&str; 5] = ["text/plain;charset=utf-8", "text/plain", "UTF8_STRING", "TEXT", "STRING"];

/// The most text that crosses either way, in UTF-8 bytes. Larger copies stay
/// where they were made.
pub const MAX_CLIPBOARD_BYTES: usize = 1024 * 1024;

/// The text type to read from an app's offer, or None when it offers no
/// text (an image, files). Mime types compare without case and spaces, so
/// `text/plain; charset=UTF-8` counts.
pub fn text_mime(offered: &[String]) -> Option<String> {
    let normal = |m: &str| m.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_ascii_lowercase();
    READ_PREFERENCE.iter().find_map(|wanted| {
        let wanted = normal(wanted);
        offered.iter().find(|m| normal(m) == wanted).cloned()
    })
}

/// Collects what an app writes into the pipe, up to [`MAX_CLIPBOARD_BYTES`].
#[derive(Default)]
pub struct Collector {
    bytes: Vec<u8>,
    too_large: bool,
}

impl Collector {
    /// Add a chunk. False once the text is over the limit: stop reading.
    pub fn push(&mut self, chunk: &[u8]) -> bool {
        if self.bytes.len() + chunk.len() > MAX_CLIPBOARD_BYTES {
            self.too_large = true;
            self.bytes.clear();
            return false;
        }
        self.bytes.extend_from_slice(chunk);
        true
    }

    /// The text, once the app has closed its end: None when it was over the
    /// limit or empty. Invalid UTF-8 is replaced, not refused.
    pub fn finish(self) -> Option<String> {
        if self.too_large || self.bytes.is_empty() {
            return None;
        }
        Some(String::from_utf8_lossy(&self.bytes).into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offered(types: &[&str]) -> Vec<String> {
        types.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reads_the_best_text_type_offered() {
        // Firefox's offer for copied page text.
        let firefox = offered(&["text/html", "text/_moz_htmlcontext", "text/plain;charset=utf-8", "UTF8_STRING"]);
        assert_eq!(text_mime(&firefox).as_deref(), Some("text/plain;charset=utf-8"));
        assert_eq!(text_mime(&offered(&["STRING", "UTF8_STRING"])).as_deref(), Some("UTF8_STRING"));
        assert_eq!(
            text_mime(&offered(&["text/plain; charset=UTF-8"])).as_deref(),
            Some("text/plain; charset=UTF-8")
        );
    }

    #[test]
    fn ignores_offers_with_no_text() {
        assert_eq!(text_mime(&offered(&["image/png", "text/uri-list", "text/html"])), None);
        assert_eq!(text_mime(&[]), None);
    }

    #[test]
    fn collects_text_up_to_the_limit() {
        let mut c = Collector::default();
        assert!(c.push("ș ț ".as_bytes()));
        assert!(c.push(b"done"));
        assert_eq!(c.finish().as_deref(), Some("ș ț done"));

        let mut c = Collector::default();
        assert!(c.push(&vec![b'a'; MAX_CLIPBOARD_BYTES]));
        assert!(!c.push(b"one byte too many"));
        assert_eq!(c.finish(), None);
    }

    #[test]
    fn empty_or_broken_text() {
        assert_eq!(Collector::default().finish(), None);
        let mut c = Collector::default();
        c.push(&[0x66, 0x6f, 0xff, 0x6f]);
        assert_eq!(c.finish().as_deref(), Some("fo\u{fffd}o"));
    }

    #[test]
    fn the_offer_covers_what_apps_ask_for() {
        for mime in READ_PREFERENCE {
            assert!(OFFERED_MIME_TYPES.contains(&mime));
        }
    }
}
