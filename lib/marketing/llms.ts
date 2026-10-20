import { useCases } from "@/app/use-cases/use-cases-data"
import { faqs } from "@/components/landing/bot/faq-data"
import {
  absoluteUrl,
  capabilities,
  comparisons,
  definition,
  howItWorks,
  limitations,
  pricingFacts,
  safeguards,
} from "./content"
import { marketingUpdated, productName, siteDescription } from "./site"

// /llms.txt and /llms-full.txt (llmstxt.org): a plain Markdown map of the public
// site for AI assistants and answer engines, built from the same data as the
// pages so the two can't drift.

const list = (items: readonly string[]) =>
  items.map((item) => `- ${item}`).join("\n")

export function llmsTxt() {
  return `# ${productName}

> ${siteDescription}

${definition}

## Pages

- [Home](${absoluteUrl("/")}): what ${productName} is, features, pricing, and FAQs
- [How it works](${absoluteUrl("/how-it-works")}): Bots, memory, the shared cloud computer, connected apps, routines, approvals, and limits
- [Use cases](${absoluteUrl("/use-cases")}): jobs people give a Bot, each with a starter prompt
- [Pricing](${absoluteUrl("/#pricing")}): Free and Pro plans
- [Support](${absoluteUrl("/support")}): help and contact

## Use cases

${useCases
  .map(
    (useCase) =>
      `- [${useCase.name}](${absoluteUrl(`/use-cases/${useCase.id}`)}): ${useCase.summary}`
  )
  .join("\n")}

## Optional

- [Full text for AI assistants](${absoluteUrl("/llms-full.txt")})
- [Privacy policy](${absoluteUrl("/privacy")})
- [Terms of service](${absoluteUrl("/terms")})
`
}

export function llmsFullTxt() {
  return `# ${productName}

> ${siteDescription}

Updated ${marketingUpdated}. Source: ${absoluteUrl("/")}

## What ${productName} is

${definition}

## How it works

${howItWorks.map((step, index) => `${index + 1}. **${step.title}.** ${step.body}`).join("\n")}

## What a Bot has

${capabilities.map((capability) => `- **${capability.title}.** ${capability.body}`).join("\n")}

## What waits for you

${list(safeguards)}

## Limits

${list(limitations)}

## How it compares

${comparisons.map((comparison) => `- **${comparison.title}.** ${comparison.body}`).join("\n")}

## Pricing

${list(pricingFacts)}

## Use cases

${useCases
  .map(
    (useCase) => `### ${useCase.name}

${useCase.summary}

- Page: ${absoluteUrl(`/use-cases/${useCase.id}`)}
- Apps in the starter prompt: ${useCase.apps.join(", ")}
- Runs: ${useCase.schedule}

Starter prompt:

> ${useCase.prompt}`
  )
  .join("\n\n")}

## FAQs

${faqs.map(([question, answer]) => `### ${question}\n\n${answer}`).join("\n\n")}
`
}
