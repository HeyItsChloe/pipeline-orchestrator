import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'cache',
  '.vitepress/dist',
  '.vitepress/cache',
])

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

export function walkRepo(root) {
  const files = []

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const size = statSync(fullPath).size
        files.push({ path: relative(root, fullPath), size })
      }
    }
  }

  walk(root)
  return files
}

export function buildTree(files) {
  const root = {}
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ??= {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = file.size
  }
  return root
}

export function renderTree(node, prefix = '') {
  const lines = []
  const entries = Object.entries(node)
  entries.forEach(([name, value], i) => {
    const isLast = i === entries.length - 1
    const connector = isLast ? '└── ' : '├── '
    if (typeof value === 'object') {
      lines.push(`${prefix}${connector}${name}/`)
      lines.push(...renderTree(value, prefix + (isLast ? '    ' : '│   ')))
    } else {
      lines.push(`${prefix}${connector}${name} (${formatBytes(value)})`)
    }
  })
  return lines
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`
  return `${(n / 1024).toFixed(1)}KB`
}

const LOCAL_IMPORT_RE = /(?:import\s+.*?from\s+|require\()\s*['"](\.[^'"]+)['"]/g

export function buildImportGraph(root, files) {
  const graph = {}
  for (const file of files) {
    if (!CODE_EXTENSIONS.has(extname(file.path))) continue
    const content = readFileSync(join(root, file.path), 'utf8')
    const imports = new Set()
    for (const match of content.matchAll(LOCAL_IMPORT_RE)) {
      imports.add(match[1])
    }
    if (imports.size > 0) graph[file.path] = [...imports]
  }
  return graph
}

export function pickSourceSample(root, files, maxChars = 40000) {
  const codeFiles = files
    .filter((f) => CODE_EXTENSIONS.has(extname(f.path)) || f.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path))

  let budget = maxChars
  const sample = []
  for (const file of codeFiles) {
    if (budget <= 0) break
    const content = readFileSync(join(root, file.path), 'utf8')
    const chunk = content.slice(0, Math.min(content.length, budget))
    sample.push(`--- ${file.path} ---\n${chunk}`)
    budget -= chunk.length
  }
  return sample.join('\n\n')
}
