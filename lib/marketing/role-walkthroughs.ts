export type RoleWalkthrough = {
  slug: "sales-outbound" | "support-triage"
  title: string
  transcript: readonly string[]
}

const walkthroughs: readonly RoleWalkthrough[] = [
  {
    slug: "sales-outbound",
    title: "From a sales brief to one approved send",
    transcript: [
      "Ask the Sales Outbound Bot to find three accounts, draft the emails, and send nothing.",
      "The Bot researches a buying signal and keeps its source beside the account.",
      "It ranks three accounts for review, then prepares a short email draft.",
      "Review the recipient, subject, and body. Approve one send; leave the other drafts waiting.",
      "The Bot confirms the send in chat and tells you which drafts remain. This animation uses sample data; it does not send a real email.",
    ],
  },
  {
    slug: "support-triage",
    title: "From a support queue to reviewed replies and bug links",
    transcript: [
      "Ask the Support Triage Bot to read new tickets, draft replies from the help center, and flag bugs.",
      "The Bot separates how-to, billing, and bug reports, then grounds a draft in a help-center article.",
      "It finds an existing issue for the bug and proposes linking the ticket to it.",
      "Review and approve the reply and each proposed change before anything is written to a connected app.",
      "The Bot confirms what changed and what still needs finance. This animation uses sample data; it does not change real tickets or send a real reply.",
    ],
  },
]

export function roleWalkthroughFor(slug: string) {
  return walkthroughs.find((walkthrough) => walkthrough.slug === slug)
}

export function walkthroughAsset(
  slug: RoleWalkthrough["slug"],
  format: "16x9" | "9x16",
  extension: "mp4" | "webp"
) {
  return `/marketing/walkthroughs/${slug}-${format}.${extension}`
}
