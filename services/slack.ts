import type { SlackSettings } from "@/db/schema"
import * as slack from "@/lib/slack"

// Slack is written once in lib/slack.ts, where the chat agent posts replies
// back. These are the person's entry points and Slack's own.

export function getSlackStatus(userId: string) {
  return slack.getSlackStatus(userId)
}

export function completeSlackInstall(
  userId: string,
  install: { code: string; redirectUri: string }
) {
  return slack.completeSlackInstall(userId, install)
}

export function updateSlackSettings(userId: string, input: SlackSettings) {
  return slack.updateSlackSettings(userId, input)
}

export function disconnectSlack(userId: string) {
  return slack.disconnectSlack(userId)
}

// A verified Events API callback; the sender is matched to an installation
export function handleSlackEvent(payload: unknown) {
  return slack.handleSlackEvent(payload)
}
