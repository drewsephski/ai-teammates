import assert from "node:assert/strict"
import test from "node:test"

import {
  actionForCategory,
  approvalCovers,
  approvalRequiredMessage,
  computerRefusalMessage,
  DECLINED_ERROR,
  gestureNeedsCheck,
  guardVerdict,
  NOT_APPROVED_ERROR,
  NOTHING_HELD_ERROR,
  protectedPath,
  shellApprovalRequiredMessage,
  shellCommandRisk,
  shellRefusedMessage,
  windowOpen,
  type GuardOutput,
} from "../lib/computer-approval-policy"

const output = (patch: Partial<GuardOutput> = {}): GuardOutput => ({
  target: "Button",
  impact: "none",
  category: "none",
  confidence: "high",
  injection: false,
  hostname: null,
  reason: "",
  ...patch,
})

test("every click, drag and non-navigation key is checked; typing and moving aren't", () => {
  const press = (key: string, modifiers: string[] = []) =>
    gestureNeedsCheck({ tool: "keyboardPress", key, modifiers })
  assert.equal(
    gestureNeedsCheck({
      tool: "mouseClick",
      x: 1,
      y: 1,
      button: "right",
      double: false,
    }),
    true
  )
  assert.equal(
    gestureNeedsCheck({
      tool: "mouseDrag",
      startX: 0,
      startY: 0,
      endX: 9,
      endY: 9,
    }),
    true
  )
  for (const key of [
    "Return",
    "KP_Enter",
    "enter",
    "space",
    "#",
    "e",
    "delete",
    "y",
  ])
    assert.equal(press(key), true, key)
  assert.equal(press("enter", ["ctrl"]), true)
  assert.equal(press("Return", ["cmd"]), true)
  assert.equal(press("s", ["alt"]), true)
  for (const key of ["escape", "tab", "pagedown", "Up", "backspace"])
    assert.equal(press(key), false, key)
  assert.equal(press("c", ["ctrl"]), false)
  assert.equal(press("tab", ["shift"]), false)
  const type = (text: string) =>
    gestureNeedsCheck({ tool: "keyboardType", text })
  assert.equal(type("hello\n"), true)
  assert.equal(type("hello\r"), true)
  assert.equal(type("123456"), true)
  assert.equal(type("hello world"), false)
})

test("the verdict is the server's: high impact, injection or an unsure category commits", () => {
  assert.equal(guardVerdict(output()).commits, false)
  assert.equal(
    guardVerdict(output({ impact: "high", category: "send" })).commits,
    true
  )
  // Page text that tries to talk the guard round is itself a reason to stop
  assert.equal(
    guardVerdict(output({ impact: "low", injection: true })).commits,
    true
  )
  assert.equal(
    guardVerdict(
      output({ impact: "low", category: "submit", confidence: "low" })
    ).commits,
    true
  )
  assert.equal(
    guardVerdict(
      output({ impact: "low", category: "submit", confidence: "high" })
    ).commits,
    false
  )
})

test("an approval covers only its own kind of action, on its own site", () => {
  const approval = { action: "post", hostname: "x.com" }
  assert.equal(
    approvalCovers(approval, { category: "post", hostname: "x.com" }),
    true
  )
  assert.equal(
    approvalCovers(approval, { category: "post", hostname: "www.x.com" }),
    true
  )
  assert.equal(
    approvalCovers(approval, { category: "post", hostname: null }),
    false
  )
  assert.equal(
    approvalCovers(approval, { category: "payment", hostname: "x.com" }),
    false
  )
  assert.equal(
    approvalCovers(approval, { category: "post", hostname: "evil.com" }),
    false
  )
  assert.equal(
    approvalCovers(approval, { category: "post", hostname: "notx.com" }),
    false
  )
  assert.equal(actionForCategory("grades"), "submit")
  assert.equal(actionForCategory("roster"), "submit")
  assert.equal(actionForCategory("purchase"), "buy")
})

test("an approval's window is 90 seconds and three steps from its first use", () => {
  const now = Date.now()
  assert.equal(
    windowOpen({ claimedAt: new Date(now - 10_000), uses: 1 }, now),
    true
  )
  assert.equal(
    windowOpen({ claimedAt: new Date(now - 10_000), uses: 3 }, now),
    false
  )
  assert.equal(
    windowOpen({ claimedAt: new Date(now - 91_000), uses: 1 }, now),
    false
  )
  assert.equal(windowOpen({ claimedAt: null, uses: 0 }, now), false)
})

