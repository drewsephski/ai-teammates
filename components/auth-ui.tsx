"use client"

import dynamic from "next/dynamic"

function LoadingAuth() {
  return (
    <div
      className="flex min-h-96 items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      Loading authentication…
    </div>
  )
}

// Clerk's hosted widgets hydrate their own markup. Mount after hydration so
// their initial text cannot differ from the app's server-rendered shell.
export const KraftySignIn = dynamic(
  () => import("@clerk/nextjs").then((module) => module.SignIn),
  { ssr: false, loading: LoadingAuth }
)

export const KraftySignUp = dynamic(
  () => import("@clerk/nextjs").then((module) => module.SignUp),
  { ssr: false, loading: LoadingAuth }
)
