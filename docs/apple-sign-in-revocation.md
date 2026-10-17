# Sign in with Apple revocation on account deletion

App Store Guideline 5.1.1(v): apps that offer Sign in with Apple must revoke
the user's tokens with the Sign in with Apple REST API when the account is
deleted. Deleting the Clerk user does not do this. Clerk's native Apple hook
sends only the identity token to Clerk and drops Apple's authorization code, so
Clerk has no Apple refresh token for native sign-ins that it could revoke.

## How it works

1. **At sign-in (iOS).** `krafty-mobile` calls `AppleAuthentication.signInAsync`
   itself (`src/hooks/use-apple-sign-in.ts`, which mirrors Clerk's hook) and
   keeps `authorizationCode`. Once the Clerk session is active, it posts the code
   to `POST /api/v1/apple/authorization`. The server exchanges it at
   `https://appleid.apple.com/auth/token` (client ID `app.kraftybot.mobile`, no
   `redirect_uri` for native codes). It checks that the ID token's `iss` and
   `aud` match and that its `sub` is an Apple ID Clerk has linked to this
   account. Then it stores the refresh token AES-256-GCM encrypted in
   `apple_sign_in_grants`, bound to the user and client ID. The code is
   single-use and short-lived, so it is sent right away and never logged.
2. **At deletion (iOS).** For an account with an Apple ID linked, the app opens
   Apple's sheet again to get a fresh authorization code and sends it with
   `DELETE /api/v1/account`. This covers accounts with no stored token:
   existing users, web sign-ins, and failed exchanges.
3. **On the server.** `deleteAccount` calls `revokeAppleSignIn`
   (`services/apple.ts`) after billing and before any data is deleted. Every
   stored token, plus the token from the fresh code, is revoked at
   `https://appleid.apple.com/auth/revoke` with `token_type_hint=refresh_token`.
   The client secret is an ES256 JWT (`kid` = key ID, `iss` = Team ID,
   `aud` = `https://appleid.apple.com`, `sub` = client ID, expires in 5 minutes),
   signed with the Sign in with Apple key. The grant rows are deleted in the
   final transaction.

## Outcomes (`appleSignIn` in the DELETE response)

| Result    | When                                                                                                                                                                                                            | What the person sees                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `revoked` | Apple returned 200 for every linked Apple ID                                                                                                                                                                    | Normal deletion                                                                                                                                                                      |
| `manual`  | Apple-linked, but no token could be revoked: key not configured, Apple rejected the request (`invalid_client`), the code was used or expired, the sheet was cancelled, or a stored token could not be decrypted | Deletion completes, then an alert with Apple's steps: Settings > [your name] > Sign in with Apple > Krafty > Delete ([Apple support 102571](https://support.apple.com/en-us/102571)) |
| `none`    | No Apple ID linked and no stored grant                                                                                                                                                                          | Normal deletion                                                                                                                                                                      |

Failure handling follows the deletion service's retry rule:

- A network failure, an Apple 5xx or 429, or a Clerk lookup failure throws
  `Couldn't revoke Sign in with Apple. Try again.` (HTTP 502). Deletion stops
  before any data goes. Retrying is safe because Apple returns 200 for a token
  it already revoked.
- Anything a retry can't fix goes on to deletion with `manual`. It is reported
  to Sentry as `Sign in with Apple needs manual removal`, with tags
  `area:apple-signin`, `outcome:manual` and a `reason`. A missing or broken key
  is also reported at error level as `Sign in with Apple is not configured`.
  Alert on both.

## Guaranteed and not guaranteed

Guaranteed by the code and its tests:

- When Apple accepts a revoke request (HTTP 200), the call was made with the
  user's refresh token, the right client ID and a correctly formed ES256 client
  secret.
- A token is only stored or revoked for an Apple ID that Clerk links to the
  calling account. One account can't store or revoke another person's grant.
- A missing or broken key never blocks deletion, and it is never silent.

Not guaranteed, or not yet verified:

- **That revoking removes Krafty from Settings > Sign in with Apple.** Apple's
  token revocation docs say revocation invalidates "the tokens and associated
  user authorizations". Removal from the Settings list must be confirmed
  live (see below).
- **Web sign-ins (Services ID `app.kraftybot.signin`).** Clerk holds those
  tokens and exposes no revoke. The native re-auth at deletion revokes the
  grant for `app.kraftybot.mobile`. Whether that also clears a grant first
  made on the web depends on Apple grouping both under the same primary App ID.
  This is unverified. A person who deletes on the web gets no native re-auth.
  There is no web deletion route in this repo, but Clerk's hosted profile can
  delete a user directly if account deletion is turned on in the Clerk
  dashboard. Keep it off.
- **Nothing works until the Sign in with Apple key is configured.** Until then
  every Apple user gets `manual`.
- The authorization code's lifetime is not published in the REST API docs.
  Apple calls it "single-use" and "short-lived", so the app sends it within
  seconds.

## Owner setup

1. Get the `.p8` for key ID `K3A6UW6K4F` (or create a new key with Sign in with
   Apple enabled and primary App ID `app.kraftybot.mobile`). `AuthKey_D8QSDNPXX9`
   and `PG446F7A73` are App Store Connect API keys and won't work.
2. Set on Railway (`ai-teammates`, production): `APPLE_TEAM_ID=2NHJGX6A7S`,
   `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY` (the .p8 contents),
   `APPLE_SIWA_CLIENT_ID=app.kraftybot.mobile`, and
   `APPLE_SIWA_TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`). Trigger.dev does
   not need them.
3. Run `pnpm db:push` to create `apple_sign_in_grants` (additive) before this
   code ships.

## Live verification

Use a throwaway Apple ID on a real iPhone running a TestFlight build with the
mobile change. Production Railway must have the env vars above.

1. Settings > [your name] > Sign in with Apple: confirm Krafty is not listed.
2. Open Krafty, then Continue with Apple, and share or hide the email. Finish
   sign-in.
3. Optional DB check, by row count only: `apple_sign_in_grants` has one row for
   the new user ID (encrypted token, never print it).
4. Back in Settings > Sign in with Apple: Krafty is listed.
5. In Krafty: Account > Delete account > Continue > Delete account. Confirm
   Apple's sheet when it appears.
6. Expected: no "One more step" alert (the result was `revoked`). Railway logs
   show `Account deleted` with `apple.revocation: revoked`.
7. Settings > Sign in with Apple: Krafty is gone. It can take a short while to
   refresh; reopen Settings. Screenshot this for issue #7.
8. The `manual` fallback is covered by unit tests (`tests/apple-revocation.test.ts`).
   Exercising it live needs an Apple-linked account with no stored grant, for
   example one created before this build. Cancel Apple's sheet at step 5. The
   "One more step for Sign in with Apple" alert should appear, and Sentry should
   get `Sign in with Apple needs manual removal` with `reason:no_token`.

## Sources

- [Token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)
- [Token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)
- [ErrorResponse](https://developer.apple.com/documentation/signinwithapplerestapi/errorresponse)
- [Creating a client secret](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret)
- [TN3194: Handling account deletions and revoking tokens for Sign in with Apple](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Stop using Sign in with Apple with an app](https://support.apple.com/en-us/102571)
- [OpenID Connect Core 3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
