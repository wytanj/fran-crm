<script setup lang="ts">
import { buildYTicks } from '~/utils/chart-ticks'
import type { FranMemberTier, FranTierTrendPoint } from '~/types/crm'

const props = defineProps<{
  points: FranTierTrendPoint[]
}>()

const width = 700
const height = 260
const padding = {
  top: 18,
  right: 20,
  bottom: 42,
  left: 42
}
// Tiers are ranked, so they get an ordinal ramp (one hue, light to dark) rather
// than three metallic hues. Validated with the dataviz palette checker.
const tierColors: Record<FranMemberTier, string> = {
  Bronze: '#c4a070',
  Silver: '#8b7355',
  Gold: '#5c4030'
}
const tiers: FranMemberTier[] = ['Bronze', 'Silver', 'Gold']
const segmentGap = 2

const plotWidth = computed(() => width - padding.left - padding.right)
const plotHeight = computed(() => height - padding.top - padding.bottom)
const maxTotal = computed(() => Math.max(1, ...props.points.map((point) => point.total)))
// Bars sit in evenly divided bands rather than on line-chart point positions, so
// the first and last bar stay inside the plot area instead of overhanging it.
const bandWidth = computed(() => props.points.length ? plotWidth.value / props.points.length : plotWidth.value)
const barWidth = computed(() => {
  if (!props.points.length) {
    return 18
  }

  return Math.max(14, Math.min(54, bandWidth.value - 12))
})

const bars = computed(() => props.points.map((point, index) => {
  const slot = bandWidth.value * (index + 0.5)
  const x = padding.left + slot - (barWidth.value / 2)
  let yCursor = padding.top + plotHeight.value
  const segments = tiers.map((tier, tierIndex) => {
    const rawValue = tier === 'Bronze' ? point.bronze : tier === 'Silver' ? point.silver : point.gold
    const segmentHeight = (rawValue / maxTotal.value) * plotHeight.value
    yCursor -= segmentHeight

    return {
      tier,
      value: rawValue,
      x,
      y: yCursor,
      width: barWidth.value,
      // Every segment above the baseline loses its last 2px so adjacent fills
      // stay separated by the surface instead of touching.
      height: tierIndex === 0 ? segmentHeight : Math.max(0, segmentHeight - segmentGap),
      color: tierColors[tier]
    }
  })

  return {
    ...point,
    x,
    labelX: x + barWidth.value / 2,
    segments
  }
}))

const labelStride = computed(() => Math.max(1, Math.ceil(props.points.length / 6)))
const xLabels = computed(() => bars.value.filter((_, index) => index % labelStride.value === 0 || index === bars.value.length - 1))
const yTicks = computed(() => buildYTicks(maxTotal.value, padding.top, plotHeight.value))
</script>

<template>
  <div class="chart-frame">
    <svg class="native-chart" :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="Tier trend">
      <g class="chart-grid">
        <line
          v-for="tick in yTicks"
          :key="tick.y"
          :x1="padding.left"
          :x2="width - padding.right"
          :y1="tick.y"
          :y2="tick.y"
        />
      </g>
      <g class="chart-axis">
        <text v-for="tick in yTicks" :key="tick.value" :x="padding.left - 10" :y="tick.y + 4" text-anchor="end">
          {{ tick.value }}
        </text>
        <text v-for="bar in xLabels" :key="bar.period" :x="bar.labelX" :y="height - 14" text-anchor="middle">
          {{ bar.period }}
        </text>
      </g>
      <g>
        <g v-for="bar in bars" :key="bar.period">
          <rect
            v-for="segment in bar.segments"
            :key="`${bar.period}-${segment.tier}`"
            :x="segment.x"
            :y="segment.y"
            :width="segment.width"
            :height="Math.max(0, segment.height)"
            :fill="segment.color"
            rx="2"
          >
            <title>{{ bar.period }} {{ segment.tier }}: {{ segment.value }}</title>
          </rect>
        </g>
      </g>
    </svg>
    <div class="chart-legend">
      <span v-for="tier in tiers" :key="tier">
        <i :style="{ background: tierColors[tier] }" />
        {{ tier }}
      </span>
    </div>
  </div>
</template>
