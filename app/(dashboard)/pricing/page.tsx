import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import { AppPageHeader } from "@/components/app-page-header"

export default async function Page() {
  await auth.protect()

  return (
    <section>
      <AppPageHeader title="Plans & billing" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Pricing
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Bots and their sandboxes are part of the paid plan.
          </p>
        </div>
        {/* Checkout happens in Clerk's drawer, then lands back in the app */}
        <PricingTable newSubscriptionRedirectUrl="/workspace" />
      </div>
    </section>
  )
}
