"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { BotMark } from "./bot-mark"
import { SupportScreen, DashboardScreen, SUPPORT_TIMELINE, SUPPORT_INITIAL, SUPPORT_FINAL, SUPPORT_CURSOR, RECORDING_TIMELINE, RECORDING_INITIAL, RECORDING_FINAL, RECORDING_CURSOR, RECORDING_SECONDS, RECORDING_START } from "./feature-browser"
import styles from "./feature-scenes.module.css"

const EASE = [.4, 0, .2, 1] as const
const CYCLE_MS = 9300

/** Source cards run for 9000ms, fade for 300ms, then replay. */
function usePlayback() {
  const ref = useRef<HTMLElement>(null)
  const elapsed = useRef(0)
  const [time, setTime] = useState(0)
  const [inView, setInView] = useState(false)
  const [visible, setVisible] = useState(true)
  const reduced = useReducedMotion()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio >= .35), { threshold: .35 })
    observer.observe(element)
    const onVisibility = () => setVisible(!document.hidden)
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility) }
  }, [])
  const playing = inView && visible && !reduced
  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      elapsed.current += now - previous
      previous = now
      setTime(elapsed.current)
    }, 25)
    return () => window.clearInterval(timer)
  }, [playing])
  return { ref, time: time % CYCLE_MS, run: Math.floor(time / CYCLE_MS), playing, instant: !!reduced, dimmed: time % CYCLE_MS >= 9000 }
}
function phase<T>(time: number, initial: T, final: T, events: readonly { atMs: number; value: T }[], instant: boolean) {
  if (instant) return final
  let value = initial
  for (const event of events) if (time >= event.atMs) value = event.value
  return value
}

