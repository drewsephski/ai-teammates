import { runs, sessions, task } from "@trigger.dev/sdk"

import { postChatMessage } from "@/lib/chat-dispatch"
import {
  CONTINUATION_DISPLAY_PROMPT,
  CONTINUATION_PROMPT,
  continuationDispatch,
} from "@/lib/turn-continuation"

// Posts the "continue" message for a turn the step or time cap cut off. It runs
// outside the chat's run, after that run has exited: a message appended while
// a run is still alive doesn't boot the next one. Idempotent on the message
// ID, which is also the trigger's idempotency key.
export const continueTurn = task({
  id: "continue-turn",
  maxDuration: 120,
  // Waiting for the turn's run to exit is a retry
  retry: {
    maxAttempts: 6,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15_000,
    factor: 2,
  },
  run: async (payload: {
    chatId: string
    previousRunId: string
    messageId: string
    botId?: string
  }) => {
    const [session, previous] = await Promise.all([
      sessions.retrieve(payload.chatId),
      runs.retrieve(payload.previousRunId),
    ])
    const next = continuationDispatch({
      previousRunId: payload.previousRunId,
      currentRunId: session.currentRunId,
      previousRunFinished: previous.isCompleted,
    })
    if (next === "skip") return { skipped: "chat moved on" }
    if (next === "wait") throw new Error("The turn's run hasn't exited yet")

    await postChatMessage(
      payload.chatId,
      {
        id: payload.messageId,
        text: CONTINUATION_PROMPT,
        displayPrompt: CONTINUATION_DISPLAY_PROMPT,
      },
      { botId: payload.botId }
    )
    return { posted: payload.messageId }
  },
})
