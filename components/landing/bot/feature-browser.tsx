import { memo } from "react"

// Miniature app screens share the card playback clock and cursor coordinates.
export interface SupportState {
  view: string
  emailChars: number
  passwordChars: number
  focus: string | null
  queue: number
  menu: boolean
  ticket: number | null
  macro: boolean
}
export interface DashboardState {
  range: number
  menu: boolean
  hovered: number | null
  exported: boolean
}
const LINE = "var(--color-theme-fg)"
const MINI_BORDER = `0.5px solid color-mix(in srgb, ${LINE} 8%, transparent)`
function Bar({
  width,
  opacity = 0.1,
  className = "",
}: {
  width: string
  opacity?: number
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={`h-[3px] shrink-0 rounded-full ${className}`}
      style={{ width, backgroundColor: LINE, opacity }}
    />
  )
}
function Caret() {
  return (
    <span
      className="ml-px inline-block h-[6px] w-px animate-pulse"
      style={{ backgroundColor: LINE, opacity: 0.7 }}
    />
  )
}
function MiniWindowChrome({ title }: { title: string }) {
  return (
    <div
      className="flex h-[11px] shrink-0 items-center gap-[2px] px-[4px]"
      style={{ borderBottom: MINI_BORDER }}
    >
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="h-[3px] w-[3px] rounded-full"
          style={{ backgroundColor: LINE, opacity: 0.15 }}
        />
      ))}
      <span className="ml-2 truncate text-[4px] text-white/45">{title}</span>
    </div>
  )
}
const SUPPORT_EMAIL = "hello@studio.co",
  QUEUE_MENU_WIDTHS = [44, 58, 36],
  SUPPORT_SIDEBAR = [
    [64, 46, 72],
    [52, 68],
  ],
  QUEUE_TICKETS = [
    [
      { subject: "Account access", urgent: !0 },
      { subject: "Billing question", urgent: !1 },
      { subject: "Getting started", urgent: !1 },
      { subject: "Team invite", urgent: !0 },
      { subject: "Plan change", urgent: !1 },
    ],
    [
      { subject: "Workspace access", urgent: !0 },
      { subject: "Seat upgrade", urgent: !0 },
      { subject: "Quick question", urgent: !1 },
      { subject: "Weekly recap", urgent: !1 },
      { subject: "Welcome aboard", urgent: !0 },
    ],
  ],
  MACRO_WIDTHS = [92, 84, 61],
  LOGIN_SCREEN: SupportState = {
    view: "login",
    emailChars: 0,
    passwordChars: 0,
    focus: null,
    queue: 0,
    menu: !1,
    ticket: null,
    macro: !1,
  }
