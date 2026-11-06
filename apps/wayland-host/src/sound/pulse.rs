//! One app's connection to the session's sound server, in PulseAudio's
//! native protocol: the handshake, the questions apps ask about the server
//! and its one sink, and playback streams. The `pulseaudio` crate reads and
//! writes the messages; this decides what to answer.
//!
//! No I/O here: bytes come in through [`Client::receive`] and the answers
//! collect in [`Client::out`] for the caller to write.

use std::collections::BTreeMap;
use std::ffi::CString;
use std::io::Cursor;
use std::time::{Duration, SystemTime};

use pulseaudio::protocol::{
    self, ChannelMap, ChannelVolume, Command, CreatePlaybackStreamReply, Descriptor, FormatEncoding, FormatInfo,
    PlaybackLatency, Props, PulseError, SampleFormat, SampleSpec, ServerInfo, SinkInfo, SinkState,
};

use super::stream::{Event, Stream, RATE};

/// The one sink every stream plays to: the tab.
pub const SINK_NAME: &str = "tab";
/// Our own cap on a message from an app. PulseAudio's blocks are 64 KiB.
const MAX_PACKET: u32 = 1024 * 1024;
/// Streams one app may hold at once.
const MAX_STREAMS: usize = 32;
/// PulseAudio's descriptor flag for data in shared memory, which this server
/// never offers.
const FLAG_SHMDATA: u32 = 0x8000_0000;

/// What the server tells a client about the state around it.
pub struct Context {
    /// The index the next stream gets, unique within the session.
    pub next_stream_index: u32,
    /// How long after the mix takes a sample the tab plays it, about.
    pub latency: Duration,
}

pub struct Client {
    pub id: u32,
    inbuf: Vec<u8>,
    /// Messages for the app, not yet written.
    pub out: Vec<u8>,
    version: u16,
    authorized: bool,
    named: bool,
    /// By channel, the app's handle for a stream.
    pub streams: BTreeMap<u32, Stream>,
    next_channel: u32,
}

impl Client {
    pub fn new(id: u32) -> Client {
        Client {
            id,
            inbuf: Vec::new(),
            out: Vec::new(),
            version: protocol::MAX_VERSION,
            authorized: false,
            named: false,
            streams: BTreeMap::new(),
            next_channel: 0,
        }
    }

    /// Bytes from the app. Err when the connection should close: a malformed
    /// message, or a command before the handshake.
    pub fn receive(&mut self, bytes: &[u8], ctx: &mut Context) -> Result<(), String> {
        self.inbuf.extend_from_slice(bytes);
        let mut at = 0;
        loop {
            let rest = &self.inbuf[at..];
            if rest.len() < protocol::DESCRIPTOR_SIZE {
                break;
            }
            let desc = protocol::read_descriptor(&mut Cursor::new(rest)).map_err(|e| format!("{e:?}"))?;
            if desc.length > MAX_PACKET {
                return Err(format!("a {} byte message", desc.length));
            }
            let end = protocol::DESCRIPTOR_SIZE + desc.length as usize;
            if rest.len() < end {
                break;
            }
            let payload = rest[protocol::DESCRIPTOR_SIZE..end].to_vec();
            at += end;
            if desc.channel == u32::MAX {
                self.command(&payload, ctx)?;
            } else {
                self.data(&desc, &payload)?;
            }
        }
        self.inbuf.drain(..at);
        Ok(())
    }

