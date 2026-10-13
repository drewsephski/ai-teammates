# Native phone demo specification

Target: `components/landing/bot/role-showcase-phone.tsx`, `role-showcase-cards.tsx`, and the role showcase renderer.
Source: x.ai/bot, lazy chunk `0dbwbm_4_oxoy.js` and `28l9c_gklv743.js`.

Desktop: right 456px column, 730px stage; original 300px-wide/650px-tall phone. Mobile: 300px carousel slides containing 270px-wide/585px-tall phones, 20px gaps. Gray 44px frame, original dynamic island, glass agent name/control pills, original 14px transcript and composer. Content preserves source data and tool-card ordering.

Carousel: original Embla options align=center, containScroll=false, dragFree=true. Selected role synchronizes with drag/swipe and pill clicks; only slides within two of selection mount their phones. Role rows measured from actual pill widths with an additional 21px reserve for inactive avatars and 8px gaps. Description/CTA placement follows source breakpoints at 640/1024px.

Native controls: Back opens the local source chat list. Choosing a role opens its transcript. Computer opens the original bottom sheet and remote desktop demonstration. Application CTA/composer links go to the real auth-aware workspace.

Assets: local original wallpapers and source glyph font; shared source SVG character. Brand text is Krafty. Main hero identity is Drew Sepeczi.

Validation: compare desktop/mobile original and local phone/carousel; test every role, back/list/computer interactions, swipe-selection sync, content overflow and reduced motion.
