import { KraftySignIn } from "@/components/auth-ui"
import { AuthShell } from "@/components/auth-shell"

export default function SignInPage() {
  return (
    <AuthShell>
      <KraftySignIn
        appearance={{ elements: { rootBox: "w-full!", cardBox: "w-full!" } }}
        fallbackRedirectUrl="/workspace"
        signUpFallbackRedirectUrl="/workspace"
      />
    </AuthShell>
  )
}
