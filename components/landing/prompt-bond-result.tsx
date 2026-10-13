"use client"

import { useRef } from "react"
import { FileTextIcon, XIcon } from "lucide-react"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import { demoScenarios } from "./demo-scenarios"
import styles from "./prompt-bond.module.css"

export function PromptBondResult({
  example,
}: {
  example: (typeof demoScenarios)[number]
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className={styles.result}
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
      >
        <FileTextIcon size={18} aria-hidden="true" />
        <span>
          <strong>{example.file}</strong>
          <small>Open the example result</small>
        </span>
        <AnimatedArrow direction="diagonal" size={15} />
      </button>
      <dialog
        ref={dialog}
        className={styles.resultDialog}
        aria-labelledby="prompt-result-title"
      >
        <div className={styles.dialogTop}>
          <span>EXAMPLE {example.label.toUpperCase()} RESULT</span>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close prompt example result"
          >
            <XIcon size={18} />
          </button>
        </div>
        <h4 id="prompt-result-title">{example.title}</h4>
        <p>{example.summary}</p>
        <div className={styles.findings}>
          {example.findings.map((finding) => (
            <div key={finding.label}>
              <h5>{finding.label}</h5>
              <p>{finding.text}</p>
            </div>
          ))}
        </div>
        <p className={styles.dialogNote}>
          An illustrative result. Your own tasks run in your workspace.
        </p>
      </dialog>
    </>
  )
}
