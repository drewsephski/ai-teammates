"use client"

import Link from "next/link"
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react"
import useEmblaCarousel from "embla-carousel-react"
import { BotMark } from "./bot-mark"
import { roles, roleStyle, type BotRole } from "./role-showcase-data"
import { RolePhone } from "./role-showcase-phone"
import styles from "./role-showcase.module.css"

const mobileQuery = "(max-width: 639px)"
function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(mobileQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function useMeasuredPillRows(
  ref: RefObject<HTMLDivElement | null>,
  selected: number
) {
  const [rows, setRows] = useState<number[][] | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let frame = 0
    let disposed = false
    const measure = () => {
      frame = 0
      if (disposed) return
      const buttons =
        element.querySelectorAll<HTMLButtonElement>("[data-role-index]")
      if (buttons.length !== roles.length) return
      const nextRows: number[][] = []
      let row: number[] = []
      let rowWidth = 0
      buttons.forEach((button) => {
        const width =
          button.getBoundingClientRect().width +
          (button.getAttribute("aria-pressed") === "false" ? 21 : 0)
        const nextWidth = rowWidth + 8 + width
        if (row.length && nextWidth > element.clientWidth) {
          nextRows.push(row)
          row = []
          rowWidth = 0
        }
        row.push(Number(button.dataset.roleIndex))
        rowWidth = row.length === 1 ? width : nextWidth
      })
      if (row.length) nextRows.push(row)
      setRows((previous) =>
        previous && JSON.stringify(previous) === JSON.stringify(nextRows)
          ? previous
          : nextRows
      )
    }
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure)
    }
    schedule()
    void document.fonts.ready.then(schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    return () => {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ref, selected])
  return rows
}

function RoleDescription({
  role,
  className = "",
}: {
  role: BotRole
  className?: string
}) {
  const [lead, ...rest] = role.description.split(/(?<=[.!?]) /)
  return (
    <p className={`${styles.description} ${className}`} key={role.id}>
      <strong>{lead}</strong>
      {rest.length > 0 && <> {rest.join(" ")}</>}
    </p>
  )
}

function MobileRoleCarousel({
  selected,
  onSelect,
  workspaceHref,
}: {
  selected: number
  onSelect: (index: number) => void
  workspaceHref: string
}) {
  const [viewportRef, carousel] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    dragFree: true,
  })
  useEffect(() => {
    if (!carousel) return
    const handleSelect = () => onSelect(carousel.selectedScrollSnap())
    carousel.on("select", handleSelect)
    return () => {
      carousel.off("select", handleSelect)
    }
  }, [carousel, onSelect])
  useEffect(() => {
    if (carousel && carousel.selectedScrollSnap() !== selected)
      carousel.scrollTo(
        selected,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
  }, [carousel, selected])
  return (
    <div
      className={styles.carousel}
      ref={viewportRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Ways to use Krafty Bot"
    >
      <div className={styles.carouselTrack}>
        {roles.map((role, index) => (
          <div
            className={styles.carouselSlide}
            key={role.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${roles.length}`}
            style={roleStyle(role)}
          >
            {Math.abs(index - selected) <= 2 ? (
              <RolePhone role={role} workspaceHref={workspaceHref} />
            ) : (
              <div className={styles.phoneStage} />
            )}
            <RoleDescription
              role={role}
              className={styles.carouselDescription}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function RoleShowcase({ workspaceHref }: { workspaceHref: string }) {
  const [selected, setSelected] = useState(0)
  const pillsRef = useRef<HTMLDivElement>(null)
  const rows = useMeasuredPillRows(pillsRef, selected)
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(mobileQuery).matches,
    () => false
  )
  const role = roles[selected]
  return (
    <section
      id="use-cases"
      className={styles.section}
      aria-labelledby="roles-heading"
    >
      <div className={styles.layout} style={roleStyle(role)}>
        <div className={styles.copy}>
          <h2 id="roles-heading">Give each Bot a job</h2>
          <div
            className={styles.pills}
            ref={pillsRef}
            aria-label="Choose a bot role"
          >
            {(rows ?? [roles.map((_, index) => index)]).map((row) => (
              <div className={styles.pillRow} key={row.join()}>
                {row.map((roleIndex) => (
                  <button
                    key={roles[roleIndex].name}
                    type="button"
                    aria-pressed={selected === roleIndex}
                    aria-controls="role-example"
                    data-role-index={roleIndex}
                    onClick={() => setSelected(roleIndex)}
                    className={styles.pill}
                    style={roleStyle(roles[roleIndex])}
                  >
                    <span className={styles.pillAvatar}>
                      <BotMark color={roles[roleIndex].color} active={false} />
                    </span>
                    {roles[roleIndex].name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.desktopDescription}>
            <RoleDescription role={role} />
          </div>
          <div className={styles.desktopExplore}>
            <Link href={workspaceHref} className={styles.explore}>
              Explore more bots
            </Link>
          </div>
        </div>
        <div id="role-example" className={styles.example}>
          {isMobile ? (
            <MobileRoleCarousel
              selected={selected}
              onSelect={setSelected}
              workspaceHref={workspaceHref}
            />
          ) : (
            <RolePhone
              key={role.id}
              role={role}
              workspaceHref={workspaceHref}
            />
          )}
        </div>
        <div className={styles.tabletDescription}>
          <RoleDescription role={role} />
        </div>
      </div>
      <div className={styles.mobileExplore}>
        <Link href={workspaceHref} className={styles.explore}>
          Explore more bots
        </Link>
      </div>
    </section>
  )
}
