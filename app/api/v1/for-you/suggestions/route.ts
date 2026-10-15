import { apiRoute } from "@/lib/api"
import { getForYouSuggestion } from "@/services/for-you"

// Scans connected apps for one suggestion. It runs a model and spends the AI
// allowance, so it is a POST that may take up to a minute.
export const POST = apiRoute(async (caller) => getForYouSuggestion(caller))
