import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { walkRepo, buildTree, renderTree, buildImportGraph, pickSourceSample } from './lib/repo-scan.mjs'
import { currentSha } from './lib/git-log.mjs'
import { callClaude, parseEngineArg } from './lib/claude.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'docs', 'codebase-overview.md')

async function run() {
  const engine = parseEngineArg()
  const files = walkRepo(root)
  const sha = currentSha(root)
  const generatedAt = new Date().toISOString()

  let body
  if (engine === 'deterministic') {
    body = renderDeterministic(files)
  } else {
    body = await renderLlm(files)
  }

  const header = `# Codebase Overview\n\n_Generated ${generatedAt} · engine: \`${engine}\` · commit \`${sha.slice(0, 7)}\`_\n\n`
  writeFileSync(outPath, header + body + '\n')
  console.log(`Wrote ${outPath} (engine=${engine}, ${files.length} files scanned)`)
}

function renderDeterministic(files) {
  const tree = buildTree(files)
  const treeLines = renderTree(tree)
  const graph = buildImportGraph(root, files)

  const graphLines = Object.entries(graph)
    .slice(0, 60)
    .map(([file, imports]) => `- \`${file}\` → ${imports.map((i) => `\`${i}\``).join(', ')}`)

  return [
    '## File tree',
    '',
    '```',
    ...treeLines,
    '```',
    '',
    `## Local import graph (${Object.keys(graph).length} files with local imports)`,
    '',
    graphLines.length > 0 ? graphLines.join('\n') : '_No local imports detected._',
  ].join('\n')
}

async function renderLlm(files) {
  const sample = pickSourceSample(root, files)
  const text = await callClaude({
    system:
      'You are a senior engineer writing a concise, accurate architecture overview of a codebase for a docs site. Only describe what is actually present in the provided source — never invent files, modules, or behavior that is not shown. Use markdown with ## headings. Cover: purpose, key modules/files and what each does, and any notable patterns or conventions.',
    prompt: `Here is a representative sample of the repository's source files. Write the architecture overview.\n\n${sample}`,
    maxTokens: 3000,
  })
  return text
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
