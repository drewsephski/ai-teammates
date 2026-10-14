"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function WorkspaceRefresh() {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const timer = setInterval(refresh, 10_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [router])
  return null
}
