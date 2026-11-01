# Krafty role walkthrough delivery — October 27, 2026

Two 20-second animated examples are implemented on the sales-outbound and support-triage role pages. They use actual Krafty components and fonts, the charcoal/teal direction, original synthesized music/SFX, and no voiceover. All content is explicitly sample data. Producing or playing the films performs no external actions.

## Final files

| File                | Dimensions  | Size    | Open                                                               |
| ------------------- | ----------- | ------- | ------------------------------------------------------------------ |
| sales-outbound-16x9 | 1920 × 1080 | 4.37 MB | [MP4](../../public/marketing/walkthroughs/sales-outbound-16x9.mp4) |
| sales-outbound-9x16 | 1080 × 1920 | 4.53 MB | [MP4](../../public/marketing/walkthroughs/sales-outbound-9x16.mp4) |
| support-triage-16x9 | 1920 × 1080 | 4.82 MB | [MP4](../../public/marketing/walkthroughs/support-triage-16x9.mp4) |
| support-triage-9x16 | 1080 × 1920 | 5.21 MB | [MP4](../../public/marketing/walkthroughs/support-triage-9x16.mp4) |

Each file is 20.000 seconds, 1,200 frames at 60 fps, H.264 High / yuv420p, BT.709 primaries/transfer/matrix, AAC stereo at 48 kHz, and MP4 faststart. Every encoded file measures **−14.0 LUFS** integrated and **−1.4 dBTP**. Asset hashes and stream assertions: `.artifacts/seo-follow-up/walkthrough-assets.json`; audio results: `walkthrough-audio-final.json` in the same folder.

Posters are separately framed WebP images, approximately 56–62 KB. English VTT captions and five-step transcripts accompany both films. The transcript is rendered on the server, so the example remains understandable without video.

## Page behavior and verification

The player initially renders a lazy poster and a Play button. There is no video element or MP4 URL in the rendered player until Play. At 640px or below it selects the portrait version; above that, landscape. Playback starts muted with native controls, inline playback, and keyboard focus. A failed video download returns to the poster with a retry message.

Playwright checked the local production build at 1440 × 1000 and 390 × 844 for each role: all four cases passed. In every case there were **zero MP4 requests before Play**, then the correct file loaded and played with the expected dimensions and 20-second duration. Muting, controls, captions, focus, five transcript steps, and no horizontal overflow were asserted. No page errors occurred. Screenshots and machine-readable results: `.artifacts/seo-follow-up/walkthrough-browser/`. The temporary production server on port 3101 was stopped afterward; the existing development server was not stopped or restarted.

`pnpm build`, `pnpm typecheck`, file-scoped ESLint/Prettier checks, and the normal `pnpm test` command passed. The complete suite passed **898 tests, zero failures**. Player regression tests cover intent-only loading, portrait selection, focus, captions and failed-download retry.

## Motion review and source evidence

Both final 60 fps films earned **SHIP, all eight criteria 8/10**, in round 7. The detailed evidence is in each project's `docs/review_log.md`.

| Criterion         | Sales | Support |
| ----------------- | ----: | ------: |
| Hook              |     8 |       8 |
| Phone readability |     8 |       8 |
| Motion quality    |     8 |       8 |
| Variety / pacing  |     8 |       8 |
| Brand accuracy    |     8 |       8 |
| Sound sync        |     8 |       8 |
| Composition       |     8 |       8 |
| Polish            |     8 |       8 |

Final contact sheets:

- [Sales](../../videos/krafty-sales-walkthrough-20261027/review/rfinal/contact.jpg)
- [Support](../../videos/krafty-support-walkthrough-20261027/review/rfinal/contact.jpg)

All **48 deterministic probes** passed: 12 per role and format. The final motion diagnostics show a maximum event gap of 2.8 seconds and a longest low-motion interval of 1.77 seconds inside the 18–20 second end card. Static detection is normalized to 30 fps so the same camera speed is treated consistently at both draft and final frame rates. Full teal cover frames are intentional wipes. These are nonlooping films; a seamless replay is not claimed.

The final shutter check found boundary frames that combined opposite approval states. Native state changes are now declared in `window.CUTS`; the affected frames were regenerated with exact adaptive-shutter samples and replaced, followed by CRF16 encoding with the original AAC stream copied. Original exports remain in each project's `renders/before-native-cuts-*`. Consecutive-frame proof is in `review/rfinal/native-cuts-*.jpg`. The renderer now supports `--frames` and writes BT.709 metadata into the H.264 bitstream for future full renders.

Coarse full-frame sound detection can select cursor or mascot motion rather than the approval press or first readable result. Exact-frame inspection verifies the native interaction and confirmation text against isolated SFX; those observations are documented in the review logs rather than hiding the diagnostic limitation.

The local authoring projects are `videos/krafty-sales-walkthrough-20261027` and `videos/krafty-support-walkthrough-20261027`. They contain approved shotlists, source markup/CSS, native font and brand assets, audio generation, frame-driven authoring, render scripts, and all review rounds. They follow the existing `videos/` ignore rule and remain local. Final media, page integration, and regression tests are working-tree changes.

## Remaining release and measurement work

Nothing was committed, pushed, deployed or published. After an explicitly authorized release, verify the four public media URLs and repeat the homepage mobile performance measurement on Railway. The [SEO follow-up](seo-follow-up-2026-10-27.md) records the sitemap success, 19/25 indexed URLs, current search impressions/clicks, and the limitation that conversion data is unavailable. These role choices remain provisional commercial examples until organic landing-page signup/activation/paid data is connected.

## SKILL FEEDBACK

The approval gate and independent critique loop caught material portrait, clipping and approval-state issues. Exact source-frame sampling, frame-rate-normalized motion diagnostics, and explicit native cut metadata were necessary for reliable final review. On this machine, `/usr/bin/python3` supplied the audio/image dependencies, and Pillow encoded WebP posters because the installed FFmpeg has no libwebp encoder. No paid generation was used.
