import { apiRoute } from "@/lib/api"
import { publicPreset } from "@/lib/api-shapes"
import { botPresets } from "@/lib/bot-presets"

// The starting roles POST /bots accepts as presetId
export const GET = apiRoute(async () => ({
  presets: botPresets.map(publicPreset),
}))
