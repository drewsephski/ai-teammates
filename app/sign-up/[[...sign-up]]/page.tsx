import { SignUp } from "@clerk/nextjs"
import { KraftyWordmark } from "@/components/krafty-wordmark"

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <KraftyWordmark />
      <SignUp />
    </div>
  )
}