function LoginField({
  target: e,
  label: t,
  text: s,
  focused: r,
}: {
  target: string
  label: string
  text: string
  focused: boolean
}) {
  return (
    <div className="flex w-full flex-col gap-[3px]">
      {
        <span
          className="text-[4.5px] leading-none"
          style={{ color: LINE, opacity: 0.4 }}
        >
          {t}
        </span>
      }
      {
        <div
          data-desk={e}
          className="flex h-[11px] w-full items-center rounded-[3px] px-[5px] text-[5px] leading-none"
          style={{
            border: r
              ? `0.5px solid color-mix(in srgb, ${LINE} 35%, transparent)`
              : MINI_BORDER,
            backgroundColor: `color-mix(in srgb, ${LINE} 3%, transparent)`,
          }}
        >
          {s.length > 0 ? (
            <span style={{ color: LINE, opacity: 0.8 }}>{s}</span>
          ) : null}
          {r ? <Caret /> : null}
        </div>
      }
    </div>
  )
}
function LoginScreen({ screen: e }: { screen: SupportState }) {
  return (
    <div className="flex min-h-0 flex-1 items-center px-[13%]">
      {
        <div
          className="flex w-full flex-col gap-[6px] rounded-[4px] px-[10px] py-[10px]"
          style={{
            border: MINI_BORDER,
            backgroundColor: `color-mix(in srgb, ${LINE} 2%, transparent)`,
          }}
        >
          {
            <div className="flex items-center gap-[4px]">
              {
                <span
                  aria-hidden={!0}
                  className="h-[8px] w-[8px] shrink-0 rounded-[2px]"
                  style={{ backgroundColor: LINE, opacity: 0.22 }}
                />
              }
              <span className="text-[6px] font-medium text-white/70">
                Studio help desk
              </span>
            </div>
          }
          {
            <LoginField
              target="email"
              label="Work email"
              text={SUPPORT_EMAIL.slice(0, e.emailChars)}
              focused={"email" === e.focus}
            />
          }
          {
            <LoginField
              target="password"
              label="Password"
              text={"•".repeat(e.passwordChars)}
              focused={"password" === e.focus}
            />
          }
          {
            <div
              data-desk="submit"
              className="mt-[1px] flex h-[11px] w-full items-center justify-center rounded-[3px] text-[5px] leading-none"
              style={{
                backgroundColor: LINE,
                color: "var(--color-theme-bg)",
                opacity: 0.85,
              }}
            >
              Continue
            </div>
          }
          {
            <div className="flex items-center justify-center gap-[4px]">
              {
                <span
                  aria-hidden={!0}
                  className="h-[0.5px] flex-1"
                  style={{ backgroundColor: LINE, opacity: 0.1 }}
                />
              }
              {<Bar width="26%" opacity={0.08} />}
              {
                <span
                  aria-hidden={!0}
                  className="h-[0.5px] flex-1"
                  style={{ backgroundColor: LINE, opacity: 0.1 }}
                />
              }
            </div>
          }
        </div>
      }
    </div>
  )
}
function QueueMenu({ selected: e }: { selected: number }) {
  return (
    <div
      className="absolute top-[11px] right-0 z-10 flex w-[44px] flex-col gap-[1px] rounded-[3px] p-[2px]"
      style={{
        border: MINI_BORDER,
        backgroundColor: "var(--color-theme-bg)",
        boxShadow: "0 2px 6px rgb(0 0 0 / 0.12)",
      }}
    >
      {QUEUE_MENU_WIDTHS.map((t, s) => (
        <div
          data-desk={1 === s ? "menu" : void 0}
          className="flex h-[8px] items-center rounded-[2px] px-[3px]"
          style={{
            backgroundColor:
              e === s ? `color-mix(in srgb, ${LINE} 8%, transparent)` : void 0,
          }}
          key={s}
        >
          {<Bar width={`${t}%`} opacity={e === s ? 0.28 : 0.14} />}
        </div>
      ))}
    </div>
  )
}
function TicketRow({
  target: e,
  subject: t,
  urgent: s,
  open: r,
}: {
  target?: string
  subject: string
  urgent: boolean
  open: boolean
}) {
  return (
    <div
      data-desk={e}
      className="flex items-center gap-[5px] rounded-[2px] px-[3px] py-[3px] transition-colors duration-200"
      style={{
        backgroundColor: r
          ? `color-mix(in srgb, ${LINE} 7%, transparent)`
          : void 0,
      }}
    >
      {
        <span
          aria-hidden={!0}
          className="h-[4px] w-[4px] shrink-0 rounded-full"
          style={{ backgroundColor: LINE, opacity: s ? 0.32 : 0.12 }}
        />
      }
      <span className="min-w-0 truncate text-[5px] text-white/60">{t}</span>
      {
        <span
          aria-hidden={!0}
          className="ml-auto h-[6px] w-[14px] shrink-0 rounded-full"
          style={{
            backgroundColor: `color-mix(in srgb, ${LINE} ${s ? 11 : 5}%, transparent)`,
          }}
        />
      }
    </div>
  )
}
function TicketDetails({ macro: e }: { macro: boolean }) {
  return (
    <div
      className="flex w-[40%] shrink-0 flex-col gap-[5px] px-[6px] py-[5px]"
      style={{ borderLeft: MINI_BORDER }}
    >
      {<Bar width="62%" opacity={0.18} />}
      {
        <div className="flex flex-col gap-[3px]">
          {<Bar width="94%" opacity={0.08} />}
          {<Bar width="78%" opacity={0.08} />}
        </div>
      }
      {
        <div className="flex items-center gap-[4px]">
          {
            <div
              data-desk="macro"
              className="flex h-[8px] items-center rounded-full px-[4px] transition-colors duration-300"
              style={
                e
                  ? { backgroundColor: LINE, opacity: 0.85 }
                  : {
                      border: MINI_BORDER,
                      backgroundColor: `color-mix(in srgb, ${LINE} 8%, transparent)`,
                    }
              }
            >
              {
                <div
                  aria-hidden={!0}
                  className="h-[3px] w-[18px] rounded-full"
                  style={{
                    backgroundColor: e ? "var(--color-theme-bg)" : LINE,
                    opacity: e ? 0.9 : 0.22,
                  }}
                />
              }
            </div>
          }
          {
            <span
              aria-hidden={!0}
              className="ml-auto h-[8px] w-[20px] rounded-full"
              style={{
                backgroundColor: `color-mix(in srgb, ${LINE} 6%, transparent)`,
              }}
            />
          }
        </div>
      }
      {
        <div
          className="flex flex-col gap-[3px] rounded-[3px] px-[5px] py-[5px]"
          style={{
            border: MINI_BORDER,
            backgroundColor: `color-mix(in srgb, ${LINE} 2%, transparent)`,
          }}
        >
          {e ? (
            MACRO_WIDTHS.map((e, t) => (
              <Bar width={`${e}%`} opacity={0.16} key={t} />
            ))
          ) : (
            <div className="h-[12px]" />
          )}
        </div>
      }
    </div>
  )
}
function QueueScreen({ screen: e }: { screen: SupportState }) {
  const t = QUEUE_TICKETS[e.queue] ?? QUEUE_TICKETS[0]
  return (
    <div className="flex min-h-0 flex-1">
      {
        <div
          className="flex w-[17%] shrink-0 flex-col gap-[7px] px-[5px] py-[7px]"
          style={{
            borderRight: MINI_BORDER,
            backgroundColor: `color-mix(in srgb, ${LINE} 2%, transparent)`,
          }}
        >
          {SUPPORT_SIDEBAR.map((e, t) => (
            <div className="flex flex-col gap-[5px]" key={t}>
              {e.map((e, t) => (
                <Bar width={`${e}%`} opacity={0.09} key={t} />
              ))}
            </div>
          ))}
        </div>
      }
      {
        <div className="flex min-w-0 flex-1 flex-col px-[7px] py-[7px]">
          {
            <div className="relative flex items-center gap-[5px] pb-[6px]">
              {
                <div
                  className="flex h-[8px] min-w-0 flex-1 items-center gap-[3px] rounded-full px-[4px]"
                  style={{
                    border: MINI_BORDER,
                    backgroundColor: `color-mix(in srgb, ${LINE} 3%, transparent)`,
                  }}
                >
                  {
                    <span
                      aria-hidden={!0}
                      className="h-[3px] w-[3px] shrink-0 rounded-full"
                      style={{
                        border: `0.5px solid ${LINE}`,
                        opacity: 0.3,
                      }}
                    />
                  }
                  {<Bar width="30%" opacity={0.08} />}
                </div>
              }
              {
                <div className="relative shrink-0">
                  {
                    <div
                      data-desk="view"
                      className="flex h-[8px] items-center gap-[3px] rounded-full px-[4px]"
                      style={{
                        border: MINI_BORDER,
                        backgroundColor: `color-mix(in srgb, ${LINE} 4%, transparent)`,
                      }}
                    >
                      {<Bar width="20px" opacity={0.18} />}
                      {
                        <span
                          aria-hidden={!0}
                          className="h-[2px] w-[2px] rotate-45"
                          style={{
                            borderRight: `0.5px solid ${LINE}`,
                            borderBottom: `0.5px solid ${LINE}`,
                            opacity: 0.35,
                          }}
                        />
                      }
                    </div>
                  }
                  {e.menu ? <QueueMenu selected={e.queue} /> : null}
                </div>
              }
            </div>
          }
          {
            <div className="flex min-h-0 flex-1">
              {
                <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
                  {t.map((t, s) => (
                    <TicketRow
                      target={1 === s ? "ticket" : void 0}
                      subject={t.subject}
                      urgent={t.urgent}
                      open={e.ticket === s}
                      key={s}
                    />
                  ))}
                </div>
              }
              {null != e.ticket ? <TicketDetails macro={e.macro} /> : null}
            </div>
          }
        </div>
      }
    </div>
  )
}
function SupportScreen({ screen: e }: { screen: SupportState }) {
  return (
    <div className="flex h-full w-full flex-col">
      <MiniWindowChrome title="Studio · Help desk" />
      {
        <div
          aria-hidden={!0}
          className="flex h-[9px] shrink-0 items-center justify-center"
          style={{ borderBottom: MINI_BORDER }}
        >
          {
            <div
              className="h-[4px] w-[36%] rounded-full"
              style={{
                backgroundColor: `color-mix(in srgb, ${LINE} 5%, transparent)`,
              }}
            />
          }
        </div>
      }
      {"login" === e.view ? (
        <LoginScreen screen={e} />
      ) : (
        <QueueScreen screen={e} />
      )}
    </div>
  )
}

