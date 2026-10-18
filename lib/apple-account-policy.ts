// Pure policy shared by account serialization and API error translation.
export const APPLE_ACCOUNT_BUSY_ERROR =
  "Your account is busy with another request. Try again shortly."

export class AppleAccountBusyError extends Error {
  constructor() {
    super(APPLE_ACCOUNT_BUSY_ERROR)
    this.name = "AppleAccountBusyError"
  }
}
