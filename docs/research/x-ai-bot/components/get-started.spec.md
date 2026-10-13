# get-started specification

Source: https://x.ai/bot. Brand substitution: Grok → Krafty. All app actions use auth-aware local routes.

## DOM and exact computed styles

```json
{
  "container": {
    "cls": "mx-auto w-full max-w-[var(--site-content-width)] px-4 pt-24 sm:px-6 sm:pt-32",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "847px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1024px",
      "padding": "128px 24px 0px",
      "width": "1024px"
    },
    "tag": "DIV",
    "text": "Meet your first BotAn AI teammate you can trust to get work doneGet started for freeContact sales"
  },
  "id": "get-started",
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
        "width": "297.859px"
      },
      "tag": "H2",
      "text": "Meet your first Bot"
    },
    {
      "cls": "text-primary text-sm leading-relaxed text-balance sm:text-base",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "16px",
        "fontWeight": "400",
        "gap": "normal",
        "height": "24px",
        "letterSpacing": "normal",
        "lineHeight": "24px",
        "maxWidth": "none",
        "padding": "0px",
        "width": "348.906px"
      },
      "tag": "P",
      "text": "An AI teammate you can trust to get work done"
    }
  ]
}
```

## Mobile (390px)

```json
{
  "container": {
    "cls": "mx-auto w-full max-w-[var(--site-content-width)] px-4 pt-24 sm:px-6 sm:pt-32",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "533.25px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1024px",
      "padding": "96px 16px 0px",
      "width": "375px"
    },
    "tag": "DIV",
    "text": "Meet your first BotAn AI teammate you can trust to get work doneGet started for freeContact sales"
  },
  "id": "get-started",
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
        "width": "250.406px"
      },
      "tag": "H2",
      "text": "Meet your first Bot"
    },
    {
      "cls": "text-primary text-sm leading-relaxed text-balance sm:text-base",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(255, 255, 255)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "14px",
        "fontWeight": "400",
        "gap": "normal",
        "height": "22.75px",
        "letterSpacing": "normal",
        "lineHeight": "22.75px",
        "maxWidth": "none",
        "padding": "0px",
        "width": "306.109px"
      },
      "tag": "P",
      "text": "An AI teammate you can trust to get work done"
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
