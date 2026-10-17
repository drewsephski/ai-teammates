import { computerTimeUsedUpMessage } from "@/lib/sandbox-policy"

// Sign-in needs computer time left and a screen observed in this turn. It works
// in direct and group chats, on every plan. Provider access is checked
// separately by the caller. `tier` only words the used-up message.
export function assertComputerLoginReady({
  remainingSeconds,
  screenViewed,
  tier,
}: {
  remainingSeconds: number
  screenViewed: boolean
  tier?: "free" | "paid"
}) {
  if (!(remainingSeconds > 0)) throw new Error(computerTimeUsedUpMessage(tier))
  if (!screenViewed)
    throw new Error(
      "Open the website and call viewScreen before requesting sign-in."
    )
}
