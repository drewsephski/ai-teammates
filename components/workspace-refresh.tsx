"use client"

import { useEffect } from "react"

export function WorkspaceRefresh({
  refresh,
}: {
  refresh: (signal: AbortSignal) => Promise<void>
}) {
  useEffect(() => {
    let inFlight = false
    let active = true
    let request: AbortController | undefined
    const check = async () => {
      if (!active || inFlight || document.visibilityState !== "visible") return
      inFlight = true
      request = new AbortController()
      const timeout = setTimeout(() => request?.abort(), 8_000)
      try {
        await refresh(request.signal)
      } catch {
        /* Keep the last snapshot until the next check. */
      } finally {
        clearTimeout(timeout)
        inFlight = false
      }
    }
    void check()
    const timer = setInterval(check, 10_000)
    document.addEventListener("visibilitychange", check)
    return () => {
      active = false
      request?.abort()
      clearInterval(timer)
      document.removeEventListener("visibilitychange", check)
    }
  }, [refresh])
  return null
}
