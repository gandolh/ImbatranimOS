#!/bin/bash
# In-container entry point (run as the `build` user). Orchestrates the full
# ISO build UNPRIVILEGED via fakeroot:
#   1. build the signed imbatranim-os payload apk into a local repo
#   2. pin + fetch aports, drop in our profile + apkovl generator
#   3. run the official mkimage.sh against main + community + our local repo
#
# Mounts expected:
#   /repo   a pristine HEAD snapshot of the repo (the app is built from source)
#   /work   iso/scripts (read-only): rootfs/, apkbuild/, *.sh
#   /out    host output dir for the finished ISO
set -euo pipefail

: "${ISO_VERSION:=1.0.0}"
: "${ISO_APORTS_REF:=3.22-stable}"
: "${ALPINE_MIRROR:=https://dl-cdn.alpinelinux.org/alpine}"
: "${ALPINE_BRANCH:=v3.22}"

export SCRIPTS=/work
export SRC=/repo
export BUILD="$HOME/b"
LOCALREPO="$BUILD/localrepo"
APORTS="$HOME/aports"
mkdir -p "$BUILD"

echo "############ 1/3  Build payload apk ############"
bash "$SCRIPTS/build-payload.sh"

echo "############ 2/3  Prepare aports ($ISO_APORTS_REF) ############"
if [ ! -d "$APORTS/.git" ]; then
	git clone --depth 1 --branch "$ISO_APORTS_REF" \
		https://gitlab.alpinelinux.org/alpine/aports.git "$APORTS"
fi
echo "aports commit: $(git -C "$APORTS" rev-parse HEAD)"
cp "$SCRIPTS/mkimg.imbatranim.sh" "$SCRIPTS/genapkovl-imbatranim.sh" "$APORTS/scripts/"
# mkimage execs the apkovl generator via fakeroot; the read-only mount may not
# carry the exec bit, so set it on the copies.
chmod +x "$APORTS/scripts/genapkovl-imbatranim.sh"

echo "############ 3/3  Run mkimage (unprivileged, fakeroot) ############"
mkdir -p /out
cd "$APORTS/scripts"
sh mkimage.sh \
	--tag "$ISO_VERSION" \
	--outdir /out \
	--arch x86_64 \
	--repository "$ALPINE_MIRROR/$ALPINE_BRANCH/main" \
	--repository "$ALPINE_MIRROR/$ALPINE_BRANCH/community" \
	--repository "$LOCALREPO" \
	--profile imbatranim \
	--checksum

echo "############ Done ############"
ls -la /out/
