//! A session's sound: the PulseAudio server its Linux apps play to, and the
//! mix of their streams, encoded as Opus for the tab.
//!
//! Each session listens on its own socket (`socket_path`), which the backend
//! hands the session's apps as `PULSE_SERVER`. Linux apps play through
//! libpulse, which only needs the protocol, so the host speaks it itself
//! rather than running PulseAudio or PipeWire: either costs about 250 MB in
//! the image. While a stream plays, the mix takes its samples in real time,
//! 48 kHz stereo, and every 20 ms becomes one Opus packet. A frame of
//! silence is not sent, and with nothing playing the clock stops.

mod pulse;
mod stream;

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use stream::RATE;

/// Samples per channel in one Opus frame: 20 ms at 48 kHz.
pub const FRAME: usize = 960;
/// How long after the mix takes a sample the tab plays it, about: half a
/// frame waiting for the rest of it, the trip, and the tab's jitter buffer.
/// Apps are told it as the sink's latency, so a video player shows each
/// picture this much later, beside its sound.
const LATENCY: Duration = Duration::from_millis(60);
/// After a stall (the host was busy), at most this much is mixed at once.
const MAX_CATCH_UP: u64 = RATE as u64 / 5;
/// Apps connected to one session's sound at once.
const MAX_CLIENTS: usize = 64;
/// Opus at this rate is transparent for stereo music.
const BITRATE: i32 = 128_000;
/// Quieter than a 16-bit sample's last bit: silence.
const SILENCE: f32 = 1.0 / 32768.0;

/// Where a session's sound server listens:
/// `$XDG_RUNTIME_DIR/imbatranim-sound/<session id>`, in a directory only the
/// OS user can enter. The backend names the same path.
pub fn socket_path(runtime_dir: &std::path::Path, session: &str) -> PathBuf {
    runtime_dir.join("imbatranim-sound").join(session)
}

pub struct Sound {
    clients: HashMap<u32, pulse::Client>,
    next_client: u32,
    ctx: pulse::Context,
    /// When mixing started and how many frames it has taken since. None
    /// while nothing plays.
    clock: Option<(Instant, u64)>,
    /// Mixed samples, interleaved stereo, short of a whole frame.
    pending: Vec<f32>,
    encoder: Option<opus::Encoder>,
    /// The frame number of the next packet. Silent frames count too, so a
    /// gap in the numbers tells the tab the sound paused.
    sequence: u32,
    frozen: bool,
    /// Packet bodies waiting to go: the sequence number, then the Opus data.
    packets: Vec<Vec<u8>>,
}

impl Default for Sound {
    fn default() -> Self {
        Sound {
            clients: HashMap::new(),
            next_client: 1,
            ctx: pulse::Context { next_stream_index: 0, latency: LATENCY },
            clock: None,
            pending: Vec::new(),
            encoder: None,
            sequence: 0,
            frozen: false,
            packets: Vec::new(),
        }
    }
}

impl Sound {
    /// A new app connection; None when the session has too many.
    pub fn connect(&mut self) -> Option<u32> {
        if self.clients.len() >= MAX_CLIENTS {
            return None;
        }
        let id = self.next_client;
        self.next_client = self.next_client.wrapping_add(1).max(1);
        self.clients.insert(id, pulse::Client::new(id));
        Some(id)
    }

    pub fn disconnect(&mut self, id: u32) {
        self.clients.remove(&id);
    }

    /// Bytes from an app. False when its connection should close.
    pub fn receive(&mut self, id: u32, bytes: &[u8]) -> bool {
        let Some(client) = self.clients.get_mut(&id) else {
            return false;
        };
        match client.receive(bytes, &mut self.ctx) {
            Ok(()) => {
                client.report();
                true
            }
            Err(e) => {
                eprintln!("wayland-host: a sound client was dropped: {e}");
                false
            }
        }
    }

    /// What is waiting to be written to an app.
    pub fn output(&mut self, id: u32) -> Option<&mut Vec<u8>> {
        self.clients.get_mut(&id).map(|c| &mut c.out)
    }

    pub fn client_ids(&self) -> Vec<u32> {
        self.clients.keys().copied().collect()
    }

    /// Whether the mix needs its clock: a stream is playing, or the last
    /// round's state has to wind down.
    pub fn wants_clock(&self) -> bool {
        self.clock.is_some() || (!self.frozen && self.any_active())
    }

    fn any_active(&self) -> bool {
        self.clients.values().any(|c| c.streams.values().any(|s| s.active()))
    }

    /// Under the cover screen the apps are frozen: the clock stops, and the
    /// part of a frame not yet sent is dropped.
    pub fn set_frozen(&mut self, frozen: bool) {
        self.frozen = frozen;
        if frozen {
            self.stop_clock();
            self.pending.clear();
        }
    }

