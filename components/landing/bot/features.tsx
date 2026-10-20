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
              Hand a Bot a task the way you would a coworker, on your desktop or
              phone. It takes the project from start to finish, learns how you
              like things done, and checks in when it needs your approval.
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
            Start with one Bot and add another when the work grows, say one on
            outbound and one on a launch. They run at the same time, pass work
            to each other when it helps, and keep going after you log off.
          </p>
        </div>
        <div className={styles.grid}>
          <FeatureCard
            scene="support"
            title="Krafty Bot works where you work"
            body="Sign Krafty Bot in once and it uses your apps and websites the way you do, including the ones that are a pain to click through."
          />
          <FeatureCard
            scene="recording"
            title="Show a Bot how it’s done"
            body="Walk a Bot through a workflow in chat once. It saves the job as a routine and runs it on schedule after that."
          />
          <FeatureCard
            scene="memory"
            title="Bots get smarter over time"
            body="Bots keep context and learn from each other. Show one a workflow today, hand off the project by Friday."
          />
          <FeatureCard
            scene="collaboration"
            title="Connect the Bots"
            body="Put a few Bots in one thread and they pass the work between themselves. You can follow along without approving every step."
          />
        </div>
      </section>
    </>
  )
}
