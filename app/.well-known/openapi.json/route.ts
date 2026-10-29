import { absoluteUrl } from "@/lib/marketing/content"

// Describes the HTTP transport; MCP methods and tools are discovered by MCP.
export function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Krafty public docs MCP API",
      version: "1.0.0",
      description:
        "Public, read-only documentation over stateless MCP Streamable HTTP. No authentication. Account operations are unavailable. Discover tools with tools/list after initialize.",
    },
    servers: [{ url: absoluteUrl("/").replace(/\/$/, "") }],
    paths: {
      "/mcp": {
        post: {
          operationId: "docsMcpMessage",
          summary: "Send an MCP JSON-RPC message or batch",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/Message" },
                    {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/Message" },
                    },
                  ],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "JSON-RPC response or batch, including RPC errors",
              content: { "application/json": { schema: {} } },
            },
            "202": { description: "Notification accepted; no response body" },
            "400": { description: "Invalid JSON or empty batch" },
          },
        },
      },
    },
    components: {
      schemas: {
        Message: {
          type: "object",
          properties: {
            jsonrpc: { type: "string", const: "2.0" },
            id: { type: ["string", "number", "null"] },
            method: { type: "string" },
            params: { type: "object", additionalProperties: true },
          },
          required: ["jsonrpc"],
          additionalProperties: true,
        },
      },
    },
  })
}
