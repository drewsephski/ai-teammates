---
name: "Krafty application"
description: "A restrained charcoal conversation workspace with source-native teammate characters."
colors:
  background: "#0a0a0a"
  foreground: "#f2f2f2"
  card: "#202020"
  popover: "#262626"
  primary: "#f5f5f5"
  primary-foreground: "#161615"
  secondary: "#333333"
  muted: "#2b2b2b"
  muted-foreground: "#a6a6a6"
  accent: "#353535"
  destructive: "#ff9898"
  border: "#ffffff14"
  input: "#ffffff24"
  ring: "#bcbcbc"
  sidebar: "#161615"
  sidebar-foreground: "#e8e8e8"
  sidebar-accent: "#2b2b2a"
  sidebar-border: "#ffffff0d"
  chat-surface: "#111111"
  light-background: "oklch(1 0 0)"
  light-foreground: "oklch(0.145 0 0)"
  light-primary: "oklch(0.205 0 0)"
  light-primary-foreground: "oklch(0.985 0 0)"
  light-muted: "oklch(0.97 0 0)"
  light-muted-foreground: "oklch(0.556 0 0)"
  light-border: "oklch(0.922 0 0)"
  light-ring: "oklch(0.708 0 0)"
  light-sidebar: "oklch(0.985 0 0)"
  light-destructive: "oklch(0.577 0.245 27.325)"
  light-chat-surface: "#fafafa"
  character-red: "#ff2849"
  character-blue: "#208bff"
  character-purple: "#9455ff"
  character-orange: "#ff8a19"
  character-lime: "#d9f38b"
  character-lilac: "#b5a7fc"
  character-white: "#fafafa"
  character-gray: "#a5a5a5"
  character-green: "#35c76f"
  character-black: "#111111"
typography:
  headline:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: "1.25"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "-0.01em"
  body-large:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "-0.01em"
  label:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "-0.01em"
  pinned-role-label:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "9px"
  receipt-label:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    lineHeight: 1
rounded:
  sm: "0.525rem"
  md: "0.7rem"
  lg: "0.875rem"
  xl: "1.225rem"
  2xl: "1.575rem"
  3xl: "1.925rem"
  full: "9999px"
  composer: "24px"
  bubble: "20px"
  bubble-tail: "6px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "40px"
  button-outline:
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "40px"
  input:
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
    height: "40px"
  nav-row:
    textColor: "{colors.sidebar-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "8px"
    height: "40px"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "2.275rem"
    padding: "2px 8px"
    height: "20px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
  user-message:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "20px 20px 6px 20px"
    padding: "12px 16px"
  pinned-role-label:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.pinned-role-label}"
    padding: "0 4px"
  seen-receipt:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.receipt-label}"
  composer:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.composer}"
---

# Design System: Krafty application

## Overview

**Creative North Star: "The charcoal conversation workspace"**

Krafty extends the user-pinned Grok Bot reference and the existing Krafty landing into a compact, full-height application. The charcoal conversation workspace pairs quiet neutral surfaces, white pill actions, the landing’s self-hosted face, and source-native organic characters. Conversation and the current teammate provide the visual center; navigation, tools, and account controls remain compact.

Dark is the default, with an explicit light theme using the same semantic component roles. Characters supply personality in teammate identities, welcome, empty, and authentication surfaces. Larger decorative characters stay outside ordinary message text. Existing user-selected DiceBear identities remain valid alongside the native characters.

**Key Characteristics:**

- Layered charcoal surfaces and restrained neutral borders.
- White primary actions, rounded controls, and visible keyboard focus.
- Narrow conversation measure with a compact bottom composer.
- Source-native teammate identities and selective, reduced-motion-aware animation.
- Persistent desktop navigation and accessible mobile overlays.

## Colors

The palette is neutral and layered; character identity provides selective color. Frontmatter records dark-default primitives and explicitly named light counterparts. CSS semantic variables in `app/globals.css` remain the runtime authority; shared aliases resolve through that file rather than acquiring competing literal colors.

### Primary

- **Soft white action:** `primary` on `primary-foreground` for consequential actions and submit controls. In light mode these roles reverse to dark ink on pale text.

