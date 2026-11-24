#!/bin/sh
# Builds the production image as a deploy should: the slow parts once, the code every time.
#
#   infrastructure/image.sh [--dry-run] [--no-prune] [-- <docker build options for the bases>]
#
# The Dockerfile's slow parts are stages of their own (see "Prebuilt bases" at its top): runtime-base
# (Alpine packages and Nix), wayland-host-bin (the Rust host's binary), deps (the build's node_modules)
# and proddeps-bin (production's). Each is built here once, as a local image tagged by a hash of what it
# is made from: its text in the Dockerfile, the files it copies, and the same for each stage it builds on
# or copies from (for the `manifests` stage, the normalised manifests it writes, so the version every
# commit bumps changes nothing). An existing tag is reused; missing ones are built side by side. Then
# `docker compose build imbatranimos` runs with those tags as build arguments, so it builds only the code.
#
# Tagged images are not build cache: BuildKit's garbage collection (cache mounts unused for 48 hours go)
# and `docker builder prune` leave them. Afterwards each base keeps its newest two tags (the one in use
# and the one before, for a rollback), and the images earlier builds of imbatranimos left untagged are
# removed. `docker image prune -a` would remove the bases too (no container uses them): prune with
# `--filter label!=imbatranim.base` instead.
#
# Needs only docker with compose, and a POSIX shell with sha256sum, find, sort and awk.
# COMPOSE_FILE, if set, is used instead of infrastructure/docker-compose.yml.
set -eu

cd "$(dirname "$0")/.."
DOCKERFILE=infrastructure/Dockerfile
BASES="runtime-base wayland-host-bin deps proddeps-bin"
KEEP=2
DRY_RUN=0
PRUNE=1
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-prune) PRUNE=0 ;;
    --) shift; break ;;
    *) echo "image.sh: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
# What is left in "$@" goes to each base's docker build (e.g. --network host).

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The text of one stage: its FROM line to the line before the next FROM.
stage_text() {
  awk -v name="$1" '/^FROM / { inside = ($NF == name) } inside { print }' "$DOCKERFILE"
}

# The stages of this file a stage builds on or copies from.
stage_refs() {
  stages=$(awk '/^FROM / && $(NF-1) == "AS" { print $NF }' "$DOCKERFILE")
  stage_text "$1" | awk '
    /^FROM / { print $2 }
    /^COPY / { for (i = 2; i <= NF; i++) if ($i ~ /^--from=/) { sub(/^--from=/, "", $i); print $i } }
  ' | while read -r ref; do
    for s in $stages; do [ "$s" = "$ref" ] && echo "$ref"; done
  done | LC_ALL=C sort -u
}

# The local sources of a stage's COPY lines (not --from): every argument but the last, flags left out.
stage_sources() {
  stage_text "$1" | awk '
    /^COPY / && !/--from=/ {
      n = 0
      for (i = 2; i < NF; i++) if ($i !~ /^--/) src[n++] = $i
      for (i = 0; i < n; i++) print src[i]
    }
  '
}

# A digest of files, paths included, contents only (no times or owners): the same tree hashes the same.
hash_files() {
  LC_ALL=C sort -u | while read -r file; do
    printf '%s\n' "$file"
    sha256sum <"$file"
  done | sha256sum | cut -c1-64
}

# The normalised manifests deps and proddeps install from, as the manifests stage writes them.
manifests_hash() {
  docker build -q -f "$DOCKERFILE" --target manifests --output "type=local,dest=$tmp/manifests" "$@" . >/dev/null
  (cd "$tmp/manifests" && find . -type f | hash_files)
}

# A stage's hash: the syntax line, its text, its sources, and the hashes of the stages it uses.
stage_hash() {
  stage=$1
  shift
  if [ -f "$tmp/hash-$stage" ]; then cat "$tmp/hash-$stage"; return; fi
  if [ "$stage" = manifests ]; then
    manifests_hash "$@" >"$tmp/hash-$stage"
    cat "$tmp/hash-$stage"
    return
  fi
  {
    sed -n '1p' "$DOCKERFILE"
    stage_text "$stage"
    for source in $(stage_sources "$stage"); do
      # shellcheck disable=SC2086 # a COPY source may be a glob
      for match in $source; do
        [ -e "$match" ] || { echo "image.sh: $match is missing" >&2; exit 1; }
        find "$match" -type f -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*'
      done
    done | hash_files
    for ref in $(stage_refs "$stage"); do
      printf '%s %s\n' "$ref" "$(stage_hash "$ref" "$@")"
    done
  } | sha256sum | cut -c1-16 >"$tmp/hash-$stage"
  cat "$tmp/hash-$stage"
}

args=""
pids=""
for stage in $BASES; do
  tag="imbatranim-$stage:$(stage_hash "$stage" "$@")"
  if docker image inspect "$tag" >/dev/null 2>&1; then
    echo "image.sh: $stage: reusing $tag"
  elif [ "$DRY_RUN" = 1 ]; then
    echo "image.sh: $stage: would build $tag"
  else
    echo "image.sh: $stage: building $tag (log: $tmp/$stage.log)"
    docker build -f "$DOCKERFILE" --target "$stage" --label "imbatranim.base=$stage" -t "$tag" "$@" . \
      >"$tmp/$stage.log" 2>&1 &
    pids="$pids $!:$stage"
  fi
  case "$stage" in
    runtime-base) args="$args RUNTIME_BASE=$tag" ;;
    wayland-host-bin) args="$args WAYLAND_HOST=$tag" ;;
    deps) args="$args BUILD_DEPS=$tag" ;;
    proddeps-bin) args="$args PROD_DEPS=$tag" ;;
  esac
done
failed=0
for entry in $pids; do
  if ! wait "${entry%%:*}"; then
    echo "image.sh: ${entry#*:} failed; the end of its log:" >&2
    tail -n 30 "$tmp/${entry#*:}.log" >&2
    failed=1
  fi
done
[ "$failed" = 0 ] || exit 1

if [ "$DRY_RUN" = 1 ]; then
  echo "image.sh: would run docker compose build imbatranimos with$args"
  exit 0
fi

# The compose file reads the four arguments from the environment (unset, they name the stages).
if [ -z "${COMPOSE_FILE:-}" ]; then set -- -f infrastructure/docker-compose.yml; else set --; fi
# shellcheck disable=SC2086 # NAME=value words for env
env $args docker compose "$@" build imbatranimos

[ "$PRUNE" = 1 ] || exit 0
# Each base keeps its newest $KEEP tags; older ones go (their layers stay while an image uses them).
for stage in $BASES; do
  docker image ls "imbatranim-$stage" --format '{{.CreatedAt}}	{{.Repository}}:{{.Tag}}' | LC_ALL=C sort -r |
    tail -n "+$((KEEP + 1))" | cut -f2 | while read -r old; do
      echo "image.sh: removing $old"
      docker image rm "$old" >/dev/null || true
    done
done
# The images earlier builds of imbatranimos left untagged. Only dangling ones, and only ours.
docker image prune -f --filter "label=org.opencontainers.image.title=ImbatranimOS" >/dev/null
