# Linux apps installed with Nix: the user's Nix profile on PATH for login
# shells. Installed as /etc/profile.d/nix-apps.sh. The Terminal's shells get
# the same PATH from the backend (pty.constants.ts, terminalEnv).
if [ -n "${NIX_STATE_HOME:-}" ]; then
  case ":$PATH:" in
    *":$NIX_STATE_HOME/profile/bin:"*) ;;
    *) PATH="$NIX_STATE_HOME/profile/bin:$PATH" ;;
  esac
  export PATH
fi
