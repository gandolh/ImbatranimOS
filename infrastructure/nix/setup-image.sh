#!/bin/sh
# The image-build half of Linux apps under Nix: Nix itself, its config, the
# pinned registry, fontconfig for Nix apps, and /nix owned by imbatranim.
#
# Runs as root during `docker build`, in the prod and dev stages, after the
# imbatranim user exists and after the stage's ENV names the Nix paths
# (NIX_STATE_HOME, NIX_CACHE_HOME, FONTCONFIG_FILE, XDG_RUNTIME_DIR). Nothing
# here downloads a Nix package: apps and the base profile come from the binary
# cache at runtime (entrypoint.sh, the Terminal, the Linux apps pane).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
: "${NIX_STATE_HOME:?}" "${NIX_CACHE_HOME:?}" "${FONTCONFIG_FILE:?}" "${XDG_RUNTIME_DIR:?}"

# Alpine's own build (community repo). It is packaged for a multi-user setup
# with a daemon; this image runs it single-user instead, so its daemon hint
# for login shells has to go.
apk add --no-cache nix
rm -f /etc/profile.d/nix-remote.sh

install -D -m 0644 "$here/nix.conf" /etc/nix/nix.conf

# The pin. The file is copied as is, for the Linux apps pane to read, and its
# commit becomes the system registry's `nixpkgs` entry.
install -m 0644 "$here/nixpkgs-pin.env" /etc/nix/nixpkgs-pin.env
. "$here/nixpkgs-pin.env"
case "$NIXPKGS_COMMIT" in
  *[!0-9a-f]* | '') echo "nixpkgs-pin.env: NIXPKGS_COMMIT is not a commit id" >&2; exit 1 ;;
esac
if [ "${#NIXPKGS_COMMIT}" -ne 40 ]; then
  echo "nixpkgs-pin.env: NIXPKGS_COMMIT must be 40 hex digits" >&2
  exit 1
fi
printf '{"version":2,"flakes":[{"from":{"type":"indirect","id":"nixpkgs"},"to":{"type":"github","owner":"NixOS","repo":"nixpkgs","rev":"%s"}}]}\n' \
  "$NIXPKGS_COMMIT" >/etc/nix/registry.json
chmod 0644 /etc/nix/registry.json

# fontconfig for Nix apps (they bring their own fontconfig, which reads
# FONTCONFIG_FILE). Fonts come from the base profile and the user's profile;
# the cache stays in /nix so the home folder gains nothing.
install -d -m 0755 "$(dirname "$FONTCONFIG_FILE")"
cat >"$FONTCONFIG_FILE" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<!-- Generated at image build by infrastructure/nix/setup-image.sh. -->
<fontconfig>
  <dir>$NIX_STATE_HOME/profiles/imbatranim-base/share/fonts</dir>
  <dir>$NIX_STATE_HOME/profile/share/fonts</dir>
  <cachedir>$NIX_CACHE_HOME/fontconfig</cachedir>
  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
</fontconfig>
EOF
chmod 0644 "$FONTCONFIG_FILE"

install -m 0644 "$here/profile.sh" /etc/profile.d/nix-apps.sh
install -D -m 0755 "$here/base-profile.sh" /usr/local/libexec/imbatranim/nix-base-profile.sh

# /nix belongs to imbatranim: single-user Nix writes the store and its
# database as that user. Docker copies this tree, with its owner, into the
# imbatranim-nix volume the first time the volume is mounted.
install -d -o imbatranim -g imbatranim -m 0755 \
  /nix /nix/store /nix/var /nix/var/nix /nix/var/imbatranim \
  "$NIX_STATE_HOME" "$NIX_CACHE_HOME"

# The runtime directory for Wayland sockets. entrypoint.sh runs as
# imbatranim and can't create anything under /run, so the image makes it and
# the entrypoint keeps it private.
install -d -m 0755 "$(dirname "$XDG_RUNTIME_DIR")"
install -d -o imbatranim -g imbatranim -m 0700 "$XDG_RUNTIME_DIR"
