import { useCaseGuides } from "@/app/use-cases/use-case-guides"
import { useCases } from "@/app/use-cases/use-cases-data"
import { faqs } from "@/components/landing/bot/faq-data"
import {
  absoluteUrl,
  capabilities,
  comparisons,
  definition,
  definitionShort,
  howItWorks,
  limitations,
  pricingFacts,
  safeguards,
  spendControls,
} from "./content"
import {
  marketingSeoPages,
  type MarketingPage,
  type MarketingSection,
  type MarketingTable,
} from "./seo-pages"
import {
  marketingUpdated,
  productName,
  publicPlans,
  siteDescription,
} from "./site"

// Markdown copies of the public pages, for AI agents that ask for
// `text/markdown` (proxy.ts rewrites those requests to /md/...) and for
// llms-full.txt. Built from the same data as the HTML pages, so the two can't
// drift.

export const list = (items: readonly string[]) =>
  items.map((item) => `- ${item}`).join("\n")

const numbered = (items: readonly string[]) =>
  items.map((item, index) => `${index + 1}. ${item}`).join("\n")

const cell = (text: string) => text.replaceAll("|", "\\|")

export function tableMarkdown(table: MarketingTable) {
  const header = [table.rowHeader, ...table.columns]
  return [
    `_${table.caption}_`,
    "",
    `| ${header.map(cell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...table.rows.map(
      (row) => `| ${[row.label, ...row.cells].map(cell).join(" | ")} |`
    ),
  ].join("\n")
}

/** Links in Markdown are absolute, since the copy is read away from the site. */
const link = (label: string, href: string) =>
  `[${label}](${href.startsWith("/") ? absoluteUrl(href) : href})`

export function sectionMarkdown(section: MarketingSection, level: number) {
  const parts = [`${"#".repeat(level)} ${section.title}`]
  if (section.body) parts.push(section.body)
  if (section.bullets) parts.push(list(section.bullets))
  if (section.table) parts.push(tableMarkdown(section.table))
  if (section.cards)
    parts.push(
      section.cards
        .map((card) => `- **${card.title}.** ${card.body}`)
        .join("\n")
    )
  if (section.note) parts.push(`_${section.note}_`)
  if (section.links)
    parts.push(list(section.links.map((item) => link(item.label, item.href))))
  return parts.join("\n\n")
}

const faqMarkdown = (
  items: readonly (readonly [string, string])[],
  level: number
) =>
  items
    .map(
      ([question, answer]) => `${"#".repeat(level)} ${question}\n\n${answer}`
    )
    .join("\n\n")

const footer = (path: string) =>
  `---\n\nUpdated ${marketingUpdated}. Page: ${absoluteUrl(path)}`

export function marketingPageMarkdown(page: MarketingPage) {
  return `# ${page.h1}

${page.lead}

${page.sections.map((section) => sectionMarkdown(section, 2)).join("\n\n")}
${
  page.useCases && page.useCases.length > 0
    ? `\n## ${page.useCasesTitle ?? "Starter prompts"}\n\n${page.useCases
        .map(
          (useCase) =>
            `- **${link(useCase.title, useCase.href)}.** ${useCase.body}`
        )
        .join("\n")}\n`
    : ""
}
## FAQs

${faqMarkdown(page.faqs, 3)}

## Related pages

${list(page.related.map((item) => `${link(item.label, item.href)}: ${item.description}`))}

${footer(page.path)}
`
}

export function pricingMarkdown() {
  return `# Pricing: ${productName}

Prices in US dollars. Source: ${absoluteUrl("/#pricing")}

${publicPlans
  .map(
    (plan) => `## ${plan.name}

- Price: ${plan.price === 0 ? "$0" : `$${plan.price} per ${plan.period}`}
- ${plan.summary}
${list(plan.features)}`
  )
  .join("\n\n")}

## Notes

${list(pricingFacts)}

## What a task costs

${list(spendControls)}

${footer("/#pricing")}
`
}

function homeMarkdown() {
  return `# ${productName}

> ${siteDescription}

${definitionShort}

## What is ${productName}?

${definition}

## How it works

${numbered(howItWorks.map((step) => `**${step.title}.** ${step.body}`))}

## What a Bot has

${list(capabilities.map((capability) => `**${capability.title}.** ${capability.body}`))}

## Pricing

${list(pricingFacts)}

Plans in Markdown: ${absoluteUrl("/pricing.md")}

## FAQs

${faqMarkdown(faqs, 3)}

## More

- ${link("How it works", "/how-it-works")}
- ${link("Use cases", "/use-cases")}
${list(marketingSeoPages.map((page) => link(page.h1, page.path)))}

${footer("/")}
`
}

function howItWorksMarkdown() {
  return `# How ${productName} works

${definition}

## From a message to finished work

${numbered(howItWorks.map((step) => `**${step.title}.** ${step.body}`))}

## What every Bot has

${list(capabilities.map((capability) => `**${capability.title}.** ${capability.body}`))}

## What waits for your approval

${list(safeguards)}

## What a task costs

${list(spendControls)}

## How it compares

${list(comparisons.map((comparison) => `**${comparison.title}.** ${comparison.body}`))}

## What it doesn't do

${list(limitations)}

## What it costs

${list(pricingFacts)}

${footer("/how-it-works")}
`
}

function useCasesMarkdown() {
  return `# AI teammate use cases

${productName} teammates sign in to your tools, work on their own cloud computer, and come back with finished work for you to review. Each job below has a starter prompt you can paste into a new Bot.

${useCases
  .map(
    (useCase) => `## ${link(useCase.name, `/use-cases/${useCase.id}`)}

${useCase.description}

Starter prompt:

> ${useCase.prompt}`
  )
  .join("\n\n")}

${footer("/use-cases")}
`
}

function useCaseMarkdown(useCase: (typeof useCases)[number]) {
  const guide = useCaseGuides[useCase.id]
  return `# ${useCase.headline}

${useCase.summary}

## What the Bot does

${numbered(useCase.steps.map((step) => `${step}.`))}

## What waits for you

${list(useCase.waitsForYou.map((item) => `${item}.`))}

Reading your apps needs no approval. Anything that writes to them waits for you.

## Your first run

${numbered(guide.firstRun)}

## Apps and schedule

- Apps in the starter prompt: ${useCase.apps.join(", ")}
- When it runs: ${useCase.schedule}

## Starter prompt

> ${useCase.prompt}

## Where this job goes wrong

${guide.pitfalls}

## Questions about this role

${faqMarkdown(guide.faqs, 3)}

${footer(`/use-cases/${useCase.id}`)}
`
}

const pages = new Map<string, () => string>([
  ["/", homeMarkdown],
  ["/how-it-works", howItWorksMarkdown],
  ["/use-cases", useCasesMarkdown],
  ...useCases.map(
    (useCase) =>
      [`/use-cases/${useCase.id}`, () => useCaseMarkdown(useCase)] as const
  ),
  ...marketingSeoPages.map(
    (page) => [page.path, () => marketingPageMarkdown(page)] as const
  ),
])

/** Public paths with a Markdown copy. */
export const markdownPaths: ReadonlySet<string> = new Set(pages.keys())

/** The Markdown copy of a public page, or null when it has none. */
export function markdownForPath(path: string) {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path
  return pages.get(normalized)?.() ?? null
}

/** Where the Markdown copy of a page is served directly. */
export const markdownHref = (path: string) =>
  path === "/" ? "/md" : `/md${path}`
