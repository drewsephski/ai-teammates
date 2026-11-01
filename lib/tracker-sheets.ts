import { z } from "zod"
import { classifyEnvelope, classifyThrown } from "./connector-failure-policy"
import type { AppAccount, ConnectorRuntime } from "./connector-tools"
import {
  columnLetter,
  MAX_TRACKER_ROWS,
  quoteSheet,
  rangeOrigin,
} from "./tracker-review"

export const TRACKER_READ_SLUG = "GOOGLESHEETS_BATCH_GET"
export const TRACKER_INFO_SLUG = "GOOGLESHEETS_GET_SPREADSHEET_INFO"
export const TRACKER_PROOF_KEY = "__kraftyTrackerWrite"
export const trackerWriteSlugs = new Set([
  "GOOGLESHEETS_VALUES_UPDATE",
  "GOOGLESHEETS_UPDATE_VALUES_BATCH",
])
const scalar = z.union([z.string(), z.number().finite(), z.boolean()])
const cell = z.object({ address: z.string(), value: scalar })
const proofSchema = z.object({
  spreadsheetId: z.string(),
  sheet: z.string(),
  sheetId: z.number().int().nonnegative(),
  expected: z.array(cell).min(1).max(2_000),
  changes: z.array(cell).min(1).max(100),
})
export type TrackerWriteProof = z.infer<typeof proofSchema>
export type TrackerSnapshot = {
  spreadsheetId: string
  sheet: string
  sheetId: number
  range: string
  values: unknown[][]
  headerRow: number
  taskColumn: string
  writableColumns: string[]
}

type Execute = (
  slug: string,
  input: Record<string, unknown>
) => Promise<unknown>

// Keep provider failures intact so the connector's reconnect handling applies.
export class TrackerReadError extends Error {
  constructor(readonly result: unknown) {
    super("Tracker read failed")
  }
}
export function completedData(result: unknown): Record<string, unknown> {
  const envelope = z
    .object({
      resultType: z.literal("completed"),
      error: z.unknown().optional(),
      data: z.record(z.string(), z.unknown()),
    })
    .safeParse(result)
  if (
    !envelope.success ||
    envelope.data.error ||
    envelope.data.data.successful === false
  )
    throw new TrackerReadError(result)
  return envelope.data.data
}

export async function trackerTab(
  execute: Execute,
  spreadsheetId: string,
  sheet?: string
) {
  const data = completedData(
    await execute(TRACKER_INFO_SLUG, {
      spreadsheet_id: spreadsheetId,
      fields:
        "spreadsheetId,sheets.properties(sheetId,title,index,gridProperties)",
    })
  )
  const parsed = z
    .object({
      spreadsheetId: z.literal(spreadsheetId),
      sheets: z
        .array(
          z.object({
            properties: z.object({
              sheetId: z.number().int().nonnegative(),
              title: z.string().min(1),
              index: z.number().int().nonnegative(),
              gridProperties: z.object({
                rowCount: z.number().int().positive(),
                columnCount: z.number().int().min(1).max(18_278),
              }),
            }),
          })
        )
        .min(1),
    })
    .parse(data)
  const candidates = parsed.sheets.filter(({ properties: p }) =>
    sheet === undefined ? p.index === 0 : p.title === sheet
  )
  if (candidates.length !== 1)
    throw new Error("The intended tracker tab could not be resolved")
  return candidates[0].properties
}

export async function readTrackerSheet(
  execute: Execute,
  spreadsheetId: string,
  sheet?: string
) {
  const tab = await trackerTab(execute, spreadsheetId, sheet)
  const range = `${quoteSheet(tab.title)}!A1:${columnLetter(tab.gridProperties.columnCount - 1)}${Math.min(tab.gridProperties.rowCount, MAX_TRACKER_ROWS + 1)}`
  const values = await readTrackerRanges(execute, spreadsheetId, [range])
  return {
    spreadsheetId,
    sheet: tab.title,
    sheetId: tab.sheetId,
    range,
    values: values[0],
  }
}

