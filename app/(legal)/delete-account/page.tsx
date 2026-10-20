import type { Metadata } from "next"
import Link from "next/link"
import { SignInButton } from "@clerk/nextjs"
import { auth, currentUser } from "@clerk/nextjs/server"

import { deleteAccount } from "@/actions/account"
import { DeleteAccountForm } from "@/components/delete-account-form"
import { Button } from "@/components/ui/button"
import { pageMetadata } from "@/lib/marketing/content"

export const metadata: Metadata = pageMetadata({
  path: "/delete-account",
  title: "Delete your Krafty account",
  description:
    "Delete your Krafty account and workspace without installing the app.",
})

export default async function DeleteAccountPage() {
  const { isAuthenticated } = await auth()
  const user = isAuthenticated ? await currentUser() : null
  return (
    <article>
      <h1>Delete your Krafty account</h1>
      <p>
        You can delete your Krafty account here without installing the app. Sign
        in with the account you want to delete, then confirm below. Deletion is
        permanent and cannot be undone.
      </p>
      <h2>What deletion removes</h2>
      <p>
        Deletion cancels your Krafty subscriptions before removing your account,
        teammates, workspace conversations, saved memories, routines, settings,
        and cloud computer. It disconnects your app and ChatGPT connections and
        signs you out on all devices. It does not delete your accounts with
        connected services or undo actions already taken there.
      </p>
      <h2>What may be retained</h2>
      <p>
        Usage and cloud computer metering records remain as billing records,
        associated with your former account identifier. Payment providers may
        retain billing records. Copies of conversations and task data stored by
        Trigger.dev are not erased by closing their sessions. Provider retention
        periods and erasure are not yet confirmed. Other provider records and
        backups may remain under their retention policies. Contact us to request
        deletion of retained data or ask about its status. See the{" "}
        <Link href="/privacy">privacy policy</Link> for more information.
      </p>
      <h2>Confirm account deletion</h2>
      <p>
        Check that you are signed in to the right account before continuing.
        Export any files or information you want to keep first.
      </p>
      {user && (
        <p>
          Signed in as{" "}
          <strong>
            {user.primaryEmailAddress?.emailAddress ??
              user.fullName ??
              "your Krafty account"}
          </strong>
          .
        </p>
      )}
      {isAuthenticated ? (
        <DeleteAccountForm deleteAction={deleteAccount} />
      ) : (
        <SignInButton
          forceRedirectUrl="/delete-account"
          signUpForceRedirectUrl="/delete-account"
        >
          <Button>Sign in to delete your account</Button>
        </SignInButton>
      )}
      <h2>Cannot sign in, or need help?</h2>
      <p>
        Email{" "}
        <a href="mailto:drewsepeczi@gmail.com?subject=Krafty%20account%20deletion">
          drewsepeczi@gmail.com
        </a>{" "}
        with the subject Krafty account deletion and the account email address.
        If you used Sign in with Apple, this may be your Apple relay address. We
        may need to verify your identity. Never send passwords, sign-in codes,
        or payment card details.
      </p>
    </article>
  )
}