    fn command(&mut self, payload: &[u8], ctx: &mut Context) -> Result<(), String> {
        let (seq, cmd) = match Command::read_tag_prefixed(&mut Cursor::new(payload), self.version) {
            Ok(v) => v,
            Err(_) => {
                // A command this server doesn't read. Its sequence number
                // follows the tag: refuse it, so the app's call returns.
                let seq = command_seq(payload).ok_or("a command without a sequence number")?;
                self.error(seq, PulseError::NotSupported);
                return Ok(());
            }
        };
        if !self.authorized {
            let Command::Auth(params) = cmd else {
                return Err("a command before the handshake".into());
            };
            self.authorized = true;
            self.version = params.version.clamp(protocol::MIN_VERSION, protocol::MAX_VERSION);
            // Data comes inline on the socket: no shared memory.
            let reply = protocol::AuthReply { version: self.version, use_shm: false, use_memfd: false };
            self.reply(seq, &reply);
            return Ok(());
        }
        if !self.named {
            let Command::SetClientName(_) = cmd else {
                return Err("a command before the client's name".into());
            };
            self.named = true;
            self.reply(seq, &protocol::SetClientNameReply { client_id: self.id });
            return Ok(());
        }
        self.handle(seq, cmd, ctx);
        Ok(())
    }

    fn handle(&mut self, seq: u32, cmd: Command, ctx: &mut Context) {
        match cmd {
            Command::GetServerInfo => self.reply(seq, &server_info()),
            Command::GetSinkInfo(q) => {
                if q.index.is_some_and(|i| i != 0) || q.name.as_deref().is_some_and(|n| !is_our_sink(n)) {
                    self.error(seq, PulseError::NoEntity);
                } else {
                    self.reply(seq, &sink_info(ctx.latency));
                }
            }
            Command::GetSinkInfoList => self.reply(seq, &vec![sink_info(ctx.latency)]),
            Command::LookupSink(name) => {
                if is_our_sink(&name) {
                    self.reply(seq, &protocol::LookupReply(0));
                } else {
                    self.error(seq, PulseError::NoEntity);
                }
            }
            // No microphone: there are no sources.
            Command::GetSourceInfoList => self.reply(seq, &protocol::SourceInfoList::new()),
            Command::GetSourceInfo(_) | Command::LookupSource(_) | Command::CreateRecordStream(_) => {
                self.error(seq, PulseError::NoEntity)
            }
            Command::GetClientInfoList => self.reply(seq, &protocol::ClientInfoList::new()),
            Command::GetModuleInfoList => self.reply(seq, &protocol::ModuleInfoList::new()),
            Command::GetCardInfoList => self.reply(seq, &protocol::CardInfoList::new()),
            Command::GetSinkInputInfoList => self.reply(seq, &protocol::SinkInputInfoList::new()),
            Command::GetSourceOutputInfoList => self.reply(seq, &protocol::SourceOutputInfoList::new()),
            Command::GetSampleInfoList => self.reply(seq, &protocol::SampleInfoList::new()),
            Command::Stat => self.reply(seq, &protocol::StatInfo::default()),
            Command::Extension(_) => self.error(seq, PulseError::NoExtension),

            Command::CreatePlaybackStream(params) => self.create_stream(seq, params, ctx),
            Command::DeletePlaybackStream(channel) => {
                if self.streams.remove(&channel).is_some() {
                    self.ack(seq);
                } else {
                    self.error(seq, PulseError::NoEntity);
                }
            }
            Command::CorkPlaybackStream(p) => self.with_stream(seq, p.channel, |s| s.cork(p.cork)),
            Command::FlushPlaybackStream(channel) => self.with_stream(seq, channel, Stream::flush),
            Command::TriggerPlaybackStream(channel) => self.with_stream(seq, channel, Stream::trigger),
            Command::PrebufPlaybackStream(channel) => self.with_stream(seq, channel, Stream::prebuf),
            Command::DrainPlaybackStream(channel) => match self.streams.get_mut(&channel) {
                // Acknowledged once the stream has played out.
                Some(s) => s.drain(seq),
                None => self.error(seq, PulseError::NoEntity),
            },
            Command::GetPlaybackLatency(p) => match self.streams.get(&p.channel) {
                Some(s) => {
                    let reply = PlaybackLatency {
                        sink_usec: ctx.latency.as_micros() as u64,
                        source_usec: 0,
                        playing: s.active(),
                        local_time: p.now,
                        remote_time: SystemTime::now(),
                        write_offset: s.write_index as i64,
                        read_offset: s.read_index as i64,
                        underrun_for: 0,
                        playing_for: s.playing_for,
                    };
                    self.reply(seq, &reply);
                }
                None => self.error(seq, PulseError::NoEntity),
            },
            Command::SetPlaybackStreamBufferAttr(p) => match self.streams.get_mut(&p.index) {
                Some(s) => {
                    s.set_attr(p.buffer_attr);
                    let reply = protocol::SetPlaybackStreamBufferAttrReply {
                        buffer_attr: s.attr,
                        configured_sink_latency: ctx.latency.as_micros() as u64,
                    };
                    self.reply(seq, &reply);
                }
                None => self.error(seq, PulseError::NoEntity),
            },
            Command::UpdatePlaybackStreamSampleRate(p) => match self.streams.get_mut(&p.index) {
                Some(s) => match s.set_rate(p.sample_rate) {
                    Ok(()) => self.ack(seq),
                    Err(e) => self.error(seq, e),
                },
                None => self.error(seq, PulseError::NoEntity),
            },
            // Volume and mute name the stream by its session-wide index.
            Command::SetSinkInputVolume(p) => match self.stream_by_index(p.index) {
                Some(s) => {
                    s.set_volume(p.volume.channels());
                    self.ack(seq);
                }
                None => self.error(seq, PulseError::NoEntity),
            },
            Command::SetSinkInputMute(p) => match self.stream_by_index(p.index) {
                Some(s) => {
                    s.set_muted(p.mute);
                    self.ack(seq);
                }
                None => self.error(seq, PulseError::NoEntity),
            },

            // Names and properties: nothing reads them back.
            Command::SetClientName(_)
            | Command::UpdateClientProplist(_)
            | Command::RemoveClientProplist
            | Command::SetPlaybackStreamName(_)
            | Command::UpdatePlaybackStreamProplist(_)
            | Command::RemovePlaybackStreamProplist(_)
            // No events are ever sent, so any mask will do.
            | Command::Subscribe(_)
            // One sink, always on: there is nothing to move, choose or wake.
            | Command::SetDefaultSink(_)
            | Command::SuspendSink(_)
            | Command::MoveSinkInput(_)
            // The tab's volume is the OS's own, set in the tray.
            | Command::SetSinkVolume(_)
            | Command::SetSinkMute(_) => self.ack(seq),

            _ => self.error(seq, PulseError::NotSupported),
        }
    }

