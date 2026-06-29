<script setup lang="ts">
import { BookOpen, Database, FileCode, Search, Wrench, Workflow } from '@lucide/vue'

const props = defineProps<{
  path: string
}>()

type TocLink = {
  id: string
  text: string
  children?: TocLink[]
}

type DocsPage = {
  title?: string
  description?: string
  kicker?: string
  html: string
  headings: Array<{ id: string, text: string }>
}

const markdownFiles = import.meta.glob('../../content/docs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>

const docsByPath: Record<string, string | undefined> = {
  '/docs': markdownFiles['../../content/docs/index.md'],
  '/docs/api': markdownFiles['../../content/docs/api.md'],
  '/docs/agents': markdownFiles['../../content/docs/agents.md'],
  '/docs/skills': markdownFiles['../../content/docs/skills.md'],
  '/docs/model': markdownFiles['../../content/docs/model.md']
}

const docsNav = [
  {
    title: 'Start here',
    items: [
      { label: 'Overview', to: '/docs', path: '/docs', description: 'Product principles and documentation map', icon: BookOpen },
      { label: 'API docs', to: '/docs/api', path: '/docs/api', description: 'Routes, payloads, and API behavior', icon: FileCode }
    ]
  },
  {
    title: 'Agent surface',
    items: [
      { label: 'Agent protocol', to: '/docs/agents', path: '/docs/agents', description: 'Workspace boundaries, proposals, approvals', icon: Workflow },
      { label: 'Agent skills', to: '/docs/skills', path: '/docs/skills', description: 'Capabilities agents can use safely', icon: Wrench },
      { label: 'Data model', to: '/docs/model', path: '/docs/model', description: 'Base records, fields, and extension rules', icon: Database }
    ]
  }
]

const searchTerm = ref('')

const navItems = docsNav.flatMap((section) => section.items)
const activeNav = computed(() => navItems.find((item) => item.path === props.path) || navItems[0])
const filteredNav = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()

  if (!query) {
    return docsNav
  }

  return docsNav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        `${item.label} ${item.description}`.toLowerCase().includes(query)
      )
    }))
    .filter((section) => section.items.length > 0)
})

const page = computed<DocsPage | null>(() => {
  const markdown = docsByPath[props.path]

  if (!markdown) {
    return null
  }

  return parseDocsMarkdown(markdown)
})

const headings = computed(() => page.value?.headings || [])

function parseDocsMarkdown(markdown: string): DocsPage {
  const { meta, body } = parseFrontmatter(markdown)
  const rendered = renderMarkdown(body)

  return {
    title: meta.title,
    description: meta.description,
    kicker: meta.kicker,
    html: rendered.html,
    headings: rendered.headings
  }
}

function parseFrontmatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const meta: Record<string, string> = {}

  if (!match) {
    return { meta, body: markdown }
  }

  for (const line of match[1]!.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()

    meta[key] = value.replace(/^["']|["']$/g, '')
  }

  return {
    meta,
    body: markdown.slice(match[0].length)
  }
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  const headings: Array<{ id: string, text: string }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || ''
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1]!.length
      const text = heading[2]!.trim()
      const id = slugify(text)
      headings.push({ id, text })
      html.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`)
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !(lines[index] || '').trim().startsWith('```')) {
        codeLines.push(lines[index] || '')
        index += 1
      }

      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : ''
      html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = []

      while (index < lines.length && (lines[index] || '').includes('|') && (lines[index] || '').trim()) {
        tableLines.push(lines[index] || '')
        index += 1
      }

      index -= 1
      html.push(renderTable(tableLines))
      continue
    }

    if (/^- /.test(trimmed)) {
      const items: string[] = []

      while (index < lines.length && /^- /.test((lines[index] || '').trim())) {
        items.push((lines[index] || '').trim().slice(2))
        index += 1
      }

      index -= 1
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\d+\. /.test(trimmed)) {
      const items: string[] = []

      while (index < lines.length && /^\d+\. /.test((lines[index] || '').trim())) {
        items.push((lines[index] || '').trim().replace(/^\d+\. /, ''))
        index += 1
      }

      index -= 1
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`)
      continue
    }

    const paragraphLines = [trimmed]

    while (
      index + 1 < lines.length
      && (lines[index + 1] || '').trim()
      && !isBlockStart(lines, index + 1)
    ) {
      index += 1
      paragraphLines.push((lines[index] || '').trim())
    }

    html.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`)
  }

  return {
    html: html.join('\n'),
    headings
  }
}

function isBlockStart(lines: string[], index: number) {
  const trimmed = (lines[index] || '').trim()

  return /^(#{2,4})\s+/.test(trimmed)
    || trimmed.startsWith('```')
    || /^- /.test(trimmed)
    || /^\d+\. /.test(trimmed)
    || isTableStart(lines, index)
}

function isTableStart(lines: string[], index: number) {
  const line = lines[index]?.trim() || ''
  const next = lines[index + 1]?.trim() || ''

  return line.includes('|') && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next)
}

function renderTable(lines: string[]) {
  const [headerLine, , ...bodyLines] = lines
  const headers = parseTableCells(headerLine || '')
  const rows = bodyLines.map(parseTableCells)

  return [
    '<table>',
    `<thead><tr>${headers.map((header) => `<th>${renderInline(header)}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
    '</table>'
  ].join('')
}

function parseTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
</script>

<template>
  <div class="docs-reader">
    <aside class="docs-sidebar-panel" aria-label="Documentation navigation">
      <NuxtLink class="docs-home-link" to="/">
        <span class="docs-home-mark">
          <BookOpen :size="18" />
        </span>
        <span>
          <strong>Fran CRM Docs</strong>
          <small>Contracts and operating notes</small>
        </span>
      </NuxtLink>

      <label class="docs-search">
        <Search :size="16" />
        <input v-model="searchTerm" type="search" placeholder="Search docs" aria-label="Search documentation" />
      </label>

      <nav class="docs-nav-groups">
        <section v-for="section in filteredNav" :key="section.title">
          <h2>{{ section.title }}</h2>
          <NuxtLink
            v-for="item in section.items"
            :key="item.path"
            class="docs-nav-item"
            :class="{ active: item.path === props.path }"
            :to="item.to"
          >
            <component :is="item.icon" :size="17" />
            <span>
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </span>
          </NuxtLink>
        </section>
      </nav>
    </aside>

    <main class="docs-article-shell">
      <div class="docs-breadcrumb">
        <NuxtLink to="/docs">Docs</NuxtLink>
        <span>/</span>
        <span>{{ activeNav?.label }}</span>
      </div>

      <article v-if="page" class="docs-article">
        <header>
          <p class="eyebrow">{{ page.kicker || 'Documentation' }}</p>
          <h1>{{ page.title }}</h1>
          <p>{{ page.description }}</p>
        </header>

        <div class="docs-markdown" v-html="page.html" />
      </article>

      <article v-else class="docs-article">
        <header>
          <p class="eyebrow">Documentation</p>
          <h1>Page not found</h1>
          <p>The requested documentation page is not available.</p>
        </header>
      </article>
    </main>

    <aside class="docs-toc" aria-label="On this page">
      <strong>On this page</strong>
      <a v-for="heading in headings" :key="heading.id" :href="`#${heading.id}`">{{ heading.text }}</a>
      <div class="docs-cta-box">
        <span>Need the operating surface?</span>
        <NuxtLink to="/graph">Open graph</NuxtLink>
        <NuxtLink to="/login">Sign in</NuxtLink>
      </div>
    </aside>
  </div>
</template>
