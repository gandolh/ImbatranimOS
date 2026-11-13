---
title: Image Viewer groups a folder's photos by date
created: 2026-11-13
status: open
tags: [later, image-viewer]
---

# Image Viewer groups a folder's photos by date

The owner asked for this on 2026-11-13, grilling the self-hosted tools
research in vps-deploy (its `self-hosted-tools-adopt-or-borrow.md`, the
PhotoPrism section). PhotoPrism indexes a folder of photos where it is and
keeps the files as the truth instead of importing them. imbatranimOS already
decided the same for app data (files on disk, no hidden store).

The idea: Image Viewer, opened on a folder, can show its photos grouped by
the date each was taken, newest first, read from the photo's EXIF
`DateTimeOriginal`, falling back to the file's modified time. No database
and no index file: the grouping is worked out when the folder opens.

Image Viewer stays built in (the 2026-11-06 imbatranim-apps grill), so this
is OS work, not an imbatranim-apps group.

## Questions for the grill

- Where the grouping shows: a view inside Image Viewer, or a mode in Files.
- Reading EXIF in the browser (a small parser; "lightweight is identity")
  or in the backend, and how large a folder must stay fast.
- Photos without EXIF (screenshots, edits): grouped by modified time, or
  in their own group.
