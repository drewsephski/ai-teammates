// Sign-in needs an interactive viewer and a screen observed in this turn.
// Provider access and remaining allowance are checked separately by the caller.
export function assertComputerLoginReady({
  paid,
  direct,
  screenViewed,
}: {
  paid: boolean
  direct: boolean
  screenViewed: boolean
}) {
  if (!paid || !direct)
    throw new Error("Computer sign-in is available in a paid private chat.")
  if (!screenViewed)
    throw new Error(
      "Open the website and call viewScreen before requesting sign-in."
    )
}
