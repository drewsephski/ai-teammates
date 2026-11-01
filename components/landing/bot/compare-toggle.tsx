"use client"

import { useId, useState, type CSSProperties } from "react"

import styles from "./compare-toggle.module.css"

type Comparison = { title: string; body: string }

/** A segmented control that shows one comparison at a time. */
export function CompareToggle({
  comparisons,
}: {
  comparisons: readonly Comparison[]
}) {
  const [active, setActive] = useState(0)
  const base = useId()

  return (
    <div className={styles.compare}>
      <div
        role="tablist"
        aria-label="Compare Krafty Bot with"
        className={styles.segments}
        style={
          { "--count": comparisons.length, "--active": active } as CSSProperties
        }
      >
        <span className={styles.thumb} aria-hidden="true" />
        {comparisons.map((comparison, index) => (
          <button
            key={comparison.title}
            id={`${base}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${base}-panel-${index}`}
            className={styles.segment}
            onClick={() => setActive(index)}
          >
            {comparison.title.replace(/^Compared with (?:an? )?/, "vs. ")}
          </button>
        ))}
      </div>
      {comparisons.map((comparison, index) => (
        <div
          key={comparison.title}
          id={`${base}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${index}`}
          hidden={index !== active}
          className={styles.panel}
        >
          <h3 className={styles.srOnly}>{comparison.title}</h3>
          <p>{comparison.body}</p>
        </div>
      ))}
    </div>
  )
}
