// Live check of a computer made from the krafty-desktop template: the shell
// user can't reach the desktop, and readScreen, clickElement, fillElement and
// openOnScreen work in the real Firefox. Opt-in, not part of `pnpm test`:
//
//   pnpm exec tsx --env-file=.env.local scripts/verify-screen-reader.ts [dir]
//
// Spends a few minutes of E2B Hobby time on one throwaway computer, deleted at
// the end. Every gesture is let through without the guard, so no model calls.
// No database rows are written: the computer has no owner.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { mock } from "node:test"
import { CommandExitError, Sandbox, type SandboxOpts } from "@e2b/desktop"

import { createAccountSandbox, deleteSandbox, withComputer } from "@/lib/e2b"
import { SHELL_HOME, SHELL_USER } from "@/lib/computer-shell"
import { createSandboxTools } from "@/lib/sandbox-tools"
import { screenReaderCommand } from "@/lib/screen-reader"

function isStream<T>(value: T | AsyncIterable<T>): value is AsyncIterable<T> {
  return (
    typeof value === "object" && value !== null && Symbol.asyncIterator in value
  )
}

async function result<T>(
  value: T | AsyncIterable<T> | PromiseLike<T | AsyncIterable<T>>
): Promise<T> {
  const output = await value
  if (isStream(output))
    throw new Error("Verification expected a completed tool result")
  return output
}

const directory = process.argv[2] ?? ".artifacts/screen-reader"
// Kept out of the production meter's and orphan cleanup's way
const originalCreate: (
  this: typeof Sandbox,
  template: string,
  options: SandboxOpts
) => Promise<Sandbox> = Sandbox.create
// Called on the class that called it, so createAccountSandbox's subclass
// still starts the display its own way
mock.method(
  Sandbox,
  "create",
  function (this: typeof Sandbox, template: string, options: SandboxOpts) {
    return originalCreate.call(this, template, {
      ...options,
      metadata: { ...options.metadata, app: "ai-teammates-verification" },
    })
  }
)
await mkdir(directory, { recursive: true })

const report: Record<string, unknown> = { checkedAt: new Date().toISOString() }
const started = Date.now()
const sandboxId = await createAccountSandbox(`verify-${randomUUID()}`)
report.sandboxId = sandboxId
console.log(`Computer ${sandboxId} created and hardened`)

const tools = createSandboxTools(() => sandboxId, {
  gesture: async () => ({}),
  shell: async () => ({}),
  complete: async () => {},
})
const options = { toolCallId: "verification", messages: [], context: {} }

// Runs as the shell user from its home and reports whether the command
// succeeded. A command that couldn't start at all is an error, never a denial.
async function asShell(sandbox: Sandbox, command: string) {
  try {
    const run = await sandbox.commands.run(command, {
      user: SHELL_USER,
      cwd: SHELL_HOME,
      timeoutMs: 15_000,
    })
    return { ok: true, output: run.stdout.trim().slice(0, 400) }
  } catch (error) {
    if (!(error instanceof CommandExitError)) throw error
    return {
      ok: false,
      output: `${error.stdout}${error.stderr}`.trim().slice(0, 400),
    }
  }
}

// Reads the screen until it's readable: a first Firefox start makes its
// profile, which takes a while. Keeps the walker's raw output when it isn't.
async function readScreenSoon(label: string, expect?: RegExp) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const read = await result(tools.readScreen.execute!({}, options))
    if (read.status === "read" && (!expect || expect.test(read.text)))
      return read
    report[`${label}Last`] = read
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  report[`${label}Raw`] = await withComputer(sandboxId, async (sandbox) => {
    const screen = await sandbox.getScreenSize()
    const raw = await sandbox.commands
      .run(screenReaderCommand(screen), { timeoutMs: 25_000 })
      .catch((error: { stdout?: string; stderr?: string }) => error)
    return `${raw.stdout ?? ""}\n${raw.stderr ?? ""}`.slice(0, 4000)
  })
  const shot = await result(tools.viewScreen.execute!({}, options))
  await writeFile(
    `${directory}/${label}-unreadable.png`,
    Buffer.from(shot.base64, "base64")
  )
  throw new Error(`${label}: the screen stayed unreadable`)
}

