//! One app's playback stream: its buffer, where it stands in PulseAudio's
//! playback model (corked, prebuffering, playing, draining), and its samples
//! turned into the session's mix: 48 kHz stereo floats.

use std::collections::VecDeque;

use pulseaudio::protocol::stream::BufferAttr;
use pulseaudio::protocol::{ChannelMap, ChannelPosition, PulseError, SampleFormat, SampleSpec};

/// The mix's rate, and so the rate every stream is resampled to.
pub const RATE: u32 = 48_000;

/// The most a stream may hold, whatever it asks for: two seconds of 8
/// channels of 32-bit samples at 48 kHz is 3 MiB.
const MAX_LENGTH: u32 = 4 * 1024 * 1024;
/// The target an app gets when it names none: PulseAudio's own default.
const DEFAULT_TARGET: std::time::Duration = std::time::Duration::from_secs(2);
/// No app gets less than this buffered: the mix takes 10 ms at a time.
const MIN_TARGET: std::time::Duration = std::time::Duration::from_millis(20);

/// What a stream has to tell its app after a round of mixing.
#[derive(Debug, PartialEq)]
pub enum Event {
    /// Playback began, after prebuffering or an uncork.
    Started,
    /// The buffer ran dry while playing, at this read index.
    Underflow(i64),
    /// The drain asked for with this sequence number is done.
    Drained(u32),
}

pub struct Stream {
    /// The stream's index across the session (PulseAudio's sink input index).
    pub index: u32,
    pub spec: SampleSpec,
    pub attr: BufferAttr,
    buffer: VecDeque<u8>,
    /// Bytes the app has written, and bytes the mix has taken.
    pub write_index: u64,
    pub read_index: u64,
    /// Bytes asked of the app that haven't arrived.
    requested: u64,
    corked: bool,
    prebuffering: bool,
    draining: Option<u32>,
    /// Ran dry and stays so until data comes.
    underflowed: bool,
    /// Bytes played since playback last started.
    pub playing_for: u64,
    volume: f32,
    muted: bool,
    /// How much of each channel goes to the left and the right.
    gains: Vec<(f32, f32)>,
    resampler: Resampler,
    pub events: Vec<Event>,
}

impl Stream {
    /// A stream as the app asked for it, its buffer attributes filled in.
    /// Formats the mix can't read are refused.
    pub fn new(
        index: u32,
        spec: SampleSpec,
        map: &ChannelMap,
        attr: BufferAttr,
        corked: bool,
    ) -> Result<Stream, PulseError> {
        if !readable(spec.format) || spec.channels == 0 || spec.channels > 32 {
            return Err(PulseError::NotSupported);
        }
        if spec.sample_rate == 0 || spec.sample_rate > 384_000 {
            return Err(PulseError::Invalid);
        }
        let mut stream = Stream {
            index,
            spec,
            attr: BufferAttr::default(),
            buffer: VecDeque::new(),
            write_index: 0,
            read_index: 0,
            requested: 0,
            corked,
            prebuffering: true,
            draining: None,
            underflowed: false,
            playing_for: 0,
            volume: 1.0,
            muted: false,
            gains: channel_gains(map, spec.channels),
            resampler: Resampler::new(spec.sample_rate),
            events: Vec::new(),
        };
        stream.set_attr(attr);
        // The app writes the whole target at once.
        stream.requested = u64::from(stream.attr.target_length);
        Ok(stream)
    }

    fn frame_size(&self) -> usize {
        self.spec.format.bytes_per_sample() * usize::from(self.spec.channels)
    }

    fn bytes_for(&self, duration: std::time::Duration) -> u32 {
        let frames = duration.as_secs_f64() * f64::from(self.spec.sample_rate);
        (frames as u32).saturating_mul(self.frame_size() as u32)
    }

