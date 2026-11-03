import { locals } from "@trigger.dev/sdk"
import { chat, type TranscriptStorage } from "@trigger.dev/sdk/ai"
import {
  assertChatSessionId,
  CHAT_SESSION_ERROR,
} from "@/lib/chat-session-policy"

const rejectedSession = locals.create<boolean>("krafty-rejected-chat-session")

// SDK 4.7.4 binds this handle from the task's boot payload before resolving
// restored tools or onBoot. Later wire payloads must never replace it.
export function assertWorkerChatSession(
  candidate: unknown
): asserts candidate is string {
  let trusted: string | undefined
  try {
    trusted = chat.session().id
  } catch {
    /* Fail closed below. */
  }
  if (!trusted) throw new Error(CHAT_SESSION_ERROR)
  try {
    assertChatSessionId(trusted, candidate)
  } catch {
    locals.set(rejectedSession, true)
    // Do not reuse the rejected turn's accumulator on another turn.
    chat.endRun()
    throw new Error(CHAT_SESSION_ERROR)
  }
}

// The SDK persists even failed turns. Prevent rejected wire records from
// changing the boot session's transcript through that error-recovery path.
// Only wrap worker storage; server-side transcript reads need no task context.
export function bindChatSessionStorage(
  storage: TranscriptStorage
): TranscriptStorage {
  return {
    ...storage,
    async save(scope, changes) {
      if (locals.get(rejectedSession)) throw new Error(CHAT_SESSION_ERROR)
      assertWorkerChatSession(scope.chatId)
      return storage.save(scope, changes)
    },
  }
}
