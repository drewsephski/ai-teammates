import "./helpers/avatar-motion"
import "./helpers/css.mjs"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useRef, useState, type ComponentProps } from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import type { ChatSpeechButton as ChatSpeechButtonType } from "../components/chat-speech-button"
import { ChatComposer } from "../components/chat-composer"
import { PromptInputProvider } from "../components/ai-elements/prompt-input"
import type { AudioRecording } from "../lib/audio-recording"
import type { TranscriptionResult } from "../lib/transcription-policy"

afterEach(cleanup)
const { ChatSpeechButton } = await import("../components/chat-speech-button")
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function Harness({
  transcribe,
  record,
  submit = () => {
    throw new Error("Unexpected send")
  },
}: Pick<
  ComponentProps<typeof ChatSpeechButtonType>,
  "transcribe" | "record"
> & {
  submit?: () => boolean
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <PromptInputProvider initialInput="Existing draft">
      <ChatComposer
        bots={[]}
        memberIds={[]}
        inputRef={inputRef}
        placeholder="Message"
        disabled={busy}
        onSubmit={submit}
      >
        <ChatSpeechButton
          inputRef={inputRef}
          transcribe={transcribe}
          record={record}
          onBusyChange={setBusy}
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </ChatComposer>
    </PromptInputProvider>
  )
}
const recording = (cancel = () => {}) => ({
  stop: async () => new window.Blob(["audio"], { type: "audio/wav" }),
  cancel,
})

test("wave toggles recording, waits for transcription, and inserts into the latest draft without sending", async () => {
  const result = deferred<TranscriptionResult>()
  let uploads = 0
  const view = render(
    <Harness
      record={async () => recording()}
      transcribe={async (form) => {
        assert.ok(form.get("audio"))
        uploads++
        return result.promise
      }}
    />
  )
  const input = view.getByRole("textbox") as HTMLTextAreaElement
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Start dictation" }))
  })
  assert.equal(
    view
      .getByRole("button", { name: "Stop dictation" })
      .getAttribute("aria-pressed"),
    "true"
  )
  assert.equal(
    view.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
    true
  )
  fireEvent.change(input, {
    target: { value: "Edited draft: ", selectionStart: 14 },
  })
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Stop dictation" }))
  })
  assert.equal(uploads, 1)
  assert.ok(
    view
      .getByRole("button", { name: "Transcribing recording" })
      .hasAttribute("disabled")
  )
  await act(async () => {
    result.resolve({ ok: true, text: "spoken words" })
  })
  assert.equal(input.value, "Edited draft: spoken words")
  assert.ok(view.getByRole("button", { name: "Start dictation" }))
})

test("cancel stops the microphone without uploading and preserves the draft", async () => {
  let cancellations = 0
  const view = render(
    <Harness
      record={async () =>
        recording(() => {
          cancellations++
        })
      }
      transcribe={async () => {
        throw new Error("Unexpected upload")
      }}
    />
  )
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Start dictation" }))
  })
  fireEvent.click(view.getByRole("button", { name: "Cancel dictation" }))
  assert.equal(cancellations, 1)
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "Existing draft"
  )
})

test("cancelling pending permission closes a microphone granted afterwards", async () => {
  const permission = deferred<AudioRecording>()
  let cancellations = 0
  const view = render(
    <Harness
      record={() => permission.promise}
      transcribe={async () => {
        throw new Error("Unexpected upload")
      }}
    />
  )
  fireEvent.click(view.getByRole("button", { name: "Start dictation" }))
  fireEvent.click(view.getByRole("button", { name: "Cancel dictation" }))
  await act(async () => {
    permission.resolve(
      recording(() => {
        cancellations++
      })
    )
  })
  assert.equal(cancellations, 1)
  assert.ok(view.getByRole("button", { name: "Start dictation" }))
})

test("unmount closes the microphone and ignores a transcript already in flight", async () => {
  const result = deferred<TranscriptionResult>()
  let cancellations = 0
  const view = render(
    <Harness
      record={async () =>
        recording(() => {
          cancellations++
        })
      }
      transcribe={() => result.promise}
    />
  )
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Start dictation" }))
  })
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Stop dictation" }))
  })
  view.unmount()
  await act(async () => {
    result.resolve({ ok: true, text: "Late transcript" })
  })
  assert.equal(cancellations, 1)
})

test("denied microphone and upstream failure unlock sending and keep the draft", async () => {
  for (const denied of [true, false]) {
    const view = render(
      <Harness
        record={async () => {
          if (denied) throw new Error("Microphone denied")
          return recording()
        }}
        transcribe={async () => ({
          ok: false,
          code: "upstream",
          error: "Couldn't transcribe your recording. Try again.",
        })}
      />
    )
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Start dictation" }))
    })
    if (!denied)
      await act(async () => {
        fireEvent.click(view.getByRole("button", { name: "Stop dictation" }))
      })
    assert.equal(
      (view.getByRole("textbox") as HTMLTextAreaElement).value,
      "Existing draft"
    )
    assert.equal(
      view.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
      false
    )
    view.unmount()
  }
})
