---
name: media-optimizer
description: Optimize screenshots to WebP and video loops to lightweight muted MP4 for web landing pages.
---
When adding or optimizing images and videos for the website:
1. Convert PNG/JPG screenshots to `.webp` (quality 82-85, max width 1920px) using `sharp` or `cwebp`.
2. Export video loops as muted `.mp4` (H.264, `yuv420p`, `-an`, target < 2MB, 3-4 seconds) with a matching `.webp` poster image.
3. Always use `loading="lazy"` on below-the-fold images and preserve 16:9 aspect ratio containers to prevent layout shift.