### Secondary

- **Character colors:** the ten `character-*` choices belong to native teammate avatars. They are identity assets, not additional primary-action themes. Existing DiceBear avatars are rendered through the same identity component.
- **Error rose:** `destructive` and its light counterpart identify invalid fields, destructive actions, and errors.

### Neutral

- **Near-black backdrop:** `background` surrounds the application.
- **Conversation black:** `chat-surface` supplies direct and group chat surfaces and their header.
- **Sidebar charcoal:** `sidebar`, `sidebar-foreground`, and `sidebar-accent` separate navigation and selected rows.
- **Panel charcoal:** `card` and `popover` support content panels and floating menus/dialogs.
- **Quiet fills:** `secondary`, `muted`, and `accent` carry user bubbles, composer/input backgrounds, hover, and selected states.
- **Readable neutrals:** `foreground` and `muted-foreground` distinguish primary text and supporting copy.
- **Quiet edges and focus:** `border`, `sidebar-border`, and `input` separate surfaces; `ring` highlights keyboard focus.
- **Light theme:** light backgrounds/card/popover use the white background primitive; sidebar uses the pale sidebar primitive; muted/secondary/accent use the pale muted primitive. Foreground aliases use the light ink primitive. Input and borders share the light border primitive. The chat retains its separate light conversation surface.

**The neutral chrome rule.** Keep workspace chrome on the semantic neutral palette. Character color identifies a teammate; it does not recolor the entire application.

## Typography

**Display and body face:** the existing local `public/landing/bot/display.woff2` loaded by `next/font/local` as `--font-sans` (variable weight range 200–800). Keep this source file as authority rather than inventing a family name. The marketing surface loads the same asset under its scoped font variable.

**Mono face:** Geist Mono through `--font-mono`, for code and technical content where the existing renderer applies it.

The application uses a compact hierarchy with regular body text and medium headings. The body’s slight negative tracking carries through labels; headings use tighter tracking. It is an observed role ladder rather than a mathematical scale.

### Hierarchy

- **Headline:** the frontmatter headline role serves chat empty states. Page introductions expand to a medium (500) page heading at (30px/36px) on phones and (36px/40px) above the small breakpoint. The authentication introduction has its own larger composition; it is not a shared control size.
- **Title:** the frontmatter title role serves dialog headings. Section headings use medium (500) text at (18px/28px); card titles use medium (500) text at (16px) with snug line height.
- **Body:** the body role carries messages, menus, descriptions, and desktop inputs. Explanatory paragraphs may use relaxed line height (1.625).
- **Body large:** the larger body role carries phone form controls and the composer before the small breakpoint; ordinary shared inputs switch to the body size at the medium breakpoint.
- **Label:** the label role carries identity pills, timestamps, supporting navigation copy, and badges. Use normal sentence case for application labels.

**The conversation measure rule.** Keep message content inside the existing narrow conversation column while allowing the composer a wider measure. Do not stretch ordinary messages across the available desktop width.

## Layout

The application uses full viewport-height shells with separately scrolling content. The desktop sidebar defaults to (256px), adjusts between (208px) and (360px), and is clamped to preserve (480px) for content where viewport width permits. Its draggable rail persists width in the `sidebar_width` cookie and supports keyboard resizing. It collapses to a (48px) icon rail and becomes an (18rem) mobile sheet below the medium breakpoint (768px). Header and footer controls remain separate from the scrollable conversation list. The chat header is (48px) tall, with the identity pill centered between navigation and computer controls.

The message container is capped at (36rem/576px), with (20px) horizontal padding on phones and (32px) from the small breakpoint (640px). That yields the implemented (512px) desktop inner message measure. Message groups cap their width at (95%) of the inner column. The composer is capped at (56rem/896px), with (16px) phone and (24px) small-breakpoint gutters. Keep its lower breathing room and independent measure.

Workspace and pricing content use a centered (64rem/1024px) container, phone gutters (20px), and small-breakpoint gutters (32px). Cards become two columns at the small breakpoint where the content warrants it. Spacing follows the recurring four-pixel rhythm in the frontmatter, with compact control gaps and larger section gaps.