    /// Mix what is due by `now`.
    pub fn tick(&mut self, now: Instant) {
        if self.frozen || !self.any_active() {
            if self.clock.is_some() {
                self.stop_clock();
            }
            return;
        }
        let (start, done) = *self.clock.get_or_insert((now, 0));
        let due = (now.saturating_duration_since(start).as_secs_f64() * f64::from(RATE)) as u64;
        let mut frames = due.saturating_sub(done);
        if frames > MAX_CATCH_UP {
            frames = MAX_CATCH_UP;
            self.clock = Some((now, 0));
        } else {
            self.clock = Some((start, done + frames));
        }
        let mut mix = vec![0.0f32; frames as usize * 2];
        for client in self.clients.values_mut() {
            for stream in client.streams.values_mut() {
                stream.mix_into(&mut mix);
            }
            client.report();
        }
        self.pending.extend_from_slice(&mix);
        while self.pending.len() >= FRAME * 2 {
            let frame: Vec<f32> = self.pending.drain(..FRAME * 2).collect();
            self.emit(frame);
        }
    }

    /// Nothing plays any more: send what was mixed, padded to a frame, and
    /// mark the break in the sequence.
    fn stop_clock(&mut self) {
        self.clock = None;
        if !self.pending.is_empty() {
            let mut frame = std::mem::take(&mut self.pending);
            frame.resize(FRAME * 2, 0.0);
            self.emit(frame);
        }
        self.sequence = self.sequence.wrapping_add(1);
    }

    fn emit(&mut self, mut frame: Vec<f32>) {
        let sequence = self.sequence;
        self.sequence = self.sequence.wrapping_add(1);
        if frame.iter().all(|s| s.abs() < SILENCE) {
            return;
        }
        for s in &mut frame {
            *s = s.clamp(-1.0, 1.0);
        }
        let Some(encoder) = self.encoder() else {
            return;
        };
        let mut packet = vec![0u8; 4000];
        match encoder.encode_float(&frame, &mut packet) {
            Ok(len) => {
                let mut body = Vec::with_capacity(4 + len);
                body.extend_from_slice(&sequence.to_le_bytes());
                body.extend_from_slice(&packet[..len]);
                self.packets.push(body);
            }
            Err(e) => eprintln!("wayland-host: Opus refused a frame: {e}"),
        }
    }

    fn encoder(&mut self) -> Option<&mut opus::Encoder> {
        if self.encoder.is_none() {
            match opus::Encoder::new(RATE, opus::Channels::Stereo, opus::Application::Audio) {
                Ok(mut e) => {
                    let _ = e.set_bitrate(opus::Bitrate::Bits(BITRATE));
                    self.encoder = Some(e);
                }
                Err(e) => eprintln!("wayland-host: no Opus encoder: {e}"),
            }
        }
        self.encoder.as_mut()
    }

