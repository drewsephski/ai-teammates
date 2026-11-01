"use client"

import { useAuth, useClerk } from "@clerk/nextjs"
import { useCallback, useEffect, useRef } from "react"

// A tab left open past its Clerk session (a laptop asleep overnight) still
// calls server actions with the old session cookie, which `auth()` reads as
// signed out, so every call failed with a 500 and the chat broke silently.
// Refresh the session token first: Clerk writes the fresh cookie before the
// action's request goes out. When there is no session left, send the person
// to sign in and come back here instead of retrying forever.
export function useSignedInAction() {
  const { getToken } = useAuth()
  const clerk = useClerk()
  const latest = useRef({ getToken, clerk })
  useEffect(() => {
    latest.current = { getToken, clerk }
  }, [getToken, clerk])

  return useCallback(async <T>(action: () => Promise<T>): Promise<T> => {
    const { getToken, clerk } = latest.current
    // A failed refresh (offline) isn't a sign-out; let the action report it
    const token = await getToken().catch(() => undefined)
    if (token === null) {
      void clerk.redirectToSignIn({ redirectUrl: window.location.href })
      throw new Error("Signed out")
    }
    return action()
  }, [])
}
