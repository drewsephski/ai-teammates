import type { Metadata } from "next"
import Link from "next/link"

import { JsonLd } from "@/components/json-ld"
import {
  absoluteUrl,
  breadcrumbJsonLd,
  pageMetadata,
} from "@/lib/marketing/content"
import { siteUrl } from "@/lib/marketing/site"

export const metadata: Metadata = pageMetadata({
  path: "/support",
  title: "Support",
  description:
    "Get help with your Krafty account, teammates, and conversations.",
})

export default function SupportPage() {
  return (
    <article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          "@id": `${siteUrl}/support#page`,
          url: absoluteUrl("/support"),
          name: "Krafty support",
          description:
            "Get help with your Krafty account, teammates, and conversations.",
          isPartOf: { "@id": `${siteUrl}/#website` },
          about: { "@id": `${siteUrl}/#organization` },
          breadcrumb: breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Support", path: "/support" },
          ]),
        }}
      />
      <h1>Krafty support</h1>
      <p>
        For help with Krafty on the web or iPhone, email{" "}
        <a href="mailto:drewsepeczi@gmail.com">drewsepeczi@gmail.com</a>. Krafty
        is operated by Drew Sepeczi.
      </p>

      <h2>Report a problem</h2>
      <p>
        Tell us what you were trying to do, what happened, and whether you were
        using the website or iPhone app. Include your app version and device
        model if you know them. A screenshot can help, but remove any private
        information first. Never send passwords, sign-in codes, API keys, or
        connected-account credentials.
      </p>

      <h2>Account and sign-in</h2>
      <p>
        Use the same sign-in method you used when creating your account. If you
        used Sign in with Apple and hid your email, your account may use an
        Apple relay address. Contact us if you cannot access your account.
      </p>

      <h2>Privacy and deletion</h2>
      <p>
        To delete your Krafty account without the app, visit{" "}
        <Link href="/delete-account">Delete your account</Link>, sign in, and
        confirm deletion. On iPhone, open Account and choose Delete account. You
        can also email us with privacy or deletion requests. See our{" "}
        <Link href="/privacy">privacy policy</Link> for information about data
        handling and retention, and our{" "}
        <Link href="/terms">terms of service</Link> for service terms.
      </p>
    </article>
  )
}
