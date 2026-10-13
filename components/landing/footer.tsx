import Link from "next/link"
import { KraftyWordmark } from "@/components/krafty-wordmark"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import { HalftoneWordmarkFooter } from "./halftone-wordmark-footer"
import styles from "./footer.module.css"

export function LandingFooter({
  appHref,
  isAuthenticated,
}: {
  appHref: (destination: string) => string
  isAuthenticated: boolean
}) {
  return (
    <HalftoneWordmarkFooter>
      <div className={styles.top}>
        <div className={styles.brand}>
          <KraftyWordmark />
          <p>
            A role. A memory. A computer.
            <br />A teammate for what’s next.
          </p>
          <small>© {new Date().getFullYear()} Krafty</small>
        </div>
        <nav className={styles.column} aria-label="Product links">
          <h3>Explore Krafty</h3>
          <ul>
            <li>
              <Link href={appHref("/workspace#teammates")} prefetch={false}>
                Teammates
              </Link>
            </li>
            <li>
              <Link href={appHref("/workspace#groups")} prefetch={false}>
                Group chats
              </Link>
            </li>
            <li>
              <Link href={appHref("/workspace#computer")} prefetch={false}>
                Cloud computers
              </Link>
            </li>
            <li>
              <Link href={appHref("/workspace#memory")} prefetch={false}>
                Memory & files
              </Link>
            </li>
          </ul>
        </nav>
        <nav className={styles.column} aria-label="Account links">
          <h3>Your workspace</h3>
          <ul>
            <li>
              <Link href={appHref("/workspace")} prefetch={false}>
                Open workspace
              </Link>
            </li>
            <li>
              <Link href={appHref("/pricing")} prefetch={false}>
                Plans & billing
              </Link>
            </li>
            <li>
              <Link href={appHref("/usage")} prefetch={false}>
                Usage
              </Link>
            </li>
            <li>
              <Link
                href={
                  isAuthenticated
                    ? "/workspace"
                    : "/sign-up?redirect_url=%2Fworkspace"
                }
                prefetch={false}
              >
                {isAuthenticated ? "Your team" : "Create an account"}
              </Link>
            </li>
          </ul>
        </nav>
        <nav className={styles.column} aria-label="Learn more">
          <h3>Get to know us</h3>
          <ul>
            <li>
              <a href="#use-cases">Use cases</a>
            </li>
            <li>
              <a href="#how-it-works">How it works</a>
            </li>
            <li>
              <a href="#faq">FAQs</a>
            </li>
            <li>
              <a
                href="https://github.com/code-with-antonio/ai-teammates"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub <AnimatedArrow direction="diagonal" size={12} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </HalftoneWordmarkFooter>
  )
}
