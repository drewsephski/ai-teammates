import assert from "node:assert/strict"
import test from "node:test"

import {
  computerShellFor,
  HARDEN_DESKTOP_SCRIPT,
  HARDEN_ROOT_SCRIPT,
  ISOLATED_SHELL,
  LEGACY_SHELL,
  shellPath,
  shellQuote,
  SHELL_USER,
} from "../lib/computer-shell"

test("computers from the template run bots' commands as the shell user", () => {
  assert.equal(computerShellFor("isolated\n"), ISOLATED_SHELL)
  assert.equal(ISOLATED_SHELL.user, SHELL_USER)
  assert.equal(ISOLATED_SHELL.home, "/home/worker")
  // Older computers keep the desktop's user until they're reset
  assert.equal(computerShellFor("legacy"), LEGACY_SHELL)
  assert.equal(LEGACY_SHELL.user, "user")
  // Anything else fails closed
  assert.throws(() => computerShellFor(""))
  assert.throws(() => computerShellFor("iptables: not found"))
})

test("the shell user can't reach the desktop's services or display", () => {
  // sshd, rpcbind, x11vnc, noVNC and envd, over IPv4 and IPv6, plus the
  // metadata service, matched by the sending user
  assert.match(HARDEN_ROOT_SCRIPT, /uid=\$\(id -u worker\)/)
  assert.match(HARDEN_ROOT_SCRIPT, /table ip krafty_shell \{/)
  assert.match(HARDEN_ROOT_SCRIPT, /table ip6 krafty_shell \{/)
  assert.match(
    HARDEN_ROOT_SCRIPT,
    /meta skuid \$uid fib daddr type local tcp dport \{ 22, 111, 5900-5999, 6080, 49982-49999 \} reject/
  )
  assert.match(HARDEN_ROOT_SCRIPT, /ip daddr 169\.254\.169\.254 reject/)
  // The tables are replaced whole, so hardening twice is harmless
  assert.match(
    HARDEN_ROOT_SCRIPT,
    /delete table ip krafty_shell\ntable ip krafty_shell \{/
  )
  // What E2B's build resets is set again
  assert.match(HARDEN_ROOT_SCRIPT, /chmod 700 \/home\/user/)
  assert.match(HARDEN_ROOT_SCRIPT, /passwd -l user/)
  assert.match(HARDEN_ROOT_SCRIPT, /find \/usr\/local -perm -0002/)
  // The display admits only the desktop's own user
  assert.match(HARDEN_DESKTOP_SCRIPT, /xhost \+si:localuser:user/)
  assert.match(HARDEN_DESKTOP_SCRIPT, /xhost - /)
  assert.match(HARDEN_DESKTOP_SCRIPT, /access control enabled/)
  // Every local connection would be let in, whoever's it is
  assert.match(HARDEN_DESKTOP_SCRIPT, /xhost -local: /)
  assert.match(HARDEN_DESKTOP_SCRIPT, /grep -vx "SI:localuser:user"/)
  assert.match(
    HARDEN_DESKTOP_SCRIPT,
    /test "\$\(xhost \| tail -n \+2\)" = "SI:localuser:user"/
  )
})

test("paths resolve against the shell's own home", () => {
  assert.equal(shellPath("notes.md", "/home/worker"), "/home/worker/notes.md")
  assert.equal(shellPath("~/a/b.txt", "/home/worker"), "/home/worker/a/b.txt")
  assert.equal(shellPath("~", "/home/user"), "/home/user")
  assert.equal(shellPath("/tmp/file.txt", "/home/worker"), "/tmp/file.txt")
})

test("a quoted word stays one word", () => {
  assert.equal(shellQuote("https://a.com/?q=1&b=2"), "'https://a.com/?q=1&b=2'")
  assert.equal(shellQuote("it's; rm -rf ~"), "'it'\\''s; rm -rf ~'")
})
