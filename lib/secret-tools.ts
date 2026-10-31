import { tool } from "ai"
import { z } from "zod"

import { secretNameSchema } from "@/lib/secret-policy"

// The bot asks for an API key with a private card in the chat. The person
// pastes it into the card, which sends it straight to the server
// (services/secrets.ts), so the value never passes through the model: not in
// this tool's input, its output, or the transcript (docs/secrets.md).
export const secretRequestSchema = z.object({
  name: secretNameSchema.describe(
    "Environment variable name the key is saved as, like OPENAI_API_KEY"
  ),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Short name the person recognizes, like 'OpenAI API key'"),
  description: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe("One or two sentences on where to find or create the key"),
  url: z
    .string()
    .url()
    .startsWith("https://")
    .optional()
    .describe("The https page where the key is created, when you know it"),
})
export type SecretRequest = z.infer<typeof secretRequestSchema>

export type SecretRequestResult =
  | { state: "saved"; name: string; label: string }
  | ({ state: "requested" } & SecretRequest)

export function createSecretTools(deps: {
  // Whether the person already saved a key under this name
  hasSecret: (name: string) => Promise<boolean>
}) {
  return {
    requestSecret: tool({
      description:
        "Ask the person for an API key or token that a command on your computer needs, with a private card in the chat. Give an environment-variable style name like OPENAI_API_KEY, a short label, where to find the key, and the https page where it's created when you know it. If the key is already saved, this returns at once and you use $NAME in bash. Otherwise the card shows and you stop and wait. Never ask for a key in a chat message, and never use this for passwords or verification codes.",
      inputSchema: secretRequestSchema,
      execute: async (input): Promise<SecretRequestResult> => {
        const request = secretRequestSchema.parse(input)
        if (await deps.hasSecret(request.name))
          return { state: "saved", name: request.name, label: request.label }
        return { state: "requested", ...request }
      },
      toModelOutput: ({ output }) => ({
        type: "text" as const,
        value:
          output.state === "saved"
            ? `${output.label} is already saved. Use $${output.name} in bash commands on your computer; it's set in every command. Never print, echo, log or write its value.`
            : `A private card asking for ${output.label} is showing in the chat. Stop now and wait: don't run commands that need it and don't answer for the person. When they save it you'll get a message saying so; then use $${output.name} in bash. Never ask them to paste the key in chat, and never print, echo, log or write its value.`,
      }),
    }),
  }
}
export type SecretTools = ReturnType<typeof createSecretTools>
