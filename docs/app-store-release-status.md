# App Store release status — October 16, 2026

This file distinguishes completed preparation from the remaining acceptance gates.
No App Review submission has been made.

## Implemented in this release

- Paid users no longer have to wait for their paid period to end before deleting
  their account. The deletion service cancels non-default Clerk subscription
  items immediately before removing workspace data. Billing failures preserve
  the workspace for retry; already-ended subscriptions are skipped on retry.
- Account deletion closes every owned Trigger.dev chat session before bot/chat
  IDs disappear. This stops further session messages, but does not erase
  Trigger.dev's stored transcript snapshots or historical stream records.
- Account deletion also removes the user's For you scan state. Teammate-owned
  For you items already cascade with bots. Billing/metering records remain by design.
- The iPhone confirmation explains cancellation and immediate loss of access.
- Clerk production Apple sign-in now has native bundle ID
  `app.kraftybot.mobile`; the field was previously empty. A fresh config read
  verified the correction. Apple and Google remain enabled. The Apple web
  Services ID remains `app.kraftybot.signin`.

These changes are uncommitted on the current main branches, per AGENTS.md.

## Verification

- Web: 292 tests, typecheck, and targeted ESLint passed. The updated API error
  mapping cases also passed in the focused API suite.
- Mobile: 115 tests, typecheck, and ESLint on the modified account screen passed.
- Production health, support, privacy and terms each returned HTTP 200 before
  the new deployment. The earlier support-page blocker is resolved.
- No real paid subscription or real user account was canceled/deleted as a test.

## Production deployment and candidate

Web/API upload deployment: `89171186-55d7-4216-8a4f-385e14479a03`.
It reached SUCCESS; production health, support, privacy and updated terms returned
HTTP 200, and the unauthenticated native API returned JSON HTTP 401.
The new helper is imported only by the Next.js account service; this change
needs no matching Trigger.dev worker deployment.

The local production iOS build 10 succeeded with EAS CLI 25.0.0 and existing
signing credentials. Artifact: `~/krafty-mobile/build-output/Krafty-app-store-candidate.ipa`.
The packaged binary has production API settings, exactly one live Clerk key and
no development Clerk keys, the production update channel, the account cancellation
copy, and signed Apple sign-in entitlements. Its runtime fingerprint is
`311900490571fefc522e24dd920c06fde4113266`. SHA-256:
`627aba8509ff9102b5a91522d16acc880db1dcd9aa1fe52683a5ca36412be20a`.
EAS Submit `c9bc5521-ec18-4421-a843-92a5ccc653fc` completed successfully and
confirmed upload to App Store Connect. Apple processing is underway; TestFlight
availability is not yet verified. The upload used the existing EAS-held App Store
Connect key; the newly attached key was not needed.

## Remaining release gates

1. The owner confirmed the App Review password and Apple review sign-in field
   were both updated. No replacement password was read or recorded.
2. Finish provider-held conversation erasure. Trigger.dev 4.7.4 exposes session
   close, transcript loading, and snapshot writes, but no supported full session
   erasure API was found in the installed SDK or current management documentation.
   Closing a session is not an erasure claim. Resolve the provider cleanup process
   before calling account deletion complete. The owner approved a technical inquiry;
   Trigger.dev feedback confirmed receipt on October 16. No answer has arrived.
3. Finish Apple token revocation. Clerk's native Apple hook sends the identity
   token to Clerk and discards Apple's authorization code. Do not assume deleting
   the Clerk user revokes the Apple grant. The original Apple signing key is
   masked in Clerk configuration. The owner supplied `AuthKey_D8QSDNPXX9.p8`,
   but production Apple sign-in uses key ID `K3A6UW6K4F`. The owner confirmed the attachment is an App Store Connect API key. It was not
   applied to Sign in with Apple; the original sign-in key is still needed.
   No key contents were printed or committed.
4. Verify the exact new binary's production settings, upload to App Store Connect,
   and wait for Apple processing.
5. Test on a real iPhone through TestFlight: cold start, email/Apple/Google sign-in,
   restart persistence, consent/withdrawal, streamed AI replies, reconnect/background
   behavior, app connection callback, and account deletion using disposable data.
6. Select the tested build and submit for App Review only after these gates pass.

## Official references

- [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple token revocation](https://developer.apple.com/forums/thread/708415)
- [Clerk subscription cancellation](https://clerk.com/docs/reference/backend/billing/cancel-subscription-item)
- [Trigger.dev session close](https://trigger.dev/docs/management/sessions/close)
- [Trigger.dev transcript storage](https://trigger.dev/docs/ai-chat/transcript-storage)
