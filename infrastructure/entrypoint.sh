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

exec "$@"
