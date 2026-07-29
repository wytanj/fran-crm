export type ChartTick = {
  value: number
  y: number
}

/**
 * Build y-axis ticks for the native charts.
 *
 * Ticks are rounded to whole units because every series here is a count, so on
 * small ranges the midpoint collapses onto a neighbour (max 1 renders 0, 1, 1).
 * Duplicate values are dropped rather than drawn twice at different heights.
 */
export function buildYTicks(maxValue: number, paddingTop: number, plotHeight: number): ChartTick[] {
  const ratios = maxValue < 4 ? [0, 1] : [0, 0.5, 1]
  const ticks: ChartTick[] = []

  for (const ratio of ratios) {
    const value = Math.round(maxValue * ratio)

    if (ticks.some((tick) => tick.value === value)) {
      continue
    }

    ticks.push({
      value,
      y: paddingTop + plotHeight - (ratio * plotHeight)
    })
  }

  return ticks
}
