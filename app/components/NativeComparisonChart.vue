<script setup lang="ts">
type ComparisonPoint = {
  label: string
  value: number
}

type ComparisonSeries = {
  label: string
  color: string
  points: ComparisonPoint[]
}

const props = defineProps<{
  series: ComparisonSeries[]
  ariaLabel?: string
}>()

const width = 640
const height = 220
const padding = {
  top: 18,
  right: 18,
  bottom: 34,
  left: 52
}

const labels = computed(() => Array.from(new Set(props.series.flatMap((serie) => serie.points.map((point) => point.label)))).sort())
const valueBySeries = computed(() => props.series.map((serie) => ({
  ...serie,
  values: new Map(serie.points.map((point) => [point.label, point.value]))
})))
const maxValue = computed(() => Math.max(1, ...props.series.flatMap((serie) => serie.points.map((point) => point.value))))
const plotWidth = computed(() => width - padding.left - padding.right)
const plotHeight = computed(() => height - padding.top - padding.bottom)

const seriesCoordinates = computed(() => valueBySeries.value.map((serie) => {
  const coordinates = labels.value.map((label, index) => {
    const value = serie.values.get(label) || 0
    const x = padding.left + (labels.value.length <= 1 ? plotWidth.value / 2 : (index / (labels.value.length - 1)) * plotWidth.value)
    const y = padding.top + plotHeight.value - ((value / maxValue.value) * plotHeight.value)

    return { label, value, x, y }
  })

  return {
    label: serie.label,
    color: serie.color,
    coordinates,
    path: coordinates
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ')
  }
}))

const labelStride = computed(() => Math.max(1, Math.ceil(labels.value.length / 6)))
const xLabels = computed(() => labels.value
  .map((label, index) => {
    const x = padding.left + (labels.value.length <= 1 ? plotWidth.value / 2 : (index / (labels.value.length - 1)) * plotWidth.value)
    return { label, index, x }
  })
  .filter((label) => label.index % labelStride.value === 0 || label.index === labels.value.length - 1))
const yTicks = computed(() => [0, 0.5, 1].map((ratio) => {
  const value = Math.round(maxValue.value * ratio)
  const y = padding.top + plotHeight.value - (ratio * plotHeight.value)

  return { value, y }
}))
</script>

<template>
  <div class="chart-frame">
    <svg class="native-chart" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="ariaLabel || 'Comparison trend'">
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
      <g v-for="serie in seriesCoordinates" :key="serie.label">
        <path v-if="serie.path" class="chart-line comparison-line" :d="serie.path" :style="{ stroke: serie.color }" />
        <circle
          v-for="point in serie.coordinates"
          :key="`${serie.label}-${point.label}`"
          class="comparison-point"
          :cx="point.x"
          :cy="point.y"
          r="3"
          :fill="serie.color"
        >
          <title>{{ serie.label }} {{ point.label }}: {{ point.value }}</title>
        </circle>
      </g>
    </svg>
    <div class="chart-legend">
      <span v-for="serie in series" :key="serie.label">
        <i :style="{ background: serie.color }" />
        {{ serie.label }}
      </span>
    </div>
  </div>
</template>
