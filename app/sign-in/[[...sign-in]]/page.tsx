import { KraftySignIn } from "@/components/auth-ui"
import { AuthShell } from "@/components/auth-shell"
import { ChatGPTAuthOption } from "@/components/chatgpt-auth-option"
import Link from "next/link"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ chatgpt?: string }>
}) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="flex w-full flex-col gap-5">
        <KraftySignIn
          appearance={{ elements: { rootBox: "w-full!", cardBox: "w-full!" } }}
          fallbackRedirectUrl="/workspace"
          signUpFallbackRedirectUrl="/workspace"
        />
        <Link
          href="/forgot-password"
          className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Forgot your password?
        </Link>
        <ChatGPTAuthOption intent="sign-in" result={params.chatgpt} />
      </div>
    </AuthShell>
  )
}
