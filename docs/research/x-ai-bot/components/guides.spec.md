# guides specification

Source: https://x.ai/bot. Brand substitution: Grok → Krafty. All app actions use auth-aware local routes.

## DOM and exact computed styles

```json
{
  "container": {
    "cls": "mx-auto w-full max-w-[var(--site-content-width)] px-4 py-20 sm:px-6 sm:py-28",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "385.25px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1024px",
      "padding": "112px 24px",
      "width": "1024px"
    },
    "tag": "DIV",
    "text": "Grok Bot GuidesHow PMs, designers, and GTM run Grok Bot day to day.Read the guides"
  },
  "id": "guides",
  "nodes": [
    {
      "cls": "font-display text-3xl tracking-tight text-balance sm:text-4xl",
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
        "width": "261.703px"
      },
      "tag": "H2",
      "text": "Grok Bot Guides"
    },
    {
      "cls": "text-primary max-w-xl text-lg leading-relaxed text-balance",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "18px",
        "fontWeight": "400",
        "gap": "normal",
        "height": "29.25px",
        "letterSpacing": "normal",
        "lineHeight": "29.25px",
        "maxWidth": "576px",
        "padding": "0px",
        "width": "454.953px"
      },
      "tag": "P",
      "text": "How PMs, designers, and GTM run Grok Bot day to day."
    }
  ]
}
```

## Mobile (390px)

```json
{
  "container": {
    "cls": "mx-auto w-full max-w-[var(--site-content-width)] px-4 py-20 sm:px-6 sm:py-28",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "346.5px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1024px",
      "padding": "80px 16px",
      "width": "375px"
    },
    "tag": "DIV",
    "text": "Grok Bot GuidesHow PMs, designers, and GTM run Grok Bot day to day.Read the guides"
  },
  "id": "guides",
  "nodes": [
    {
      "cls": "font-display text-3xl tracking-tight text-balance sm:text-4xl",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "30px",
        "fontWeight": "500",
        "gap": "normal",
        "height": "36px",
        "letterSpacing": "-0.3px",
        "lineHeight": "36px",
        "maxWidth": "none",
        "padding": "0px",
        "width": "219.953px"
      },
      "tag": "H2",
      "text": "Grok Bot Guides"
    },
    {
      "cls": "text-primary max-w-xl text-lg leading-relaxed text-balance",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "18px",
        "fontWeight": "400",
        "gap": "normal",
        "height": "58.5px",
        "letterSpacing": "normal",
        "lineHeight": "29.25px",
        "maxWidth": "576px",
        "padding": "0px",
        "width": "343px"
      },
      "tag": "P",
      "text": "How PMs, designers, and GTM run Grok Bot day to day."
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