export async function readTrackerRanges(
  execute: Execute,
  spreadsheetId: string,
  ranges: string[]
) {
  const data = completedData(
    await execute(TRACKER_READ_SLUG, {
      spreadsheet_id: spreadsheetId,
      ranges,
      majorDimension: "ROWS",
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    })
  )
  if (data.spreadsheetId !== spreadsheetId)
    throw new Error("Spreadsheet identity was not confirmed")
  const valueRanges = data.valueRanges ?? data.value_ranges
  if (!Array.isArray(valueRanges) || valueRanges.length !== ranges.length)
    throw new Error("Incomplete tracker read")
  return valueRanges.map((value, i) => {
    const entry = z
      .object({
        range: z.string(),
        majorDimension: z.literal("ROWS").optional(),
        values: z.array(z.array(scalar.nullable())).optional(),
      })
      .parse(value)
    const actualEnd = rangeOrigin(
      entry.range.split(":").at(-1)?.split("!").at(-1)
    )
    const expectedEnd = rangeOrigin(
      ranges[i].split(":").at(-1)?.split("!").at(-1)
    )
    if (
      actualEnd.column !== expectedEnd.column ||
      actualEnd.row !== expectedEnd.row
    )
      throw new Error("Incomplete tracker range")
    const actual = rangeOrigin(entry.range)
    const expected = rangeOrigin(ranges[i])
    if (
      actual.sheet !== expected.sheet ||
      actual.column !== expected.column ||
      actual.row !== expected.row
    )
      throw new Error("Tracker range identity changed")
    return entry.values ?? []
  })
}

const blank = (value: unknown): string | number | boolean =>
  value === null || value === undefined ? "" : scalar.parse(value)

// Only exact, non-overlapping cell edits from a fresh, unambiguous review.
// RAW keeps read-back comparisons independent of locale or formula evaluation.
export function prepareTrackerWrite(
  slug: string,
  input: Record<string, unknown>,
  snapshot?: TrackerSnapshot
): TrackerWriteProof {
  if (!snapshot || input.spreadsheet_id !== snapshot.spreadsheetId)
    throw new Error(
      "Review this spreadsheet with reviewTracker before preparing an edit"
    )
  const batch = slug === "GOOGLESHEETS_UPDATE_VALUES_BATCH"
  if ((batch ? input.valueInputOption : input.value_input_option) !== "RAW")
    throw new Error(
      "Use RAW values (ISO dates) so the exact edit can be verified"
    )
  const ranges = z
    .array(
      z.object({
        range: z.string(),
        values: z.array(z.array(scalar)).min(1),
        majorDimension: z.literal("ROWS").optional(),
      })
    )
    .min(1)
    .parse(
      batch ? input.data : [{ ...input, majorDimension: input.major_dimension }]
    )
  const changes: TrackerWriteProof["changes"] = []
  const rows = new Set<number>()
  for (const range of ranges) {
    // Reject unqualified ranges, open ranges, null skips and size expansion.
    if (
      !/^(?:'(?:[^']|'')+'|[^'!]+)!\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?$/.test(
        range.range
      )
    )
      throw new Error("Use exact sheet-qualified cell addresses")
    const start = rangeOrigin(range.range)
    const end = rangeOrigin(
      range.range.includes(":")
        ? range.range.split(":").at(-1)
        : range.range.slice(range.range.lastIndexOf("!") + 1)
    )
    const width = end.column - start.column + 1
    if (
      start.sheet !== snapshot.sheet ||
      start.row <= snapshot.headerRow ||
      end.row > snapshot.values.length ||
      range.values.length !== end.row - start.row + 1 ||
      width < 1 ||
      range.values.some((r) => r.length !== width)
    )
      throw new Error("The edit does not match the reviewed data cells")
    range.values.forEach((row, r) =>
      row.forEach((value, c) => {
        const column = columnLetter(start.column + c)
        const rowNumber = start.row + r
        if (!snapshot.writableColumns.includes(column))
          throw new Error("This column mapping is not confirmed")
        const address = `${quoteSheet(snapshot.sheet)}!${column}${rowNumber}`
        if (changes.some((change) => change.address === address))
          throw new Error("Overlapping edits are unsafe")
        if (blank(snapshot.values[rowNumber - 1]?.[start.column + c]) === value)
          throw new Error(
            "The edit includes an unchanged cell; send only cells that change"
          )
        rows.add(rowNumber)
        changes.push({ address, value })
      })
    )
  }
  const expected: TrackerWriteProof["expected"] = []
  for (const rowNumber of [snapshot.headerRow, ...rows]) {
    const row = snapshot.values[rowNumber - 1] ?? []
    if (rowNumber !== snapshot.headerRow) {
      const taskIndex = rangeOrigin(`${snapshot.taskColumn}1`).column
      const task = row[taskIndex]
      if (
        typeof task !== "string" ||
        !task.trim() ||
        snapshot.values.filter(
          (r, i) => i >= snapshot.headerRow && r[taskIndex] === task
        ).length !== 1
      )
        throw new Error("The target task identity is blank or duplicated")
    }
    const width = Math.max(
      snapshot.values[snapshot.headerRow - 1]?.length ?? 0,
      row.length
    )
    for (let c = 0; c < width; c++)
      expected.push({
        address: `${quoteSheet(snapshot.sheet)}!${columnLetter(c)}${rowNumber}`,
        value: blank(row[c]),
      })
  }
  return proofSchema.parse({
    spreadsheetId: snapshot.spreadsheetId,
    sheet: snapshot.sheet,
    sheetId: snapshot.sheetId,
    expected,
    changes,
  })
}

