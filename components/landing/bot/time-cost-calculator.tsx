"use client"

import { useEffect, useId, useState } from "react"
import { CheckIcon, CopyIcon, PlusIcon, XIcon } from "lucide-react"

import { toast } from "@/components/ui/toast"
import { publicPlans, siteUrl } from "@/lib/marketing/site"
import {
  exampleTasks,
  TIME_COST_LIMITS,
  timeCost,
  WORK_WEEKS_PER_YEAR,
  type RepeatedTask,
} from "@/lib/time-cost"
import styles from "./time-cost-calculator.module.css"

type Row = RepeatedTask & { id: number }

const dollars = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
const hours = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 1 })

const proYearly = publicPlans[1].price * 12
const embedSnippet = `<a href="${siteUrl}/time-cost-calculator">Time cost calculator for repetitive tasks</a> by Krafty`

/** Interactive calculator for /time-cost-calculator. */
export function TimeCostCalculator() {
  const baseId = useId()
  const [rows, setRows] = useState<Row[]>(() =>
    exampleTasks.map((task, index) => ({ ...task, id: index }))
  )
  const [nextId, setNextId] = useState(exampleTasks.length)
  const [rate, setRate] = useState(50)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const result = timeCost(rows, rate)
  const update = (id: number, change: Partial<RepeatedTask>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...change } : row))
    )

  return (
    <div className={styles.calculator}>
      <form
        className={styles.form}
        onSubmit={(event) => event.preventDefault()}
      >
        <fieldset className={styles.tasks}>
          <legend>Your repetitive tasks</legend>
          <div className={styles.headings} aria-hidden>
            <span>Task</span>
            <span>Minutes each time</span>
            <span>Times a week</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div key={row.id} className={styles.row}>
              <input
                aria-label={`Task ${index + 1}`}
                value={row.name}
                maxLength={80}
                placeholder="Describe the task"
                onChange={(event) =>
                  update(row.id, { name: event.target.value })
                }
              />
              <input
                aria-label={`Minutes each time for task ${index + 1}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={TIME_COST_LIMITS.minutes}
                value={Number.isNaN(row.minutes) ? "" : row.minutes}
                onChange={(event) =>
                  update(row.id, { minutes: event.target.valueAsNumber })
                }
              />
              <input
                aria-label={`Times a week for task ${index + 1}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={TIME_COST_LIMITS.perWeek}
                value={Number.isNaN(row.perWeek) ? "" : row.perWeek}
                onChange={(event) =>
                  update(row.id, { perWeek: event.target.valueAsNumber })
                }
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove task ${index + 1}`}
                onClick={() =>
                  setRows((current) =>
                    current.filter((item) => item.id !== row.id)
                  )
                }
              >
                <XIcon aria-hidden />
              </button>
            </div>
          ))}
          {rows.length < TIME_COST_LIMITS.tasks && (
            <button
              type="button"
              className={styles.add}
              onClick={() => {
                setRows((current) => [
                  ...current,
                  { id: nextId, name: "", minutes: 10, perWeek: 1 },
                ])
                setNextId((id) => id + 1)
              }}
            >
              <PlusIcon aria-hidden />
              Add a task
            </button>
          )}
        </fieldset>
        <label className={styles.rate} htmlFor={`${baseId}-rate`}>
          <span>What an hour of your time is worth, in dollars</span>
          <input
            id={`${baseId}-rate`}
            type="number"
            inputMode="decimal"
            min={0}
            max={TIME_COST_LIMITS.hourlyRate}
            value={Number.isNaN(rate) ? "" : rate}
            onChange={(event) => setRate(event.target.valueAsNumber)}
          />
        </label>
      </form>

      <section className={styles.results} aria-labelledby={`${baseId}-results`}>
        <h2 id={`${baseId}-results`}>What these tasks cost you</h2>
        <dl role="status" aria-live="polite">
          <div>
            <dt>Each week</dt>
            <dd>{hours(result.weeklyHours)} hours</dd>
          </div>
          <div>
            <dt>Each year</dt>
            <dd>{hours(result.yearlyHours)} hours</dd>
          </div>
          <div>
            <dt>In workdays</dt>
            <dd>{hours(result.yearlyWorkdays)} eight-hour days</dd>
          </div>
          <div>
            <dt>In money, each year</dt>
            <dd>{dollars(result.yearlyCost)}</dd>
          </div>
        </dl>
        <p className={styles.fine}>
          Based on {WORK_WEEKS_PER_YEAR} working weeks a year. That&apos;s{" "}
          {dollars(result.monthlyCost)} a month. For comparison, Krafty Pro is{" "}
          {dollars(proYearly)} a year. A Bot won&apos;t take every minute off
          your plate: you still describe the job and review its work.
        </p>
      </section>

      <figure className={styles.embed}>
        <figcaption>
          <span>Link to this calculator</span>
          <button
            type="button"
            className={styles.copy}
            aria-label={copied ? "Copied" : "Copy link HTML"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(embedSnippet)
                setCopied(true)
              } catch {
                toast.add({
                  type: "error",
                  title: "Couldn't copy the link",
                  description: "Select the text and copy it instead.",
                })
              }
            }}
          >
            {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
          </button>
        </figcaption>
        <code>{embedSnippet}</code>
      </figure>
    </div>
  )
}
