import {
  COMPUTER_APPROVAL_REQUIRED,
  DECLINED_ERROR,
  GUARD_EXHAUSTED_ERROR,
  GUARD_UNAVAILABLE_ERROR,
} from "@/lib/computer-approval-policy"

// Computer tools refuse some steps on purpose: they wait for the owner's
// approval, the owner already declined that kind of step, or the safety check
// couldn't run. The bot handles each and nothing broke, so the chat shows them
// as calm status rows rather than red failures.
export type ComputerHold = {
  kind: "held" | "declined" | "unchecked"
  // Short enough for a tool row
  summary: string
  // What the opened row says
  detail: string
}

export function computerHold(errorText?: string): ComputerHold | undefined {
  if (!errorText) return undefined
  if (errorText.startsWith(COMPUTER_APPROVAL_REQUIRED))
    return {
      kind: "held",
      summary: "Waiting for your approval",
      detail:
        "This step would send, post, submit, delete or buy something outside the computer, so it was held. Nothing was done.",
    }
  if (errorText === DECLINED_ERROR)
    return {
      kind: "declined",
      summary: "Skipped: you declined this kind of action",
      detail:
        "You declined this kind of action in this conversation, so the bot didn't try it.",
    }
  if (errorText === GUARD_UNAVAILABLE_ERROR)
    return {
      kind: "unchecked",
      summary: "Held: couldn't check this step",
      detail:
        "The safety check couldn't run, so this step wasn't done. The bot can try again.",
    }
  if (errorText === GUARD_EXHAUSTED_ERROR)
    return {
      kind: "unchecked",
      summary: "Held: safety check unavailable",
      detail:
        "The safety check for clicks and keys isn't available right now, so the bot stopped using the mouse and keyboard.",
    }
  if (errorText.startsWith("That approvalId isn't an approved request"))
    return {
      kind: "held",
      summary: "Held for approval",
      detail:
        "This step needs a fresh approval, because the earlier one didn't cover it or ran out. Nothing was done.",
    }
  return undefined
}
