import { KraftySignUp } from "@/components/auth-ui"
import { AuthShell } from "@/components/auth-shell"

export default function SignUpPage() {
  return (
    <AuthShell>
      <KraftySignUp
        appearance={{ elements: { rootBox: "w-full!", cardBox: "w-full!" } }}
        fallbackRedirectUrl="/workspace"
        signInFallbackRedirectUrl="/workspace"
      />
    </AuthShell>
  )
}