    /// Apply the app's buffer attributes, PulseAudio's way: `u32::MAX` means
    /// the server picks, lengths are whole frames, and the target, prebuffer
    /// and request size fit inside the maximum.
    pub fn set_attr(&mut self, asked: BufferAttr) {
        let frame = self.frame_size() as u32;
        let whole = |n: u32| (n / frame).max(1) * frame;
        let max_length = if asked.max_length == u32::MAX { MAX_LENGTH } else { asked.max_length.min(MAX_LENGTH) };
        let max_length = whole(max_length);
        let target = if asked.target_length == u32::MAX { self.bytes_for(DEFAULT_TARGET) } else { asked.target_length };
        let target = whole(target.max(self.bytes_for(MIN_TARGET)).min(max_length));
        let minreq = if asked.minimum_request_length == u32::MAX { target / 4 } else { asked.minimum_request_length };
        let minreq = whole(minreq.min(target));
        let prebuf = if asked.pre_buffering == u32::MAX { target } else { asked.pre_buffering.min(target) };
        let prebuf = if prebuf == 0 { 0 } else { whole(prebuf) };
        self.attr = BufferAttr {
            max_length,
            target_length: target,
            pre_buffering: prebuf,
            minimum_request_length: minreq,
            fragment_size: asked.fragment_size,
        };
    }

    pub fn set_rate(&mut self, rate: u32) -> Result<(), PulseError> {
        if rate == 0 || rate > 384_000 {
            return Err(PulseError::Invalid);
        }
        self.spec.sample_rate = rate;
        self.resampler.set_rate(rate);
        Ok(())
    }

    /// The stream's volume, from PulseAudio's per-channel volumes: their
    /// average, on PulseAudio's cubic scale.
    pub fn set_volume(&mut self, volumes: &[pulseaudio::protocol::Volume]) {
        if volumes.is_empty() {
            return;
        }
        self.volume = volumes.iter().map(|v| v.to_linear()).sum::<f32>() / volumes.len() as f32;
    }

    pub fn set_muted(&mut self, muted: bool) {
        self.muted = muted;
    }

    /// Data from the app. Returns how many bytes didn't fit (an overflow).
    pub fn write(&mut self, data: &[u8]) -> usize {
        let room = (self.attr.max_length as usize).saturating_sub(self.buffer.len());
        let taken = data.len().min(room);
        self.buffer.extend(&data[..taken]);
        self.write_index += taken as u64;
        self.requested = self.requested.saturating_sub(data.len() as u64);
        if taken > 0 {
            self.underflowed = false;
        }
        self.check_prebuffer();
        data.len() - taken
    }

    fn check_prebuffer(&mut self) {
        if self.prebuffering && self.buffer.len() >= self.attr.pre_buffering.max(1) as usize {
            self.start();
        }
    }

    fn start(&mut self) {
        self.prebuffering = false;
        self.playing_for = 0;
        if !self.corked {
            self.events.push(Event::Started);
        }
    }

    pub fn cork(&mut self, corked: bool) {
        if self.corked == corked {
            return;
        }
        self.corked = corked;
        if !corked && !self.prebuffering {
            self.playing_for = 0;
            self.events.push(Event::Started);
        }
    }

    /// Drop what's buffered: the app seeks or stops.
    pub fn flush(&mut self) {
        self.read_index = self.write_index;
        self.buffer.clear();
        self.resampler.reset();
        self.underflowed = false;
        self.prebuffering = self.attr.pre_buffering > 0;
        self.requested = 0;
    }

    /// Play now, whatever has been buffered.
    pub fn trigger(&mut self) {
        if self.prebuffering {
            self.start();
        }
    }

    /// Wait for the prebuffer again before playing.
    pub fn prebuf(&mut self) {
        if self.attr.pre_buffering > 0 {
            self.prebuffering = true;
        }
    }

    /// Play what's left, then acknowledge `seq`.
    pub fn drain(&mut self, seq: u32) {
        if let Some(old) = self.draining.replace(seq) {
            self.events.push(Event::Drained(old));
        }
        self.trigger();
        self.finish_drain();
    }

    fn finish_drain(&mut self) {
        if self.buffer.is_empty() {
            if let Some(seq) = self.draining.take() {
                self.events.push(Event::Drained(seq));
            }
        }
    }

    /// Whether the stream is playing: uncorked, past its prebuffer.
    pub fn playing(&self) -> bool {
        !self.corked && !self.prebuffering
    }

