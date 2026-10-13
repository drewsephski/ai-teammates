import { BotMark } from "./bot-mark"
import styles from "./features.module.css"
import { FeatureCard } from "./feature-scenes"

export function BotFeatures() {
  return (
    <>
      <section
        id="statement"
        className={styles.statementSection}
        aria-labelledby="statement-title"
      >
        <div className={styles.statement}>
          <div className={styles.statementCopy}>
            <h2 id="statement-title">Message Bots like teammates</h2>
            <p>
              Give tasks to Bots like you would a teammate on desktop or iOS.
              Your AI teammates take projects from start to end, keep context on
              how you work and get smarter over time, and come back when your
              approval is needed.
            </p>
          </div>
          <div className={styles.statementPop}>
            <div className={styles.statementFrame}>
              <div className={styles.statementCharacterPanel}>
                <BotMark className={styles.statementCharacter} color="#fff" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section
        id="features"
        className={styles.features}
        aria-labelledby="features-title"
      >
        <div className={styles.heading}>
          <h2 id="features-title">Work with many Bots at once</h2>
          <p>
            Create a Bot, give it a task, and add another when the work
            grows—one on a project, one on outbound, one on systems. AI
            teammates work in parallel, collaborate where it makes sense, and
            keep working 24/7.
          </p>
        </div>
        <div className={styles.grid}>
          <FeatureCard
            scene="support"
            title="Krafty Bot works where you work"
            body="Log Krafty Bot in once. It uses your apps and websites just like you would, including the tools that are harder to navigate."
          />
          <FeatureCard
            scene="recording"
            title="Show a Bot how it’s done"
            body="Ask a Bot to follow along as you complete a workflow once. It saves it as a routine and runs it on its own next time."
          />
          <FeatureCard
            scene="memory"
            title="Bots get smarter over time"
            body="Bots keep context and learn from each other. Show one a workflow today, hand off the project by Friday."
          />
          <FeatureCard
            scene="collaboration"
            title="Connect the Bots"
            body="Put a few Bots in the same thread and they pass work between themselves. You watch them take action instead of approving every step."
          />
        </div>
      </section>
    </>
  )
}