const SUPPORT_CURSOR = {
    email: { x: 38, y: 34.8 },
    password: { x: 38, y: 45.7 },
    submit: { x: 50, y: 53.7 },
    view: { x: 75.2, y: 20.8 },
    menu: { x: 73.9, y: 31 },
    ticket: { x: 35, y: 33.7 },
    macro: { x: 65.9, y: 39 },
  },
  LOGGED_IN_SCREEN = {
    ...LOGIN_SCREEN,
    view: "queue",
    emailChars: SUPPORT_EMAIL.length,
    passwordChars: 9,
    focus: null,
  },
  HALF_EMAIL = Math.round(SUPPORT_EMAIL.length / 2),
  EMAIL_SCREEN = { ...LOGIN_SCREEN, emailChars: SUPPORT_EMAIL.length },
  PASSWORD_SCREEN = { ...EMAIL_SCREEN, passwordChars: 9 }
function handover(e: SupportState, a: keyof typeof SUPPORT_CURSOR) {
  return { status: "handed-over", screen: e, at: a, who: "You" }
}
function working(e: SupportState, a: keyof typeof SUPPORT_CURSOR) {
  return { status: "working", screen: e, at: a, who: "Bot" }
}
const SUPPORT_TIMELINE = [
    { atMs: 300, value: handover(LOGIN_SCREEN, "email") },
    {
      atMs: 750,
      value: handover({ ...LOGIN_SCREEN, focus: "email" }, "email"),
    },
    {
      atMs: 1050,
      value: handover(
        { ...LOGIN_SCREEN, focus: "email", emailChars: HALF_EMAIL },
        "email"
      ),
    },
    {
      atMs: 1400,
      value: handover({ ...EMAIL_SCREEN, focus: "email" }, "email"),
    },
    { atMs: 1800, value: handover(EMAIL_SCREEN, "password") },
    {
      atMs: 2150,
      value: handover({ ...EMAIL_SCREEN, focus: "password" }, "password"),
    },
    {
      atMs: 2500,
      value: handover({ ...PASSWORD_SCREEN, focus: "password" }, "password"),
    },
    { atMs: 2900, value: handover(PASSWORD_SCREEN, "submit") },
    { atMs: 3400, value: working(LOGGED_IN_SCREEN, "submit") },
    { atMs: 3900, value: working(LOGGED_IN_SCREEN, "view") },
    { atMs: 4400, value: working({ ...LOGGED_IN_SCREEN, menu: !0 }, "view") },
    {
      atMs: 4900,
      value: working({ ...LOGGED_IN_SCREEN, menu: !0, queue: 1 }, "menu"),
    },
    { atMs: 5400, value: working({ ...LOGGED_IN_SCREEN, queue: 1 }, "ticket") },
    {
      atMs: 5900,
      value: working({ ...LOGGED_IN_SCREEN, queue: 1, ticket: 1 }, "ticket"),
    },
    {
      atMs: 6400,
      value: working({ ...LOGGED_IN_SCREEN, queue: 1, ticket: 1 }, "macro"),
    },
    {
      atMs: 6900,
      value: working(
        { ...LOGGED_IN_SCREEN, queue: 1, ticket: 1, macro: !0 },
        "macro"
      ),
    },
  ],
  SUPPORT_INITIAL = handover(LOGIN_SCREEN, "submit"),
  SUPPORT_FINAL = SUPPORT_TIMELINE[SUPPORT_TIMELINE.length - 1].value

