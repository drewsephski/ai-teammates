"use client"

import { useRef, useState } from "react"
import { PlayIcon } from "lucide-react"
import styles from "./demo-video.module.css"

export function BotDemoVideo() {
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  async function play() {
    try {
      await video.current?.play()
      setPlaying(true)
      setError(false)
    } catch {
      setError(true)
    }
  }
  return (
    <section className={styles.section} aria-labelledby="demo-title">
      <h2 id="demo-title">See Krafty Bot at work</h2>
      <div className={styles.player}>
        <video
          ref={video}
          src="/landing/bot/demo.mp4"
          poster="/landing/bot/demo-poster.png"
          preload="none"
          playsInline
          muted
          controls={playing}
          onEnded={() => setPlaying(false)}
          aria-label="Example Krafty conversation, bot selection, and computer preview"
        >
          <track
            kind="captions"
            src="/landing/bot/demo.vtt"
            srcLang="en"
            label="English"
            default
          />
        </video>
        {!playing && (
          <button
            type="button"
            onClick={play}
            aria-label="Play Krafty demonstration"
          >
            <PlayIcon fill="currentColor" aria-hidden="true" /> Play
          </button>
        )}
      </div>
      <p className={styles.caption}>
        {error
          ? "The video could not play. Try again to watch the demonstration."
          : "An example workspace. Start your own conversation in Krafty."}
      </p>
    </section>
  )
}
