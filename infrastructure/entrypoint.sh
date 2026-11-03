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

# The base Nix profile (fonts and locales for Linux apps) comes in the image
# and is copied into a new /nix volume. A volume made before it never gets it;
# boot doesn't download it, it says so.
if [ -n "${NIX_STATE_HOME:-}" ] && [ ! -e "$NIX_STATE_HOME/profiles/imbatranim-base" ]; then
  echo "entrypoint: the Nix base profile is missing from /nix; Linux apps will have no fonts or locales. Recreate the Nix volume to get it from the image." >&2
fi

exec "$@"
