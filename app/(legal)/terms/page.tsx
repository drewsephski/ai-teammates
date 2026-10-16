import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Terms for using Krafty’s AI teammates and cloud computers.",
  alternates: { canonical: "https://kraftybot.app/terms" },
}

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of service</h1>
      <p>Last updated: October 15, 2026</p>
      <p>
        These terms govern your use of Krafty at kraftybot.app and through the
        Krafty mobile app, operated by Drew Sepeczi. By using the service, you
        agree to these terms. Questions can be sent to{" "}
        <a href="mailto:drewsepeczi@gmail.com">drewsepeczi@gmail.com</a>.
      </p>

      <h2>Your account</h2>
      <p>
        You must be at least 13 and meet the age and consent requirements that
        apply where you live. Provide accurate account information, protect your
        credentials, and only use accounts and services you are authorized to
        access. You are responsible for activity under your account and should
        contact us if you suspect unauthorized access.
      </p>

      <h2>AI teammates and connected tools</h2>
      <p>
        Krafty uses AI to generate responses and perform requested work. AI
        results may be inaccurate, incomplete, or unsuitable for your situation.
        Review important outputs and actions before relying on them. Krafty does
        not replace qualified professional advice.
      </p>
      <p>
        When you connect accounts or provide access to a cloud computer, you
        authorize processing and actions within the permissions you grant and
        instructions you provide. Tasks can involve external services, changes
        to files, and actions that are difficult to reverse. You remain
        responsible for deciding which work to delegate and for complying with
        third-party service terms.
      </p>

      <h2>Your content</h2>
      <p>
        You retain your rights in content you provide. You grant Krafty and its
        service providers the permission needed to host, store, process,
        transmit, and display that content to operate the service and carry out
        your requests. You must have the rights and permissions needed to submit
        content or authorize access to it.
      </p>
      <p>
        AI output may not be unique, and these terms do not guarantee that it is
        accurate, original, or free of third-party rights. Information handling
        is described in our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use Krafty for unlawful activity, fraud, harassment, unauthorized
        access, malware, infringement, or abuse of other people or services. Do
        not bypass usage limits or access controls, interfere with the service,
        or grant your teammates access to systems you do not have permission to
        use. We may restrict or suspend access when necessary to address abuse,
        security issues, or legal requirements.
      </p>

      <h2>Plans, payments, and usage</h2>
      <p>
        The iPhone app is a free companion to your Krafty account. Its available
        features depend on your account plan and remaining allowances. The app
        does not offer purchases. Web subscriptions are managed separately.
      </p>
      <p>
        Plan prices, included allowances, and billing intervals are shown before
        checkout. Paid subscriptions renew automatically until canceled.
        Payments are processed through Clerk and Stripe. You can manage
        available subscription controls through your account or contact us for
        help. Cancellation generally takes effect at the end of the paid billing
        period unless stated otherwise at cancellation.
      </p>
      <p>
        Features may be limited by your plan, remaining AI allowance, or
        available cloud computer time. Included allowances are not cash balances
        and are not redeemable for money. Promotional offers may have
        eligibility and redemption limits. The founding offer is limited to the
        first 50 eligible new subscribers who successfully redeem its code; its
        recurring discount continues while the subscription remains on the
        eligible plan. Canceling, changing plans, or changing the subscription
        price may end the discount.
      </p>
      <p>
        Refund questions can be sent to{" "}
        <a href="mailto:drewsepeczi@gmail.com">drewsepeczi@gmail.com</a>. These
        terms do not remove refund or cancellation rights provided by applicable
        law. We will provide notice of material changes to paid subscription
        pricing before those changes take effect.
      </p>

      <h2>Availability and ending use</h2>
      <p>
        Features depend on third-party services and may change or become
        unavailable. We do not guarantee uninterrupted service or permanent
        storage. Keep separate copies of important files and outputs. You may
        stop using Krafty at any time; cancel paid subscriptions separately and
        contact us if you want account or data deletion.
      </p>

      <h2>Disclaimers and responsibility</h2>
      <p>
        To the extent permitted by applicable law, Krafty is provided as
        available, without guarantees of fitness for a particular purpose or
        accuracy of AI output. We are not responsible for third-party service
        outages or losses caused by your unauthorized use or reliance on
        unreviewed AI actions. Nothing in these terms excludes rights or
        liability that cannot lawfully be excluded.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will revise the date above. Material
        changes will be communicated where required. Contact{" "}
        <a href="mailto:drewsepeczi@gmail.com">drewsepeczi@gmail.com</a> with
        questions about the service or these terms.
      </p>
    </article>
  )
}
