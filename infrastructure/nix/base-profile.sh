#!/bin/sh
# Installs the base profile Nix apps need on a host that isn't NixOS: one font
# package and the smallest cached UTF-8 locale archive, both at the pinned
# nixpkgs. entrypoint.sh starts it in the background on every boot; it does
# nothing once the profile exists.
#
# The /nix volume starts empty, so the first boot with network fills it. With
# no network the install fails, this logs it, and the OS carries on; Linux
# apps then lack fonts and locales until a later boot succeeds.
set -u

if [ -z "${NIX_STATE_HOME:-}" ] || ! command -v nix >/dev/null 2>&1; then
  exit 0
fi

base="$NIX_STATE_HOME/profiles/imbatranim-base"
[ -e "$base" ] && exit 0

log() { printf '%s nix-base-profile: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

mkdir -p "$NIX_STATE_HOME/profiles"
log "installing $base (dejavu_fonts, glibcLocalesUtf8)"
if nix profile add --profile "$base" nixpkgs#dejavu_fonts nixpkgs#glibcLocalesUtf8; then
  log "installed"
else
  log "install failed; Linux apps have no fonts or locales until a later boot installs them"
fi
