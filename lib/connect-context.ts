import { z } from "zod"

// Where a connect card started a connection: the chat it is in, the askUser
// toolCallId it answers, and the bot that asked. All optional, so a connection
// started from Apps carries none. The service checks ownership.
export const connectContextShape = {
  chatId: z.string().min(1).max(200).optional(),
  questionId: z.string().min(1).max(200).optional(),
  botId: z.string().min(1).max(200).optional(),
}

export type ConnectContext = {
  chatId?: string
  questionId?: string
  botId?: string
}

// questionId and botId only mean something inside a chat
export function connectContextComplete(value: ConnectContext) {
  return Boolean(value.chatId) || (!value.questionId && !value.botId)
}

export const CONNECT_CONTEXT_ERROR = "Send chatId with questionId or botId."

export const connectContextSchema = z
  .object(connectContextShape)
  .refine(connectContextComplete, { message: CONNECT_CONTEXT_ERROR })
