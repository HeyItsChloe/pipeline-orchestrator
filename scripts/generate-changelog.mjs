import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { commitsSince, currentSha } from './lib/git-log.mjs'
import { callClaude, parseEngineArg } from './lib/claude.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'docs', 'changelog.md')
const statePath = join(root, 'scripts', '.last-sha.json')
const HEADING = '# Changelog\n'

async function run() {
  const engine = parseEngineArg()
  const lastSha = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')).sha : null
  const commits = commitsSince(root, lastSha)
  const sha = currentSha(root)

  if (commits.length === 0) {
    console.log('No new commits since last run — changelog unchanged.')
    return
  }

  const entryBody =
    engine === 'deterministic' ? renderDeterministic(commits) : await renderLlm(commits)

  const date = new Date().toISOString().slice(0, 10)
  const entry = `## ${date} — ${commits.length} commit${commits.length === 1 ? '' : 's'} (\`${sha.slice(0, 7)}\`)\n\n_engine: \`${engine}\`_\n\n${entryBody}\n`

  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : HEADING
  const afterHeading = existing.startsWith(HEADING) ? existing.slice(HEADING.length).trim() : existing.trim()
  // Only carry forward real prior entries — discard first-run placeholder copy.
  const rest = afterHeading.startsWith('##') ? afterHeading : ''
  writeFileSync(outPath, `${HEADING}\n${entry}\n${rest}\n`.replace(/\n{3,}/g, '\n\n'))
  writeFileSync(statePath, JSON.stringify({ sha }, null, 2) + '\n')

  console.log(`Wrote ${outPath} (engine=${engine}, ${commits.length} new commits)`)
}

function renderDeterministic(commits) {
  return commits.map((c) => `- ${c.subject} (${c.author}, ${c.date}, \`${c.hash.slice(0, 7)}\`)`).join('\n')
}

async function renderLlm(commits) {
  const raw = commits.map((c) => `${c.hash.slice(0, 7)} ${c.date} ${c.author}: ${c.subject}`).join('\n')
  return callClaude({
    system:
      'You write clean, human-readable changelog entries from raw commit lists for a docs site. Group entries under "### Added", "### Changed", and "### Fixed" subheadings as appropriate (omit empty groups). Never invent changes not implied by the commit subjects.',
    prompt: `Raw commits, most recent last:\n\n${raw}\n\nWrite the grouped changelog entry.`,
    maxTokens: 1500,
  })
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