There is one computer per account, shared by all the person's bots, so the Desktop control appears in direct and group chats alike, and the panel says which bot is using it. Reset and pause copy says they affect every bot. The live computer is a resizable side panel on desktop, initially (50%) with a minimum (20%). Below (768px) it occupies a full-screen dialog using the same live viewer. Do not compress it into a phone split pane. Direct-chat settings occupy a separate right panel, initially (360px) with an allowed range of (280–480px); below (768px) they use a full-width sheet. Settings and the computer viewer close each other when opened. Forms and long content scroll within the available viewport.

## Elevation & Depth

Ordinary application panels are flat: surface tone, translucent borders, and thin rings define hierarchy. Shared cards use a foreground-tinted one-pixel ring; workspace cards use muted fill. Authentication and pricing cards explicitly suppress shadow. Floating dialogs use a diffuse ambient shadow and a dark scrim. This is a restrained hybrid, not a universal shadow-free system.

### Shadow Vocabulary

- **Floating dialog ambient:** the shared dialog’s extra-large shadow uses black at (20%): `0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2)`.
- **Overlay scrim:** black at (60%) separates a modal from the application.
- **Focus ring:** shared buttons and inputs use a (3px) ring at (50%) ring color plus a ring-colored border; navigation uses a (2px) ring.

**The tonal depth rule.** Use surface tone and quiet borders for ordinary workspace depth. Reserve ambient shadow for floating overlays rather than adding lift to every card.

Transitions primarily communicate state: button color (150ms), application navigation color (160ms ease-out), composer border and shadow (180ms ease-out), and overlay/sidebar movement (200ms). Tool details use measured height (220ms, cubic-bezier(0.16, 1, 0.3, 1)) with opacity (160ms ease-out). Reduced-motion preferences suppress or minimize these effects; theme changes disable transition.

## Shapes

Actions use full pills; icon actions use circular silhouettes. Shared inputs, navigation rows, assistant bubbles, and cards use the extra-large radius derived from the base radius (0.875rem). Larger workspace cards use the next radius step and dialogs the following step. The composer has its own rounded envelope. User bubbles use the established asymmetric radius (20px 20px 6px 20px): the `bubble` primitive defines the soft body corners and `bubble-tail` defines the tighter trailing corner. This geometry is the source-pinned bubble silhouette, rather than a separate speech-arrow asset.

Source-native teammate characters are shape assets drawn by the existing `BotMark` and character geometry. They are not generic rounded-square application icons. Keep the existing shape/color identity and its subtle pointer-responsive eyes where animation is enabled. Retained DiceBear identities use their existing renderer. The compact identity pill uses a small avatar; the sidebar’s pinned tiles use larger avatars than regular conversation rows.

Chat identities use restrained motion: thinking keeps the silhouette and glances upward, tool work has a small rhythmic movement, and response writing uses an attentive breathing motion. An unanswered question tilts once and settles; a completed response gets one small nod. Only the current author and header identity reflect live activity; historical messages stay still. Group handoffs transfer activity by bot ID, including members beyond the first three visible avatars. Hover and keyboard focus add brief reactions on identity controls. Colors remain stable, with contrasting eye ink and a fine silhouette edge. Reduced motion, offscreen visibility, and hidden tabs pause animation; readable status text carries the same information.

The source-pinned gallery retains its compact (9px) role micro-label as the `pinned-role-label` token. It is a component-specific exception to the main type ramp; keep it confined to this gallery. The (11px) `receipt-label` is similarly confined to message receipts.

## Components

### Buttons

Quiet, rounded, and compact. The canonical default is (40px) tall with medium body-size text and (16px) horizontal padding. Small buttons use (36px), large buttons (48px); compact icon controls retain their existing size variants.

