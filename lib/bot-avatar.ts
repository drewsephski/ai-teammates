import type { CharacterShape } from "@/components/landing/bot/character-geometry"

export const botShapes = [
  "blob",
  "pebble",
  "bean",
  "egg",
  "squircle",
  "tablet",
  "capsule",
  "cylinder",
  "hex",
  "gem",
  "crystal",
  "wedge",
  "shield",
  "dome",
  "arch",
  "cloud",
  "teardrop",
  "leaf",
] as const satisfies readonly CharacterShape[]
export const botColors = [
  "#ff2849",
  "#208bff",
  "#9455ff",
  "#ff8a19",
  "#d9f38b",
  "#b5a7fc",
  "#fafafa",
  "#a5a5a5",
] as const

// Generated only by server actions or explicit shuffle events, never during render.
export function createBotAvatar() {
  return `blob:${botShapes[Math.floor(Math.random() * botShapes.length)]}:${Math.floor(Math.random() * botColors.length)}`
}

export function parseBotAvatar(value: string) {
  if (value.split(":").length !== 3) return null
  const [prefix, shape, color] = value.split(":")
  if (
    prefix !== "blob" ||
    !botShapes.includes(shape as (typeof botShapes)[number]) ||
    !/^\d+$/.test(color ?? "")
  )
    return null
  const index = Number(color)
  if (index < 0 || index >= botColors.length) return null
  return { shape: shape as CharacterShape, color: botColors[index] }
}
