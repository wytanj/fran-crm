<script setup lang="ts">
const props = defineProps<{
  points: Array<{
    label: string
    value: number
  }>
}>()

const width = 640
const height = 220
const padding = {
  top: 18,
  right: 18,
  bottom: 34,
  left: 42
}

const maxValue = computed(() => Math.max(1, ...props.points.map((point) => point.value)))
const plotWidth = computed(() => width - padding.left - padding.right)
const plotHeight = computed(() => height - padding.top - padding.bottom)

const coordinates = computed(() => props.points.map((point, index) => {
  const x = padding.left + (props.points.length <= 1 ? plotWidth.value / 2 : (index / (props.points.length - 1)) * plotWidth.value)
  const y = padding.top + plotHeight.value - ((point.value / maxValue.value) * plotHeight.value)

  return {
    ...point,
    x,
    y
  }
}))

const linePath = computed(() => coordinates.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
  .join(' '))

const areaPath = computed(() => {
  const points = coordinates.value

  if (!points.length) {
    return ''
  }

  const baseline = padding.top + plotHeight.value
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const first = points[0]
  const last = points[points.length - 1]

  if (!first || !last) {
    return ''
  }

  return `${line} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} L ${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`
})

const labelStride = computed(() => Math.max(1, Math.ceil(props.points.length / 6)))
const xLabels = computed(() => coordinates.value.filter((_, index) => index % labelStride.value === 0 || index === coordinates.value.length - 1))
const yTicks = computed(() => [0, 0.5, 1].map((ratio) => {
  const value = Math.round(maxValue.value * ratio)
  const y = padding.top + plotHeight.value - (ratio * plotHeight.value)

  return { value, y }
}))
</script>

<template>
  <div class="chart-frame">
    <svg class="native-chart" :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="Signup trend">
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
        <text v-for="label in xLabels" :key="label.label" :x="label.x" :y="height - 10" text-anchor="middle">
          {{ label.label }}
        </text>
      </g>
      <path v-if="areaPath" class="chart-area" :d="areaPath" />
      <path v-if="linePath" class="chart-line" :d="linePath" />
      <g v-if="coordinates.length <= 40" class="chart-points">
        <circle v-for="point in coordinates" :key="point.label" :cx="point.x" :cy="point.y" r="3.5">
          <title>{{ point.label }}: {{ point.value }}</title>
        </circle>
      </g>
    </svg>
  </div>
</template>