    fn create_stream(&mut self, seq: u32, params: protocol::PlaybackStreamParams, ctx: &mut Context) {
        if self.streams.len() >= MAX_STREAMS {
            self.error(seq, PulseError::TooLarge);
            return;
        }
        let corked = params.flags.start_corked;
        let mut stream = match Stream::new(
            ctx.next_stream_index,
            params.sample_spec,
            &params.channel_map,
            params.buffer_attr,
            corked,
        ) {
            Ok(s) => s,
            Err(e) => {
                self.error(seq, e);
                return;
            }
        };
        if let Some(v) = params.cvolume {
            stream.set_volume(v.channels());
        }
        if params.flags.start_muted == Some(true) {
            stream.set_muted(true);
        }
        ctx.next_stream_index = ctx.next_stream_index.wrapping_add(1);
        let channel = self.next_channel;
        self.next_channel += 1;
        let reply = CreatePlaybackStreamReply {
            channel,
            stream_index: stream.index,
            requested_bytes: stream.attr.target_length,
            buffer_attr: stream.attr,
            sample_spec: stream.spec,
            channel_map: params.channel_map,
            stream_latency: ctx.latency.as_micros() as u64,
            sink_index: 0,
            sink_name: Some(CString::new(SINK_NAME).unwrap()),
            suspended: false,
            format: FormatInfo::new(FormatEncoding::Pcm),
        };
        self.streams.insert(channel, stream);
        self.reply(seq, &reply);
    }

