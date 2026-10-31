# API keys (key cards)

A bot that needs an API key asks with the `requestSecret` tool. The person
pastes the key into a private card in the chat, or adds it on /workspace, and
it becomes an environment variable in every `bash` command on their computer.

## What is stored, and where

- One row per key in `user_secrets` (Neon): owner, environment-variable name
  (`OPENAI_API_KEY`), a label, the ciphertext and timestamps. The name is unique
  per account; saving it again replaces the value and keeps `createdAt`.
- The value is encrypted with AES-256-GCM (`lib/user-secrets.ts`). The key is
  derived with HKDF-SHA256 from `CHATGPT_TOKEN_ENCRYPTION_KEY` (info
  `krafty:user-secrets:v1`), so it never matches the ChatGPT token key. The
  additional data binds each ciphertext to its owner and name: a ciphertext
  copied to another account or another name fails to decrypt. A row that fails
  is skipped and reported to Sentry.
- Names and labels leave the server (`listSecrets`, `GET /api/v1/secrets`).
  Values never do, and nothing but `lib/user-secrets.ts` reads `ciphertext`.
- Names follow `SECRET_NAME_PATTERN` and can't override what the computer uses
  (`PATH`, `HOME`, `LD_PRELOAD`, `BASH_ENV`, `NODE_OPTIONS`, `E2B_*`, `LC_*` and
  the rest of `isReservedSecretName` in `lib/secret-policy.ts`).
- Deleting the account deletes the rows (`deleteAccount`).

## How the model is kept from the value

- The card posts the value straight to the server: the `saveSecret` server
  action on the web, `POST /api/v1/secrets` from the app. It is never a chat
  message, so it is not in the transcript, the tool call or Trigger.dev's
  session streams.
- The tool's input and output carry the name, label and description only.
- Saving from a card wakes the bot with a `secret_<toolCallId>` message
  (`lib/secret-wake.ts`) that names `$NAME`, never the value. The chat and bot
  are checked against the owner first; a chat that isn't theirs is not woken,
  though the key is still saved to their own account. `secret_` turns are
  attended, like `connect_`.
- `bash` loads the keys on every call (`loadUserSecretEnv`), passes them as
  environment variables, and redacts each value to `[secret NAME]` in its
  output before the model sees it. `readFile` redacts too (`redactSecrets`).

## What isn't enforced

- Redaction is a literal match on the stored value. A value that is encoded,
  split, reversed or otherwise transformed by a command passes through, and
  values shorter than 6 characters are never redacted.
- Keys are environment variables for every command any of the account's bots
  runs on the computer. Nothing stops a command from sending a key to another
  host or writing it to a file; the computer guard (`docs/autonomy.md`) checks
  commands for risk, not for key use.
- Values are decrypted in memory in the Trigger.dev worker and are visible to
  processes on the E2B computer while a command runs.
- If the person pastes a key into the chat instead of the card, it is an
  ordinary message: the bot is told not to repeat it and to offer the card,
  but it stays in the transcript until the chat is deleted.
