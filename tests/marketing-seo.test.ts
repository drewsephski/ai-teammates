import assert from "node:assert/strict"
import { describe, it } from "node:test"

import sitemap from "@/app/sitemap"
import { useCaseGuides } from "@/app/use-cases/use-case-guides"
import { useCases } from "@/app/use-cases/use-cases-data"
import { faqs } from "@/components/landing/bot/faq-data"
import { planLimits } from "@/lib/billing-policy"
import { definition, pageMetadata } from "@/lib/marketing/content"
import { marketingSeoPages } from "@/lib/marketing/seo-pages"
import { homeJsonLd } from "@/lib/marketing/json-ld"
import { llmsFullTxt, llmsTxt } from "@/lib/marketing/llms"
import { robots, robotsTxt } from "@/lib/marketing/robots"
import {
  markdownForPath,
  markdownPaths,
  pricingMarkdown,
} from "@/lib/marketing/markdown"

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

  it("keeps every guide page's title and description within snippet limits", () => {
    const paths = new Set<string>()
    for (const page of marketingSeoPages) {
      assert.ok(!paths.has(page.path), page.path)
      paths.add(page.path)
      // The layout appends " · Krafty" (9 characters) to the title tag.
      assert.ok(
        page.title.length <= 51,
        `${page.path} title ${page.title.length}`
      )
      assert.ok(
        page.description.length >= 110 && page.description.length <= 158,
        `${page.path} description ${page.description.length}`
      )
      assert.ok(page.summary.length <= 130, `${page.path} summary`)
      assert.ok(page.faqs.length >= 4, `${page.path} faqs`)
      assert.ok(page.sections.length >= 5, `${page.path} sections`)
      for (const link of page.related) {
        assert.notEqual(link.href, page.path, `${page.path} links to itself`)
      }
    }
    const urls = sitemap().map((entry) => entry.url)
    assert.ok(urls.includes("https://kraftybot.app/download"))
  })

  it("names real alternatives on the comparison pages, without scores", () => {
    for (const path of ["/grokbot-alternatives", "/manus-alternatives"]) {
      const page = marketingSeoPages.find((entry) => entry.path === path)
      assert.ok(page, path)
      const section = page.sections.find((entry) => entry.id === "alternatives")
      assert.ok(section?.cards && section.cards.length >= 4, path)
      const external = section.cards.filter((card) =>
        card.href?.startsWith("https://")
      )
      assert.ok(external.length >= 3, `${path} links to vendors`)
      assert.ok(section.note?.includes("don't score"), path)
      const text = JSON.stringify(page)
      assert.ok(
        !/\d\s*\/\s*10\b|out of (5|10)|\brating\b/i.test(text),
        `${path} has a score`
      )
    }
  })

  it("tables the same products the comparison cards describe", () => {
    for (const path of ["/grokbot-alternatives", "/manus-alternatives"]) {
      const page = marketingSeoPages.find((entry) => entry.path === path)!
      const section = page.sections.find(
        (entry) => entry.id === "alternatives"
      )!
      const table = section.table
      assert.ok(table, path)
      assert.deepEqual(
        table.rows.map((row) => row.label),
        section.cards?.map((card) => card.title),
        path
      )
      for (const row of table.rows) {
        assert.equal(row.cells.length, table.columns.length, row.label)
      }
      assert.ok(markdownForPath(path)?.includes(`| ${table.rowHeader} |`), path)
    }
  })

  it("compares every roundup product on the same criteria, without scores", () => {
    const page = marketingSeoPages.find(
      (entry) => entry.path === "/best-ai-agents-small-business"
    )!
    const table = page.sections.find((entry) => entry.id === "table")?.table
    const cards = page.sections.find((entry) => entry.id === "agents")
    assert.ok(table && cards?.cards)
    assert.deepEqual(
      table.rows.map((row) => row.label),
      cards.cards.map((card) => card.title)
    )
    for (const row of table.rows) {
      assert.equal(row.cells.length, table.columns.length, row.label)
    }
    assert.ok(cards.note?.includes("don't score"))
    assert.ok(
      !/\d\s*\/\s*10\b|out of (5|10)|\brating\b|\$\d/i.test(
        JSON.stringify(cards.cards.slice(1))
      ),
      "other vendors carry no scores or prices"
    )
  })

  it("keeps the time cost calculator's worked example consistent with the formula", async () => {
    const { timeCost } = await import("@/lib/time-cost")
    const page = marketingSeoPages.find(
      (entry) => entry.path === "/time-cost-calculator"
    )!
    const result = timeCost([{ name: "Email", minutes: 30, perWeek: 5 }], 50)
    const example = page.sections.find((entry) => entry.id === "formula")!
    const text = example.bullets!.join(" ")
    assert.ok(text.includes(`${result.yearlyHours} hours a year`), text)
    assert.ok(
      text.includes(`$${result.yearlyCost.toLocaleString("en-US")} a year`),
      text
    )
  })

  it("has a Markdown copy of every public marketing page", () => {
    const legal = [
      "/privacy",
      "/terms",
      "/support",
      "/delete-account",
      "/download",
    ]
    for (const { url } of sitemap()) {
      const path = new URL(url).pathname
      if (legal.includes(path)) continue
      assert.ok(markdownPaths.has(path), path)
      const markdown = markdownForPath(path) ?? ""
      assert.ok(markdown.startsWith("# "), path)
      assert.ok(
        markdown.includes(`https://kraftybot.app${path === "/" ? "/" : path}`),
        path
      )
    }
    assert.equal(markdownForPath("/workspace"), null)
    assert.equal(
      markdownForPath("/how-it-works/"),
      markdownForPath("/how-it-works")
    )
  })

  it("lists both plans and their limits in pricing.md", () => {
    const pricing = pricingMarkdown()
    assert.ok(pricing.includes("## Free"))
    assert.ok(pricing.includes("$20 per month"))
    assert.ok(pricing.includes(`Up to ${planLimits.paid.bots} bots`))
    assert.ok(llmsTxt().includes("https://kraftybot.app/pricing.md"))
  })

  it("counts separate vendors as Manus alternatives", () => {
    const page = marketingSeoPages.find(
      (entry) => entry.path === "/manus-alternatives"
    )!
    const alternatives = page.sections.find(
      (section) => section.id === "alternatives"
    )!
    assert.equal(alternatives.cards?.length, 4)
    assert.match(page.title, /4 AI agents/)
    assert.ok(
      alternatives.cards?.every((card) => !card.href?.includes("manus.im"))
    )
    assert.ok(
      page.sections
        .find((section) => section.id === "before-switching")
        ?.body?.includes("not a separate alternative")
    )
  })

  it("puts the guide pages in llms-full.txt", () => {
    const full = llmsFullTxt()
    for (const page of marketingSeoPages) {
      assert.ok(full.includes(`### ${page.h1}`), page.path)
      assert.ok(full.includes(page.lead), page.path)
    }
  })

  it("gives every role page a first run, an example, questions, and pitfalls", () => {
    const sentences = new Map<string, string>()
    for (const useCase of useCases) {
      const guide = useCaseGuides[useCase.id]
      assert.ok(guide, useCase.id)
      assert.ok(guide.firstRun.length >= 3, useCase.id)
      assert.ok(/example/i.test(guide.sampleOutput.label), useCase.id)
      assert.ok(guide.sampleOutput.lines.length >= 3, useCase.id)
      assert.equal(guide.faqs.length, 4, useCase.id)
      for (const [, answer] of guide.faqs) {
        const words = answer.split(/\s+/).length
        assert.ok(words >= 35 && words <= 75, `${useCase.id}: ${words} words`)
        // Role pages must not share whole answers.
        assert.ok(
          !sentences.has(answer),
          `${useCase.id} repeats ${sentences.get(answer)}`
        )
        sentences.set(answer, useCase.id)
      }
      assert.ok(guide.pitfalls.length > 80, useCase.id)
      // Nothing in an example should look like a real address.
      for (const line of guide.sampleOutput.lines) {
        for (const email of line.match(/[\w.+-]+@[\w.-]+/g) ?? []) {
          assert.ok(email.endsWith(".example"), `${useCase.id}: ${email}`)
        }
      }
    }
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
    const text = robotsTxt()
    assert.match(
      text,
      /^User-Agent: \*\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\n/
    )
    assert.ok(text.includes("Sitemap: https://kraftybot.app/sitemap.xml\n"))
    assert.ok(
      text.includes("Agentmap: https://kraftybot.app/.well-known/ard.json\n")
    )
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

  it("links the organization and founder to their own profiles", () => {
    const graph = homeJsonLd()["@graph"] as Record<string, unknown>[]
    const organization = graph.find((node) => node["@type"] === "Organization")
    const founder = graph.find((node) => node["@type"] === "Person")
    assert.deepEqual(organization?.sameAs, [
      "https://www.linkedin.com/company/kraftybot/",
    ])
    assert.deepEqual(organization?.address, {
      "@type": "PostalAddress",
      addressLocality: "Chicago",
      addressRegion: "IL",
      addressCountry: "US",
    })
    const profiles = founder?.sameAs as string[]
    assert.ok(profiles.includes("https://github.com/drewsephski"))
    assert.ok(profiles.includes("https://x.com/SepecziDre72128"))
    for (const url of [...(organization?.sameAs as string[]), ...profiles]) {
      assert.match(url, /^https:\/\//, url)
    }
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
