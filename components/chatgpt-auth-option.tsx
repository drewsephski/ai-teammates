import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { chatGPTConfig } from "@/lib/chatgpt-config"

export const chatGPTAuthMessages: Record<string, string> = {
  unavailable:
    "ChatGPT sign-in is not available yet. Use another sign-in option to continue.",
  failed: "ChatGPT sign-in could not be completed. Please try again.",
  expired: "This ChatGPT sign-in attempt expired. Please start again.",
  denied:
    "ChatGPT authorization was canceled. You can try again or use another sign-in option.",
  link_required:
    "Sign in to your Krafty account first, then connect ChatGPT from Usage to link your accounts securely.",
  already_linked:
    "This ChatGPT account is already linked to a different account. Reconnect the ChatGPT account you previously linked.",
}

export function ChatGPTAuthOption({
  intent,
  result,
}: {
  intent: "sign-in" | "sign-up"
  result?: string
}) {
  const config = chatGPTConfig()
  return (
    <div className="flex w-full flex-col gap-3">
      {result && chatGPTAuthMessages[result] && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          {chatGPTAuthMessages[result]}
        </p>
      )}
      {config ? (
        <a
          href={`/api/chatgpt/start?intent=${intent}`}
          className={buttonVariants({
            variant: "outline",
            className: "w-full",
          })}
        >
          Continue with ChatGPT
        </a>
      ) : (
        <Button disabled variant="outline" className="w-full">
          Continue with ChatGPT · Coming soon
        </Button>
      )}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {config?.planUsageEnabled
          ? "Optionally use your eligible ChatGPT plan for replies without spending your Krafty AI allowance."
          : config ? "Sign in to Krafty with your ChatGPT account. Subscription-backed replies are not available yet." : "Connect your ChatGPT account when this sign-in option becomes available."}
      </p>
      {config && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By continuing, you agree to Krafty’s{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      )}
      <div
        className="flex items-center gap-3 text-xs text-muted-foreground"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
