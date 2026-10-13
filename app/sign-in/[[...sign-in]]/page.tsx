import { KraftySignIn } from "@/components/auth-ui"
import { KraftyWordmark } from "@/components/krafty-wordmark"

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <KraftyWordmark />
      <KraftySignIn
        fallbackRedirectUrl="/workspace"
        signUpFallbackRedirectUrl="/workspace"
      />
    </div>
  )
}
