# statement specification

Source: https://x.ai/bot. Brand substitution: Grok → Krafty. All app actions use auth-aware local routes.

## DOM and exact computed styles

```json
{
  "container": {
    "cls": "mx-auto w-full px-4 lg:px-6 xl:max-w-7xl py-12 sm:py-16",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "480px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1280px",
      "padding": "64px 24px",
      "width": "1280px"
    },
    "tag": "DIV",
    "text": "Message Bots like teammatesGive tasks to Bots like you would a teammate on desktop or iOS. Your AI teammates take projects from start to end, keep context on how you work and get smarter over time, and come back when your approval is needed."
  },
  "id": "statement",
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
        "width": "666.562px"
      },
      "tag": "H2",
      "text": "Message Bots like teammates"
    },
    {
      "cls": "text-theme-text-muted max-w-md text-base leading-relaxed text-pretty sm:text-lg sm:leading-relaxed",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(125, 129, 135)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "18px",
        "fontWeight": "400",
        "gap": "normal",
        "height": "146.25px",
        "letterSpacing": "normal",
        "lineHeight": "29.25px",
        "maxWidth": "448px",
        "padding": "0px",
        "width": "448px"
      },
      "tag": "P",
      "text": "Give tasks to Bots like you would a teammate on desktop or iOS. Your AI teammates take projects from start to end, keep context on how you work and get smarter over time, and come back when your approval is needed."
    }
  ]
}
```

## Mobile (390px)

```json
{
  "container": {
    "cls": "mx-auto w-full px-4 lg:px-6 xl:max-w-7xl py-12 sm:py-16",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "normal",
      "height": "574px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "none",
      "padding": "48px 16px",
      "width": "375px"
    },
    "tag": "DIV",
    "text": "Message Bots like teammatesGive tasks to Bots like you would a teammate on desktop or iOS. Your AI teammates take projects from start to end, keep context on how you work and get smarter over time, and come back when your approval is needed."
  },
  "id": "statement",
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
        "height": "72px",
        "letterSpacing": "-0.3px",
        "lineHeight": "36px",
        "maxWidth": "none",
        "padding": "0px",
        "width": "279px"
      },
      "tag": "H2",
      "text": "Message Bots like teammates"
    },
    {
      "cls": "text-theme-text-muted max-w-md text-base leading-relaxed text-pretty sm:text-lg sm:leading-relaxed",
      "css": {
        "backgroundColor": "rgba(0, 0, 0, 0)",
        "borderRadius": "0px",
        "color": "rgb(125, 129, 135)",
        "fontFamily": "xVf, \"xVf Fallback\"",
        "fontSize": "16px",
        "fontWeight": "400",
        "gap": "normal",
        "height": "182px",
        "letterSpacing": "normal",
        "lineHeight": "26px",
        "maxWidth": "448px",
        "padding": "0px",
        "width": "279px"
      },
      "tag": "P",
      "text": "Give tasks to Bots like you would a teammate on desktop or iOS. Your AI teammates take projects from start to end, keep context on how you work and get smarter over time, and come back when your approval is needed."
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
