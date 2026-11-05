//! Xwayland, for apps that speak only X11: the X display each session
//! reserves, and the launcher that starts Xwayland on it.
//!
//! A session reserves its display when it opens, the way an X server would:
//! the lock file `/tmp/.X<n>-lock` and a listening socket at
//! `/tmp/.X11-unix/X<n>`. Nothing runs yet. When the first X client
//! connects, the session starts Xwayland through smithay, and the client
//! waiting on the reserved socket is served by it.
//!
//! smithay 0.7 starts Xwayland with sockets it makes itself and has no way to
//! take ours, so the client already waiting would be lost. The host therefore
//! puts a launcher in between: smithay runs `Xwayland` from `PATH`, which
//! finds a link to this host's binary, and the host, called by that name,
//! runs the real Xwayland with smithay's arguments plus `-listenfd` for the
//! reserved socket ([`run_as_launcher_if_called`]).

use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Read, Write};
use std::os::fd::AsFd;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::UnixListener;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The name smithay runs Xwayland by, and the launcher's link's name.
const LAUNCHER_NAME: &str = "Xwayland";
/// The launcher's environment: the real Xwayland, and the reserved socket.
const REAL_XWAYLAND: &str = "IMBATRANIM_XWAYLAND";
const LISTEN_FD: &str = "IMBATRANIM_X11_LISTENFD";

/// The displays a session may take. smithay searches the same range.
const DISPLAYS: std::ops::Range<u32> = 0..33;

/// Where X servers keep their sockets and lock files. Fixed for Xwayland and
/// for X clients; a test points them elsewhere.
#[derive(Debug, Clone)]
pub struct XDirs {
    pub sockets: PathBuf,
    pub locks: PathBuf,
}

impl Default for XDirs {
    fn default() -> XDirs {
        XDirs {
            sockets: PathBuf::from("/tmp/.X11-unix"),
            locks: PathBuf::from("/tmp"),
        }
    }
}

/// How this host starts Xwayland.
#[derive(Debug)]
pub struct XwaylandConfig {
    /// The real Xwayland, from its own Nix profile. Missing until an app that
    /// speaks X11 is installed; a client that connects before then is
    /// refused.
    pub binary: PathBuf,
    /// Holds the launcher's link, put first on Xwayland's `PATH`.
    pub launcher_dir: PathBuf,
    pub dirs: XDirs,
}