    /// Whether the mix has anything to take from it: playing, and not dry.
    pub fn active(&self) -> bool {
        self.playing() && !(self.underflowed && self.buffer.is_empty())
    }

    /// Bytes to ask the app for: what the target lacks, once it is at least
    /// the minimum request. Counted as requested.
    pub fn take_request(&mut self) -> Option<u32> {
        let have = self.buffer.len() as u64 + self.requested;
        let missing = u64::from(self.attr.target_length).saturating_sub(have);
        if missing == 0 || missing < u64::from(self.attr.minimum_request_length) {
            return None;
        }
        self.requested += missing;
        Some(missing as u32)
    }

    /// Add `out.len() / 2` frames of the stream to `out` (interleaved stereo
    /// at [`RATE`]), taking them from the buffer.
    pub fn mix_into(&mut self, out: &mut [f32]) {
        if !self.active() {
            return;
        }
        let gain = if self.muted { 0.0 } else { self.volume };
        let frame = self.frame_size();
        let format = self.spec.format;
        let bytes = self.buffer.make_contiguous();
        let mut taken = 0usize;
        let gains = &self.gains;
        let mut pull = || {
            if taken + frame > bytes.len() {
                return None;
            }
            let (mut l, mut r) = (0.0f32, 0.0f32);
            for (c, (gl, gr)) in gains.iter().enumerate() {
                let s = sample(format, &bytes[taken + c * format.bytes_per_sample()..]);
                l += s * gl;
                r += s * gr;
            }
            taken += frame;
            Some([l, r])
        };
        let mut produced = 0;
        for slot in out.chunks_exact_mut(2) {
            let Some([l, r]) = self.resampler.next(&mut pull) else {
                break;
            };
            slot[0] += l * gain;
            slot[1] += r * gain;
            produced += 1;
        }
        self.buffer.drain(..taken);
        self.read_index += taken as u64;
        self.playing_for += taken as u64;
        if produced < out.len() / 2 && !self.underflowed {
            self.underflowed = true;
            self.events.push(Event::Underflow(self.read_index as i64));
            // As PulseAudio: a stream that ran dry fills its prebuffer again
            // before it plays, unless it is draining.
            if self.attr.pre_buffering > 0 && self.draining.is_none() {
                self.prebuffering = true;
            }
        }
        self.finish_drain();
    }
}

/// The formats the mix reads. The rest (a-law, mu-law, big-endian floats
/// and 24-bit) are refused; apps fall back to one of these.
fn readable(format: SampleFormat) -> bool {
    matches!(
        format,
        SampleFormat::U8
            | SampleFormat::S16Le
            | SampleFormat::S16Be
            | SampleFormat::Float32Le
            | SampleFormat::S32Le
            | SampleFormat::S24In32Le
    )
}

/// One sample at the start of `b`, as a float from -1 to 1.
fn sample(format: SampleFormat, b: &[u8]) -> f32 {
    match format {
        SampleFormat::U8 => (f32::from(b[0]) - 128.0) / 128.0,
        SampleFormat::S16Le => f32::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0,
        SampleFormat::S16Be => f32::from(i16::from_be_bytes([b[0], b[1]])) / 32768.0,
        SampleFormat::Float32Le => f32::from_le_bytes([b[0], b[1], b[2], b[3]]),
        SampleFormat::S32Le => i32::from_le_bytes([b[0], b[1], b[2], b[3]]) as f32 / 2_147_483_648.0,
        SampleFormat::S24In32Le => {
            // The low 24 bits, sign-extended.
            let v = i32::from_le_bytes([b[0], b[1], b[2], b[3]]) << 8 >> 8;
            v as f32 / 8_388_608.0
        }
        _ => 0.0,
    }
}