    fn stream_by_index(&mut self, index: u32) -> Option<&mut Stream> {
        self.streams.values_mut().find(|s| s.index == index)
    }

    fn with_stream(&mut self, seq: u32, channel: u32, f: impl FnOnce(&mut Stream)) {
        match self.streams.get_mut(&channel) {
            Some(s) => {
                f(s);
                self.ack(seq);
            }
            None => self.error(seq, PulseError::NoEntity),
        }
    }

    /// Samples for a stream. Only appending is supported, which is how apps
    /// write; a seek elsewhere is played as if it were appended.
    fn data(&mut self, desc: &Descriptor, payload: &[u8]) -> Result<(), String> {
        if desc.flags.bits() & FLAG_SHMDATA != 0 {
            return Err("shared memory data, which wasn't offered".into());
        }
        let Some(stream) = self.streams.get_mut(&desc.channel) else {
            // A stream deleted while its data was on the way.
            return Ok(());
        };
        let overflow = stream.write(payload);
        if overflow > 0 {
            self.command_out(&Command::Overflow(overflow as u32));
        }
        Ok(())
    }

    /// After data came in or a round of mixing: tell the app what its
    /// streams did, and ask for more data where they have room.
    pub fn report(&mut self) {
        let mut messages = Vec::new();
        let mut acks = Vec::new();
        for (&channel, stream) in self.streams.iter_mut() {
            for event in stream.events.drain(..) {
                match event {
                    Event::Started => messages.push(Command::Started(channel)),
                    Event::Underflow(offset) => {
                        messages.push(Command::Underflow(protocol::Underflow { channel, offset }))
                    }
                    Event::Drained(seq) => acks.push(seq),
                }
            }
            if let Some(length) = stream.take_request() {
                messages.push(Command::Request(protocol::Request { channel, length }));
            }
        }
        for m in messages {
            self.command_out(&m);
        }
        for seq in acks {
            self.ack(seq);
        }
    }

    fn reply<R: protocol::CommandReply>(&mut self, seq: u32, reply: &R) {
        let _ = protocol::write_reply_message(&mut self.out, seq, reply, self.version);
    }

    fn ack(&mut self, seq: u32) {
        let _ = protocol::write_ack_message(&mut self.out, seq);
    }

    fn error(&mut self, seq: u32, error: PulseError) {
        let _ = protocol::write_error(&mut self.out, seq, &error);
    }

    fn command_out(&mut self, cmd: &Command) {
        let _ = protocol::write_command_message(&mut self.out, u32::MAX, cmd, self.version);
    }
}

/// A command's sequence number, read by hand: the tagstruct starts with two
/// `u32`s, each a tag byte `L` and four bytes big-endian, the command and
/// then the sequence.
fn command_seq(payload: &[u8]) -> Option<u32> {
    if payload.len() < 10 || payload[0] != b'L' || payload[5] != b'L' {
        return None;
    }
    Some(u32::from_be_bytes(payload[6..10].try_into().ok()?))
}

fn is_our_sink(name: &std::ffi::CStr) -> bool {
    name == protocol::DEFAULT_SINK || name.to_bytes() == SINK_NAME.as_bytes()
}

/// The mix's own format, which apps that ask match.
fn mix_spec() -> SampleSpec {
    SampleSpec { format: SampleFormat::Float32Le, channels: 2, sample_rate: RATE }
}

fn server_info() -> ServerInfo {
    ServerInfo {
        server_name: Some(c"pulseaudio".to_owned()),
        server_version: Some(c"17.0".to_owned()),
        user_name: Some(c"imbatranim".to_owned()),
        host_name: Some(c"imbatranim".to_owned()),
        sample_spec: mix_spec(),
        cookie: 0,
        default_sink_name: Some(CString::new(SINK_NAME).unwrap()),
        default_source_name: None,
        channel_map: ChannelMap::stereo(),
    }
}

