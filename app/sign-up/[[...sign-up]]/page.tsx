import { KraftySignUp } from "@/components/auth-ui"
import { KraftyWordmark } from "@/components/krafty-wordmark"

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <KraftyWordmark />
      <KraftySignUp
        fallbackRedirectUrl="/workspace"
        signInFallbackRedirectUrl="/workspace"
      />
    </div>
  )
}
