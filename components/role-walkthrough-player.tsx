"use client"

import { PlayIcon } from "lucide-react"
import { useState } from "react"

import {
  walkthroughAsset,
  type RoleWalkthrough,
} from "@/lib/marketing/role-walkthroughs"
import styles from "./role-walkthrough-player.module.css"

export function RoleWalkthroughPlayer({
  slug,
  title,
}: Pick<RoleWalkthrough, "slug" | "title">) {
  const [format, setFormat] = useState<"16x9" | "9x16">()
  const [failed, setFailed] = useState(false)

  return (
    <>
      <div className={styles.player}>
        {format ? (
          <video
            className={styles.media}
            src={walkthroughAsset(slug, format, "mp4")}
            poster={walkthroughAsset(slug, format, "webp")}
            aria-label={title}
            tabIndex={0}
            ref={(video) => video?.focus()}
            controls
            autoPlay
            muted
            playsInline
            preload="none"
            onError={() => {
              setFailed(true)
              setFormat(undefined)
            }}
          >
            <track
              kind="captions"
              src={`/marketing/walkthroughs/${slug}.vtt`}
              srcLang="en"
              label="English"
            />
            Your browser cannot play this video. Read the walkthrough below.
          </video>
        ) : (
          <button
            type="button"
            className={styles.play}
            aria-label={`Play ${title.toLowerCase()} (20 seconds)`}
            onClick={() => {
              setFailed(false)
              setFormat(
                window.matchMedia("(max-width: 640px)").matches
                  ? "9x16"
                  : "16x9"
              )
            }}
          >
            <picture>
              <source
                media="(max-width: 640px)"
                srcSet={walkthroughAsset(slug, "9x16", "webp")}
              />
              {/* Posters are pre-encoded WebP files with separate mobile framing. */}
              <img
                src={walkthroughAsset(slug, "16x9", "webp")}
                alt=""
                width={1920}
                height={1080}
                className={styles.media}
                loading="lazy"
              />
            </picture>
            <span className={styles.playLabel}>
              <PlayIcon aria-hidden="true" /> Play walkthrough · 20 seconds
            </span>
          </button>
        )}
      </div>
      {failed && (
        <p role="alert">
          Couldn&apos;t load the video. Try Play again, or read the walkthrough
          below.
        </p>
      )}
    </>
  )
}