try {
  // What the shell user can and can't reach
  await withComputer(sandboxId, async (sandbox) => {
    await sandbox.stream.start()
    const diagnostics = await sandbox.commands.run(
      [
        "readlink -f /usr/bin/firefox-esr",
        "head -c 200 $(readlink -f /usr/bin/firefox-esr)",
        "echo; ls -ld /home/user /home/worker /home/worker/Downloads",
        "cat /etc/resolv.conf | grep nameserver",
        "ss -ltnH | awk '{print $4}' | sort -u | tr '\\n' ' '",
        "echo; nft list ruleset",
        "xhost",
        "pgrep -a at-spi || echo 'no at-spi process'",
        "hostname -I",
        "echo; echo world-writable dirs without sticky:; find / -xdev -type d -perm -0002 ! -perm -1000 2>/dev/null | head -n 20",
      ].join("; "),
      { user: "root", timeoutMs: 15_000 }
    )
    report.diagnostics = diagnostics.stdout
    console.log(diagnostics.stdout)
    const address = (
      await sandbox.commands.run("hostname -I", { timeoutMs: 5000 })
    ).stdout
      .trim()
      .split(/\s+/)[0]
    const bus = (
      await sandbox.commands
        .run("xprop -root AT_SPI_BUS", { timeoutMs: 5000 })
        .catch(() => ({ stdout: "" }))
    ).stdout.match(/"(.+)"/)?.[1]
    report.atSpiBus = bus ?? null

    const denied: Record<string, string> = {
      display: "xdpyinfo -display :0",
      desktopHome: "ls /home/user",
      browserProfile: "ls /home/user/.mozilla",
      sudo: "sudo -n true",
      suDesktopUser: "su -c true user < /dev/null",
      vncLoopback: "timeout 3 bash -c 'echo > /dev/tcp/127.0.0.1/5900'",
      vncOwnAddress: `timeout 3 bash -c 'echo > /dev/tcp/${address}/5900'`,
      novnc: "timeout 3 bash -c 'echo > /dev/tcp/127.0.0.1/6080'",
      envd: "timeout 3 bash -c 'echo > /dev/tcp/127.0.0.1/49983'",
      envdIpv6: "timeout 3 bash -c 'echo > /dev/tcp/::1/49983'",
      metadata: "curl -s -m 3 http://169.254.169.254/",
      // Programs the desktop's user would run instead of the real ones
      plantInPath: "touch /usr/local/bin/krafty-probe",
      plantInPython:
        'python3 -c "import os, sys; w = [p for p in sys.path if p and os.access(p, os.W_OK)]; print(w); sys.exit(0 if w else 1)"',
      ...(bus && {
        accessibilityBus: `dbus-send --address='${bus}' --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames`,
      }),
    }
    const isolation: Record<string, unknown> = {}
    // The shell user can run commands at all, so a refusal below is real
    assert.equal((await asShell(sandbox, "id -un")).output, SHELL_USER)
    for (const [name, command] of Object.entries(denied)) {
      const run = await asShell(sandbox, command)
      isolation[name] = run.ok ? `REACHABLE: ${run.output}` : "denied"
    }
    const allowed = await asShell(
      sandbox,
      "id -un && curl -s -o /dev/null -w '%{http_code}' -m 10 https://example.com"
    )
    isolation.internet = allowed.output
    report.isolation = isolation
    console.log(isolation)
    assert.equal(allowed.output, `${SHELL_USER}\n200`)
    assert.ok(
      Object.values(isolation).every(
        (value) => typeof value !== "string" || !value.startsWith("REACHABLE")
      ),
      "the shell user reached something it shouldn't"
    )
  })

  const shell = await result(
    tools.bash.execute!({ command: "id -un; pwd", timeout: 30 }, options)
  )
  assert.equal(shell.output.trim(), "worker\n/home/worker")
  await result(
    tools.writeFile.execute!(
      { path: "workspace/verify/note.txt", content: "hello" },
      options
    )
  )
  const note = await result(
    tools.readFile.execute!({ path: "~/workspace/verify/note.txt" }, options)
  )
  assert.equal(note.content, "hello")
  report.shellAndFiles = "worker in /home/worker"

  await result(
    tools.openOnScreen.execute!({ url: "https://example.com/" }, options)
  )
  const first = await readScreenSoon("first", /Learn more/)
  report.firstRead = first
  console.log(first)
  const shot = await result(tools.viewScreen.execute!({}, options))
  await writeFile(
    `${directory}/example.png`,
    Buffer.from(shot.base64, "base64")
  )
  assert.match(first.text, /Example Domain/)
  // Below the fold at 1024x768: listed without a ref until scrolled to
  let page = first
  if (/link "Learn more" \(off screen\)/.test(page.text)) {
    report.offScreenListed = true
    await result(
      tools.mouseScroll.execute!(
        { x: 512, y: 500, direction: "down", amount: 10 },
        options
      )
    )
    page = await readScreenSoon("scrolled", /\[e\d+\] link "Learn more/)
  }
  const link = page.text.match(/\[(e\d+)\] link "Learn more/)
  assert.ok(link, "example.com's link has a ref")
  await result(
    tools.clickElement.execute!(
      { ref: link[1], button: "left", double: false },
      options
    )
  )
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const second = await readScreenSoon(
    "afterClick",
    /^URL: https:\/\/www\.iana\.org/m
  )
  report.afterClick = second.url
  assert.notEqual(second.url, "https://example.com/")

  await result(
    tools.openOnScreen.execute!({ url: "https://www.wikipedia.org/" }, options)
  )
  await new Promise((resolve) => setTimeout(resolve, 4000))
  const search = await readScreenSoon("wikipedia", /"Search Wikipedia/)
  const field = search.text.match(
    /\[(e\d+)\] (?:entry|combo box) "Search Wikipedia/
  )
  assert.ok(field, "Wikipedia's search field has a ref")
  await result(
    tools.fillElement.execute!({ ref: field[1], text: "Krafty" }, options)
  )
  const filled = await readScreenSoon("filled", /= "Krafty"/)
  report.filled = filled.text
    .split("\n")
    .find((line) => /\] (?:entry|combo box) "Search Wikipedia/.test(line))
  assert.match(String(report.filled), /= "Krafty"/)
  const end = await result(tools.viewScreen.execute!({}, options))
  await writeFile(
    `${directory}/wikipedia.png`,
    Buffer.from(end.base64, "base64")
  )
} finally {
  report.seconds = Math.round((Date.now() - started) / 1000)
  await deleteSandbox(sandboxId).catch((error: unknown) =>
    console.error(`Couldn't delete ${sandboxId}`, error)
  )
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2))
  console.log(`Report saved to ${directory}/report.json`)
}
process.exit(0)
