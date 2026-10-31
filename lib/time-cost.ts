// What repetitive tasks cost in time and money, for the public time cost
// calculator (/time-cost-calculator). Pure so the page and its test share it.

export type RepeatedTask = {
  name: string
  /** Minutes one run of the task takes. */
  minutes: number
  /** How many times a week it happens. */
  perWeek: number
}

export type TimeCost = {
  weeklyMinutes: number
  weeklyHours: number
  yearlyHours: number
  /** Eight-hour workdays the tasks take each year. */
  yearlyWorkdays: number
  yearlyCost: number
  monthlyCost: number
}

/** Working weeks in a year, allowing for holidays and time off. */
export const WORK_WEEKS_PER_YEAR = 48

export const TIME_COST_LIMITS = {
  minutes: 600,
  perWeek: 100,
  hourlyRate: 2000,
  tasks: 12,
} as const

/** Clamp a typed number into [0, max], treating blanks and junk as 0. */
export function clampInput(value: number, max: number) {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(value, max)
}

const round = (value: number, places: number) => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function timeCost(
  tasks: readonly RepeatedTask[],
  hourlyRate: number,
  weeksPerYear = WORK_WEEKS_PER_YEAR
): TimeCost {
  const rate = clampInput(hourlyRate, TIME_COST_LIMITS.hourlyRate)
  const weeklyMinutes = tasks
    .slice(0, TIME_COST_LIMITS.tasks)
    .reduce(
      (total, task) =>
        total +
        clampInput(task.minutes, TIME_COST_LIMITS.minutes) *
          clampInput(task.perWeek, TIME_COST_LIMITS.perWeek),
      0
    )
  const yearlyHours = (weeklyMinutes / 60) * weeksPerYear
  const yearlyCost = yearlyHours * rate
  return {
    weeklyMinutes: round(weeklyMinutes, 1),
    weeklyHours: round(weeklyMinutes / 60, 1),
    yearlyHours: round(yearlyHours, 1),
    yearlyWorkdays: round(yearlyHours / 8, 1),
    yearlyCost: Math.round(yearlyCost),
    monthlyCost: Math.round(yearlyCost / 12),
  }
}

/** Examples the calculator starts with; the person edits or replaces them. */
export const exampleTasks: readonly RepeatedTask[] = [
  { name: "Sorting email and drafting replies", minutes: 30, perWeek: 5 },
  { name: "Morning prep for meetings", minutes: 15, perWeek: 5 },
  { name: "Filing receipts in a spreadsheet", minutes: 20, perWeek: 1 },
]