function confirmedWriteTargets(
  data: Record<string, unknown>,
  proof: TrackerWriteProof
) {
  const responses = z
    .array(
      z.object({
        updatedRange: z.string(),
        updatedCells: z.number().int().positive(),
      })
    )
    .safeParse(data.responses ?? [data])
  if (!responses.success) return false
  const actual = new Set<string>()
  let count = 0
  for (const response of responses.data) {
    const start = rangeOrigin(response.updatedRange)
    const end = rangeOrigin(
      response.updatedRange.split(":").at(-1)?.split("!").at(-1)
    )
    if (
      start.sheet !== proof.sheet ||
      end.row < start.row ||
      end.column < start.column ||
      response.updatedCells > 100
    )
      return false
    const size = (end.row - start.row + 1) * (end.column - start.column + 1)
    if (size !== response.updatedCells) return false
    count += size
    for (let row = start.row; row <= end.row; row++)
      for (let col = start.column; col <= end.column; col++)
        actual.add(`${quoteSheet(proof.sheet)}!${columnLetter(col)}${row}`)
  }
  return (
    count === proof.changes.length &&
    actual.size === count &&
    proof.changes.every((cell) => actual.has(cell.address))
  )
}

export async function executeTrackerWrite(
  userId: string,
  runtime: Pick<ConnectorRuntime, "execute" | "withTrackerWriteLock">,
  slug: string,
  storedInput: Record<string, unknown>,
  account: AppAccount,
  signal?: AbortSignal
): Promise<unknown> {
  const parsed = proofSchema.safeParse(storedInput[TRACKER_PROOF_KEY])
  if (!parsed.success)
    return {
      resultType: "failed",
      code: "TRACKER_REVIEW_REQUIRED",
      error:
        "This approval has no verified tracker preconditions. Nothing ran. Review the sheet and request a new approval.",
    }
  const proof = parsed.data
  // Serialize Krafty writers across bots, sessions and connected accounts.
  // Google's API has no compare-and-swap for values; human edits can still race.
  if (runtime.withTrackerWriteLock)
    return runtime.withTrackerWriteLock(proof.spreadsheetId, (assertHeld) =>
      runTrackerWrite(
        userId,
        runtime,
        slug,
        storedInput,
        account,
        proof,
        signal,
        assertHeld
      )
    )
  return runTrackerWrite(
    userId,
    runtime,
    slug,
    storedInput,
    account,
    proof,
    signal,
    () => {}
  )
}

