# Animation source evidence

Inspected shipped source from https://x.ai/bot on 2026-10-13. Source deployment fingerprint: 5df893138f56f0eb6b89b1370299b01c49261313.

- `2x3dmgtyfwu26.js`: SVG character controller, gaze tracking, blink/body springs, state transitions.
- `2uycf32_3nw2k.js`: original head and eye path geometry/shape math.
- `28l9c_gklv743.js`: feature handover, recording, memory and collaborator sequence controllers; role showcase.
- `0t1icaf4cznhl.js`: timed hero interaction driver.
- `2f77pgmho25c9.js`: interactive demo shell and original tool/computer cards.
- `2qxgawzx_hxyu.js`: original demo transcripts and initial/end hero data.
- `30x61rqxjkax7.css`: original demo theme and layout styles.
- `0dbwbm_4_oxoy.js`: original phone chat window in role showcase.

Downloaded source bundles for inspection to `/tmp/krafty-source-chunks/`. Original DOM, computed styles, asset URLs and states remain in this research directory. The app ports targeted source geometry and choreography into local typed components, with Krafty naming and local app actions. A recorded substitute was removed when the user requested the original interactive elements.

## Character motion

Pointer target: `22 * clamp(dx / width, -.6, .6)`, `14 * clamp(dy / height, -.6, .6)`.
Gaze ease: `1 - exp(60 * log(.84) * dt)`.
Idle body: rotation `1.5 sin(.5t) + .6 sin(.17t)`, x `sin(.27t)`, y `1.2 sin(.85t)`, scaleY `1 + .007 sin(.85t)`.

## FAQ

Uses this repository's shadcn/Base UI Accordion primitives. Height and opacity transition for 300ms; height easing `cubic-bezier(.22,1,.36,1)`. Reduced motion disables the transition.