    /// The packets mixed since the last call, oldest first.
    pub fn take_packets(&mut self) -> Vec<Vec<u8>> {
        std::mem::take(&mut self.packets)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pulseaudio::protocol::stream::{BufferAttr, StreamFlags};
    use pulseaudio::protocol::{
        self, AuthParams, ChannelMap, Command, PlaybackStreamParams, Props, SampleFormat, SampleSpec,
    };

    fn command(seq: u32, cmd: &Command) -> Vec<u8> {
        let mut bytes = Vec::new();
        protocol::write_command_message(&mut bytes, seq, cmd, protocol::MAX_VERSION).unwrap();
        bytes
    }

    /// An app that connected and opened one corked stream of 48 kHz stereo
    /// 16-bit samples; the stream's channel is 0.
    fn sound_with_stream() -> (Sound, u32) {
        let mut sound = Sound::default();
        let id = sound.connect().unwrap();
        let auth = AuthParams { version: 35, supports_shm: false, supports_memfd: false, cookie: vec![] };
        assert!(sound.receive(id, &command(0, &Command::Auth(auth))));
        assert!(sound.receive(id, &command(1, &Command::SetClientName(Props::new()))));
        let params = PlaybackStreamParams {
            sample_spec: SampleSpec { format: SampleFormat::S16Le, channels: 2, sample_rate: RATE },
            channel_map: ChannelMap::stereo(),
            buffer_attr: BufferAttr {
                max_length: u32::MAX,
                target_length: 96_000,
                pre_buffering: 0,
                minimum_request_length: u32::MAX,
                fragment_size: u32::MAX,
            },
            flags: StreamFlags { start_corked: true, ..Default::default() },
            ..Default::default()
        };
        assert!(sound.receive(id, &command(2, &Command::CreatePlaybackStream(params))));
        sound.output(id).unwrap().clear();
        (sound, id)
    }

    fn write(sound: &mut Sound, id: u32, samples: &[i16]) {
        let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut data = Vec::new();
        protocol::write_memblock(&mut data, 0, &bytes, 0).unwrap();
        assert!(sound.receive(id, &data));
    }

    fn uncork(sound: &mut Sound, id: u32) {
        let cork = Command::CorkPlaybackStream(protocol::CorkStreamParams { channel: 0, cork: false });
        assert!(sound.receive(id, &command(3, &cork)));
    }

    #[test]
    fn nothing_playing_needs_no_clock() {
        let (sound, _) = sound_with_stream();
        assert!(!sound.wants_clock(), "a corked stream");
    }

    #[test]
    fn sound_is_mixed_in_real_time_into_numbered_opus_packets() {
        let (mut sound, id) = sound_with_stream();
        // 100 ms of a loud square wave.
        let tone: Vec<i16> = (0..4800).flat_map(|i| if i / 24 % 2 == 0 { [8000, 8000] } else { [-8000, -8000] }).collect();
        write(&mut sound, id, &tone);
        uncork(&mut sound, id);
        assert!(sound.wants_clock());
        let t0 = Instant::now();
        sound.tick(t0);
        assert!(sound.take_packets().is_empty(), "nothing is due yet");
        sound.tick(t0 + Duration::from_millis(45));
        let packets = sound.take_packets();
        assert_eq!(packets.len(), 2, "two whole 20 ms frames in 45 ms");
        let seqs: Vec<u32> = packets.iter().map(|p| u32::from_le_bytes(p[..4].try_into().unwrap())).collect();
        assert_eq!(seqs, vec![0, 1]);
        assert!(packets.iter().all(|p| p.len() > 4));
        // The decoder agrees it is 20 ms of stereo.
        let mut decoder = opus::Decoder::new(RATE, opus::Channels::Stereo).unwrap();
        let mut pcm = vec![0f32; FRAME * 2];
        assert_eq!(decoder.decode_float(&packets[0][4..], &mut pcm, false).unwrap(), FRAME);
    }

    #[test]
    fn silence_sends_nothing() {
        let (mut sound, id) = sound_with_stream();
        write(&mut sound, id, &vec![0i16; 9600]);
        uncork(&mut sound, id);
        let t0 = Instant::now();
        sound.tick(t0);
        sound.tick(t0 + Duration::from_millis(100));
        assert!(sound.take_packets().is_empty());
    }

    #[test]
    fn frozen_sessions_mix_nothing_and_resume_without_a_burst() {
        let (mut sound, id) = sound_with_stream();
        write(&mut sound, id, &vec![4000i16; 96_000]);
        uncork(&mut sound, id);
        let t0 = Instant::now();
        sound.tick(t0);
        sound.set_frozen(true);
        assert!(!sound.wants_clock());
        sound.tick(t0 + Duration::from_secs(5));
        assert!(sound.take_packets().is_empty());
        sound.set_frozen(false);
        assert!(sound.wants_clock());
        let t1 = t0 + Duration::from_secs(10);
        sound.tick(t1);
        sound.tick(t1 + Duration::from_millis(30));
        assert_eq!(sound.take_packets().len(), 1, "30 ms after waking, one frame");
    }

    #[test]
    fn a_break_in_the_sound_skips_a_sequence_number() {
        let (mut sound, id) = sound_with_stream();
        write(&mut sound, id, &vec![4000i16; 2 * 1920]);
        uncork(&mut sound, id);
        let t0 = Instant::now();
        sound.tick(t0);
        sound.tick(t0 + Duration::from_millis(20));
        // The stream ran dry after 40 ms of data: the clock stops and the
        // part of a frame left goes out padded.
        sound.tick(t0 + Duration::from_millis(50));
        sound.tick(t0 + Duration::from_millis(60));
        write(&mut sound, id, &vec![4000i16; 2 * 960]);
        let t1 = t0 + Duration::from_millis(500);
        sound.tick(t1);
        sound.tick(t1 + Duration::from_millis(20));
        let seqs: Vec<u32> =
            sound.take_packets().iter().map(|p| u32::from_le_bytes(p[..4].try_into().unwrap())).collect();
        assert_eq!(seqs, vec![0, 1, 4]);
    }

    #[test]
    fn the_socket_lives_in_a_directory_of_its_own() {
        let p = socket_path(std::path::Path::new("/run/user/1000"), "abcdefghijklmnop");
        assert_eq!(p, std::path::PathBuf::from("/run/user/1000/imbatranim-sound/abcdefghijklmnop"));
    }
}
