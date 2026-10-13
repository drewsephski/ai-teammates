# video specification

Source: https://x.ai/bot. Brand substitution: Grok → Krafty. All app actions use auth-aware local routes.

## DOM and exact computed styles

```json
{
  "container": {
    "cls": "mx-auto w-full px-4 lg:px-6 xl:max-w-7xl pt-28 pb-24 sm:pt-40 sm:pb-36",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "1084px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1280px",
      "padding": "160px 24px 144px",
      "width": "1280px"
    },
    "tag": "DIV",
    "text": "The SpaceXSI team runs on Grok BotPlay"
  },
  "id": "video",
  "nodes": [
    {
      "cls": "font-display text-3xl tracking-tight text-balance sm:text-4xl mb-10 text-center",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "36px",
        "fontWeight": "500",
        "gap": "normal",
        "height": "40px",
        "letterSpacing": "-0.36px",
        "lineHeight": "40px",
        "maxWidth": "none",
        "padding": "0px",
        "width": "1232px"
      },
      "tag": "H2",
      "text": "The SpaceXSI team runs on Grok Bot"
    }
  ]
}
```

## Mobile (390px)

```json
{
  "container": {
    "cls": "mx-auto w-full px-4 lg:px-6 xl:max-w-7xl pt-28 pb-24 sm:pt-40 sm:pb-36",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "519.938px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "none",
      "padding": "112px 16px 96px",
      "width": "375px"
    },
    "tag": "DIV",
    "text": "The SpaceXSI team runs on Grok BotPlay"
  },
  "id": "video",
  "nodes": [
    {
      "cls": "font-display text-3xl tracking-tight text-balance sm:text-4xl mb-10 text-center",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "30px",
        "fontWeight": "500",
        "gap": "normal",
        "height": "72px",
        "letterSpacing": "-0.3px",
        "lineHeight": "36px",
        "maxWidth": "none",
        "padding": "0px",
        "width": "343px"
      },
      "tag": "H2",
      "text": "The SpaceXSI team runs on Grok Bot"
    }
  ]
}
```

## Behavior

Native scroll; no scroll-driven tabs. Header fixed, border appears after scrolling. Rounded buttons use 200ms color transitions. Roles use click-to-switch with 300ms transitions. Chat preview uses local demo state and timed messages; label it as a demo. Respect reduced motion. FAQ is single-open accordion with first item open.

## Assets

Local assets under public/landing/bot; shared BotMark SVG. Text in extraction is source verbatim, with Krafty substitution. Pricing, supported platforms, security, recording, and scheduling claims must match the app.

## Responsive

640px: headings 30 → 36px and features one → two columns. 1024px: roles stack → two columns. Main max width 1024px; features and statement 1280px. No content overflow.
