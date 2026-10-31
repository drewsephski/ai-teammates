// Who runs a bot's shell commands on the computer, and the hardening that keeps
// that user away from the desktop. Pure: the E2B template
// (scripts/build-e2b-template.ts) and lib/e2b.ts share these. What this does
// and doesn't enforce: docs/autonomy.md.

// The E2B template computers are created from
export const COMPUTER_TEMPLATE = "krafty-desktop"

// The desktop, the browser and its sign-ins belong to this user
export const DESKTOP_USER = "user"
export const DESKTOP_HOME = "/home/user"
// Bots' shell commands and file tools run as this user on computers made from
// the template: no display, no browser profile, no desktop services
export const SHELL_USER = "worker"
export const SHELL_HOME = "/home/worker"

export type ComputerShell = {
  user: string
  home: string
  // False on computers made before the template, where the shell still runs
  // as the desktop's user
  isolated: boolean
}

export const LEGACY_SHELL: ComputerShell = {
  user: DESKTOP_USER,
  home: DESKTOP_HOME,
  isolated: false,
}
export const ISOLATED_SHELL: ComputerShell = {
  user: SHELL_USER,
  home: SHELL_HOME,
  isolated: true,
}

// Local TCP services the shell user must never reach: sshd (22), rpcbind
// (111), x11vnc (5900 and up), noVNC (6080) and E2B's envd (49982-49999),
// which take input or run commands as anyone. Its own servers on other ports
// stay reachable. Firecracker's metadata service is blocked too.
const BLOCKED_LOCAL_PORTS = "{ 22, 111, 5900-5999, 6080, 49982-49999 }"
const METADATA_ADDRESS = "169.254.169.254"

// nftables, matching the sending user (`meta skuid`): E2B's kernel has no
// iptables owner match, and `fib` exists only per address family. Replacing
// the tables in one transaction keeps hardening idempotent.
function firewall(uid: string) {
  const local = `meta skuid ${uid} fib daddr type local tcp dport ${BLOCKED_LOCAL_PORTS} reject with tcp reset`
  return [
    "table ip krafty_shell",
    "delete table ip krafty_shell",
    "table ip krafty_shell {",
    "  chain output {",
    "    type filter hook output priority 0; policy accept;",
    `    ${local}`,
    `    meta skuid ${uid} ip daddr ${METADATA_ADDRESS} reject`,
    "  }",
    "}",
    "table ip6 krafty_shell",
    "delete table ip6 krafty_shell",
    "table ip6 krafty_shell {",
    "  chain output {",
    "    type filter hook output priority 0; policy accept;",
    `    ${local}`,
    "  }",
    "}",
  ].join("\n")
}

// Run as root on every computer before its first use in a process: idempotent,
// and prints `legacy` on a computer without the shell user. Kernel rules
// survive pause and resume, which restore the computer's memory.
export const HARDEN_ROOT_SCRIPT = [
  "set -eu",
  `if ! id -u ${SHELL_USER} >/dev/null 2>&1; then echo legacy; exit 0; fi`,
  // E2B's build ends with a config step that undoes template steps, so these
  // are set here. The desktop's home holds the browser profile and sign-ins.
  `chmod 700 ${DESKTOP_HOME}`,
  // No empty password lets the shell user \`su\` to the desktop's user or root
  `passwd -l root >/dev/null 2>&1`,
  `passwd -l ${DESKTOP_USER} >/dev/null 2>&1`,
  // E2B leaves /usr/local writable by everyone. It comes first on the
  // desktop user's PATH and in Python's path, so a program planted there
  // would run as that user
  "find /usr/local -perm -0002 ! -type l -exec chmod go-w {} +",
  `uid=$(id -u ${SHELL_USER})`,
  `nft -f - <<EOF\n${firewall("$uid")}\nEOF`,
  "echo isolated",
].join("\n")

// Run as the desktop's user with the display. The display starts with access
// control off (`Xvfb -ac` in @e2b/desktop), so turn it on and admit only the
// desktop's own user. Also start the accessibility bus the screen reader and
// Firefox use, if the session didn't.
export const HARDEN_DESKTOP_SCRIPT = [
  "set -eu",
  `xhost +si:localuser:${DESKTOP_USER} >/dev/null`,
  "xhost - >/dev/null",
  // Without -auth the server also admits every local connection, which
  // xhost doesn't list, and may list other entries. Drop all of them but the
  // desktop's user, then check.
  "xhost -local: >/dev/null",
  `xhost | tail -n +2 | grep -vx "SI:localuser:${DESKTOP_USER}" | while read -r entry; do xhost "-$entry" >/dev/null; done`,
  'xhost | head -n 1 | grep -q "access control enabled"',
  `test "$(xhost | tail -n +2)" = "SI:localuser:${DESKTOP_USER}"`,
  `if ! pgrep -u ${DESKTOP_USER} -f at-spi-bus-launcher >/dev/null; then`,
  "  for launcher in /usr/libexec/at-spi-bus-launcher /usr/lib/at-spi2-core/at-spi-bus-launcher; do",
  '    if [ -x "$launcher" ]; then setsid -f "$launcher" --launch-immediately >/dev/null 2>&1; break; fi',
  "  done",
  "fi",
].join("\n")

export function computerShellFor(output: string): ComputerShell {
  const result = output.trim().split("\n").pop()
  if (result === "legacy") return LEGACY_SHELL
  if (result === "isolated") return ISOLATED_SHELL
  throw new Error(`Unexpected hardening output: ${result ?? ""}`)
}

// A path the bot gave, absolute or relative to its home directory
export function shellPath(path: string, home: string) {
  if (path === "~") return home
  if (path.startsWith("~/")) return `${home}/${path.slice(2)}`
  return path.startsWith("/") ? path : `${home}/${path}`
}

// One shell word, whatever the text holds
export function shellQuote(text: string) {
  return `'${text.replace(/'/g, `'\\''`)}'`
}
