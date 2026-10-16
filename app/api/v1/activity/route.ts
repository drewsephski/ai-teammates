import { apiRoute } from "@/lib/api"
import { getActivity } from "@/services/activity"

// Requests waiting for a decision, routines, and the recent unattended work
export const GET = apiRoute(async ({ userId }) => getActivity(userId))
