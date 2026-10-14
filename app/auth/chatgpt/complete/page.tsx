import { AuthShell } from "@/components/auth-shell"
import { ChatGPTSignInCompletion } from "@/components/chatgpt-sign-in-completion"

export default function Page() {
  return (
    <AuthShell>
      <ChatGPTSignInCompletion />
    </AuthShell>
  )
}