const CHART_HEIGHTS = [
    [30, 46, 39, 57, 52, 66, 61, 75, 71, 88],
    [45, 54, 48, 70, 62, 78, 72, 87, 80, 96],
  ],
  DASHBOARD_SIDEBAR = [
    [62, 48, 70],
    [54, 66, 44],
  ],
  RANGE_MENU_WIDTHS = [52, 64, 43],
  DASHBOARD_METRICS = [
    { label: "Visitors", value: "2,840" },
    { label: "Signups", value: "186" },
    { label: "Activation", value: "72%" },
  ],
  DASHBOARD_INITIAL: DashboardState = {
    range: 0,
    menu: !1,
    hovered: null,
    exported: !1,
  }
function RangeMenu({ hovered: e }: { hovered: number | null }) {
  return (
    <div
      className="absolute top-[11px] left-0 z-10 flex w-[46px] flex-col gap-[1px] rounded-[3px] p-[2px]"
      style={{
        border: MINI_BORDER,
        backgroundColor: "var(--color-theme-bg)",
        boxShadow: "0 2px 6px rgb(0 0 0 / 0.12)",
      }}
    >
      {RANGE_MENU_WIDTHS.map((t, s) => (
        <div
          className="flex h-[8px] items-center rounded-[2px] px-[3px]"
          style={{
            backgroundColor:
              e === s ? `color-mix(in srgb, ${LINE} 8%, transparent)` : void 0,
          }}
          key={s}
        >
          {<Bar width={`${t}%`} opacity={e === s ? 0.28 : 0.14} />}
        </div>
      ))}
    </div>
  )
}
function DashboardScreen({ screen: e }: { screen: DashboardState }) {
  const t = CHART_HEIGHTS[e.range] ?? CHART_HEIGHTS[0]
  return (
    <div className="flex h-full w-full flex-col">
      <MiniWindowChrome title="Studio · Weekly overview" />
      {
        <div
          aria-hidden={!0}
          className="flex h-[9px] shrink-0 items-center justify-center"
          style={{ borderBottom: MINI_BORDER }}
        >
          {
            <div
              className="h-[4px] w-[36%] rounded-full"
              style={{
                backgroundColor: `color-mix(in srgb, ${LINE} 5%, transparent)`,
              }}
            />
          }
        </div>
      }
      {
        <div className="relative flex min-h-0 flex-1">
          {
            <div
              className="flex w-[18%] shrink-0 flex-col gap-[7px] px-[5px] py-[7px]"
              style={{
                borderRight: MINI_BORDER,
                backgroundColor: `color-mix(in srgb, ${LINE} 2%, transparent)`,
              }}
            >
              {DASHBOARD_SIDEBAR.map((e, t) => (
                <div className="flex flex-col gap-[5px]" key={t}>
                  {e.map((e, t) => (
                    <Bar width={`${e}%`} opacity={0.09} key={t} />
                  ))}
                </div>
              ))}
            </div>
          }
          {
            <div className="flex min-w-0 flex-1 flex-col gap-[7px] px-[8px] py-[7px]">
              {
                <div className="relative flex items-center gap-[5px]">
                  <span className="text-[5px] font-medium text-white/70">
                    Friday recap
                  </span>
                  {
                    <div className="relative ml-auto">
                      {
                        <div
                          className="flex h-[8px] items-center gap-[3px] rounded-full px-[4px]"
                          style={{
                            border: MINI_BORDER,
                            backgroundColor: `color-mix(in srgb, ${LINE} 4%, transparent)`,
                          }}
                        >
                          <span className="text-[4px] text-white/60">
                            {e.range ? "This week" : "Last week"}
                          </span>
                          {
                            <span
                              aria-hidden={!0}
                              className="h-[2px] w-[2px] rotate-45"
                              style={{
                                borderRight: `0.5px solid ${LINE}`,
                                borderBottom: `0.5px solid ${LINE}`,
                                opacity: 0.35,
                              }}
                            />
                          }
                        </div>
                      }
                      {e.menu ? <RangeMenu hovered={e.hovered} /> : null}
                    </div>
                  }
                  {
                    <div
                      className="flex h-[8px] items-center gap-[2px] rounded-full px-[4px] transition-colors duration-300"
                      style={
                        e.exported
                          ? { backgroundColor: LINE, opacity: 0.85 }
                          : {
                              border: MINI_BORDER,
                              backgroundColor: `color-mix(in srgb, ${LINE} 8%, transparent)`,
                            }
                      }
                    >
                      {
                        <div
                          aria-hidden={!0}
                          className="h-[3px] w-[16px] rounded-full"
                          style={{
                            backgroundColor: e.exported
                              ? "var(--color-theme-bg)"
                              : LINE,
                            opacity: e.exported ? 0.9 : 0.22,
                          }}
                        />
                      }
                    </div>
                  }
                </div>
              }
              {
                <div className="flex gap-[5px]">
                  {DASHBOARD_METRICS.map((e, t) => (
                    <div
                      className="flex flex-1 flex-col gap-[4px] rounded-[3px] px-[5px] py-[5px]"
                      style={{
                        border: MINI_BORDER,
                        backgroundColor: `color-mix(in srgb, ${LINE} 2%, transparent)`,
                      }}
                      key={t}
                    >
                      <span className="text-[4px] text-white/45">
                        {e.label}
                      </span>
                      <span className="text-[7px] font-medium text-white/80">
                        {e.value}
                      </span>
                    </div>
                  ))}
                </div>
              }
              {
                <div
                  className="flex min-h-0 flex-1 items-end gap-[4px] pb-[5px]"
                  style={{
                    borderBottom: `0.5px solid color-mix(in srgb, ${LINE} 10%, transparent)`,
                  }}
                >
                  {t.map((e, t) => (
                    <div
                      aria-hidden={!0}
                      className="flex-1 rounded-t-[1px] transition-[height] duration-500 ease-out"
                      style={{
                        height: `${e}%`,
                        backgroundColor: t === 9 ? "#b5a7fc" : LINE,
                        opacity: t === 9 ? 0.75 : 0.14 + (t % 3) * 0.03,
                      }}
                      key={t}
                    />
                  ))}
                </div>
              }
              {
                <div className="flex items-center gap-[6px]">
                  {[16, 13, 11].map((e, t) => (
                    <div className="flex items-center gap-[3px]" key={t}>
                      {
                        <span
                          aria-hidden={!0}
                          className="h-[3px] w-[3px] rounded-full"
                          style={{
                            backgroundColor: LINE,
                            opacity: 0.2,
                          }}
                        />
                      }
                      {<Bar width={`${2 * e}px`} opacity={0.08} />}
                    </div>
                  ))}
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  )
}

const RECORDING_CURSOR = {
    teach: { x: 90, y: 5 },
    range: { x: 68.6, y: 29.7 },
    menu: { x: 70.4, y: 39 },
    export: { x: 78.2, y: 29.7 },
  },
  RECORDING_INITIAL = {
    recording: !1,
    pressed: !1,
    screen: DASHBOARD_INITIAL,
    at: "export",
  },
  RECORDING_TIMELINE = [
    { atMs: 300, value: { ...RECORDING_INITIAL, at: "teach" } },
    { atMs: 1050, value: { ...RECORDING_INITIAL, at: "teach", pressed: !0 } },
    { atMs: 1250, value: { ...RECORDING_INITIAL, at: "teach", recording: !0 } },
    {
      atMs: 1900,
      value: {
        recording: !0,
        pressed: !1,
        screen: DASHBOARD_INITIAL,
        at: "range",
      },
    },
    {
      atMs: 2450,
      value: {
        recording: !0,
        pressed: !1,
        screen: { ...DASHBOARD_INITIAL, menu: !0 },
        at: "range",
      },
    },
    {
      atMs: 3050,
      value: {
        recording: !0,
        pressed: !1,
        screen: { ...DASHBOARD_INITIAL, menu: !0, hovered: 1 },
        at: "menu",
      },
    },
    {
      atMs: 3550,
      value: {
        recording: !0,
        pressed: !1,
        screen: { range: 1, menu: !1, hovered: null, exported: !1 },
        at: "range",
      },
    },
    {
      atMs: 4250,
      value: {
        recording: !0,
        pressed: !1,
        screen: { range: 1, menu: !1, hovered: null, exported: !1 },
        at: "export",
      },
    },
    {
      atMs: 4700,
      value: {
        recording: !0,
        pressed: !1,
        screen: { range: 1, menu: !1, hovered: null, exported: !0 },
        at: "export",
      },
    },
  ],
  RECORDING_FINAL = RECORDING_TIMELINE[RECORDING_TIMELINE.length - 1].value,
  LAST_RECORDING_EVENT = RECORDING_TIMELINE[RECORDING_TIMELINE.length - 1].atMs,
  RECORDING_START = RECORDING_TIMELINE[2].atMs,
  RECORDING_SECONDS = Math.ceil((LAST_RECORDING_EVENT - RECORDING_START) / 1e3)
const MemoSupportScreen = memo(SupportScreen)
const MemoDashboardScreen = memo(DashboardScreen)
export {
  MemoSupportScreen as SupportScreen,
  MemoDashboardScreen as DashboardScreen,
  SUPPORT_TIMELINE,
  SUPPORT_INITIAL,
  SUPPORT_FINAL,
  SUPPORT_CURSOR,
  RECORDING_TIMELINE,
  RECORDING_INITIAL,
  RECORDING_FINAL,
  RECORDING_CURSOR,
  RECORDING_SECONDS,
  RECORDING_START,
}
