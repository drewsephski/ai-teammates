import { createHash } from "node:crypto"

import { absoluteUrl } from "./content"
import { docsMcpName, docsMcpPath } from "./docs-mcp"
import { brandName, productName, siteDescription } from "./site"

// Discovery files that tell AI agents what kraftybot.app offers them:
// /.well-known/ard.json (Agentic Resource Discovery, also served at its
// predecessor path ai-catalog.json), the agent skills index, the skill itself
// and /auth.md. Every line must stay true: only the public pages, their
// Markdown copies and the read-only docs MCP server are open to agents.

const host = new URL(absoluteUrl("/")).host

export const agentSkillName = "krafty-docs"
export const agentSkillPath = `/.well-known/agent-skills/${agentSkillName}/SKILL.md`

export function agentSkillMarkdown() {
  return `---
name: ${agentSkillName}
description: Look up facts about ${productName} (${host}) - what it is, how its Bots work, approvals and safeguards, pricing, and use cases - from its Markdown pages or its read-only MCP server. Use when someone asks about ${brandName}, ${productName}, or ${host}.
---

# ${productName} docs

${siteDescription}

Everything here is public and read-only. No sign-in, no API key.

## Read the pages as Markdown

- Index of every public page: ${absoluteUrl("/llms.txt")}
- All of it in one file: ${absoluteUrl("/llms-full.txt")}
- Any public page as Markdown: add \`.md\` to its path (${absoluteUrl("/how-it-works.md")}, ${absoluteUrl("/index.md")} for the home page), or request the page with \`Accept: text/markdown\`.
- Plans and limits: ${absoluteUrl("/pricing.md")}

## Use the MCP server

Streamable HTTP, no authentication: ${absoluteUrl(docsMcpPath)}

- \`search_krafty_docs\` with a \`query\` returns matching pages and their paths.
- \`get_krafty_page\` with a \`path\` returns that page as Markdown.
- \`get_krafty_pricing\` returns the plans, with a pricing card for hosts that support MCP Apps.

## What agents can't do here

${productName} has no API for agents yet. Agents can't sign in, create Bots or act in someone's account. Send people to ${absoluteUrl("/sign-up")} to start, or ${absoluteUrl("/workspace")} if they have an account. Details: ${absoluteUrl("/auth.md")}
`
}

const digest = (text: string) =>
  `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`

/** /.well-known/agent-skills/index.json (Agent Skills Discovery 0.2.0). */
export function agentSkillsIndex() {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: agentSkillName,
        type: "skill-md",
        description: `Look up ${productName}'s features, safeguards, pricing and use cases from its Markdown pages or read-only MCP server.`,
        url: agentSkillPath,
        digest: digest(agentSkillMarkdown()),
      },
    ],
  }
}

/** /.well-known/ard.json: the agentic resources this site publishes. */
export function ardManifest() {
  return {
    specVersion: "1.0",
    host: {
      displayName: brandName,
      identifier: `did:web:${host}`,
      url: absoluteUrl("/"),
    },
    entries: [
      {
        identifier: `urn:air:${host}:mcp:${docsMcpName}`,
        displayName: `${productName} docs MCP server`,
        description: `Read-only MCP server over ${productName}'s public pages, with search, page reads and pricing.`,
        type: "application/mcp-server-card+json",
        url: absoluteUrl("/.well-known/mcp/server-card.json"),
        representativeQueries: [
          "what is Krafty Bot",
          "how much does Krafty Bot cost",
          "does Krafty ask before sending email",
          "AI agent that works in my apps on a cloud computer",
        ],
      },
      {
        identifier: `urn:air:${host}:skill:${agentSkillName}`,
        displayName: `${productName} docs skill`,
        description: `How an agent reads ${productName}'s public pages as Markdown or through its MCP server.`,
        type: "application/agent-skills+md",
        url: absoluteUrl(agentSkillPath),
        representativeQueries: [
          "read Krafty Bot documentation as markdown",
          "Krafty Bot use cases and starter prompts",
          "Krafty Bot approvals and safeguards",
        ],
      },
      {
        identifier: `urn:air:${host}:docs:llms-txt`,
        displayName: `${productName} llms.txt`,
        description: `Index of ${productName}'s public pages for AI assistants.`,
        type: "text/markdown",
        url: absoluteUrl("/llms.txt"),
        representativeQueries: [
          "Krafty Bot pages for AI assistants",
          "Krafty Bot features and pricing summary",
        ],
      },
    ],
  }
}

/** /auth.md: how agents authenticate here, which today is not at all. */
export function authMarkdown() {
  return `# ${host} auth.md

How AI agents authenticate with ${productName}.

## Audience

AI agents, assistants and crawlers that read ${host} or act for a person who uses ${productName}.

## What needs no credentials

- Every public page, and its Markdown copy (add \`.md\` to the path, or send \`Accept: text/markdown\`).
- ${absoluteUrl("/llms.txt")} and ${absoluteUrl("/llms-full.txt")}.
- The read-only docs MCP server at ${absoluteUrl(docsMcpPath)} (Streamable HTTP). Its server card is ${absoluteUrl("/.well-known/mcp/server-card.json")}.

## Agent registration

${productName} has no agent registration, no OAuth client registration and no API keys. There is no endpoint where an agent can create an account or get a credential, so there is no \`/agent/auth\` endpoint and no OAuth metadata.

## Acting for a person

Agents can't sign in to someone's ${productName} account or act in it. The account API at \`/api/v1\` accepts only session tokens from ${brandName}'s own apps, for the person signed in to them. Send the person to ${absoluteUrl("/sign-up")} to start, or ${absoluteUrl("/workspace")} if they have an account; they sign in themselves.

Inside ${productName}, the person's own Bots act for them, and anything that writes to a connected app waits for their approval.

## Contact

${absoluteUrl("/support")}
`
}
