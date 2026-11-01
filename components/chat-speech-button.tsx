"use client"

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { useEffect, useRef, useState, type RefObject } from "react"
import { AudioLinesIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Wave } from "@/components/ui/wave"
import { toast } from "@/components/ui/toast"
import { usePromptInputController } from "@/components/ai-elements/prompt-input"
import { startAudioRecording, type AudioRecording } from "@/lib/audio-recording"
import {
  insertDictation,
  MAX_RECORDING_SECONDS,
  type TranscriptionResult,
} from "@/lib/transcription-policy"

type Phase = "idle" | "starting" | "recording" | "transcribing"
type RecordingSession = {
  recording?: AudioRecording
  cancelled: boolean
  finishing?: boolean
}

export function ChatSpeechButton({
  inputRef,
  transcribe,
  onBusyChange,
  record = startAudioRecording,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  transcribe: (form: FormData) => Promise<TranscriptionResult>
  onBusyChange: (busy: boolean) => void
  record?: () => Promise<AudioRecording>
}) {
  const { textInput } = usePromptInputController()
  const [phase, setPhase] = useState<Phase>("idle")
  const [seconds, setSeconds] = useState(0)
  const session = useRef<RecordingSession | null>(null)
  const latestInput = useRef(textInput)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => {
    latestInput.current = textInput
  }, [textInput])

  useEffect(
    () => () => {
      const active = session.current
      if (active) {
        active.cancelled = true
        active.recording?.cancel()
      }
      clearInterval(timer.current)
    },
    []
  )

  function reset() {
    clearInterval(timer.current)
    session.current = null
    setPhase("idle")
    onBusyChange(false)
  }

  function cancel() {
    const active = session.current
    if (active) {
      active.cancelled = true
      active.recording?.cancel()
    }
    reset()
  }

  async function finish() {
    const active = session.current
    if (!active?.recording || active.cancelled || active.finishing) return
    active.finishing = true
    clearInterval(timer.current)
    setPhase("transcribing")
    try {
      const audio = await active.recording.stop()
      if (active.cancelled) return
      const form = new FormData()
      form.set("audio", audio, "dictation.wav")
      const result = await transcribe(form)
      if (active.cancelled) return
      if (!result.ok) throw new Error(result.error)
      if (!result.text.trim()) {
        toast.add({ type: "info", title: "No speech detected. Try again." })
        return
      }
      const current = latestInput.current
      const insertion = insertDictation(
        current.value,
        result.text,
        inputRef.current?.selectionStart ?? current.value.length
      )
      current.setInput(insertion.text)
      requestAnimationFrame(() => {
        if (active.cancelled) return
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(
          insertion.position,
          insertion.position
        )
      })
    } catch (error) {
      if (!active.cancelled)
        toast.add({
          type: "error",
          title:
            error instanceof Error
              ? error.message
              : "Couldn't transcribe your recording. Try again.",
        })
    } finally {
      if (!active.cancelled) reset()
    }
  }

  async function start() {
    if (session.current) return
    const active: RecordingSession = { cancelled: false }
    session.current = active
    setPhase("starting")
    onBusyChange(true)
    try {
      active.recording = await record()
      if (active.cancelled) {
        active.recording.cancel()
        return
      }
      setPhase("recording")
      setSeconds(0)
      const started = Date.now()
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_RECORDING_SECONDS) void finish()
      }, 250)
    } catch (error) {
      if (!active.cancelled) {
        toast.add({
          type: "error",
          title:
            error instanceof Error
              ? error.message
              : "Couldn't start recording. Try again.",
        })
        reset()
      }
    }
  }

  const label =
    phase === "recording"
      ? "Stop dictation"
      : phase === "starting"
        ? "Waiting for microphone"
        : phase === "transcribing"
          ? "Transcribing recording"
          : "Start dictation"
  return (
    <div className="flex shrink-0 items-center gap-1">
      {phase !== "idle" && (
        <>
          <span className="sr-only" aria-live="polite">
            {phase === "recording"
              ? "Listening. Click the wave again to insert your words."
              : label}
          </span>
          {phase === "recording" && (
            <span
              aria-hidden="true"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          )}
          {phase !== "transcribing" && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Cancel dictation"
                    onClick={cancel}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>{"Cancel dictation"}</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant={phase === "recording" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={label}
              aria-pressed={phase === "recording"}
              disabled={phase === "starting" || phase === "transcribing"}
              onClick={() => {
                if (phase === "recording") void finish()
                else void start()
              }}
            >
              {phase === "recording" ? (
                <Wave className="h-4 w-5" aria-hidden="true" />
              ) : phase === "idle" ? (
                <AudioLinesIcon className="size-4" />
              ) : (
                <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              )}
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}
