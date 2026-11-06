---
title: URL apps install natively once trusted
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# URL apps install natively once trusted

An app installed from a URL runs natively, in the desktop's page like a Marketplace app, instead of in a sandboxed frame. A verified app (listed as verified by imbatranim) installs smoothly; an unverified one first shows a warning like Windows' unknown-publisher prompt, and installs natively only if the owner trusts it.

From the imbatranim-apps grill on 2026-11-06. The owner: "should run as the
native one. In our official marketplace repo for imbatranim we can have a
JSON for verified ones, so that installing a verified one installs
smoothly. If it is not verified, it should show a pop-up at installation
like windows does with un-checked sources, if you say you trust it, you can
go forward to install it natively." This revisits the 2026-10-07 decision
that URL apps always run sandboxed, prebuilt, with `notify` only
([decisions-marketplace.md](../wiki/decisions-marketplace.md)). Grill the
open questions below when the work starts, then promote this to a numbered
brief.

## Open questions (grill before starting)

Settled on 2026-11-06:
- URL apps can run natively;
- verified ones install without a warning;
- unverified ones show a warning and install natively only when trusted.

1. **Where does the verified list live, and how does the OS read it?**
   Answered 2026-11-06: a `verified.json` in imbatranim-apps, each entry a repo
   and a pinned commit. The OS reads it at a commit pinned with each OS
   release, so nothing changes between updates and an OS update brings the
   newer list.
2. **Does the warning keep a sandboxed choice?** Answered 2026-11-06: no.
   Like Windows, it offers trust or cancel. The sandboxed URL-app path (the
   frame, its tokens and its share of the keyboard guard) can be retired in
   its own todo once nothing uses it; the Browser's frame keeps what it needs.
3. **What does a native URL app run as?** Answered 2026-11-06: yes.
4. **Updates.** Answered 2026-11-06: yes.

## Draft brief

Written after the grill settles the questions above.