impl XwaylandConfig {
    /// Make the launcher's directory and link (`<dir>/Xwayland`, to this
    /// host's own binary).
    pub fn new(binary: PathBuf, launcher_dir: PathBuf) -> io::Result<XwaylandConfig> {
        fs::create_dir_all(&launcher_dir)?;
        fs::set_permissions(&launcher_dir, fs::Permissions::from_mode(0o700))?;
        let link = launcher_dir.join(LAUNCHER_NAME);
        match fs::remove_file(&link) {
            Ok(()) => {}
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        std::os::unix::fs::symlink(std::env::current_exe()?, &link)?;
        Ok(XwaylandConfig { binary, launcher_dir, dirs: XDirs::default() })
    }

    /// The environment smithay adds when it starts Xwayland: `PATH` with the
    /// launcher first, the real binary, and the reserved socket's fd.
    pub fn launch_env(&self, listen_fd: i32) -> Vec<(OsString, OsString)> {
        let mut path = OsString::from(&self.launcher_dir);
        if let Some(rest) = std::env::var_os("PATH") {
            path.push(":");
            path.push(rest);
        }
        vec![
            ("PATH".into(), path),
            (REAL_XWAYLAND.into(), self.binary.clone().into_os_string()),
            (LISTEN_FD.into(), listen_fd.to_string().into()),
        ]
    }
}

/// When this process was started as `Xwayland` (by smithay, through the
/// launcher's link), become the real Xwayland: its arguments, plus the
/// reserved socket. Returns only when started under any other name.
pub fn run_as_launcher_if_called() {
    let mut args = std::env::args_os();
    let called = args.next().map(PathBuf::from);
    if called.as_deref().and_then(Path::file_name) != Some(LAUNCHER_NAME.as_ref()) {
        return;
    }
    let Some(real) = std::env::var_os(REAL_XWAYLAND) else {
        eprintln!("wayland-host: started as Xwayland without {REAL_XWAYLAND}");
        std::process::exit(1);
    };
    let fd = std::env::var_os(LISTEN_FD);
    let err = Command::new(&real)
        .args(launcher_args(args.collect(), fd))
        .env_remove(REAL_XWAYLAND)
        .env_remove(LISTEN_FD)
        .exec();
    eprintln!("wayland-host: cannot run {}: {err}", Path::new(&real).display());
    std::process::exit(1);
}

/// smithay's arguments, plus `-listenfd <fd>` for the reserved socket when
/// the fd is a number.
fn launcher_args(mut args: Vec<OsString>, fd: Option<OsString>) -> Vec<OsString> {
    if let Some(fd) = fd.filter(|f| f.to_str().is_some_and(|s| s.parse::<u32>().is_ok())) {
        args.push("-listenfd".into());
        args.push(fd);
    }
    args
}

/// Whether `fd` passes to a program this process runs (no `FD_CLOEXEC`).
pub fn set_inherited(fd: impl AsFd, inherited: bool) -> io::Result<()> {
    let flags = if inherited {
        rustix::io::FdFlags::empty()
    } else {
        rustix::io::FdFlags::CLOEXEC
    };
    rustix::io::fcntl_setfd(fd, flags)?;
    Ok(())
}

/// A display claimed for a session before anything runs on it: the lock file
/// and the listening socket. Dropped, it removes both.
#[derive(Debug)]
pub struct Reservation {
    display: u32,
    lock: Option<PathBuf>,
    socket: Option<PathBuf>,
    listener: UnixListener,
}

impl Reservation {
    /// Claim `only`, or else the first free display in [`DISPLAYS`].
    pub fn claim(dirs: &XDirs, only: Option<u32>) -> io::Result<Reservation> {
        ensure_sockets_dir(&dirs.sockets)?;
        let candidates: Vec<u32> = match only {
            Some(n) => vec![n],
            None => DISPLAYS.collect(),
        };
        for n in candidates {
            let Some(lock) = grab_lock(dirs, n)? else { continue };
            let socket = dirs.sockets.join(format!("X{n}"));
            // A socket left by a server that is gone (its lock was stale).
            let _ = fs::remove_file(&socket);
            match UnixListener::bind(&socket) {
                Ok(listener) => {
                    listener.set_nonblocking(true)?;
                    return Ok(Reservation { display: n, lock: Some(lock), socket: Some(socket), listener });
                }
                Err(_) => {
                    let _ = fs::remove_file(&lock);
                }
            }
        }
        Err(io::Error::new(ErrorKind::AddrInUse, "no free X display"))
    }

    pub fn display(&self) -> u32 {
        self.display
    }

    pub fn listener(&self) -> &UnixListener {
        &self.listener
    }

    /// Refuse the clients waiting now: Xwayland can't start for them.
    pub fn refuse_waiting(&self) {
        while self.listener.accept().is_ok() {}
    }

    /// Give the display over to Xwayland's start: the lock file goes, since
    /// smithay takes it again for the same display, and the socket's name
    /// is left to smithay, which binds a new socket there. The listening
    /// socket stays open with whoever waits on it, for Xwayland to accept.
    pub fn into_listener(mut self) -> io::Result<UnixListener> {
        let listener = self.listener.try_clone()?;
        if let Some(lock) = self.lock.take() {
            let _ = fs::remove_file(lock);
        }
        self.socket = None;
        Ok(listener)
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if let Some(socket) = self.socket.take() {
            let _ = fs::remove_file(socket);
        }
        if let Some(lock) = self.lock.take() {
            let _ = fs::remove_file(lock);
        }
    }
}

/// `/tmp/.X11-unix`, made world-writable and sticky like a system's own when
/// the image has none.
fn ensure_sockets_dir(dir: &Path) -> io::Result<()> {
    match fs::create_dir(dir) {
        Ok(()) => fs::set_permissions(dir, fs::Permissions::from_mode(0o1777)),
        Err(e) if e.kind() == ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(e),
    }
}

/// Take display `n`'s lock file, as X servers do: created exclusively, with
/// our pid. A lock whose process is gone is taken over. None when another
/// live process holds it.
fn grab_lock(dirs: &XDirs, n: u32) -> io::Result<Option<PathBuf>> {
    let path = dirs.locks.join(format!(".X{n}-lock"));
    for _ in 0..2 {
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if file.write_all(format!("{:>10}\n", std::process::id()).as_bytes()).is_err() {
                    let _ = fs::remove_file(&path);
                    return Ok(None);
                }
                return Ok(Some(path));
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => {
                if !lock_is_stale(&path) {
                    return Ok(None);
                }
                // Its server is gone: take it over.
                if fs::remove_file(&path).is_err() {
                    return Ok(None);
                }
            }
            Err(e) => return Err(e),
        }
    }
    Ok(None)
}

