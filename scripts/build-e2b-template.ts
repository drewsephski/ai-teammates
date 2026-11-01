// Builds the E2B template account computers are created from
// (COMPUTER_TEMPLATE, lib/computer-shell.ts). Run it after changing a step
// below, before the code that relies on it ships:
//
//   pnpm exec tsx --env-file=.env.local scripts/build-e2b-template.ts
//
// It publishes the template to the E2B team that E2B_API_KEY belongs to.
// Computers made earlier keep their template until they're reset.
import { E2B } from "@e2b/desktop"

import {
  COMPUTER_TEMPLATE,
  DESKTOP_HOME,
  DESKTOP_USER,
  SHELL_HOME,
  SHELL_USER,
} from "@/lib/computer-shell"

const client = new E2B()

// Firefox builds its accessibility tree only when it starts with
// GNOME_ACCESSIBILITY=1, so the browser itself sets it, however it's opened:
// x-www-browser, the panel, a link from another app
const firefoxWrapper = [
  "set -eu",
  "real=$(readlink -f /usr/bin/firefox-esr)",
  'echo "firefox-esr is $real"',
  'if [ ! -e "$real.real" ]; then dpkg-divert --local --rename --divert "$real.real" --add "$real"; fi',
  `printf '#!/bin/sh\\n# Krafty: Firefox with its accessibility tree on, for readScreen\\nexport GNOME_ACCESSIBILITY=1\\nexec "%s.real" "$@"\\n' "$real" > "$real"`,
  'chmod 755 "$real"',
].join("\n")

const firefoxPrefs = `cat >> /usr/lib/firefox-esr/firefox.cfg <<'EOF'

// Krafty: downloads land where bots' shell can read them
pref("browser.download.dir", "${SHELL_HOME}/Downloads");
pref("browser.download.folderList", 2);
pref("browser.download.useDownloadDir", true);
EOF`

const template = client
  .Template()
  .fromTemplate("desktop")
  .setUser("root")
  // The screen reader (AT-SPI through GObject) and the shell user's firewall
  .aptInstall(["at-spi2-core", "gir1.2-atspi-2.0", "python3-gi", "nftables"])
  .runCmd([
    // Bots' shell commands and file tools run as this user. Its home is
    // readable by the desktop, so the browser can upload what bots make.
    `useradd --create-home --home-dir ${SHELL_HOME} --shell /bin/bash --user-group ${SHELL_USER}`,
    `chmod 755 ${SHELL_HOME}`,
    `install -d -o ${SHELL_USER} -g ${SHELL_USER} -m 755 ${SHELL_HOME}/workspace`,
    // The browser saves downloads here as the desktop's user
    `install -d -o ${SHELL_USER} -g ${SHELL_USER} -m 777 ${SHELL_HOME}/Downloads`,
    `if sudo -l -U ${SHELL_USER} | grep -q "may run the following"; then echo "${SHELL_USER} can use sudo" >&2; exit 1; fi`,
    // /usr/local is root's (lib/computer-shell.ts), so global npm installs
    // go to the shell user's own ~/.local, which its login shell puts on PATH
    `install -d -o ${SHELL_USER} -g ${SHELL_USER} ${SHELL_HOME}/.local ${SHELL_HOME}/.local/bin`,
    `printf 'prefix=${SHELL_HOME}/.local\\n' > ${SHELL_HOME}/.npmrc`,
    `chown ${SHELL_USER}:${SHELL_USER} ${SHELL_HOME}/.npmrc`,
  ])
  // The desktop's home, the password locks and /usr/local are set when each
  // computer is first used (HARDEN_ROOT_SCRIPT): E2B's own config step runs
  // after these steps and resets them
  .runCmd(firefoxWrapper)
  .runCmd(firefoxPrefs)
  .setUser(DESKTOP_USER)
  .setWorkdir(DESKTOP_HOME)

// The same size as E2B's desktop template, which computers used before
const info = await client.Template.build(template, COMPUTER_TEMPLATE, {
  cpuCount: 8,
  memoryMB: 8192,
  onBuildLogs: (entry) => console.log(entry.toString()),
})
console.log(`Built ${COMPUTER_TEMPLATE}: ${JSON.stringify(info)}`)