- **Primary:** pale fill and dark text, shifting to (80%) fill opacity on hover.
- **Secondary:** secondary fill and foreground text; hover mixes a small amount (5%) of foreground into the secondary tone.
- **Outline:** quiet border; the dark variant uses translucent input fill, increasing it on hover. Light uses the background surface and muted hover.
- **Ghost:** transparent at rest and a quiet muted hover. Pressed/expanded controls show a tonal state rather than relying on color alone.
- **Focus/disabled/error:** visible ring and border, disabled opacity (50%), and destructive border/ring for invalid controls. Ordinary non-popup actions shift down (1px) while pressed.

### Chips

The shared Badge is compact (20px) tall, medium label text, pill-like radius, and (8px) horizontal padding. Secondary badges use quiet fill; outline badges carry a subtle edge. Group-message addressee badges retain the actual avatar and truncated name. Status and entitlement text reflect real application state.

### Cards / Containers

Shared cards have extra-large corners, card fill, a thin foreground ring, and (16px) internal spacing; the smaller variant uses (12px). Workspace conversation cards use the next radius step, muted fill at (60%), (20px) padding, and full muted fill on hover. Clerk authentication and pricing cards use the same semantic palette and rounded language with shadows suppressed.

### Inputs / Fields

Shared fields are (40px) tall with quiet input borders, extra-large corners, and (12px) horizontal padding. Dark fields use input color at (30%) as fill. Placeholder copy uses muted foreground. Phone input text stays at (16px); shared fields use (14px) from the medium breakpoint. Focus has the shared ring/border treatment; invalid fields use destructive styling and disabled fields are visibly muted.

Bot settings use the existing labeled field and validation patterns in the right panel or mobile sheet; the context-menu editor retains a dialog using the same form. Group editing retains its scrolling dialog. Teammate creation starts a conversation immediately; it has no creation form.

### First-run workspace

Owners without teammates see a two-step introduction in the workspace content area: choose an end-to-end workflow, then connect services and enter the real setup conversation. Six role presets cover researching and delivering a brief, fixing and testing code with a pull request, launch publishing, hands-on training, project coordination, and live-data analysis. Each carries execution and authentication guidance into its real bot configuration. A blank-slate option supports other workflows. The existing creation action, plan checks, and retry identity remain authoritative. A valid role link starts at its preview. Existing teammates bypass this introduction.

Suggested service buttons open the existing app marketplace with a search by display name; Find another app opens its full searchable catalog. Actual provider discovery determines available integrations and connection status. Users authenticate through the provider authorization page. Browser-only services use personal sign-in in the live Desktop, with no passwords or codes in chat. Connecting an app does not sign in the desktop browser or authorize unrelated actions. The introduction explicitly distinguishes connected apps from paid cloud-computer and file capabilities.

Connected app names and logos open the marketplace's Connected tab filtered to that app, with disconnect and reauthentication controls. App logos preserve their full proportions without circular cropping. GitHub uses a light backing in both themes, shared between the workspace and marketplace.

Keep the existing charcoal chrome, page-heading type sizes, native character palette, and white pill actions. Characters provide a quiet introduction beside the choices on desktop and above them on phones; the role illustration is explicitly a preview. Step changes have one brief entrance, disabled under reduced motion, and move keyboard focus to the new heading. Skip is always visible, remembered per account in this browser, and reversible through Resume getting started. Storage failure permits skipping for the current visit. Advanced workspace features sit inside a collapsed More you can do disclosure.

### Navigation

Sidebar destinations use rounded rows with compact icons and medium active text. Hover/active states use the sidebar accent; keyboard focus has its own visible ring. Regular conversation rows are (48px) tall with (32px) avatars, truncated names/previews, and muted timestamps. Pinned teammates appear above conversations with (48px) avatars. The gallery uses two columns and becomes three when its own content container reaches (220px); the collapsed rail uses (16px) avatars and hides tile labels. Selecting a destination closes the mobile sheet.

Pin/Unpin lives in the existing context menu and persists server-side. Pending and failure states belong to the real mutation; the gallery is not a client-only visual toggle. Account, integrations, usage, and billing remain in the footer.

### Conversation and identity pill

The header’s centered identity pill is (32px) tall, label-size medium text, muted fill at (40%), (12px) horizontal padding, and a (24px) avatar. Direct-chat identity opens the right settings panel or full-width mobile sheet, with an explicit expanded state and focus restored to the header control on close. Group identity uses the existing member-avatar composition.

