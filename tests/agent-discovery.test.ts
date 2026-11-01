import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { POST as mcpPost } from "@/app/mcp/route"
import config from "@/next.config"
import {
  agentSkillMarkdown,
  agentSkillsIndex,
  ardManifest,
  authMarkdown,
} from "@/lib/marketing/agent-discovery"
import {
  docsMcpServerCard,
  handleDocsMcpMessage,
  pricingUiUri,
  searchDocs,
} from "@/lib/marketing/docs-mcp"
import { llmsTxt } from "@/lib/marketing/llms"
import { markdownPaths } from "@/lib/marketing/markdown"
import { appSegments, markdownRewrite } from "@/lib/marketing/markdown-routing"
import { publicPlans } from "@/lib/marketing/site"

const rpc = (method: string, params: Record<string, unknown> = {}) => {
  const reply = handleDocsMcpMessage({ jsonrpc: "2.0", id: 1, method, params })
  assert.ok(reply && "result" in reply, `${method} failed`)
  return reply.result as Record<string, unknown>
}

describe("docs MCP server", () => {
  it("negotiates a protocol version and advertises MCP Apps", () => {
    const result = rpc("initialize", { protocolVersion: "2025-06-18" })
    assert.equal(result.protocolVersion, "2025-06-18")
    const unknown = rpc("initialize", { protocolVersion: "1999-01-01" })
    assert.equal(unknown.protocolVersion, "2025-11-25")
    const capabilities = result.capabilities as Record<string, unknown>
    assert.ok(capabilities.tools && capabilities.resources)
    assert.deepEqual(
      (capabilities.extensions as Record<string, unknown>)[
        "io.modelcontextprotocol/ui"
      ],
      { mimeTypes: ["text/html;profile=mcp-app"] }
    )
  })

  it("ignores notifications and rejects unknown methods", () => {
    assert.equal(
      handleDocsMcpMessage({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      null
    )
    const reply = handleDocsMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "bots/create",
    })
    assert.ok(reply && "error" in reply)
    assert.equal(reply.error.code, -32601)
  })

  it("exposes only read-only tools, with a UI for pricing", () => {
    const { tools } = rpc("tools/list") as {
      tools: {
        name: string
        annotations: { readOnlyHint: boolean }
        _meta?: { ui?: { resourceUri: string } }
      }[]
    }
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["search_krafty_docs", "get_krafty_page", "get_krafty_pricing"]
    )
    for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true)
    const pricing = tools.find((tool) => tool.name === "get_krafty_pricing")
    assert.equal(pricing?._meta?.ui?.resourceUri, pricingUiUri)

    const { resources } = rpc("resources/list") as {
      resources: { uri: string; mimeType: string }[]
    }
    assert.ok(
      resources.some(
        (resource) =>
          resource.uri === pricingUiUri &&
          resource.mimeType === "text/html;profile=mcp-app"
      )
    )
    const { contents } = rpc("resources/read", { uri: pricingUiUri }) as {
      contents: { text: string; mimeType: string }[]
    }
    assert.equal(contents[0].mimeType, "text/html;profile=mcp-app")
    assert.match(contents[0].text, /^<!doctype html>/)
    assert.match(contents[0].text, /ui\/initialize/)
    for (const plan of publicPlans) {
      assert.ok(contents[0].text.includes(plan.name), plan.name)
    }
  })

  it("searches and reads the public pages", () => {
    const results = searchDocs("approval")
    assert.ok(results.length > 0)
    for (const result of results) assert.ok(markdownPaths.has(result.path))

    const page = rpc("tools/call", {
      name: "get_krafty_page",
      arguments: { path: "https://kraftybot.app/how-it-works.md" },
    }) as { content: { text: string }[]; isError?: boolean }
    assert.equal(page.isError, undefined)
    assert.match(page.content[0].text, /^# How Krafty Bot works/)

    const missing = rpc("tools/call", {
      name: "get_krafty_page",
      arguments: { path: "https://example.com/how-it-works" },
    }) as { isError?: boolean }
    assert.equal(missing.isError, true)

    const pricing = rpc("tools/call", { name: "get_krafty_pricing" }) as {
      structuredContent: { plans: { priceUsd: number }[] }
    }
    assert.deepEqual(
      pricing.structuredContent.plans.map((plan) => plan.priceUsd),
      publicPlans.map((plan) => plan.price)
    )
  })

  it("answers JSON-RPC over POST, and 202 for notifications", async () => {
    const post = (body: unknown) =>
      mcpPost(
        new Request("https://kraftybot.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      )
    const reply = await post({ jsonrpc: "2.0", id: 7, method: "ping" })
    assert.equal(reply.status, 200)
    assert.deepEqual(await reply.json(), { jsonrpc: "2.0", id: 7, result: {} })

    const notification = await post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })
    assert.equal(notification.status, 202)

    const broken = await mcpPost(
      new Request("https://kraftybot.app/mcp", { method: "POST", body: "{" })
    )
    assert.equal(broken.status, 400)
  })
})

