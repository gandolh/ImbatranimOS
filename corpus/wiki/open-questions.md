---
summary: Genuinely unresolved items — each now owned by a specific brief as a gate, none free-floating.
updated: 2026-07-16
---

# Open questions

All previously free-floating questions were either decided in the
2026-07-16 product grilling or assigned to a brief as an explicit gate:

- **Does chroot-in-privileged-Docker-on-WSL2 behave?** Gate at the top of
  [brief 01](../briefs/todo/01-build-scaffold.md) — smoke-test first; if it
  fails, the Hyper-V VM fallback is a conscious decision, not a workaround.
- **Which accent color(s) on the B&W identity?** Decided from rendered
  mockups inside [brief 03](../briefs/todo/03-identity-theming.md); the
  pick gets recorded in [decisions.md](decisions.md).
- **Does the 2GB RAM floor hold in practice?** Validated in
  [brief 07](../briefs/todo/07-v1-release.md); a failure formally revisits
  the floor decision.

Resolved 2026-07-16 (third grilling; history in log.md): media player
(VLC), distribution (build-from-source, no hosted ISO), desktop feel
(Win7-classic, modern flat), hardware floor (2GB zram / 4GB rec, hybrid
UEFI+BIOS), Secure Boot (Ubuntu shim) + dual-boot (supported), updates
(notify + one-click), language (English-only v1), versioning (semantic),
Welcome scope (tour + status check).
