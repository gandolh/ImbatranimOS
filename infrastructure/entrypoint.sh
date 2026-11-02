#!/bin/sh
# First-run init for the imbatranim home. Idempotent: safe on every start,
# whether the /home/imbatranim volume is fresh or already populated. The DB
# itself is created by the backend (better-sqlite3) on boot; we only ensure
# the directories it and the apps expect exist.
set -e

: "${DB_PATH:=/home/imbatranim/.imbatranim/db.sqlite}"
: "${NOTES_DIR:=/home/imbatranim/notes}"
: "${CONFIGS_DIR:=/home/imbatranim/.imbatranim/configs}"

mkdir -p "$(dirname "$DB_PATH")" "$NOTES_DIR" "$CONFIGS_DIR"

# Linux apps. The runtime directory holds the Wayland sockets; the image
# creates it (this script runs as imbatranim and can't write under /run), and
# it stays private to imbatranim.
if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
  mkdir -p "$XDG_RUNTIME_DIR" && chmod 0700 "$XDG_RUNTIME_DIR" ||
    echo "entrypoint: cannot prepare XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR; Linux apps won't start" >&2
fi

# The base Nix profile (fonts and locales for Linux apps), in the background
# so that boot never waits on the network. It does nothing once installed.
base_profile=/usr/local/libexec/imbatranim/nix-base-profile.sh
if [ -x "$base_profile" ]; then
  "$base_profile" &
fi

exec "$@"
