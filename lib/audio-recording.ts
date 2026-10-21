import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
} from "@/lib/transcription-policy"

export type AudioRecording = { stop: () => Promise<Blob>; cancel: () => void }

// PCM WAV avoids Chromium's WebM recordings with missing duration metadata,
// and gives the server a duration it can verify before spending credits.
export function encodeDictationWav(samples: Float32Array, sampleRate = 16_000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index))
  }
  write(0, "RIFF")
  view.setUint32(4, buffer.byteLength - 8, true)
  write(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(
      44 + index * 2,
      Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)),
      true
    )
  }
  return new Blob([buffer], { type: "audio/wav" })
}

export async function startAudioRecording(): Promise<AudioRecording> {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined" ||
    typeof AudioContext === "undefined"
  )
    throw new Error(
      "Dictation needs a supported browser and a secure HTTPS connection."
    )
  const context = new AudioContext()
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
  } catch (error) {
    await context.close()
    if (error instanceof DOMException && error.name === "NotAllowedError")
      throw new Error(
        "Allow microphone access in your browser to use dictation."
      )
    throw new Error(
      "Couldn't access your microphone. Check that it's connected and try again."
    )
  }
  let recorder: MediaRecorder
  try {
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ].find((type) => MediaRecorder.isTypeSupported(type))
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 64_000,
    })
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    await context.close()
    throw new Error(
      "Your browser couldn't start recording. Try another browser."
    )
  }
  const chunks: Blob[] = []
  let bytes = 0
  let cancelled = false
  let failed = false
  const releaseMicrophone = () =>
    stream.getTracks().forEach((track) => track.stop())
  const stopped = new Promise<void>((resolve) => {
    recorder.ondataavailable = ({ data }) => {
      bytes += data.size
      if (bytes > MAX_AUDIO_BYTES) {
        failed = true
        if (recorder.state !== "inactive") recorder.stop()
      } else chunks.push(data)
    }
    recorder.onerror = () => {
      failed = true
      if (recorder.state !== "inactive") recorder.stop()
      else resolve()
      releaseMicrophone()
    }
    recorder.onstop = () => {
      clearTimeout(timer)
      releaseMicrophone()
      resolve()
    }
  })
  try {
    recorder.start(1000)
  } catch {
    releaseMicrophone()
    await context.close()
    throw new Error("Your browser couldn't start recording. Try again.")
  }
  // A second bound protects the microphone even if the component's timer stalls.
  const timer = setTimeout(() => {
    if (recorder.state !== "inactive") recorder.stop()
  }, MAX_RECORDING_SECONDS * 1000)
  return {
    cancel() {
      cancelled = true
      clearTimeout(timer)
      if (recorder.state !== "inactive") recorder.stop()
      releaseMicrophone()
      if (context.state !== "closed") void context.close()
    },
    async stop() {
      if (recorder.state !== "inactive") recorder.stop()
      releaseMicrophone()
      await stopped
      try {
        if (cancelled || failed || !bytes)
          throw new Error("Couldn't save your recording. Try again.")
        const decoded = await context.decodeAudioData(
          await new Blob(chunks).arrayBuffer()
        )
        if (decoded.duration > MAX_RECORDING_SECONDS + 1)
          throw new Error("Record for up to two minutes at a time.")
        const frames = Math.min(
          Math.ceil(decoded.duration * 16_000),
          MAX_RECORDING_SECONDS * 16_000
        )
        const offline = new OfflineAudioContext(1, frames, 16_000)
        const source = offline.createBufferSource()
        source.buffer = decoded
        source.connect(offline.destination)
        source.start()
        const audio = await offline.startRendering()
        return encodeDictationWav(audio.getChannelData(0))
      } finally {
        if (context.state !== "closed") await context.close()
      }
    },
  }
}
