---
title: The Image Viewer's grid says "No images" when the folder can't be read
created: 2026-11-19
status: promoted
tags: [bug, image-viewer]
---

# The Image Viewer's grid says "No images" when the folder can't be read

Promoted 2026-11-19 to [brief 95](../briefs/todo/95-the-image-viewer-says-when-a-folder-cant-be-read.md).

Found by the brief-auditor's check of [brief 90](../briefs/done/90-image-viewer-groups-a-folders-photos-by-date.md).

When listing the folder fails, or the opened file is no longer among the folder's images (deleted, renamed), the viewer sets its siblings to an empty list (`apps/add-ons/image-viewer/src/ImageViewer.tsx`, the sibling effect). The single view then shows the opened path alone, which is right. The By date grid shows "No images in this folder" (`DateGrid.tsx`), which is wrong when the listing failed: the folder may be full of photos.

A fix tells the two apart: a failed listing shows "Couldn't read this folder" with a retry, and a missing file keeps today's single view. A test for each, the failure through a rejected `/files` call.
