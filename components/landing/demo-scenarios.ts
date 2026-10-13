export const demoScenarios = [
  {
    id: "research",
    label: "Research",
    name: "Ada",
    role: "Research assistant",
    prompt: "Compare three project tools for a small design studio.",
    response:
      "I’ll organize the tradeoffs around your team’s needs and turn them into a brief you can review.",
    steps: [
      "Read the studio brief",
      "Compare the supplied product notes",
      "Summarize the tradeoffs",
    ],
    file: "Studio tools · comparison brief",
    title: "The right tool for a small studio.",
    summary:
      "Choose around your workflow, rather than the longest feature list.",
    findings: [
      {
        label: "Keep planning light",
        text: "A simple board works well when a small team needs a shared view of what’s next.",
      },
      {
        label: "Bring context together",
        text: "If briefs and decisions are scattered, prioritize a workspace that keeps notes close to tasks.",
      },
      {
        label: "Test with one project",
        text: "Run a short trial using a real brief before moving the whole studio.",
      },
    ],
    memory:
      "We’re a small design studio. Keep recommendations practical and include the tradeoffs.",
    terminal: [
      "read /workspace/studio-brief.md",
      "read /workspace/product-notes.md",
      "write /workspace/comparison.md",
    ],
  },
  {
    id: "code",
    label: "Code review",
    name: "Kit",
    role: "Code reviewer",
    prompt: "Review this checkout handler for edge cases.",
    response:
      "I’ll inspect the example handler, trace its failure paths, and leave a short review with concrete fixes.",
    steps: [
      "Read the example handler",
      "Trace validation and retry paths",
      "Write the review",
    ],
    file: "Checkout handler · review notes",
    title: "Three checks before shipping.",
    summary: "A focused review of a fictional checkout handler.",
    findings: [
      {
        label: "Validate at the boundary",
        text: "Reject missing item IDs and invalid quantities before creating a checkout session.",
      },
      {
        label: "Make retries predictable",
        text: "Use an idempotency key so repeating a request doesn’t create duplicate checkouts.",
      },
      {
        label: "Handle provider failures",
        text: "Catch timeouts and return an actionable error instead of leaving the request pending.",
      },
    ],
    memory:
      "Prioritize correctness and edge cases. Suggest small fixes instead of broad rewrites.",
    terminal: [
      "read /workspace/checkout.ts",
      "inspect validation and retry paths",
      "write /workspace/review.md",
    ],
  },
  {
    id: "writing",
    label: "Writing",
    name: "Juno",
    role: "Writing editor",
    prompt: "Turn my scattered launch notes into a clear announcement.",
    response:
      "I’ll find the main idea, trim the repetition, and keep the announcement in your voice.",
    steps: [
      "Read the launch notes",
      "Find the main message",
      "Edit the announcement",
    ],
    file: "Launch announcement · edited draft",
    title: "Meet your next creative space.",
    summary: "An example announcement for a fictional studio workspace.",
    findings: [
      {
        label: "The idea",
        text: "We built a quieter place for your team to plan, share work, and keep a project moving.",
      },
      {
        label: "What’s inside",
        text: "Project boards, shared briefs, and a home for the decisions that usually get lost in chat.",
      },
      {
        label: "The invitation",
        text: "Bring one project. Make it your own. We’d love to hear what you create.",
      },
    ],
    memory:
      "Use plain language and short sentences. Keep the tone thoughtful and conversational.",
    terminal: [
      "read /workspace/launch-notes.md",
      "edit structure, clarity, and voice",
      "write /workspace/announcement.md",
    ],
  },
] as const
