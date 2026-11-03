#!/bin/sh
# The image-build half of Linux apps under Nix: Nix itself, its config, the
# pinned registry, fontconfig for Nix apps, /nix owned by imbatranim and
# holding the base profile, and the pinned snapshot's package index.
#
# Runs as root during `docker build`, in the prod and dev stages, after the
# imbatranim user exists and after the stage's ENV names the Nix paths
# (NIX_STATE_HOME, NIX_CACHE_HOME, FONTCONFIG_FILE, XDG_RUNTIME_DIR). It needs
# the network: releases.nixos.org, github.com (the pinned nixpkgs source) and
# cache.nixos.org. Booting the image never does; only installing an app does.
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
case "$NIXPKGS_SNAPSHOT" in
  '')
    cat >&2 <<MSG
nixpkgs-pin.env: NIXPKGS_SNAPSHOT is empty. Open https://channels.nixos.org/$NIXPKGS_RELEASE,
which redirects to https://releases.nixos.org/nixos/<version>/<snapshot>/, and copy
<snapshot> into infrastructure/nix/nixpkgs-pin.env. Its git-revision must equal
NIXPKGS_COMMIT ($NIXPKGS_COMMIT); if it doesn't, move NIXPKGS_COMMIT too.
MSG
    exit 1 ;;
  *[!A-Za-z0-9._-]*) echo "nixpkgs-pin.env: NIXPKGS_SNAPSHOT is not a snapshot name" >&2; exit 1 ;;
esac
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

# /nix belongs to imbatranim: single-user Nix writes the store and its
# database as that user. Docker copies this tree, with its owner, into the
# imbatranim-nix volume the first time the volume is mounted.
install -d -o imbatranim -g imbatranim -m 0755 \
  /nix /nix/store /nix/var /nix/var/nix /nix/var/imbatranim \
  "$NIX_STATE_HOME" "$NIX_CACHE_HOME"

# The base profile Nix apps need on a host that isn't NixOS: one font package
# and the UTF-8 locale archive, at the pin. It goes into the image's /nix,
# which Docker copies into a new imbatranim-nix volume, so a first boot works
# offline. The pinned nixpkgs source it was evaluated from is collected
# afterwards: the first app install fetches it again, and the image stays slim.
su -s /bin/sh imbatranim -c '
  set -eu
  mkdir -p "$NIX_STATE_HOME/profiles"
  nix profile add --profile "$NIX_STATE_HOME/profiles/imbatranim-base" \
    nixpkgs#dejavu_fonts nixpkgs#glibcLocalesUtf8
  nix store gc
  rm -rf "$NIX_CACHE_HOME"/*
'

# The snapshot's package index, for the Linux apps pane to search offline.
# Taken from the pinned snapshot's own directory, and checked against the
# commit, so the list always matches what installs.
index_dir=/usr/share/imbatranim/nix
snapshot_url="https://releases.nixos.org/nixos/${NIXPKGS_RELEASE#nixos-}/$NIXPKGS_SNAPSHOT"
install -d -m 0755 "$index_dir"
wget -q -O "$index_dir/git-revision" "$snapshot_url/git-revision"
if [ "$(cat "$index_dir/git-revision")" != "$NIXPKGS_COMMIT" ]; then
  echo "nixpkgs-pin.env: $NIXPKGS_SNAPSHOT was built from $(cat "$index_dir/git-revision"), not NIXPKGS_COMMIT ($NIXPKGS_COMMIT)" >&2
  exit 1
fi
wget -q -O "$index_dir/packages.json.br" "$snapshot_url/packages.json.br"
chmod 0644 "$index_dir/git-revision" "$index_dir/packages.json.br"

# The runtime directory for Wayland sockets. entrypoint.sh runs as
# imbatranim and can't create anything under /run, so the image makes it and
# the entrypoint keeps it private.
install -d -m 0755 "$(dirname "$XDG_RUNTIME_DIR")"
install -d -o imbatranim -g imbatranim -m 0700 "$XDG_RUNTIME_DIR"