/// A lock file names a process that no longer exists.
fn lock_is_stale(path: &Path) -> bool {
    let mut text = String::new();
    if fs::File::open(path).and_then(|mut f| f.read_to_string(&mut text)).is_err() {
        return false;
    }
    let Ok(pid) = text.trim().parse::<i32>() else {
        return false;
    };
    match rustix::process::Pid::from_raw(pid) {
        Some(pid) => matches!(rustix::process::test_kill_process(pid), Err(rustix::io::Errno::SRCH)),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::net::UnixStream;

    fn temp_dirs(name: &str) -> XDirs {
        let base = std::env::temp_dir().join(format!("imbatranim-x11-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        XDirs { sockets: base.join(".X11-unix"), locks: base }
    }

    #[test]
    fn a_reservation_takes_the_first_free_display_and_cleans_up() {
        let dirs = temp_dirs("first");
        let first = Reservation::claim(&dirs, None).unwrap();
        assert_eq!(first.display(), 0);
        assert!(dirs.locks.join(".X0-lock").exists());
        assert!(dirs.sockets.join("X0").exists());
        let second = Reservation::claim(&dirs, None).unwrap();
        assert_eq!(second.display(), 1, "display 0 is held");
        assert!(Reservation::claim(&dirs, Some(0)).is_err(), "a held display is refused");
        drop(first);
        assert!(!dirs.locks.join(".X0-lock").exists());
        assert!(!dirs.sockets.join("X0").exists());
        assert_eq!(Reservation::claim(&dirs, Some(0)).unwrap().display(), 0);
    }

    #[test]
    fn a_stale_lock_is_taken_over() {
        let dirs = temp_dirs("stale");
        // A pid far past any the system hands out.
        fs::write(dirs.locks.join(".X0-lock"), format!("{:>10}\n", 999_999_999)).unwrap();
        assert_eq!(Reservation::claim(&dirs, None).unwrap().display(), 0);
        // A live process's lock is respected.
        fs::write(dirs.locks.join(".X2-lock"), format!("{:>10}\n", std::process::id())).unwrap();
        assert!(Reservation::claim(&dirs, Some(2)).is_err());
    }

    #[test]
    fn the_listener_handed_to_xwayland_keeps_its_waiting_client() {
        let dirs = temp_dirs("handover");
        let r = Reservation::claim(&dirs, None).unwrap();
        let path = dirs.sockets.join("X0");
        let mut client = UnixStream::connect(&path).unwrap();
        let listener = r.into_listener().unwrap();
        // The lock went for smithay to take; the name is smithay's to bind.
        assert!(!dirs.locks.join(".X0-lock").exists());
        assert!(path.exists(), "the name stays until smithay binds its own");
        listener.set_nonblocking(false).unwrap();
        let (mut served, _) = listener.accept().unwrap();
        client.write_all(b"hi").unwrap();
        let mut buf = [0u8; 2];
        served.read_exact(&mut buf).unwrap();
        assert_eq!(&buf, b"hi");
    }

    #[test]
    fn refused_clients_are_drained() {
        let dirs = temp_dirs("refuse");
        let r = Reservation::claim(&dirs, None).unwrap();
        let mut client = UnixStream::connect(dirs.sockets.join("X0")).unwrap();
        r.refuse_waiting();
        let mut buf = [0u8; 1];
        // The server end is gone: the client reads end of file.
        assert_eq!(client.read(&mut buf).unwrap(), 0);
    }

    #[test]
    fn the_launcher_adds_the_reserved_socket() {
        let args: Vec<OsString> = vec![":3".into(), "-rootless".into()];
        let with = launcher_args(args.clone(), Some("7".into()));
        assert_eq!(with, vec![OsString::from(":3"), "-rootless".into(), "-listenfd".into(), "7".into()]);
        assert_eq!(launcher_args(args.clone(), Some("x".into())), args);
        assert_eq!(launcher_args(args.clone(), None), args);
    }
}
