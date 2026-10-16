"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import type { RoutineInsert, RoutineUpdate } from "@/db/schema"
import {
  PAID_ROUTINE_LIMIT_ERROR,
  ROUTINE_LIMIT_ERROR,
} from "@/lib/routine-policy"
import * as service from "@/services/routines"

async function signedIn() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return userId
}

// Plan limits come back as data, so the form can explain them
export async function createRoutine(input: RoutineInsert) {
  try {
    const routine = await service.createRoutine(await signedIn(), input)
    revalidatePath("/activity")
    return { ok: true as const, routine }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (
      message === ROUTINE_LIMIT_ERROR ||
      message === PAID_ROUTINE_LIMIT_ERROR ||
      message === "Pick a time in the future."
    )
      return { ok: false as const, message }
    throw error
  }
}

export async function updateRoutine(routineId: string, input: RoutineUpdate) {
  const routine = await service.updateRoutine(
    await signedIn(),
    routineId,
    input
  )
  revalidatePath("/activity")
  return routine
}

export async function deleteRoutine(routineId: string) {
  await service.deleteRoutine(await signedIn(), routineId)
  revalidatePath("/activity")
}

export async function runRoutineNow(routineId: string) {
  const result = await service.runRoutineNow(await signedIn(), routineId)
  revalidatePath("/activity")
  return result
}
