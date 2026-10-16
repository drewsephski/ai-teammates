import * as Sentry from "@sentry/nextjs"
import { redactChatGPTEvent } from "@/lib/chatgpt-telemetry"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: redactChatGPTEvent,
  beforeSendTransaction: redactChatGPTEvent,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },

  // 100% in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Off: local variables in chat and agent code hold message text, app data
  // and tokens, which must not leave for Sentry
  includeLocalVariables: false,

  // Logs need no switch in SDK 11: Sentry.logger always sends. This adds
  // whatever is written to console.warn and console.error, outside
  // development, where that is mostly dev-server notices.
  integrations:
    process.env.NODE_ENV === "production"
      ? [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })]
      : [],
})
