# Web account deletion

`/delete-account` is public and names Krafty. It explains deletion and retained
data, offers sign-in with a return to the page, and provides a support email for
people who cannot sign in. Authenticated requests use `actions/account.ts`, which
takes the owner ID only from the Clerk session and calls the same `deleteAccount`
service as mobile. The server independently validates the confirmation phrase.
No deletion is run during rendering or by following a URL.

The service cancels subscriptions first. It can partially complete and is
retryable; the page must not claim that every provider copy has been erased.
The server preserves the additive `appleSignIn` outcome from the revocation
service (`revoked`, `manual`, or `none`). A `manual` outcome displays explicit
iPhone and web instructions in the success notice after the Clerk account has
been removed. Legacy service responses with no outcome retain a conditional
fallback. Deleting a Clerk user does not itself revoke Apple authorization.
The instructions follow [Apple's current support guide](https://support.apple.com/en-us/102571).

## Required Clerk production setting before launch

Clerk's built-in self-delete bypasses Krafty's service and can orphan workspace
data or subscriptions. A CSS-hidden button is not an authorization control.
There is no `user.deleted` cleanup webhook in this application.

In **Clerk Dashboard > Krafty > Production > User & authentication > User model**,
turn off **Allow users to delete their accounts** and save. Confirm with a
disposable existing account that Clerk's profile no longer offers deletion and
that its Backend User `deleteSelfEnabled` is false. Check the same default for a
new account. Per-user overrides may require an approved Backend API update
`users.updateUser(userId, { deleteSelfEnabled: false })`; do not print credentials
or run a bulk update without reviewing the affected accounts. This does not
disable Krafty's server-side `users.deleteUser` cleanup.

Sources checked October 17, 2026:

- [Clerk User model settings](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options#user-model)
- [Clerk Backend User](https://clerk.com/docs/reference/backend/types/backend-user)
- [Clerk updateUser](https://clerk.com/docs/reference/backend/user/update-user)

This setting is an owner/provider action. The PR does not change it and does not
resolve that launch gate by itself.

## Release verification

- Merge/deploy the page, then verify `https://kraftybot.app/delete-account` returns
  HTTP 200 signed out and the sign-in callback returns here.
- With explicit approval, use a disposable account and verify subscription
  cancellation, Clerk deletion, owned workspace records removed, and retained
  billing/provider records accurately described. Do not delete a real customer's
  account as a test.
- Verify the Clerk production setting above. Add the URL to Google Play's
  account-deletion field only after the live page and owner flow pass.
- `/privacy` must link here. The provider-retention workstream owns that page;
  keep its retained-data description consistent with this page when integrating.
