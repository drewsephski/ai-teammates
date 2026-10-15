"use client"

import dynamic from "next/dynamic"
import { publicPlans } from "@/lib/marketing/site"
import styles from "./landing.module.css"

// Rendered on the server and shown until Clerk's live table mounts, so
// crawlers and no-JS visitors still see real plans and prices.
function StaticPlans() {
  return (
    <div className={styles.staticPlans}>
      {publicPlans.map((plan) => (
        <article className={styles.staticPlan} key={plan.name}>
          <h3>{plan.name}</h3>
          <p className={styles.staticPlanPrice}>
            ${plan.price}
            {plan.period ? <span>/{plan.period}</span> : null}
          </p>
          <p className={styles.staticPlanSummary}>{plan.summary}</p>
          <ul>
            {plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}

// Clerk mounts its own host markup. Load it after hydration so that the
// server fallback and client host cannot disagree about the initial tree.
const PricingTable = dynamic(
  () => import("@clerk/nextjs").then((module) => module.PricingTable),
  { ssr: false, loading: StaticPlans }
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
      fallback={<StaticPlans />}
    />
  )
}
