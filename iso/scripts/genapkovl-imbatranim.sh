#!/bin/sh -e
# Generates the ImbatranimOS apkovl: the /etc overlay the diskless initramfs
# applies to the tmpfs root at boot. It stays TINY on purpose — the app
# payload rides in the imbatranim-os .apk (pulled from the media at boot),
# not here. This overlay only carries system config + the OpenRC wiring:
#
#   /etc/apk/world      alpine-base + imbatranim-os (initramfs installs these,
#                       and imbatranim-os drags in the whole kiosk stack)
#   /etc/inittab        getty-free: greetd owns vt1, nothing else touches the
#                       screen -> no console, no shell flash
#   runlevels           udev + networking + dbus/seatd/greetd + backend
#
# Modeled on aports/scripts/genapkovl-dhcp.sh.

HOSTNAME="$1"
if [ -z "$HOSTNAME" ]; then
	echo "usage: $0 hostname"
	exit 1
fi

cleanup() {
	rm -rf "$tmp"
}

makefile() {
	OWNER="$1"
	PERMS="$2"
	FILENAME="$3"
	cat > "$FILENAME"
	chown "$OWNER" "$FILENAME"
	chmod "$PERMS" "$FILENAME"
}

rc_add() {
	mkdir -p "$tmp"/etc/runlevels/"$2"
	ln -sf /etc/init.d/"$1" "$tmp"/etc/runlevels/"$2"/"$1"
}

tmp="$(mktemp -d)"
trap cleanup EXIT

mkdir -p "$tmp"/etc
makefile root:root 0644 "$tmp"/etc/hostname <<EOF
$HOSTNAME
EOF

# The packages the diskless initramfs installs into tmpfs at boot. imbatranim-os
# depends on nodejs + chromium + cage + seatd + greetd + eudev + dbus + fonts,
# so those all come along.
mkdir -p "$tmp"/etc/apk
makefile root:root 0644 "$tmp"/etc/apk/world <<EOF
alpine-base
imbatranim-os
EOF

# DHCP on the first NIC; loopback for the local backend on :8080.
mkdir -p "$tmp"/etc/network
makefile root:root 0644 "$tmp"/etc/network/interfaces <<EOF
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
EOF

# getty-free inittab: greetd (vt=1) is the ONLY thing on the screen. No getty
# means no cursor flash to a shell and no tty login surface.
makefile root:root 0644 "$tmp"/etc/inittab <<EOF
# ImbatranimOS kiosk inittab — no getty; greetd owns the console.
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default

# Serial console getty left available for debugging (commented by default).
#ttyS0::respawn:/sbin/getty -L 115200 ttyS0 vt100

::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
EOF

# --- OpenRC service wiring -------------------------------------------------
# Device management via eudev (wlroots/cage want udev for input + GPU).
rc_add devfs sysinit
rc_add dmesg sysinit
rc_add udev sysinit
rc_add udev-trigger sysinit
rc_add udev-settle sysinit
rc_add modloop sysinit

rc_add hwclock boot
rc_add modules boot
rc_add sysctl boot
rc_add hostname boot
rc_add bootmisc boot
rc_add syslog boot
rc_add networking boot

# The kiosk stack.
rc_add dbus default
rc_add seatd default
rc_add imbatranim-backend default
rc_add greetd default

rc_add mount-ro shutdown
rc_add killprocs shutdown
rc_add savecache shutdown

tar -c -C "$tmp" etc | gzip -9n > "$HOSTNAME".apkovl.tar.gz