/// How each channel reaches stereo: left and right as they are, the centre
/// and mono in both, surround folded into its side, LFE left out.
fn channel_gains(map: &ChannelMap, channels: u8) -> Vec<(f32, f32)> {
    use ChannelPosition as P;
    let positions: Vec<ChannelPosition> = map.into_iter().collect();
    let positions = if positions.len() == usize::from(channels) {
        positions
    } else {
        match channels {
            1 => vec![P::Mono],
            2 => vec![P::FrontLeft, P::FrontRight],
            n => (0..n).map(|i| if i % 2 == 0 { P::FrontLeft } else { P::FrontRight }).collect(),
        }
    };
    const HALF: f32 = std::f32::consts::FRAC_1_SQRT_2;
    positions
        .into_iter()
        .map(|p| match p {
            P::Mono => (1.0, 1.0),
            P::FrontLeft | P::FrontLeftOfCenter | P::TopFrontLeft => (1.0, 0.0),
            P::FrontRight | P::FrontRightOfCenter | P::TopFrontRight => (0.0, 1.0),
            P::RearLeft | P::SideLeft | P::TopRearLeft => (HALF, 0.0),
            P::RearRight | P::SideRight | P::TopRearRight => (0.0, HALF),
            P::Lfe => (0.0, 0.0),
            _ => (HALF, HALF),
        })
        .collect()
}

/// A linear resampler from a stream's rate to [`RATE`]. It steps through the
/// input by the ratio of the rates, reading a frame ahead only when it falls
/// between two, so at 48 kHz frames pass through as they are.
struct Resampler {
    step: f64,
    /// Where the next output falls, from `prev` (0) towards the frame after.
    pos: f64,
    prev: [f32; 2],
    next: Option<[f32; 2]>,
    primed: bool,
}

impl Resampler {
    fn new(rate: u32) -> Resampler {
        Resampler { step: f64::from(rate) / f64::from(RATE), pos: 0.0, prev: [0.0; 2], next: None, primed: false }
    }

    fn set_rate(&mut self, rate: u32) {
        self.step = f64::from(rate) / f64::from(RATE);
    }

    fn reset(&mut self) {
        self.primed = false;
        self.next = None;
        self.pos = 0.0;
    }

    /// The next output frame, or None when the input ran out (the state is
    /// kept, so the next call carries on where this one stopped).
    fn next(&mut self, pull: &mut impl FnMut() -> Option<[f32; 2]>) -> Option<[f32; 2]> {
        if !self.primed {
            self.prev = pull()?;
            self.primed = true;
            self.pos = 0.0;
        }
        while self.pos >= 1.0 {
            self.prev = match self.next.take() {
                Some(f) => f,
                None => pull()?,
            };
            self.pos -= 1.0;
        }
        let out = if self.pos == 0.0 {
            self.prev
        } else {
            let next = match self.next {
                Some(f) => f,
                None => *self.next.insert(pull()?),
            };
            let t = self.pos as f32;
            [self.prev[0] + (next[0] - self.prev[0]) * t, self.prev[1] + (next[1] - self.prev[1]) * t]
        };
        self.pos += self.step;
        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(format: SampleFormat, channels: u8, rate: u32) -> SampleSpec {
        SampleSpec { format, channels, sample_rate: rate }
    }

    fn attr(target: u32, prebuf: u32) -> BufferAttr {
        BufferAttr {
            max_length: u32::MAX,
            target_length: target,
            pre_buffering: prebuf,
            minimum_request_length: u32::MAX,
            fragment_size: u32::MAX,
        }
    }

    fn s16_stereo(frames: &[(i16, i16)]) -> Vec<u8> {
        frames.iter().flat_map(|(l, r)| [l.to_le_bytes(), r.to_le_bytes()].concat()).collect()
    }

    #[test]
    fn a_stream_plays_once_its_prebuffer_is_full() {
        let s = spec(SampleFormat::S16Le, 2, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 7680), false).unwrap();
        assert_eq!(st.attr.target_length, 19200);
        assert!(!st.playing());
        st.write(&vec![0; 3840]);
        assert!(!st.playing());
        st.write(&vec![0; 3840]);
        assert!(st.playing());
        assert_eq!(st.events, vec![Event::Started]);
    }

