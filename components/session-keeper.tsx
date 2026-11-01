"use client"

import { useEffect } from "react"

import { useSignedInAction } from "@/hooks/use-signed-in-action"

// A tab that sat hidden (a sleeping laptop) can come back with an expired
// session cookie, and the page's first server action then fails with a 500.
// Refresh the session as soon as the tab is visible again; if it has ended,
// useSignedInAction sends the person to sign in and back here.
export function SessionKeeper() {
  const signedIn = useSignedInAction()
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      signedIn(async () => {}).catch(() => {})
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("online", refresh)
    return () => {
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("online", refresh)
    }
  }, [signedIn])
  return null
}
