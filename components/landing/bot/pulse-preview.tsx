import { MailIcon, SheetIcon } from "lucide-react"

import { BotMark } from "./bot-mark"
import styles from "./pulse.module.css"

// An example of the report a Pulse Bot writes in its chat, next to the sheet it
// read. Sample project and people, labelled as such: there's no project
// dashboard in the app, so this must never read as someone's real data.

type Flag = "overdue" | "stale" | "blocked"

const rows: {
  row: number
  task: string
  owner: string
  status: string
  due: string
  updated: string
  flag?: Flag
}[] = [
  {
    row: 2,
    task: "Homepage wireframes",
    owner: "Priya",
    status: "Done",
    due: "Oct 24",
    updated: "Oct 24",
  },
  {
    row: 3,
    task: "Design approval",
    owner: "Maya (client)",
    status: "Waiting",
    due: "Oct 31",
    updated: "Oct 29",
    flag: "overdue",
  },
  {
    row: 4,
    task: "Product pages build",
    owner: "Sam",
    status: "In progress",
    due: "Nov 7",
    updated: "Oct 28",
    flag: "stale",
  },
  {
    row: 5,
    task: "About page copy",
    owner: "Jordan",
    status: "Blocked",
    due: "Nov 4",
    updated: "Oct 30",
    flag: "blocked",
  },
  {
    row: 6,
    task: "Analytics setup",
    owner: "Lee",
    status: "In progress",
    due: "Nov 10",
    updated: "Oct 31",
  },
  {
    row: 7,
    task: "QA pass",
    owner: "Lee",
    status: "Not started",
    due: "Nov 12",
    updated: "—",
  },
  {
    row: 8,
    task: "Launch checklist",
    owner: "You",
    status: "Not started",
    due: "Nov 14",
    updated: "—",
  },
]

const flagLabel: Record<Flag, string> = {
  overdue: "Overdue",
  stale: "No update in 5 days",
  blocked: "Blocked",
}

const findings = [
  {
    row: 3,
    flag: "overdue",
    text: "Design approval is 2 days overdue, waiting on Maya.",
  },
  {
    row: 4,
    flag: "stale",
    text: "Product pages haven't been updated in 5 days (Sam).",
  },
  {
    row: 5,
    flag: "blocked",
    text: "About page copy is marked Blocked (Jordan).",
  },
] as const

export function PulsePreview() {
  const flagged = rows.filter((row) => row.flag).length
  return (
    <figure className={styles.preview}>
      <div className={styles.previewPanes}>
        <div className={styles.sheet}>
          <div className={styles.paneHeader}>
            <SheetIcon aria-hidden />
            <span>Website redesign tracker</span>
            <small>Google Sheets</small>
          </div>
          <div className={styles.sheetScroll}>
            <table className={styles.sheetTable}>
              <caption className={styles.srOnly}>
                Example project tracker with sample tasks
              </caption>
              <thead>
                <tr>
                  <th scope="col" aria-label="Row" />
                  <th scope="col">Task</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Due</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row} data-flag={row.flag}>
                    <td className={styles.rowNumber}>{row.row}</td>
                    <th scope="row">
                      {row.task}
                      {row.flag && (
                        <span className={styles.flag} data-flag={row.flag}>
                          {flagLabel[row.flag]}
                        </span>
                      )}
                    </th>
                    <td>{row.owner}</td>
                    <td>{row.status}</td>
                    <td>{row.due}</td>
                    <td>{row.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.chat}>
          <div className={styles.paneHeader}>
            <BotMark
              className={styles.chatMark}
              color="#35c76f"
              shape="teardrop"
              compact
            />
            <span>Pulse</span>
            <small>Monday 9:00 · weekly routine</small>
          </div>
          <div className={styles.message}>
            <p className={styles.messageLead}>
              Week of Nov 2: {flagged} of {rows.length} tasks need attention.
            </p>
            <div className={styles.stats}>
              <span>
                <strong>{rows.length}</strong> tasks
              </span>
              <span>
                <strong>
                  {rows.filter((row) => row.status === "Done").length}
                </strong>{" "}
                done
              </span>
              <span data-flag="overdue">
                <strong>{flagged}</strong> need attention
              </span>
            </div>
            <ul className={styles.findings}>
              {findings.map((item) => (
                <li key={item.row} data-flag={item.flag}>
                  <span className={styles.rowRef}>Row {item.row}</span>
                  {item.text}
                </li>
              ))}
            </ul>
            <p>
              I drafted a nudge for each owner and this week&rsquo;s status
              summary. Nothing has been sent.
            </p>
          </div>
          <div className={styles.approval}>
            <div className={styles.approvalHead}>
              <MailIcon aria-hidden />
              <span>Waiting for your approval</span>
              <small>Gmail · Send email</small>
            </div>
            <dl className={styles.approvalBody}>
              <div>
                <dt>To</dt>
                <dd>maya@client.example</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>Quick check on the design approval</dd>
              </div>
            </dl>
            <div className={styles.approvalActions} aria-hidden>
              <span className={styles.approve}>Approve</span>
              <span className={styles.decline}>Decline</span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className={styles.previewCaption}>
        Example report with a sample project and people. Pulse writes its report
        in the Bot&rsquo;s chat; there&rsquo;s no separate project dashboard
        yet.
      </figcaption>
    </figure>
  )
}
