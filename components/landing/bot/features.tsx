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
            <h2 id="statement-title">Hand it the whole task</h2>
            <p>
              Krafty doesn’t stop at telling you how. It opens the sites, reads
              the threads, does the steps, and comes back with what it found and
              what needs your OK. Message it from your laptop or your phone.
            </p>
          </div>
          <div className={styles.statementPop}>
            <div className={styles.statementFrame}>
              <div className={styles.statementCharacterPanel}>
                <BotMark
                  className={styles.statementCharacter}
                  color="#efe7dc"
                  dimensional
                />
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
          <h2 id="features-title">One Bot per job</h2>
          <p>
            Start with one Bot. Add another when you have more to hand off, like
            your inbox or the next release. They can run at the same time, pass
            work to each other, and keep going after you log off.
          </p>
        </div>
        <div className={styles.grid}>
          <FeatureCard
            scene="support"
            title="Signs in where you do"
            body="Connect Gmail, GitHub, and the other apps you use. Sites without an integration work in a browser."
          />
          <FeatureCard
            scene="recording"
            title="Do it once, then every week"
            body="Get a task right in chat once. Then say “do this every Friday” and it runs on schedule without you."
          />
          <FeatureCard
            scene="memory"
            title="Remembers what you tell it"
            body="Tell a Bot once how you like things done. It saves a note and uses it in every chat after that."
          />
          <FeatureCard
            scene="collaboration"
            title="Bots hand off work"
            body="Put a few Bots in one chat, or have one brief another. You can follow every handoff in the thread."
          />
        </div>
      </section>
    </>
  )
}
