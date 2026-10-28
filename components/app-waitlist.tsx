"use client"

import { useId, useState } from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  CheckIcon,
  MonitorIcon,
  SmartphoneIcon,
} from "lucide-react"
import { joinWaitlist } from "@/actions/app-waitlist"
import type { WaitlistPlatform } from "@/lib/app-waitlist"
import styles from "./app-waitlist.module.css"

export function AppWaitlist({
  initialPlatform = "mac",
  compact = false,
}: {
  initialPlatform?: WaitlistPlatform
  compact?: boolean
}) {
  const id = useId()
  const [platforms, setPlatforms] = useState<WaitlistPlatform[]>([
    initialPlatform,
  ])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [joined, setJoined] = useState(false)

  return (
    <section
      className={styles.panel}
      data-compact={compact}
      aria-labelledby={`${id}-title`}
    >
      <span className={styles.eyebrow}>Mac + iPhone · Coming soon</span>
      <h2 id={`${id}-title`}>Your bots. Closer at hand.</h2>
      <p className={styles.description}>
        A place on your Mac. A pocket-sized check-in. Be first to hear when
        Krafty is ready for your device.
      </p>
      {joined ? (
        <div className={styles.success} role="status">
          <CheckIcon size={24} aria-hidden="true" />
          <h3>You’re on the list.</h3>
          <p>
            We’ll email you when Krafty for{" "}
            {platforms.length === 2
              ? "Mac and iPhone are"
              : platforms[0] === "mac"
                ? "Mac is"
                : "iPhone is"}{" "}
            ready.
          </p>
          <Link href="/workspace">
            Use Krafty on the web{" "}
            <ArrowRightIcon size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending) return
            const data = new FormData(event.currentTarget)
            setError("")
            setPending(true)
            try {
              const result = await joinWaitlist({
                email: data.get("email"),
                platforms,
                website: data.get("website"),
              })
              if (result.ok) setJoined(true)
              else setError(result.error)
            } catch {
              setError("Couldn't connect. Check your connection and try again.")
            } finally {
              setPending(false)
            }
          }}
        >
          <fieldset className={styles.devices} disabled={pending}>
            <legend>Choose your devices</legend>
            {(
              [
                ["mac", "Mac", "Keep work within reach", MonitorIcon],
                ["iphone", "iPhone", "Check in from anywhere", SmartphoneIcon],
              ] as const
            ).map(([value, label, detail, Icon]) => (
              <label key={value} className={styles.device}>
                <input
                  type="checkbox"
                  name="platforms"
                  value={value}
                  checked={platforms.includes(value)}
                  onChange={(event) => {
                    setPlatforms(
                      event.target.checked
                        ? [...platforms, value]
                        : platforms.filter((platform) => platform !== value)
                    )
                  }}
                />
                <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
                <strong>{label}</strong>
                <span>{detail}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.emailLabel} htmlFor={`${id}-email`}>
            Email address
          </label>
          <div className={styles.submitRow}>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={254}
              disabled={pending}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            <button type="submit" disabled={pending || platforms.length === 0}>
              {pending ? "Saving your spot…" : "Join the waitlist"}
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.trap} aria-hidden="true">
            <label htmlFor={`${id}-website`}>Leave this empty</label>
            <input
              id={`${id}-website`}
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          {error && (
            <p id={`${id}-error`} className={styles.error} role="alert">
              {error}
            </p>
          )}
          <p className={styles.note}>
            App launch updates only. No account needed.{" "}
            <Link href="/privacy">Privacy policy</Link>
          </p>
        </form>
      )}
    </section>
  )
}
