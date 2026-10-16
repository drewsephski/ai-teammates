# Krafty

Krafty is an authenticated workspace for AI teammates. A workspace owner creates a bot, configures its name, role, and working instructions in conversation, and returns to its persistent chat. The AI sends the first setup message and offers choices through the existing Questionnaire component. Bots can be pinned above the sidebar conversation list.

Teammates share one persistent cloud computer per account, so files and browser sign-ins carry over between bots, along with saved memory, connected apps, group chats, and specialist handoffs. The computer is provisioned when first requested, rather than during conversational setup. Actual computer access and AI usage are gated by the owner's plan and remaining allowances. Usage and billing display real account data through the existing Clerk integration.

The web application uses Next.js, React, TypeScript, Tailwind, and shadcn/Base UI components. Clerk protects account-specific routes. Trigger.dev runs durable chat agents and background tasks; E2B supplies interactive computers. The current setup flow can record a desired cadence in working instructions but cannot activate a recurring schedule.

The user has pinned the Grok Bot visual reference at https://x.ai/bot and the supplied setup/sidebar screenshot: quiet charcoal surfaces, compact chat bubbles, original organic blob characters, subtle cursor-following eyes, restrained borders, and pill controls. Public copy uses Krafty. Account identity is Drew Sepeczi. The application defaults to dark, retains an explicit light theme, respects reduced motion, and adapts to phone widths.

Audience beyond workspace owners and market positioning have not been established. Do not invent customers, outcomes, usage metrics, connected services, or completed work. Functional success means an owner can create a bot, see its automatic greeting, answer setup choices, save its configuration, return to the chat, and pin or unpin it without losing the conversation.
