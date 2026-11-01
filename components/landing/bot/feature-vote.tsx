"use client"

import { useState } from "react"
import { CheckIcon } from "lucide-react"

import { voteForFeature } from "@/actions/feature-votes"
import {
  featureOptions,
  voteShare,
  type FeatureId,
  type FeatureVotes,
} from "@/lib/feature-votes"
import styles from "./feature-vote.module.css"

const votesLabel = (total: number) =>
  `${new Intl.NumberFormat("en-US").format(total)} ${total === 1 ? "vote" : "votes"}`

// Results stay hidden until this browser has voted, so early counts don't
// steer the choice. `initialVotes` is null while loading or when the tally
// couldn't be read; voting still works and returns a fresh tally.
export function FeatureVote({
  initialVotes,
}: {
  initialVotes: FeatureVotes | null
}) {
  const [votes, setVotes] = useState(initialVotes)
  const [pending, setPending] = useState<FeatureId | null>(null)
  const [error, setError] = useState("")
  const choice = votes?.choice ?? null
  const showResults = votes !== null && choice !== null

  async function vote(featureId: FeatureId) {
    if (pending || featureId === choice) return
    setPending(featureId)
    setError("")
    try {
      const result = await voteForFeature(featureId)
      if (result.ok) setVotes(result.votes)
      else setError(result.error)
    } catch {
      setError("Couldn't connect. Check your connection and try again.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={styles.poll} data-nosnippet>
      <ul className={styles.options}>
        {featureOptions.map((option) => {
          const chosen = choice === option.id
          const share = showResults
            ? voteShare(votes.counts[option.id], votes.total)
            : 0
          return (
            <li key={option.id}>
              <button
                type="button"
                className={styles.option}
                aria-pressed={chosen}
                aria-busy={pending === option.id}
                disabled={pending !== null}
                onClick={() => vote(option.id)}
              >
                {showResults && (
                  <span
                    className={styles.bar}
                    style={{ transform: `scaleX(${share / 100})` }}
                    aria-hidden="true"
                  />
                )}
                <span className={styles.text}>
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                </span>
                <span className={styles.result}>
                  {pending === option.id ? (
                    "Saving…"
                  ) : showResults ? (
                    <>
                      {chosen && <CheckIcon size={16} aria-label="Your vote" />}
                      {share}%
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className={styles.status} role="status" data-error={Boolean(error)}>
        {error ||
          (showResults
            ? `${votesLabel(votes.total)} so far. Pick another option to change yours.`
            : "One vote per browser. No account needed.")}
      </p>
    </div>
  )
}
