import { CheckIcon } from "lucide-react"
import { demoScenarios } from "./demo-scenarios"
import styles from "./demo.module.css"

export type DemoScenario = (typeof demoScenarios)[number]

export function DemoResult({ example }: { example: DemoScenario }) {
  return (
    <div className={styles.resultContent}>
      <span className={styles.resultEyebrow}>
        EXAMPLE {example.label.toUpperCase()} RESULT
      </span>
      <h3>{example.title}</h3>
      <p>{example.summary}</p>
      <div className={styles.findings}>
        {example.findings.map((finding, index) => (
          <div key={finding.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h4>{finding.label}</h4>
              <p>{finding.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.resultFoot}>
        <CheckIcon size={13} /> Ready for your review
      </div>
    </div>
  )
}