User messages align right with secondary fill and the asymmetric radius. Assistant text sits left in softly rounded muted panels at (30%) fill with (12px/8px) horizontal/vertical padding. Group replies retain the real author’s avatar and addressee identity. A quiet right-aligned `Seen` receipt appears below a user bubble only when the assistant transcript carries a persisted receipt referencing that message; sending or merely starting a reply never implies Seen. Streaming, loading, tool results, and errors remain visible and truthful. Waiting uses one muted, body-size `Thinking…` status through the shared TextShimmer until the first visible assistant text, questionnaire, or tool response appears; it does not continue alongside the reply. The shimmer uses a linear two-second cycle, theme foreground highlights over a muted-foreground base, and a still readable label under reduced motion.

Browser authentication uses a compact muted card in the existing conversation column, showing the service, its domain, one short instruction, Open sign-in, and I’m signed in. Cancel is an accessible icon action. Open sign-in opens the existing live computer in an interactive full-screen view on desktop and phones; credentials never go through chat. Opening or closing the viewer does not resume the agent. The person confirms completion in chat, and the agent checks the screen before continuing. Login cards use the existing question lifecycle and suppress follow-up suggestions while unanswered. Older app builds retain the question and choices fallback. The computer remains subject to its plan and usage limits.

### Bot settings and appearance

Appearance comes first, followed by Identity and Role. The native preview is (64px) beside Shuffle. Shape choices show all eighteen source shapes in a six-column grid, using (28px) native avatar previews inside (40px) controls. The selected shape has muted fill and a thin ring; every choice has an accessible shape name and pressed state.

The ten colors form a five-column grid with two even rows: Red, Blue, Violet, Orange, Lime, Lavender, White, Gray, Green, and Black. Circular color swatches are (20px), inside (32px) controls, with a quiet border and a selected ring/offset. Preserve the actual palette order and stored avatar identity. Black characters use white eye details and a subtle gray visibility edge (`drop-shadow(0 0 0.5px #a5a5a5)`) through the shared avatar renderer, including their settings previews and sidebar identities.

Identity contains Name; Role contains Job and working instructions. Fields scroll independently of the panel footer. Save is disabled until dirty and while submitting; failures retain entered changes. The desktop close control and mobile sheet preserve the existing focus behavior. The appearance preview is application identity, not a replacement creation flow.

### Composer and setup choices

Direct chat starts with a single-line rounded composer: a transparent textarea inside muted fill, a quiet input border, and a circular submit/stop action vertically centered at the right edge. Textarea height can expand with content. Submitted and streaming turns replace the send arrow with the Stop square. Group chat retains a recipient selector and its footer tools. Enter and submit behavior remain the existing prompt-input behavior.

Setup begins with an actual assistant greeting. Choices use the existing Questionnaire unchanged, inside its muted rounded wrapper; users can choose an option, type their own answer, or dismiss the question and explain in chat. Do not restyle the Questionnaire to imitate marketing buttons. The computer is provisioned on demand and its controls reflect actual access, plan, and allowance states.

## Do's and Don'ts

### Do:

- **Do** reuse semantic theme variables and the bundled landing face.
- **Do** retain the compact centered identity pill, narrow message column, and wider bottom composer.
- **Do** keep avatar identity intact across pinned tiles, rows, headers, and group messages.
- **Do** keep mobile navigation reachable and the live computer in a full-screen phone view.
- **Do** preserve visible focus, real loading and failure states, readable form controls, and reduced-motion behavior.
- **Do** reuse the existing Questionnaire for setup choices and the shared bot settings form for subsequent edits.

### Don't:

- **Don’t** replace the local display face with a system display font or introduce a competing accent palette.
- **Don’t** use oversized decorative characters inside ordinary conversation messages.
- **Don’t** add hard offset shadows to the charcoal workspace.
- **Don’t** show invented conversations, billing data, connected services, or successful work as application state.
- **Don’t** turn the isolated pinned role micro-label into the application’s reusable type scale.