export function FeatureCard({ title, body, scene }: { title: string; body: string; scene: "support" | "recording" | "memory" | "collaboration" }) {
  const playback = usePlayback()
  return <article ref={playback.ref} className={styles.card}>
    <h3>{title}</h3><p>{body}</p>
    <figure className={styles.figure} aria-hidden="true"><div className={styles.stage}><div className={styles.snippet}>
      {scene === "support" && <SupportIllustration {...playback} />}
      {scene === "recording" && <RecordingIllustration {...playback} />}
      {scene === "memory" && <MemoryIllustration {...playback} />}
      {scene === "collaboration" && <CollaborationIllustration {...playback} />}
    </div></div></figure>
  </article>
}
type Playback = ReturnType<typeof usePlayback>
function RemoteDesktop({ children, dashboard = false }: { children: ReactNode; dashboard?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setScale(element.clientWidth / 360))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const width = dashboard ? .68 : .64
  const height = dashboard ? .8 : .6
  return <div ref={ref} className={`${styles.desktop} ${dashboard ? styles.dashboard : ""}`}>
    <div className={styles.window} style={{ top: dashboard ? "9%" : "7%", left: dashboard ? "16%" : "18%", width: `${width * 100}%`, height: `${height * 100}%` }}>
      <div className="flex origin-top-left flex-col" style={{width: 360 * width, height: 225 * height, transform:`scale(${scale})`}}>{children}</div>
    </div>
  </div>
}
function CursorArrow({ fill = "#1a1a1a" }: { fill?: string }) {
  return <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="-scale-x-100 shrink-0 drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.3)]"><path fillRule="evenodd" clipRule="evenodd" d="M14.4775 2.375C15.1508 2.37522 15.5719 3.10428 15.2353 3.6875L8.63861 15.1143C8.19099 15.8892 7.00618 15.5716 7.00579 14.6768V7.56348L0.845638 4.00781C0.0708241 3.56015 0.388339 2.37535 1.28314 2.375H14.4775ZM7.69329 6.51758C8.04109 6.7186 8.25579 7.09044 8.25579 7.49219V13.2764L13.8271 3.625H2.68353L7.69329 6.51758Z" fill="white" /><path d="M7.69329 6.51758C8.04109 6.7186 8.25579 7.09044 8.25579 7.49219V13.2764L13.8271 3.625H2.68353L7.69329 6.51758Z" fill={fill} /></svg>
}
function Cursor({ x, y, bot = false, duration = .45, instant = false }: { x: number; y: number; bot?: boolean; duration?: number; instant?: boolean }) {
  return <motion.div className={styles.cursor} initial={false} animate={{left:`${x}%`,top:`${y}%`, x:-1.3,y:-2}} transition={{duration: instant ? 0 : duration, ease:EASE}} style={{scale:.75}}>
    <span className={styles.swap}>
      <span data-hidden={!bot || undefined}><CursorArrow fill="#eb4699" /><span className={styles.cursorAvatar}><BotMark color="#eb4699" /></span></span>
      <span data-hidden={bot || undefined}><CursorArrow /><span className={styles.cursorTag}>You</span></span>
    </span>
  </motion.div>
}
function SupportIllustration(playback: Playback) {
  const value = phase(playback.time, SUPPORT_INITIAL, SUPPORT_FINAL, SUPPORT_TIMELINE, playback.instant)
  const at = SUPPORT_CURSOR[value.at]
  return <div className={styles.computer}>
    <div className="flex items-start gap-2"><span className={styles.computerTitle}>Computer</span><span className="flex-1" /><span className={`${styles.swap} ${styles.badgeSwap}`}>
      <span data-hidden={value.status !== "handed-over" || undefined}><span className={styles.badge}><span className={styles.badgeDot} />You&apos;re in control</span></span>
      <span data-hidden={value.status !== "working" || undefined}><span className={styles.badge}><span className={styles.spinner}></span>Working</span></span>
    </span></div>
    <p className="mt-0.5">Sign in to Zendesk so I can work the support queue.</p>
    <div className={`${styles.handoverScreen} mt-2.5`}><div className={styles.take} data-dimmed={playback.dimmed || undefined}>
      <RemoteDesktop><SupportScreen screen={value.screen} /></RemoteDesktop>
      <Cursor {...at} bot={value.who === "Bot"} instant={playback.instant} />
    </div></div>
  </div>
}
function RecordingIllustration(playback: Playback) {
  const value = phase(playback.time, RECORDING_INITIAL, RECORDING_FINAL, RECORDING_TIMELINE, playback.instant)
  const at = RECORDING_CURSOR[value.at as keyof typeof RECORDING_CURSOR]
  const seconds = playback.instant ? RECORDING_SECONDS : playback.time < RECORDING_START ? 0 : Math.min(RECORDING_SECONDS, Math.floor((playback.time - RECORDING_START) / 1000) + 1)
  return <div className={styles.recording} data-recording={value.recording || undefined}>
    <div className={styles.recordingBar}>
      <div data-hidden={!value.recording || undefined}><span className={styles.recordingLabel}>Weekly Reporting is watching and learning</span><span className={styles.recordingTimer}><span className={styles.recordingDot} />0:{String(seconds).padStart(2,"0")}</span><span className={styles.recordingClose}>×</span></div>
      <div data-hidden={value.recording || undefined}><span className={styles.recordingLabel} /><span className={styles.teach} data-pressed={value.pressed || undefined}><span className={styles.recordDot} />Teach a task</span></div>
    </div>
    <div className={styles.recordingScreen}><div className={styles.take} data-dimmed={playback.dimmed || undefined}><RemoteDesktop dashboard><DashboardScreen screen={value.screen} /></RemoteDesktop></div></div>
    <Cursor {...at} duration={.5} instant={playback.instant} />
  </div>
}
const MEMORY_MESSAGES = ["Acme replied on pricing, same thread as last quarter. I already had the context, so I answered without waiting on you.", "Noted for next time: they only sign annual, and Dana is the one who approves."]
function MemoryIllustration(playback: Playback) {
  const count = playback.instant ? 3 : playback.time < 520 ? 1 : playback.time < 1040 ? 2 : 3
  return <div className={`${styles.take} ${styles.memory}`} data-dimmed={playback.dimmed || undefined}>
    <motion.div layout={playback.instant ? false : "position"} transition={{layout:{duration:.44,ease:[.16,1,.3,1]}}} key={playback.run}>
      <div className="flex flex-col justify-center gap-1 px-3 py-2">
        {MEMORY_MESSAGES.slice(0,count).map((message)=><div className={styles.entry} key={message}><div className="flex max-w-[min(560px,92%)] flex-col items-start"><p className={styles.bubble}>{message}</p></div></div>)}
        {count === 3 && <div className={`${styles.entry} mt-3`}><div className={styles.memoryReceipt}>Updated memory for <span className={styles.memoryPill}><BotMark color="#885cf5" />Account Manager</span></div></div>}
      </div>
    </motion.div>
  </div>
}
const TEAMMATES = [
  {color:"#54b9a6",label:"Asking Research", background:"#163832", ink:"#73c6b5"},
  {color:"#885cf5",label:"Looping in Comms", background:"#2b2048", ink:"#aa87fa"},
  {color:"#ea4045",label:"Sending to Chief", background:"#451f22", ink:"#ee7276"},
  {color:"#f19d38",label:"Pinging Travel", background:"#45341c", ink:"#f4b565"},
]
function CollaborationPill({ index, open, active, instant }: { index:number; open:boolean; active:boolean; instant:boolean }) {
  const teammate = TEAMMATES[index]
  const labelRef = useRef<HTMLSpanElement>(null)
  const [width,setWidth] = useState(132)
  useEffect(()=>{
    const element=labelRef.current
    if(!element)return
    const observer=new ResizeObserver(()=>setWidth(element.offsetWidth))
    observer.observe(element)
    return()=>observer.disconnect()
  },[])
  return <motion.li className={styles.pill} data-open={open || undefined} initial={instant ? false : {opacity:0,y:16}} animate={{opacity:1,y:0,zIndex:4-Math.abs(index-(open?index:0))}} transition={{opacity:{duration:instant?0:.5,ease:EASE,delay:.08*index},y:{duration:instant?0:.5,ease:EASE,delay:.08*index},zIndex:{duration:0}}} style={{background:teammate.background,color:teammate.ink,boxShadow:`inset 0 0 0 1px ${teammate.color}30`}}>
    <motion.span className={styles.avatar} initial={false} animate={{scale:open?[1,1.1,1]:1}} transition={{duration:instant?0:.4,ease:EASE,times:[0,.4,1]}}><BotMark color={teammate.color} /></motion.span>
    <motion.div className={styles.spread} initial={false} animate={{width:open?width:0}} transition={instant?{duration:0}:{type:"spring",stiffness:340,damping:32,mass:.9}}>
      <motion.span ref={labelRef} className={styles.activity} initial={false} animate={{opacity:open?1:0,x:open?0:-6}} transition={instant?{duration:0}:open?{duration:.28,ease:EASE,delay:.12}:{duration:.12,ease:EASE}}>{teammate.label}…</motion.span>
    </motion.div>
  </motion.li>
}
function CollaborationIllustration(playback: Playback) {
  const [open,setOpen] = useState(0)
  const previousStep=useRef(-1)
  const step=playback.instant ? -1 : playback.time < 900 ? -1 : Math.floor((playback.time-900)/2300)
  useEffect(()=>{
    if(step===previousStep.current)return
    previousStep.current=step
    if(step<0) { setOpen(0); return }
    setOpen(value=>(value+1+Math.floor(Math.random()*3))%4)
  },[step])
  return <div className={`${styles.take} ${styles.collaboration}`} data-dimmed={playback.dimmed || undefined}>
    <ul className={styles.avatarRow} key={playback.run}>{TEAMMATES.map((teammate,index)=><CollaborationPill key={teammate.label} index={index} open={index===open} active={playback.playing && index===open} instant={playback.instant} />)}</ul>
  </div>
}
