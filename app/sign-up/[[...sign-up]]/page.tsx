import { KraftySignUp } from "@/components/auth-ui"
import { AuthShell } from "@/components/auth-shell"
import { ChatGPTAuthOption } from "@/components/chatgpt-auth-option"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ chatgpt?: string }>
}) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="flex w-full flex-col gap-5">
        <ChatGPTAuthOption intent="sign-up" result={params.chatgpt} />
        <KraftySignUp
          appearance={{ elements: { rootBox: "w-full!", cardBox: "w-full!" } }}
          fallbackRedirectUrl="/workspace"
          signInFallbackRedirectUrl="/workspace"
        />
      </div>
    </AuthShell>
  )
}
