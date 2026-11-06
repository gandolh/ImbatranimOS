//! The clipboard bridge's pure parts: which of an app's offered types is
//! text, how much text crosses, how the bytes become a string, and where a
//! paste's text comes from.
//!
//! Plain text only, both ways. Copying in a Linux app sends the text to the
//! tab, which writes the real clipboard; a paste key in a Linux window makes
//! the tab read the real clipboard and hand the text to the host, which
//! offers it as the session's selection before the key reaches the app.
//!
//! X11 apps share it: an X11 app's `CLIPBOARD` becomes the session's
//! selection (read through the window manager), and the session's becomes
//! theirs. `PRIMARY` stays between X11 apps.

use std::sync::Arc;

/// The text types an app may offer, in the order the host prefers to read
/// them. `text/plain;charset=utf-8` is the modern one; the others are what
/// X11-era toolkits still announce.
const READ_PREFERENCE: [&str; 5] = ["text/plain;charset=utf-8", "UTF8_STRING", "text/plain", "TEXT", "STRING"];

/// What the host offers when it sets the selection from the tab's text.
pub const OFFERED_MIME_TYPES: [&str; 5] = ["text/plain;charset=utf-8", "text/plain", "UTF8_STRING", "TEXT", "STRING"];

/// What X11 apps are offered when the clipboard isn't an X11 app's. smithay's
/// window manager answers `TARGETS` with `UTF8_STRING` and `TEXT` for the
/// first two and `STRING` by its own name, and maps an X11 app's request back
/// to these names.
pub const X11_OFFERED_MIME_TYPES: [&str; 3] = ["text/plain;charset=utf-8", "text/plain", "STRING"];

/// The session's clipboard when the host set it, not a Wayland app (smithay
/// hands a Wayland app's selection to the others itself).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostSelection {
    /// The text the tab handed over for a paste.
    Tab(Arc<str>),
    /// An X11 app's `CLIPBOARD`, read from it in `mime` (the text type it
    /// offered) whenever an app pastes.
    X11 { mime: String },
}

/// Where a paste's text comes from.
#[derive(Debug, PartialEq, Eq)]
pub enum PasteFrom {
    /// Text the host holds, written into the app's pipe.
    Text(Arc<str>),
    /// The Wayland app that set the selection, asked in this type.
    WaylandApp(String),
    /// The X11 app that has `CLIPBOARD`, asked in this type.
    X11App(String),
    /// Nothing: the pipe closes empty.
    Nothing,
}

/// Where the text comes from when an app pastes the session's clipboard.
/// `held` is the host's selection, None when a Wayland app's is current;
/// `wayland_mime` the text type that Wayland app offered, if any; `x11` says
/// the app pasting is an X11 app.
pub fn paste_from(held: Option<&HostSelection>, wayland_mime: Option<&str>, x11: bool) -> PasteFrom {
    match held {
        Some(HostSelection::Tab(text)) => PasteFrom::Text(Arc::clone(text)),
        // An X11 app reads another's CLIPBOARD from X, never through the
        // host; the host's own copy of it is gone.
        Some(HostSelection::X11 { .. }) if x11 => PasteFrom::Nothing,
        Some(HostSelection::X11 { mime }) => PasteFrom::X11App(mime.clone()),
        None if x11 => wayland_mime.map_or(PasteFrom::Nothing, |m| PasteFrom::WaylandApp(m.to_string())),
        // A Wayland app reads a Wayland app's selection without the host.
        None => PasteFrom::Nothing,
    }
}

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

    #[test]
    fn x11_apps_are_offered_the_text_targets() {
        // smithay names UTF8_STRING and TEXT by these mime types, both ways.
        for mime in ["text/plain;charset=utf-8", "text/plain", "STRING"] {
            assert!(X11_OFFERED_MIME_TYPES.contains(&mime));
        }
        // Everything offered to X11 apps is text the host can write.
        for mime in X11_OFFERED_MIME_TYPES {
            assert!(OFFERED_MIME_TYPES.contains(&mime));
        }
    }

    #[test]
    fn an_x11_copy_is_read_in_its_best_text_type() {
        // xterm's TARGETS as smithay reports them: UTF8_STRING and TEXT by
        // their mime names, COMPOUND_TEXT and STRING dropped.
        assert_eq!(
            text_mime(&offered(&["text/plain;charset=utf-8", "text/plain"])).as_deref(),
            Some("text/plain;charset=utf-8")
        );
        // An image copied in an X11 app doesn't cross.
        assert_eq!(text_mime(&offered(&["image/png"])), None);
    }

    #[test]
    fn a_paste_reads_whoever_holds_the_clipboard() {
        let tab = HostSelection::Tab(Arc::from("ș"));
        let x11 = HostSelection::X11 { mime: "text/plain;charset=utf-8".into() };
        let text = PasteFrom::Text(Arc::from("ș"));
        // The tab's text, to any app.
        assert_eq!(paste_from(Some(&tab), None, false), text);
        assert_eq!(paste_from(Some(&tab), Some("UTF8_STRING"), true), text);
        // An X11 app's copy, read from it for a Wayland app.
        assert_eq!(paste_from(Some(&x11), None, false), PasteFrom::X11App("text/plain;charset=utf-8".into()));
        assert_eq!(paste_from(Some(&x11), None, true), PasteFrom::Nothing);
        // A Wayland app's copy, read from it for an X11 app, in the text
        // type it offered.
        assert_eq!(paste_from(None, Some("UTF8_STRING"), true), PasteFrom::WaylandApp("UTF8_STRING".into()));
        assert_eq!(paste_from(None, None, true), PasteFrom::Nothing);
        assert_eq!(paste_from(None, Some("UTF8_STRING"), false), PasteFrom::Nothing);
    }
}