    #[test]
    fn mixing_converts_to_float_stereo_and_moves_the_read_index() {
        let s = spec(SampleFormat::S16Le, 2, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 0), false).unwrap();
        st.write(&s16_stereo(&[(16384, -16384), (0, 32767), (-32768, 0)]));
        let mut out = [0.0f32; 6];
        st.mix_into(&mut out);
        assert_eq!(out[0], 0.5);
        assert_eq!(out[1], -0.5);
        assert_eq!(out[2], 0.0);
        assert!((out[3] - 1.0).abs() < 1e-4);
        assert_eq!(out[4], -1.0);
        assert_eq!(st.read_index, 12);
        assert_eq!(st.read_index, st.write_index);
    }

    #[test]
    fn a_dry_stream_reports_one_underflow_and_prebuffers_again() {
        let s = spec(SampleFormat::Float32Le, 2, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 16), false).unwrap();
        st.write(&[0u8; 16]);
        st.events.clear();
        let mut out = [0.0f32; 8];
        st.mix_into(&mut out);
        assert_eq!(st.events, vec![Event::Underflow(16)]);
        assert!(!st.playing());
        st.mix_into(&mut out);
        assert_eq!(st.events.len(), 1);
    }

    #[test]
    fn corked_streams_take_nothing() {
        let s = spec(SampleFormat::S16Le, 2, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 0), true).unwrap();
        st.write(&s16_stereo(&[(1000, 1000)]));
        let mut out = [0.0f32; 2];
        st.mix_into(&mut out);
        assert_eq!(out, [0.0, 0.0]);
        assert_eq!(st.read_index, 0);
        st.cork(false);
        assert_eq!(st.events, vec![Event::Started]);
        st.mix_into(&mut out);
        assert!(out[0] > 0.0);
    }

    #[test]
    fn requests_ask_for_what_the_target_lacks() {
        let s = spec(SampleFormat::S16Le, 2, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 0), false).unwrap();
        // The create reply asked for the whole target.
        assert_eq!(st.take_request(), None);
        st.write(&vec![0; 19200]);
        let mut out = vec![0.0f32; 2 * 2400];
        st.mix_into(&mut out);
        assert_eq!(st.take_request(), Some(9600));
        assert_eq!(st.take_request(), None);
    }

    #[test]
    fn mono_plays_on_both_sides_and_volume_scales() {
        let s = spec(SampleFormat::S16Le, 1, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::mono(), attr(19200, 0), false).unwrap();
        st.set_volume(&[pulseaudio::protocol::Volume::from_linear(0.5)]);
        st.write(&16384i16.to_le_bytes());
        let mut out = [0.0f32; 2];
        st.mix_into(&mut out);
        assert!((out[0] - 0.25).abs() < 1e-3, "{out:?}");
        assert_eq!(out[0], out[1]);
    }

    #[test]
    fn other_rates_are_resampled_to_the_mix() {
        let s = spec(SampleFormat::S16Le, 2, 24_000);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 0), false).unwrap();
        st.write(&s16_stereo(&[(0, 0), (16384, 16384), (0, 0), (16384, 16384)]));
        let mut out = [0.0f32; 12];
        st.mix_into(&mut out);
        // Half the input rate: every input frame, then a frame halfway.
        let left: Vec<f32> = out.chunks(2).map(|f| f[0]).collect();
        assert_eq!(left, vec![0.0, 0.25, 0.5, 0.25, 0.0, 0.25]);
    }

    #[test]
    fn a_drain_waits_for_the_buffer_to_empty() {
        let s = spec(SampleFormat::S16Le, 2, RATE);
        let mut st = Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 19200), false).unwrap();
        st.write(&s16_stereo(&[(1, 1), (2, 2)]));
        st.drain(7);
        assert!(st.playing(), "a drain plays what is there");
        assert!(!st.events.contains(&Event::Drained(7)));
        let mut out = [0.0f32; 8];
        st.mix_into(&mut out);
        assert!(st.events.contains(&Event::Drained(7)));
    }

    #[test]
    fn unreadable_formats_are_refused() {
        let s = spec(SampleFormat::Alaw, 2, RATE);
        assert!(Stream::new(1, s, &ChannelMap::stereo(), attr(19200, 0), false).is_err());
    }
}
