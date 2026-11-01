import { z } from "zod"

// API keys a person saves for their bots (docs/secrets.md). Pure and
// browser-safe: db/schema.ts and the key card import it.

// Environment-variable style, so the key becomes `$NAME` in bash
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/

// Names the computer's shell or E2B already uses. Overriding one could break
// every command, or run code (LD_PRELOAD, BASH_ENV, NODE_OPTIONS).
const RESERVED_NAMES = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "LANG",
  "TERM",
  "DISPLAY",
  "TZ",
  "HOSTNAME",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "PYTHONPATH",
  "PYTHONHOME",
  "BASH_ENV",
  "ENV",
  "IFS",
  "PS4",
])

export function isReservedSecretName(name: string) {
  return (
    RESERVED_NAMES.has(name) ||
    name.startsWith("E2B_") ||
    name.startsWith("LC_")
  )
}

export const secretNameSchema = z
  .string()
  .trim()
  .regex(
    SECRET_NAME_PATTERN,
    "Use capital letters, digits and underscores, like OPENAI_API_KEY."
  )
  .refine(
    (name) => !isReservedSecretName(name),
    "That name is used by the computer. Pick another."
  )

export const secretLabelSchema = z
  .string()
  .trim()
  .min(1, "Name this key.")
  .max(80, "Keep it under 80 characters.")

export const secretValueSchema = z
  .string()
  .trim()
  .min(1, "Paste the key.")
  .max(8192, "That key is too long.")

// Shorter values would match ordinary text in command output
const MIN_REDACTED_LENGTH = 6

// Replaces every saved value in `text` with `[secret NAME]` before the model
// sees it. Longest first, so a value containing another is replaced whole.
export function redactSecrets(text: string, secrets: Record<string, string>) {
  const entries = Object.entries(secrets)
    .filter(([, value]) => value.length >= MIN_REDACTED_LENGTH)
    .sort(([, a], [, b]) => b.length - a.length)
  let redacted = text
  for (const [name, value] of entries)
    redacted = redacted.split(value).join(`[secret ${name}]`)
  return redacted
}
