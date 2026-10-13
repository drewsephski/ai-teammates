"use client"

import dynamic from "next/dynamic"
import styles from "./landing.module.css"

function LoadingPlans() {
  return (
    <div className={styles.pricingLoading} role="status">
      Loading available plans…
    </div>
  )
}

// Clerk mounts its own host markup. Load it after hydration so that the
// server fallback and client host cannot disagree about the initial tree.
const PricingTable = dynamic(
  () => import("@clerk/nextjs").then((module) => module.PricingTable),
  { ssr: false, loading: LoadingPlans }
)

export function LandingPricing() {
  return (
    <PricingTable
      for="user"
      newSubscriptionRedirectUrl="/workspace"
      appearance={{
        variables: {
          colorBackground: "#202020",
          colorForeground: "#ffffff",
          colorMuted: "#292929",
          colorMutedForeground: "#ffffff",
          colorNeutral: "#ffffff",
          colorPrimary: "#525252",
          colorPrimaryForeground: "#ffffff",
          colorInput: "#292929",
          colorInputForeground: "#ffffff",
          colorRing: "#ffffff",
        },
      }}
      fallback={
        <div className={styles.pricingLoading} role="status">
          Loading available plans…
        </div>
      }
    />
  )
}
