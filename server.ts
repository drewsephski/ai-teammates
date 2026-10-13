import { createServer } from "node:http"
import nextEnv from "@next/env"
import next from "next"

// The gateway runs outside Next's compiler, so load env before its imports.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")
const { upgradeDesktop } = await import("./lib/desktop-gateway")
const dev = process.env.NODE_ENV !== "production"
const port = Number(process.env.PORT || 3000)
const app = next({ dev, port })
await app.prepare()
const handle = app.getRequestHandler()
const upgrade = app.getUpgradeHandler()
const server = createServer((request, response) => handle(request, response))
server.on("upgrade", (request, socket, head) => {
  if (request.url?.startsWith("/api/chats/"))
    void upgradeDesktop(request, socket, head)
  else void upgrade(request, socket, head)
})
server.listen(port, "0.0.0.0", () =>
  console.log(`Server listening on port ${port}`)
)
