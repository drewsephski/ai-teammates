import assert from "node:assert/strict"
import { describe, it } from "node:test"

import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { useCases } from "@/app/use-cases/use-cases-data"
import { faqs } from "@/components/landing/bot/faq-data"
import { planLimits } from "@/lib/billing-policy"
import { definition, pageMetadata } from "@/lib/marketing/content"
import { marketingSeoPages } from "@/lib/marketing/seo-pages"
import { homeJsonLd } from "@/lib/marketing/json-ld"
import { llmsFullTxt, llmsTxt } from "@/lib/marketing/llms"

describe("public pages for search and AI answers", () => {
  it("lists every role page in the sitemap and llms.txt", () => {
    const urls = sitemap().map((entry) => entry.url)
    const index = llmsTxt()
    for (const useCase of useCases) {
      const url = `https://kraftybot.app/use-cases/${useCase.id}`
      assert.ok(urls.includes(url), url)
      assert.ok(index.includes(url), url)
    }
    assert.ok(urls.includes("https://kraftybot.app/how-it-works"))
    for (const page of marketingSeoPages) {
      const url = `https://kraftybot.app${page.path}`
      assert.ok(urls.includes(url), url)
      assert.ok(index.includes(url), url)
    }
    assert.equal(new Set(urls).size, urls.length)
  })

  it("gives every role page its own content", () => {
    for (const useCase of useCases) {
      assert.ok(useCase.prompt, useCase.id)
      assert.ok(useCase.headline && useCase.summary, useCase.id)
      assert.ok(useCase.steps.length >= 3, useCase.id)
      assert.ok(useCase.waitsForYou.length >= 1, useCase.id)
      assert.ok(useCase.apps.length >= 1, useCase.id)
      // The first sentence is the meta description.
      const snippet = useCase.summary.split(/(?<=\.)\s/)[0]
      assert.ok(snippet.length <= 160, `${useCase.id}: ${snippet.length}`)
    }
    const headlines = useCases.map((useCase) => useCase.headline)
    assert.equal(new Set(headlines).size, headlines.length)
  })

  it("puts the FAQs and the plan limits in llms-full.txt", () => {
    const full = llmsFullTxt()
    for (const [question, answer] of faqs) {
      assert.ok(full.includes(question), question)
      assert.ok(full.includes(answer), question)
    }
    assert.ok(full.includes(`up to ${planLimits.paid.bots} bots`))
    assert.ok(full.includes(definition))
  })

  it("answers what Krafty Bot is first", () => {
    assert.equal(faqs[0][0], "What is Krafty Bot?")
    const words = definition.split(/\s+/).length
    assert.ok(words >= 40 && words <= 75, `${words} words`)
  })

  it("keeps private routes out of every crawler group", () => {
    const { rules } = robots()
    assert.ok(Array.isArray(rules))
    for (const rule of rules) {
      assert.ok([rule.disallow].flat().includes("/workspace"))
      assert.ok([rule.disallow].flat().includes("/api/"))
    }
    const agents = rules.flatMap((rule) => [rule.userAgent].flat())
    for (const bot of ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]) {
      assert.ok(agents.includes(bot), bot)
    }
  })

  it("keeps the social image on pages that set their own Open Graph", () => {
    const metadata = pageMetadata({
      path: "/how-it-works",
      title: "How it works",
      description: "About the product.",
    })
    assert.equal(metadata.alternates?.canonical, "/how-it-works")
    assert.equal(metadata.openGraph?.url, "/how-it-works")
    assert.ok([metadata.openGraph?.images].flat().length > 0)
  })

  it("uses only valid offer pricing in structured data", () => {
    const graph = homeJsonLd()["@graph"] as Record<string, unknown>[]
    const app = graph.find((node) => node["@type"] === "SoftwareApplication")
    const offers = app?.offers as Record<string, unknown>[]
    for (const offer of offers) {
      assert.equal(offer.availability, "https://schema.org/InStock")
      const spec = offer.priceSpecification as
        Record<string, unknown> | undefined
      assert.equal(spec?.unitCode, undefined)
    }
  })
})
