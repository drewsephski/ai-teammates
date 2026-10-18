import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Krafty collects, uses, and handles your information.",
  alternates: { canonical: "https://kraftybot.app/privacy" },
}

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy policy</h1>
      <p>Last updated: October 17, 2026</p>
      <p>
        Krafty provides AI teammates, connected tools, and cloud computers. This
        policy describes how information is handled when you use kraftybot.app
        and the Krafty mobile app. Krafty is operated by Drew Sepeczi. For
        privacy questions or requests, contact{" "}
        <a href="mailto:drewsepeczi@gmail.com">drewsepeczi@gmail.com</a>.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          Account information, including your email address, account identifier,
          and profile information provided when you sign up. Google sign-in
          provides basic identity information such as your name, email address,
          and profile picture. Sign in with Apple may provide your name and
          email address, including an Apple relay address if you hide your
          email.
        </li>
        <li>
          Content you provide or create, including messages, bot names and
          instructions, saved memories, files, and results generated while using
          your teammates.
        </li>
        <li>
          If you report an AI response, we store the reported response text,
          your selected reason, any details you choose to add, the relevant
          account and conversation identifiers, and report and review dates to
          investigate the report. The report does not copy your full
          conversation or tool results.
        </li>
        <li>
          Connected-service information and permissions you authorize, including
          connection identifiers and the data your teammates retrieve or act on
          when you request work.
        </li>
        <li>
          Subscription and usage information, including your plan, subscription
          status, model usage, and cloud computer usage. Payment details are
          handled by our payment providers; Krafty does not receive your full
          payment card number.
        </li>
        <li>
          Technical and diagnostic information, including request details,
          device or browser information, account and task identifiers, and
          errors needed to operate and troubleshoot the service.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>
        We use information to authenticate you, provide your workspace, generate
        AI responses, perform the tasks you request, operate connected tools and
        cloud computers, retain conversation context and saved memories, meter
        usage, process subscriptions, provide support, and investigate errors or
        misuse.
      </p>
      <p>
        Google sign-in is used for authentication. Access to other services is a
        separate connection that you authorize. Connecting a service may allow a
        teammate to retrieve information or make changes within the permissions
        you grant.
      </p>

      <h2>Service providers and AI processing</h2>
      <p>
        Operating Krafty requires sharing relevant information with service
        providers. These include Clerk for authentication and subscription
        management, Stripe for payments, Railway for app hosting, Neon for
        database and AI gateway services, Trigger.dev for background tasks and
        conversations, E2B for cloud computers, Composio for connected tools,
        and Sentry for diagnostics.
      </p>
      <p>
        Messages, instructions, relevant conversation context, tool results, and
        files or screenshots needed for your request may be processed by AI
        model providers through our AI gateway. Providers process this
        information under their own applicable terms and privacy policies. Avoid
        submitting information you are not authorized to share.
      </p>
      <p>
        The mobile app asks for permission before enabling AI features. You can
        withdraw that permission under Account, then AI data sharing.
        Withdrawing permission prevents new AI activity from that app
        installation. It does not cancel work already running, change
        permissions on other devices, or delete information already processed.
        When your account uses your connected ChatGPT plan, OpenAI processes the
        conversation through that connection.
      </p>
      <p>
        We do not sell your personal information. We may disclose information
        when required by law, to protect users or the service, or as part of a
        transfer of the business, subject to applicable requirements.
      </p>

      <h2>Cookies and storage</h2>
      <p>
        We and our authentication provider use cookies and browser storage for
        sign-in, session security, and preferences. Blocking essential cookies
        may prevent sign-in or other features from working.
      </p>

      <p>
        The mobile app uses secure device storage for sign-in tokens and your
        AI-processing permission. App updates may use an installation identifier
        to deliver compatible software updates. The app does not display
        advertisements or use this information for cross-app advertising
        tracking.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Workspace content, saved memories, and cloud computer files may persist
        between sessions to support ongoing work. Logging out or disconnecting
        an integration does not by itself delete existing conversations, files,
        or memories. You can use available bot and conversation deletion
        controls. On iPhone, Account includes a Delete account control. You can
        also request deletion through the{" "}
        <Link href="/delete-account">account deletion page</Link> or by
        contacting us.
      </p>
      <p>
        When account deletion completes, we delete your teammates, conversations
        and their history, memories, settings, cloud computer, and app and
        ChatGPT connections, cancel any paid subscription, and delete your
        sign-in account. Reports of AI responses are removed with the reported
        conversation or your account. We keep usage and billing records, which
        contain amounts and identifiers but no message content, for accounting.
      </p>
      <p>
        Trigger.dev, which runs your teammates’ conversations, processes your
        messages and replies. Copies of messages it handled can remain with
        Trigger.dev after you delete your account or a conversation. Task logs
        are retained according to our provider plan. We have not yet confirmed
        the retention period for message streams, task records, and previously
        saved conversation snapshots, or a supported way to erase those copies.
        Closing a conversation session does not delete them.
      </p>
      <p>
        We retain information as needed to provide the service and meet
        accounting, security, dispute-resolution, and legal requirements.
        Deletion may take time to complete across providers and backups. Data
        already sent to a connected service is also subject to that service’s
        controls and retention policies.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can update available account settings, disconnect integrations, and
        revoke access in the connected provider’s settings. Depending on your
        location, you may have rights to access, correct, delete, or obtain a
        copy of your information, or to object to certain processing. Send
        requests to{" "}
        <a href="mailto:drewsepeczi@gmail.com">drewsepeczi@gmail.com</a>; we may
        need to verify your identity.
      </p>

      <h2>Security, international processing, and children</h2>
      <p>
        We use account authentication and access controls to protect
        information. No online service can guarantee absolute security. Our
        providers may process information in countries outside your country of
        residence. Krafty is not intended for children under 13; contact us if
        you believe a child has provided personal information.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as the service changes and will update the
        date above. Where required, we will provide additional notice of
        material changes. Use of Krafty is also governed by our{" "}
        <Link href="/terms">terms of service</Link>.
      </p>
    </article>
  )
}
