# download specification

Source: https://x.ai/bot. Brand substitution: Grok → Krafty. All app actions use auth-aware local routes.

## DOM and exact computed styles

```json
{
  "container": {
    "cls": "mx-auto grid w-full max-w-[var(--site-content-width)] gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-16",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "64px",
      "height": "396px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1024px",
      "padding": "112px 24px",
      "width": "1024px"
    },
    "tag": "DIV",
    "text": "Download Grok BotOne team, wherever you are \u2014 on your desk and in your pocket.macOSApple siliconMore downloadsOther platforms and devices"
  },
  "id": "download",
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
        "width": "456px"
      },
      "tag": "H2",
      "text": "Download Grok Bot"
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
        "height": "58.5px",
        "letterSpacing": "normal",
        "lineHeight": "29.25px",
        "maxWidth": "448px",
        "padding": "0px",
        "width": "448px"
      },
      "tag": "P",
      "text": "One team, wherever you are \u2014 on your desk and in your pocket."
    }
  ]
}
```

## Mobile (390px)

```json
{
  "container": {
    "cls": "mx-auto grid w-full max-w-[var(--site-content-width)] gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-16",
    "css": {
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "borderRadius": "0px",
      "color": "rgb(255, 255, 255)",
      "fontFamily": "xVf, \"xVf Fallback\"",
      "fontSize": "16px",
      "fontWeight": "400",
      "gap": "40px",
      "height": "476px",
      "letterSpacing": "normal",
      "lineHeight": "24px",
      "maxWidth": "1024px",
      "padding": "80px 16px",
      "width": "375px"
    },
    "tag": "DIV",
    "text": "Download Grok BotOne team, wherever you are \u2014 on your desk and in your pocket.macOSApple siliconMore downloadsOther platforms and devices"
  },
  "id": "download",
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
        "width": "343px"
      },
      "tag": "H2",
      "text": "Download Grok Bot"
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
        "height": "52px",
        "letterSpacing": "normal",
        "lineHeight": "26px",
        "maxWidth": "448px",
        "padding": "0px",
        "width": "343px"
      },
      "tag": "P",
      "text": "One team, wherever you are \u2014 on your desk and in your pocket."
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
