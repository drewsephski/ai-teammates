"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { toast } from "@/components/ui/toast"
import page from "./use-cases.module.css"

export function CopyPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <figure className={page.prompt}>
      <figcaption>
        <span>Try this prompt</span>
        <button
          type="button"
          className={page.copy}
          data-copied={copied || undefined}
          aria-label={copied ? "Copied" : "Copy prompt"}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt)
              setCopied(true)
            } catch {
              toast.add({
                type: "error",
                title: "Couldn't copy the prompt",
                description: "Select the text and copy it instead.",
              })
            }
          }}
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
        </button>
      </figcaption>
      <blockquote>{prompt}</blockquote>
    </figure>
  )
}
