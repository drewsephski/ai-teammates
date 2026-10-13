export const DEFAULT_SIDEBAR_WIDTH = 256
export const MIN_SIDEBAR_WIDTH = 208
export const MAX_SIDEBAR_WIDTH = 360

export function clampSidebarWidth(value: number, viewport = Infinity) {
  const maximum = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(
      MAX_SIDEBAR_WIDTH,
      Number.isFinite(viewport) ? viewport - 480 : MAX_SIDEBAR_WIDTH
    )
  )
  return Math.round(
    Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(maximum, Number.isFinite(value) ? value : DEFAULT_SIDEBAR_WIDTH)
    )
  )
}

export function readSidebarWidth(value?: string) {
  return value && /^\d+$/.test(value)
    ? clampSidebarWidth(Number(value))
    : DEFAULT_SIDEBAR_WIDTH
}
