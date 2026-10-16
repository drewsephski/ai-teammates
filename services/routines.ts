import type { RoutineInsert, RoutineUpdate } from "@/db/schema"
import * as routines from "@/lib/routines"

// Routines are written once in lib/routines.ts, where the chat agent's
// scheduleRoutine tool uses them too. These are the person's entry points.

export function listRoutines(userId: string, botId?: string) {
  return routines.listRoutines(userId, botId)
}

export function createRoutine(userId: string, input: RoutineInsert) {
  return routines.createRoutine(userId, input)
}

export function updateRoutine(
  userId: string,
  routineId: string,
  input: RoutineUpdate
) {
  return routines.updateRoutine(userId, routineId, input)
}

export function deleteRoutine(userId: string, routineId: string) {
  return routines.deleteRoutine(userId, routineId)
}

export function runRoutineNow(userId: string, routineId: string) {
  return routines.runRoutineNow(userId, routineId)
}