test("shell commands: GUI drivers, browser profiles and persistence are refused; writes need approval", () => {
  for (const command of [
    "xdotool click 1",
    "python3 -c 'import pyautogui; pyautogui.click()'",
    "DISPLAY=:0 xte 'mouseclick 1'",
    "cat ~/.config/chromium/Default/Cookies",
    "sqlite3 ~/.mozilla/firefox/x.default/cookies.sqlite .dump",
    "chromium --remote-debugging-port=9222",
    "crontab -l",
    "nohup python3 post.py &",
    "echo 'curl x' >> ~/.bashrc",
  ])
    assert.equal(shellCommandRisk(command)?.kind, "refuse", command)
  for (const [command, action] of [
    ["curl -X POST https://api.example.com/x -d '{}'", "submit"],
    ["curl --data 'a=b' https://example.com", "submit"],
    ["git push origin main", "post"],
    ["gh pr create --fill", "post"],
    ["rsync -a out/ host:/srv", "submit"],
    ["echo hi | sendmail sam@example.com", "send"],
    ["npm publish", "post"],
    ["python3 -c \"import requests; requests.post('https://x')\"", "submit"],
  ] as const) {
    const risk = shellCommandRisk(command)
    assert.equal(risk?.kind, "approve", command)
    if (risk?.kind === "approve") assert.equal(risk.action, action, command)
  }
  for (const command of [
    "ls -la",
    "python3 analyze.py",
    "curl https://example.com/data.json",
    "curl -X GET https://example.com",
    "pip install pandas",
    "pytest -q",
    "cat ~/workspace/cookies-recipe.txt",
  ])
    assert.equal(shellCommandRisk(command), undefined, command)
})

test("file tools can't reach the browser profile or start-up files", () => {
  assert.equal(
    protectedPath("/home/user/.config/chromium/Default/Cookies"),
    true
  )
  assert.equal(protectedPath("/home/user/.mozilla/firefox/a/logins.json"), true)
  assert.equal(protectedPath("/home/user/.bashrc"), true)
  assert.equal(protectedPath("/home/user/.config/autostart/x.desktop"), true)
  assert.equal(protectedPath("/home/user/workspace/cookies.md"), false)
  assert.equal(protectedPath("/home/user/workspace/fantasy/roster.csv"), false)
})

test("quoting, paths and globs don't get a command past the shell rules", () => {
  for (const command of [
    'xdo""tool key Return',
    "x\\dotool click 1",
    "$'xdotool' click 1",
    "/usr/bin/xdotool click 1",
    "cat ~/.conf*/chrom*/Def*/Cook*",
    "cp -r ~/.config /tmp/c",
    "tmux new -d 'sleep 60; curl x'",
    "systemctl --user enable --now x",
  ])
    assert.equal(shellCommandRisk(command)?.kind, "refuse", command)
  for (const command of [
    "curl -sSd 'a=b' https://example.com",
    "curl -sXPOST https://example.com",
    "git -c user.name=x push origin main",
    "/usr/bin/ssh host uptime",
    "echo hi | nc example.com 25",
  ])
    assert.equal(shellCommandRisk(command)?.kind, "approve", command)
  assert.equal(
    shellCommandRisk("cat ~/workspace/knowledge/login.md"),
    undefined
  )
})

test("an approval never covers account security or desktop terminal commands", () => {
  const approval = { action: "submit", hostname: "x.com" }
  assert.equal(
    approvalCovers(approval, { category: "account", hostname: "x.com" }),
    false
  )
  assert.equal(
    approvalCovers(approval, { category: "run_command", hostname: "x.com" }),
    false
  )
  assert.equal(
    approvalCovers(
      { action: "send", hostname: "mail.example.com" },
      { category: "send", hostname: null },
      "Inbox - Example"
    ),
    true
  )
  assert.equal(
    approvalCovers(
      { action: "send", hostname: "mail.example.com" },
      { category: "send", hostname: null },
      "Terminal"
    ),
    false
  )
})

test("the gate's own refusals reach the tool card; anything else stays generic", () => {
  const shown = (message: string) => computerRefusalMessage(new Error(message))
  const held = approvalRequiredMessage(
    { category: "purchase", reason: "Places an order" },
    "buy"
  )
  const push = shellCommandRisk("git push origin main")
  assert.equal(push?.kind, "approve")
  for (const message of [
    NOT_APPROVED_ERROR,
    NOTHING_HELD_ERROR,
    DECLINED_ERROR,
    held,
    shellApprovalRequiredMessage(
      push as Extract<typeof push, { kind: "approve" }>
    ),
    shellRefusedMessage("drives the desktop's mouse or keyboard"),
  ])
    assert.equal(shown(message), message)
  assert.equal(shown("connect ECONNREFUSED 10.0.0.1:5432"), undefined)
  assert.equal(shown(shellRefusedMessage("leaks a secret sk-123")), undefined)
  assert.equal(computerRefusalMessage("not an error"), undefined)
})