fn sink_info(latency: Duration) -> SinkInfo {
    let usec = latency.as_micros() as u64;
    SinkInfo {
        name: CString::new(SINK_NAME).unwrap(),
        description: Some(c"The browser tab".to_owned()),
        props: Props::new(),
        state: SinkState::Running,
        sample_spec: mix_spec(),
        cvolume: ChannelVolume::norm(2),
        actual_latency: usec,
        configured_latency: usec,
        ..SinkInfo::new_dummy(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pulseaudio::protocol::stream::{BufferAttr, StreamFlags};
    use pulseaudio::protocol::{AuthParams, PlaybackStreamParams};

    fn ctx() -> Context {
        Context { next_stream_index: 0, latency: Duration::from_millis(60) }
    }

    fn send(client: &mut Client, ctx: &mut Context, seq: u32, cmd: &Command) {
        let mut bytes = Vec::new();
        protocol::write_command_message(&mut bytes, seq, cmd, protocol::MAX_VERSION).unwrap();
        client.receive(&bytes, ctx).unwrap();
    }

    fn handshake(client: &mut Client, ctx: &mut Context) {
        let auth = Command::Auth(AuthParams {
            version: protocol::MAX_VERSION,
            supports_shm: true,
            supports_memfd: true,
            cookie: vec![0; 256],
        });
        send(client, ctx, 0, &auth);
        let reply: protocol::AuthReply =
            protocol::read_reply_message(&mut Cursor::new(&client.out[..]), 13)
                .unwrap()
                .1;
        assert!(!reply.use_shm && !reply.use_memfd);
        client.out.clear();
        send(client, ctx, 1, &Command::SetClientName(Props::new()));
        client.out.clear();
    }

    /// The commands and replies in the client's output, in order.
    fn sent(client: &mut Client) -> Vec<(u32, Command)> {
        let out = std::mem::take(&mut client.out);
        let mut cursor = Cursor::new(&out[..]);
        let mut msgs = Vec::new();
        while (cursor.position() as usize) < out.len() {
            let desc = protocol::read_descriptor(&mut cursor).unwrap();
            let start = cursor.position() as usize;
            let payload = &out[start..start + desc.length as usize];
            msgs.push(Command::read_tag_prefixed(&mut Cursor::new(payload), protocol::MAX_VERSION).unwrap());
            cursor.set_position((start + desc.length as usize) as u64);
        }
        msgs
    }

    fn stream_params(corked: bool) -> PlaybackStreamParams {
        PlaybackStreamParams {
            sample_spec: SampleSpec { format: SampleFormat::S16Le, channels: 2, sample_rate: RATE },
            channel_map: ChannelMap::stereo(),
            buffer_attr: BufferAttr {
                max_length: u32::MAX,
                target_length: 19200,
                pre_buffering: 3840,
                minimum_request_length: u32::MAX,
                fragment_size: u32::MAX,
            },
            flags: StreamFlags { start_corked: corked, ..Default::default() },
            ..Default::default()
        }
    }

    #[test]
    fn commands_before_the_handshake_close_the_connection() {
        let mut client = Client::new(1);
        let mut bytes = Vec::new();
        protocol::write_command_message(&mut bytes, 0, &Command::GetServerInfo, protocol::MAX_VERSION).unwrap();
        assert!(client.receive(&bytes, &mut ctx()).is_err());
    }

    #[test]
    fn the_server_names_one_sink_the_tab() {
        let mut client = Client::new(1);
        let mut ctx = ctx();
        handshake(&mut client, &mut ctx);
        send(&mut client, &mut ctx, 2, &Command::GetServerInfo);
        let out = std::mem::take(&mut client.out);
        let (seq, info): (u32, ServerInfo) =
            protocol::read_reply_message(&mut Cursor::new(&out[..]), protocol::MAX_VERSION)
                .unwrap();
        assert_eq!(seq, 2);
        assert_eq!(info.default_sink_name.as_deref(), Some(c"tab"));
        assert_eq!(info.sample_spec.sample_rate, 48_000);
    }

    #[test]
    fn a_stream_is_created_written_and_started() {
        let mut client = Client::new(1);
        let mut ctx = ctx();
        handshake(&mut client, &mut ctx);
        send(&mut client, &mut ctx, 2, &Command::CreatePlaybackStream(stream_params(false)));
        let out = std::mem::take(&mut client.out);
        let (_, reply): (u32, CreatePlaybackStreamReply) =
            protocol::read_reply_message(&mut Cursor::new(&out[..]), protocol::MAX_VERSION)
                .unwrap();
        assert_eq!(reply.requested_bytes, 19200);
        assert_eq!(ctx.next_stream_index, 1);

        let mut data = Vec::new();
        protocol::write_memblock(&mut data, reply.channel, &[0u8; 19200], 0).unwrap();
        client.receive(&data, &mut ctx).unwrap();
        // 50 ms played: half the target, past the minimum request of a quarter.
        let mut mix = vec![0.0f32; 2 * 2400];
        client.streams.get_mut(&reply.channel).unwrap().mix_into(&mut mix);
        client.report();
        let msgs = sent(&mut client);
        assert_eq!(msgs[0].1, Command::Started(reply.channel));
        assert!(matches!(msgs[1].1, Command::Request(protocol::Request { length: 9600, .. })));
    }

    #[test]
    fn unknown_commands_are_refused_not_dropped() {
        let mut client = Client::new(1);
        let mut ctx = ctx();
        handshake(&mut client, &mut ctx);
        // A made-up command tag (200) with sequence number 9.
        let payload = [b'L', 0, 0, 0, 200, b'L', 0, 0, 0, 9];
        let mut bytes = Vec::new();
        let desc = Descriptor {
            length: payload.len() as u32,
            channel: u32::MAX,
            offset: 0,
            flags: protocol::DescriptorFlags::empty(),
        };
        protocol::write_descriptor(&mut bytes, &desc).unwrap();
        bytes.extend_from_slice(&payload);
        client.receive(&bytes, &mut ctx).unwrap();
        let msgs = sent(&mut client);
        assert_eq!(msgs, vec![(9, Command::Error(PulseError::NotSupported))]);
    }

    #[test]
    fn a_drain_is_acknowledged_after_the_stream_plays_out() {
        let mut client = Client::new(1);
        let mut ctx = ctx();
        handshake(&mut client, &mut ctx);
        send(&mut client, &mut ctx, 2, &Command::CreatePlaybackStream(stream_params(false)));
        client.out.clear();
        let mut data = Vec::new();
        protocol::write_memblock(&mut data, 0, &[0u8; 400], 0).unwrap();
        client.receive(&data, &mut ctx).unwrap();
        send(&mut client, &mut ctx, 3, &Command::DrainPlaybackStream(0));
        assert!(client.out.is_empty(), "nothing until it has played");
        let mut mix = vec![0.0f32; 2 * 480];
        client.streams.get_mut(&0).unwrap().mix_into(&mut mix);
        client.report();
        assert!(sent(&mut client).contains(&(3, Command::Reply)));
    }

    #[test]
    fn messages_split_across_reads_are_put_back_together() {
        let mut client = Client::new(1);
        let mut ctx = ctx();
        let auth = Command::Auth(AuthParams { version: 35, supports_shm: false, supports_memfd: false, cookie: vec![] });
        let mut bytes = Vec::new();
        protocol::write_command_message(&mut bytes, 0, &auth, protocol::MAX_VERSION).unwrap();
        for b in &bytes {
            client.receive(std::slice::from_ref(b), &mut ctx).unwrap();
        }
        assert_eq!(sent(&mut client)[0].0, 0);
    }
}