async function runTrackerWrite(
  userId: string,
  runtime: Pick<ConnectorRuntime, "execute">,
  slug: string,
  storedInput: Record<string, unknown>,
  account: AppAccount,
  proof: TrackerWriteProof,
  signal: AbortSignal | undefined,
  assertHeld: () => void
): Promise<unknown> {
  const { [TRACKER_PROOF_KEY]: _proof, ...input } = storedInput
  void _proof
  if (input.spreadsheet_id !== proof.spreadsheetId)
    throw new Error("Tracker write identity mismatch")
  const execute: Execute = (tool, args) =>
    runtime.execute(userId, tool, args, account, signal)
  const unchangedTab = async () => {
    const tab = await trackerTab(execute, proof.spreadsheetId, proof.sheet)
    if (tab.sheetId !== proof.sheetId)
      throw new Error("The tracker tab was replaced")
  }
  const check = async (after: boolean) => {
    await unchangedTab()
    const ranges = proof.expected.map((c) => c.address)
    const values = await readTrackerRanges(execute, proof.spreadsheetId, ranges)
    if (
      proof.expected.some(
        (cell, i) =>
          blank(values[i][0]?.[0]) !==
          (after
            ? (proof.changes.find((c) => c.address === cell.address)?.value ??
              cell.value)
            : cell.value)
      )
    )
      throw new Error(
        after
          ? "The tracker edit could not be verified"
          : "The tracker changed since review"
      )
  }
  try {
    await check(false)
  } catch (error) {
    if (
      error instanceof TrackerReadError &&
      ["connection_expired", "insufficient_permissions"].includes(
        classifyEnvelope(error.result as Record<string, unknown>)
      )
    )
      return error.result
    if (
      ["connection_expired", "insufficient_permissions"].includes(
        classifyThrown(error)
      )
    )
      throw error
    return {
      resultType: "failed",
      code: "TRACKER_CHANGED",
      error:
        "The spreadsheet, tab, headers, task identity or expected values could not be confirmed immediately before updating. Nothing ran. Review again and request a new approval.",
    }
  }
  signal?.throwIfAborted()
  assertHeld()
  let result: unknown
  try {
    // Exactly one attempt, even when the provider times out after committing.
    result = await execute(slug, input)
    completedData(result)
  } catch (error) {
    if (
      error instanceof TrackerReadError &&
      ["connection_expired", "insufficient_permissions"].includes(
        classifyEnvelope(error.result as Record<string, unknown>)
      )
    )
      return error.result
    if (
      ["connection_expired", "insufficient_permissions"].includes(
        classifyThrown(error)
      )
    )
      throw error
    let readBackConfirmed = false
    try {
      await check(true)
      readBackConfirmed = true
    } catch {
      /* Unconfirmed, never retry. */
    }
    return {
      resultType: "failed",
      code: "OUTCOME_UNKNOWN",
      verification: readBackConfirmed
        ? "read_back_matches_after_unknown"
        : "unconfirmed",
      error:
        "Tracker write outcome unconfirmed. It may have run. Read the sheet and ask the owner before trying again; never retry automatically.",
    }
  }
  try {
    const data = completedData(result)
    assertHeld()
    const targetsConfirmed =
      data.spreadsheetId === proof.spreadsheetId &&
      confirmedWriteTargets(data, proof)
    await check(true)
    if (!targetsConfirmed) throw new Error("Write target unconfirmed")
    return {
      ...(result as Record<string, unknown>),
      verification: "read_back_confirmed",
    }
  } catch {
    return {
      resultType: "failed",
      code: "OUTCOME_UNKNOWN",
      error:
        "The tracker write ran once but its result could not be verified. Do not retry automatically. Read the sheet and ask the owner to resolve it.",
    }
  }
}
