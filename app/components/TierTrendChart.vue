<script setup lang="ts">
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
const tierColors: Record<FranMemberTier, string> = {
  Bronze: '#a66a2d',
  Silver: '#7d8885',
  Gold: '#d19a24'
}
const tiers: FranMemberTier[] = ['Bronze', 'Silver', 'Gold']

const plotWidth = computed(() => width - padding.left - padding.right)
const plotHeight = computed(() => height - padding.top - padding.bottom)
const maxTotal = computed(() => Math.max(1, ...props.points.map((point) => point.total)))
const barWidth = computed(() => {
  if (!props.points.length) {
    return 18
  }

  return Math.max(18, Math.min(54, plotWidth.value / props.points.length - 12))
})

const bars = computed(() => props.points.map((point, index) => {
  const slot = props.points.length <= 1 ? plotWidth.value / 2 : (index / (props.points.length - 1)) * plotWidth.value
  const x = padding.left + slot - (barWidth.value / 2)
  let yCursor = padding.top + plotHeight.value
  const segments = tiers.map((tier) => {
    const rawValue = tier === 'Bronze' ? point.bronze : tier === 'Silver' ? point.silver : point.gold
    const segmentHeight = (rawValue / maxTotal.value) * plotHeight.value
    yCursor -= segmentHeight

    return {
      tier,
      value: rawValue,
      x,
      y: yCursor,
      width: barWidth.value,
      height: segmentHeight,
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
const yTicks = computed(() => [0, 0.5, 1].map((ratio) => {
  const value = Math.round(maxTotal.value * ratio)
  const y = padding.top + plotHeight.value - (ratio * plotHeight.value)

  return { value, y }
}))
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
            rx="3"
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
