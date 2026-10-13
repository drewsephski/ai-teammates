import { ChatAvatar } from "@/components/chat-avatar"
import Link from "next/link"
import {
  BrainIcon,
  CheckIcon,
  FilesIcon,
  GitForkIcon,
  MessageSquareIcon,
  MonitorIcon,
  PlusIcon,
  SparklesIcon,
  TerminalIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"
import { botPresets } from "@/lib/bot-presets"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import styles from "./landing.module.css"
import { PromptBond } from "./prompt-bond"

const features = [
  {
    title: "Custom roles, made yours.",
    description:
      "Give each teammate a name, a job, and instructions. Start with a preset or make a specialist entirely your own.",
    icon: SparklesIcon,
    href: "/workspace#teammates",
    label: "Create a teammate",
    className: "featureCustom",
  },
  {
    title: "A computer for the work.",
    description:
      "Let your teammates work in a cloud desktop with a browser, terminal, and files. Open the live view to see what’s happening.",
    icon: MonitorIcon,
    href: "/workspace#computer",
    label: "Explore cloud computers",
    className: "featureComputer",
  },
  {
    title: "Your team, in one conversation.",
    description:
      "Put specialists in a group chat. They can hand a request to the teammate whose role fits the next part of the work.",
    icon: UsersIcon,
    href: "/workspace#groups",
    label: "Start a group chat",
    className: "featureGroups",
  },
  {
    title: "Memory that stays with you.",
    description:
      "Ask a teammate to save a preference or a useful note. Its saved memory follows it into the next conversation.",
    icon: BrainIcon,
    href: "/workspace#memory",
    label: "Explore teammate memory",
    className: "featureMemory",
  },
]

export function ProductSections({
  appHref,
  startHref,
}: {
  appHref: (destination: string) => string
  startHref: string
}) {
  return (
    <>
      <section
        id="features"
        className={styles.section}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>The Krafty workspace</span>
            <h2 id="features-title">
              Built for the way
              <br />
              you work.
            </h2>
          </div>
          <p>
            A useful teammate needs more than a clever reply. Krafty gives yours
            the context and tools to get involved.
          </p>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature, index) => (
            <article
              key={feature.title}
              className={`${styles.featureCard} ${styles[feature.className]}`}
            >
              <div className={styles.featureVisual} aria-hidden="true">
                {index === 0 && (
                  <div className={styles.roleIllustration}>
                    <ChatAvatar seed="krafty-ada" className="size-16" />
                    <div>
                      <strong>Meet Ada.</strong>
                      <span>Research assistant</span>
                      <small>Curious. Thorough. On your team.</small>
                    </div>
                    <span className={styles.roleTag}>
                      Made by you <SparklesIcon size={12} />
                    </span>
                  </div>
                )}
                {index === 1 && (
                  <div className={styles.computerIllustration}>
                    <div>
                      <span />
                      <span />
                      <span />
                      <small>ada / workspace</small>
                    </div>
                    <p>
                      <TerminalIcon size={13} /> ~/project
                    </p>
                    <code>
                      <span>$</span> python analyze.py
                      <br />
                      <span>✓</span> Report saved to /workspace
                    </code>
                    <span className={styles.liveTag}>
                      <MonitorIcon size={12} /> See the work happen
                    </span>
                  </div>
                )}
                {index === 2 && (
                  <div className={styles.handoffIllustration}>
                    <span className={styles.largeAvatar}>
                      <ChatAvatar seed="krafty-ada" className="size-16" />
                      <small>Ada · Research</small>
                    </span>
                    <span className={styles.handoffArrow}>
                      <AnimatedArrow direction="right" size={22} />
                      <small>Handoff</small>
                    </span>
                    <span className={styles.largeAvatar}>
                      <ChatAvatar seed="krafty-juno" className="size-16" />
                      <small>Juno · Writing</small>
                    </span>
                  </div>
                )}
                {index === 3 && (
                  <div className={styles.memoryIllustration}>
                    <BrainIcon size={20} />
                    <div>
                      <small>SAVED TO MEMORY</small>
                      <p>
                        “Keep my briefs concise.
                        <br />
                        Always include sources.”
                      </p>
                    </div>
                    <CheckIcon size={16} />
                  </div>
                )}
              </div>
              <div className={styles.featureBody}>
                <feature.icon size={20} className={styles.featureIcon} />
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <Link href={appHref(feature.href)} prefetch={false}>
                  {feature.label}
                  <AnimatedArrow direction="diagonal" size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.moreFeatures}>
          <Link href={appHref("/workspace#computer")} prefetch={false}>
            <FilesIcon />
            <span>
              <strong>Files & terminal</strong>
              <small>Read, write, and run on a persistent computer.</small>
            </span>
            <AnimatedArrow direction="diagonal" size={13} />
          </Link>
          <Link href={appHref("/workspace#memory")} prefetch={false}>
            <MessageSquareIcon />
            <span>
              <strong>Conversations that continue</strong>
              <small>Return to your chats and ongoing work.</small>
            </span>
            <AnimatedArrow direction="diagonal" size={13} />
          </Link>
          <Link href={appHref("/usage")} prefetch={false}>
            <WalletIcon />
            <span>
              <strong>Plans & usage</strong>
              <small>Keep track of AI usage and computer time.</small>
            </span>
            <AnimatedArrow direction="diagonal" size={13} />
          </Link>
        </div>
      </section>
      <section
        id="use-cases"
        className={`${styles.section} ${styles.useCases}`}
        aria-labelledby="use-cases-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Start with a role</span>
            <h2 id="use-cases-title">There’s a teammate for that.</h2>
          </div>
          <p>
            Start with a familiar role. Give it your context.
            <br />
            Make it part of the way you work.
          </p>
        </div>
        <div className={styles.useCaseGrid}>
          {botPresets.map((preset) => (
            <Link
              key={preset.id}
              href={appHref(`/workspace?role=${preset.id}`)}
              prefetch={false}
              className={styles.useCaseCard}
            >
              <div className={styles.useCaseTop}>
                <span>
                  <preset.icon size={21} />
                </span>
                <AnimatedArrow direction="diagonal" size={17} />
              </div>
              <h3>{preset.label}</h3>
              <p>{preset.description}</p>
              <blockquote>“{preset.prompt}”</blockquote>
              <span className={styles.useCaseLink}>
                Meet your {preset.job.toLowerCase()}{" "}
                <AnimatedArrow direction="right" size={14} />
              </span>
            </Link>
          ))}
        </div>
        <div className={styles.customRole}>
          <PlusIcon size={19} />
          <p>
            <strong>Your work doesn’t fit a preset?</strong> Give a teammate any
            role and your own instructions.
          </p>
          <Link href={appHref("/workspace#teammates")} prefetch={false}>
            Make it your own <AnimatedArrow direction="right" size={15} />
          </Link>
        </div>
      </section>
      <section
        id="how-it-works"
        className={`${styles.section} ${styles.howItWorks}`}
        aria-labelledby="how-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>How it works</span>
            <h2 id="how-title">
              You set the direction.
              <br />
              Your team gets to work.
            </h2>
          </div>
          <Link
            href={startHref}
            prefetch={false}
            className={styles.secondaryButton}
          >
            Let’s get started <AnimatedArrow direction="right" size={16} />
          </Link>
        </div>
        <div className={styles.steps}>
          {[
            {
              title: "Make an introduction.",
              text: "Choose a role, a name, and a face. Tell your teammate how you like things done.",
            },
            {
              title: "Give it something real.",
              text: "Share a question, a draft, or a task. Your teammate can use its computer when the work calls for it.",
            },
            {
              title: "Keep building together.",
              text: "Review the work, save useful context, and bring in another specialist when you need one.",
            },
          ].map((step, index) => (
            <article key={step.title}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
        <PromptBond startHref={startHref} />
      </section>
      <section className={styles.openSource}>
        <div className={styles.openSourceInner}>
          <span className={styles.openSourceIcon}>
            <GitForkIcon size={28} />
          </span>
          <div>
            <span className={styles.eyebrow}>Open source</span>
            <h2>
              Your workspace.
              <br />
              Your way of working.
            </h2>
            <p>
              See how Krafty works, customize its tools, or run your own
              instance. The source is yours to explore.
            </p>
            <a
              href="https://github.com/code-with-antonio/ai-teammates"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondaryButton}
            >
              Explore the source{" "}
              <AnimatedArrow direction="diagonal" size={16} />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <div className={styles.sourceNote}>
            <span>krafty / your-next-idea</span>
            <code>
              <span>role</span> = &quot;A teammate for your work&quot;
              <br />
              <span>memory</span> = &quot;What matters to you&quot;
              <br />
              <span>computer</span> = &quot;Room to make things&quot;
            </code>
            <p>
              <SparklesIcon size={14} /> Make yourself at home.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
