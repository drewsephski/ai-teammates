import { registerHooks } from "node:module"

// Node's component tests exercise DOM behavior; the browser owns CSS layout.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css"))
      return {
        format: "module",
        source: "export default {}",
        shortCircuit: true,
      }
    return nextLoad(url, context)
  },
})
