import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { encodeDictationWav } from "../lib/audio-recording"
import { readTranscriptionAudio } from "../lib/transcription-audio"
import { transcribeRecording } from "../lib/transcription"
import { readAudioUpload } from "../lib/transcription-upload"
import { apiErrorResponse } from "../lib/api-response"
import {
  insertDictation,
  MAX_AUDIO_BYTES,
  TRANSCRIPTION_MODEL,
} from "../lib/transcription-policy"

const audio = () => encodeDictationWav(new Float32Array(16_000))
function harness({
  remaining = 1_000,
  response = { text: " Hello there. ", usage: { cost: 0.000067 } },
  status = 200,
  fail = false,
}: {
  remaining?: number
  response?: unknown
  status?: number
  fail?: boolean
} = {}) {
  const holds: number[] = [],
    recorded: number[] = [],
    reports: Error[] = []
  let calls = 0
  const steps = {
    apiKey: "test-key",
    fetch: (async (url, init) => {
      calls++
      assert.equal(url, "https://openrouter.ai/api/v1/audio/transcriptions")
      const body = JSON.parse(init!.body as string)
      assert.equal(body.model, TRANSCRIPTION_MODEL)
      assert.equal(body.input_audio.format, "wav")
      assert.equal(
        Buffer.from(body.input_audio.data, "base64").toString("ascii", 0, 4),
        "RIFF"
      )
      assert.deepEqual(
        holds,
        [67],
        "spend is reserved before calling the provider"
      )
      if (fail) throw new Error("sensitive upstream failure")
      return Response.json(response, { status })
    }) as typeof fetch,
    remaining: async () => remaining,
    hold: async (amount: number) => {
      holds.push(amount)
    },
    record: async (amount: number) => {
      recorded.push(amount)
    },
    report: (error: Error) => {
      reports.push(error)
    },
  }
  return { steps, holds, recorded, reports, calls: () => calls }
}

test("actual audio validation accepts WAV, bounds duration and rejects disguised or oversized uploads", async () => {
  const parsed = await readTranscriptionAudio(audio())
  assert.equal(parsed?.seconds, 1)
  assert.equal(parsed?.format, "wav")
  for (const invalid of [
    null,
    new Blob(),
    new Blob(["not audio"], { type: "audio/wav" }),
    new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]),
    encodeDictationWav(new Float32Array(121 * 16_000)),
  ])
    assert.equal(await readTranscriptionAudio(invalid), null)
})

test("native AAC/M4A recordings are accepted using the container's duration", async () => {
  const bytes = await readFile(
    new URL("./fixtures/audio/dictation.m4a", import.meta.url)
  )
  const parsed = await readTranscriptionAudio(
    new Blob([bytes], { type: "audio/mp4" })
  )
  assert.equal(parsed?.format, "m4a")
  assert.ok(parsed.seconds >= 1 && parsed.seconds < 1.2)
})

test("transcription reserves allowance and records provider cost once", async () => {
  const h = harness({
    response: { text: " Hello there. ", usage: { cost: 0.0000705 } },
  })
  assert.deepEqual(await transcribeRecording(audio(), h.steps), {
    ok: true,
    text: "Hello there.",
  })
  assert.deepEqual(h.recorded, [71])
  assert.equal(h.calls(), 1)
})

test("missing configuration, invalid audio and exhausted quota never reach the provider", async () => {
  const h = harness({ remaining: 0 })
  assert.equal(
    (await transcribeRecording(audio(), { ...h.steps, apiKey: undefined })).ok,
    false
  )
  assert.equal(
    (await transcribeRecording(new Blob(["bad"]), h.steps)).ok,
    false
  )
  assert.deepEqual(await transcribeRecording(audio(), h.steps), {
    ok: false,
    code: "usage_limit",
    error: "Usage limit reached",
  })
  assert.equal(h.calls(), 0)
  assert.deepEqual(h.holds, [])
})

test("provider rejections release the hold and expose no upstream content", async () => {
  const h = harness({
    status: 401,
    response: { error: { message: "sensitive provider body" } },
  })
  const result = await transcribeRecording(audio(), h.steps)
  assert.equal(result.ok, false)
  assert.deepEqual(h.recorded, [0])
  assert.equal(h.calls(), 1)
  assert.doesNotMatch(
    JSON.stringify(h.reports.map((e) => e.message)),
    /sensitive/
  )
})

test("timeouts and invalid successful responses retain uncertain spend and never retry", async () => {
  for (const h of [
    harness({ fail: true }),
    harness({ response: { unexpected: "response" } }),
  ]) {
    assert.equal((await transcribeRecording(audio(), h.steps)).ok, false)
    assert.deepEqual(h.recorded, [])
    assert.equal(h.calls(), 1)
    assert.equal(h.reports.length, 1)
    assert.doesNotMatch(h.reports[0].message, /sensitive/)
  }
})

test("empty speech returns an empty draft addition and cost falls back to measured duration", async () => {
  const h = harness({ response: { text: " " } })
  assert.deepEqual(await transcribeRecording(audio(), h.steps), {
    ok: true,
    text: "",
  })
  assert.deepEqual(h.recorded, [67])
})

test("dictation inserts into the current draft with natural spacing and preserves punctuation", () => {
  assert.deepEqual(insertDictation("", " Hello ", 0), {
    text: "Hello",
    position: 5,
  })
  assert.deepEqual(insertDictation("Ask @Alex about ", "pricing", 16), {
    text: "Ask @Alex about pricing",
    position: 23,
  })
  assert.deepEqual(insertDictation("Hello world", "beautiful", 6), {
    text: "Hello beautiful world",
    position: 16,
  })
  assert.deepEqual(insertDictation("Hello.", "there", 5), {
    text: "Hello there.",
    position: 11,
  })
  assert.deepEqual(insertDictation("draft", " ", 3), {
    text: "draft",
    position: 3,
  })
})

test("native upload reads raw audio and maps bounded input failures to API errors", async () => {
  const upload = await readAudioUpload(
    new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: audio(),
    })
  )
  assert.equal((await readTranscriptionAudio(upload))?.seconds, 1)
  for (const [headers, body, status] of [
    [{ "content-type": "application/json" }, "{}", 415],
    [
      {
        "content-type": "audio/mp4",
        "content-length": String(MAX_AUDIO_BYTES + 1),
      },
      "small",
      413,
    ],
    [{ "content-type": "audio/wav" }, new Uint8Array(MAX_AUDIO_BYTES + 1), 413],
  ] as const) {
    await assert.rejects(
      () =>
        readAudioUpload(
          new Request("https://example.test", { method: "POST", headers, body })
        ),
      (error) => apiErrorResponse(error).status === status
    )
  }
})