describe("agent discovery files", () => {
  it("points the server card and ARD manifest at the MCP endpoint", () => {
    const card = docsMcpServerCard()
    assert.equal(card.serverInfo.name, "krafty-docs")
    assert.equal(card.transport.endpoint, "https://kraftybot.app/mcp")
    assert.equal(card.authentication.required, false)

    const manifest = ardManifest()
    assert.ok(manifest.specVersion)
    assert.ok(manifest.host.displayName && manifest.host.identifier)
    for (const entry of manifest.entries) {
      assert.match(entry.identifier, /^urn:air:kraftybot\.app:/)
      assert.ok(entry.displayName && entry.type && entry.url, entry.identifier)
      assert.ok(entry.representativeQueries.length >= 2, entry.identifier)
    }
    assert.ok(
      manifest.entries.some(
        (entry) =>
          entry.url === "https://kraftybot.app/.well-known/mcp/server-card.json"
      )
    )
  })

  it("lists the skill with the digest of the text it serves", () => {
    const [skill] = agentSkillsIndex().skills
    const expected = createHash("sha256")
      .update(agentSkillMarkdown(), "utf8")
      .digest("hex")
    assert.equal(skill.digest, `sha256:${expected}`)
    assert.match(skill.name, /^[a-z0-9-]+$/)
    assert.match(agentSkillMarkdown(), /^---\nname: krafty-docs\n/)
  })

  it("says plainly that agents can't sign in", () => {
    const auth = authMarkdown()
    assert.match(auth.split("\n")[0], /^# .*auth\.md/)
    assert.match(auth, /no agent registration/)
    assert.match(auth, /\/api\/v1/)
  })

  it("links the agent resources from llms.txt and the home page headers", async () => {
    const index = llmsTxt()
    assert.ok(index.includes("https://kraftybot.app/mcp"))
    assert.ok(index.includes("https://kraftybot.app/.well-known/ard.json"))
    const rules = await config.headers!()
    const link = rules
      .find((rule) => rule.source === "/")
      ?.headers.find((header) => header.key === "Link")?.value
    assert.match(link ?? "", /<\/\.well-known\/ard\.json>; rel="ard"/)
  })
})

describe("Markdown routing for agents", () => {
  const params = (query = "") => new URLSearchParams(query)
  const markdown = "text/markdown, text/html;q=0.9"
  const browser = "text/html,application/xhtml+xml,*/*;q=0.8"

  it("serves Markdown copies at .md URLs, ?mode=agent and Accept", () => {
    assert.equal(markdownRewrite("/index.md", params(), browser), "/md")
    assert.equal(
      markdownRewrite("/how-it-works.md", params(), browser),
      "/md/how-it-works"
    )
    assert.equal(markdownRewrite("/", params("mode=agent"), browser), "/md")
    assert.equal(
      markdownRewrite("/use-cases", params(), markdown),
      "/md/use-cases"
    )
  })

  it("leaves people, files and real routes alone", () => {
    assert.equal(markdownRewrite("/", params(), browser), null)
    assert.equal(markdownRewrite("/how-it-works", params(), null), null)
    assert.equal(markdownRewrite("/pricing.md", params(), browser), null)
    assert.equal(markdownRewrite("/auth.md", params(), markdown), null)
    assert.equal(
      markdownRewrite(
        "/.well-known/agent-skills/krafty-docs/SKILL.md",
        params(),
        browser
      ),
      null
    )
    assert.equal(markdownRewrite("/workspace", params(), markdown), null)
    assert.equal(markdownRewrite("/robots.txt", params(), markdown), null)
    assert.equal(markdownRewrite("/no-such-page", params(), browser), null)
  })

  it("sends agents a Markdown 404 for paths with no route", () => {
    assert.equal(
      markdownRewrite("/no-such-page", params(), markdown),
      "/md/no-such-page"
    )
    assert.equal(
      markdownRewrite("/no-such-page.md", params(), browser),
      "/md/no-such-page"
    )
  })

  it("knows every top-level route under app/", () => {
    const app = join(process.cwd(), "app")
    const segments = new Set<string>()
    // Git doesn't keep empty folders, so a folder with no files is no route.
    const hasFiles = (dir: string): boolean =>
      readdirSync(dir, { withFileTypes: true }).some((entry) =>
        entry.isDirectory() ? hasFiles(join(dir, entry.name)) : true
      )
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const path = join(dir, entry.name)
        if (/^\(.+\)$/.test(entry.name)) visit(path)
        else if (!entry.name.startsWith("_") && hasFiles(path)) {
          segments.add(entry.name)
        }
      }
    }
    visit(app)
    assert.deepEqual([...segments].sort(), [...appSegments].sort())
  })
})
