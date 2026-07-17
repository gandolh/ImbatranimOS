# ImbatranimOS kiosk-ISO mkimage profile.
#
# Copied into aports/scripts/ by run-mkimage.sh, then invoked as
#   mkimage.sh --profile imbatranim --arch x86_64 ...
#
# Produces a hybrid BIOS+UEFI, diskless (run-from-RAM) ISO. The whole kiosk
# stack is pulled in transitively by our own `imbatranim-os` package (its
# `depends=` list — see scripts/apkbuild/APKBUILD), so the world stays two
# lines: alpine-base + imbatranim-os. The overlay (genapkovl-imbatranim.sh)
# wires OpenRC + the greetd autologin that launches cage + chromium.

profile_imbatranim() {
	title="ImbatranimOS kiosk"
	desc="ImbatranimOS as a bare-metal kiosk appliance.
		Boots straight into fullscreen chromium showing the login.
		Runs entirely from RAM (diskless)."

	profile_base
	profile_abbrev="imb"
	image_name="imbatranimos"
	image_ext="iso"
	output_format="iso"
	arch="x86_64"

	# lts kernel: covers real hardware AND VMs (virt is VM-only, deferred).
	kernel_flavors="lts"

	# Quiet boot so nothing flashes before the browser takes the screen.
	kernel_cmdline="modules=loop,squashfs,sd-mod,usb-storage quiet loglevel=3 console=tty1"
	syslinux_timeout="1"

	# The media package cache. `imbatranim-os` (from our local repo) pulls in
	# nodejs + the whole cage/chromium/seatd/greetd graphical stack via its
	# depends=, so apk fetch --recursive drags every runtime dep onto the ISO.
	apks="alpine-base
		imbatranim-os"

	apkovl="genapkovl-imbatranim.sh"
	hostname="imbatranimos"
}
