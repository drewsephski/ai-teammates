export const CHATGPT_PLAN_SCOPE = "chatgpt.tokens.use.direct"
export const CHATGPT_RECONNECT_ERROR =
  "Reconnect your ChatGPT account in Usage to continue. Your Krafty AI allowance has not been charged."
export const CHATGPT_LIMIT_ERROR =
  "Your ChatGPT plan is unavailable or has reached its usage limit. Manage your ChatGPT usage or choose Krafty AI in Usage. Your Krafty AI allowance has not been charged."
export const CHATGPT_REQUEST_ERROR =
  "ChatGPT could not complete this reply. Try again or check your connection in Usage. Your Krafty AI allowance has not been charged."

export function hasChatGPTPlanGrant(scopes: readonly string[]) {
  return (
    scopes.includes(CHATGPT_PLAN_SCOPE) && scopes.includes("resource.invoke")
  )
}

export function canUseAI(remaining: number, chatgptSelected: boolean) {
  return chatgptSelected || remaining > 0
}

export function appModelCost(chatgptSelected: boolean, cost: () => number) {
  return chatgptSelected ? 0 : cost()
}

export function chatGPTErrorMessage(status: number, code?: string) {
  if (status === 401 || code === "invalid_grant") return CHATGPT_RECONNECT_ERROR
  if (
    status === 429 ||
    code === "subscription_sharing_usage_limit_exceeded" ||
    code === "subscription_sharing_usage_unavailable"
  )
    return CHATGPT_LIMIT_ERROR
  return CHATGPT_REQUEST_ERROR
}
