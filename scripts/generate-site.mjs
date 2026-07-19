/**
 * Unified site generator.
 *
 * llm mode — requires ANTHROPIC_API_KEY:
 *   First run (no generated-config.json): builds the full site from scratch —
 *   designs nav/sidebar, accent color, and writes every page.
 *
 *   Subsequent runs: INCREMENTAL UPDATE — reads the git diff since the last run,
 *   asks Claude which pages are affected, and edits only those pages. Never
 *   removes existing content. Adds a new page only when the diff introduces a
 *   new concept that has no existing page yet.
 *
 * deterministic mode — no API key needed:
 *   Only updates codebase-overview.md (file tree + import graph) and changelog.md.
 *   All prose pages are left exactly as the last llm run wrote them.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  walkRepo,
  buildTree,
  renderTree,
  buildImportGraph,
  pickSourceSample,
} from './lib/repo-scan.mjs'
import { commitsSince, currentSha, changedFilesSince, diffForFiles } from './lib/git-log.mjs'
import { callClaude, parseEngineArg } from './lib/claude.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = join(scriptDir, '..')
const docsDir = join(root, 'docs')
const viteDir = join(docsDir, '.vitepress')
const generatedConfigPath = join(viteDir, 'generated-config.json')
const generatedTokensPath = join(viteDir, 'theme', 'generated-tokens.css')
const statePath = join(scriptDir, '.last-sha.json')
const changelogPath = join(docsDir, 'changelog.md')
const overviewPath = join(docsDir, 'codebase-overview.md')

const CHANGELOG_HEADING = '# Changelog\n'

async function run() {
  const engine = parseEngineArg()
  const files = walkRepo(root)
  const sha = currentSha(root)

  console.log(`engine=${engine}  files=${files.length}  sha=${sha.slice(0, 7)}`)

  if (engine === 'llm') {
    await runLlm(files, sha)
  } else {
    await runDeterministic(files, sha)
  }
}

// ── LLM mode ──────────────────────────────────────────────────────────────

async function runLlm(files, sha) {
  const sample = pickSourceSample(root, files)
  const readmePath = join(root, 'README.md')
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : ''

  if (!existsSync(generatedConfigPath)) {
    await runLlmFull(files, sha, sample, readme)
  } else {
    await runLlmIncremental(files, sha, sample, readme)
  }
}

// Full generation — first time setup, no existing config
async function runLlmFull(files, sha, sample, readme) {
  console.log('No existing site — running full generation…')

  const structure = await generateStructure(sample, readme)

  writeFileSync(
    generatedConfigPath,
    JSON.stringify(
      {
        title: structure.title,
        description: structure.description,
        footer: structure.footer,
        nav: structure.nav,
        sidebar: structure.sidebar,
      },
      null,
      2,
    ) + '\n',
  )
  console.log('Wrote generated-config.json')

  writeTokens(structure.accentColor || '#5169dd', structure.accentColorHover || '#4257c4')
  console.log('Wrote generated-tokens.css')

  const contentPages = (structure.pages || []).filter(
    (p) => p.path !== 'changelog.md' && p.path !== 'codebase-overview.md',
  )
  for (const page of contentPages) {
    console.log(`Writing ${page.path}…`)
    const content = await generatePageContent(page, sample, readme, structure)
    const fullPath = join(docsDir, page.path)
    mkdirSync(dirname(fullPath), { recursive: true })
    const fm = page.path === 'index.md' ? `---\ntitle: ${structure.title}\n---\n\n` : ''
    writeFileSync(fullPath, `${fm}# ${page.title}\n\n${content.trim()}\n`)
  }

  await updateOverview(files, sha)
  await updateChangelog(sha, 'llm')

  console.log('Full site generation complete.')
}

// Incremental update — read diff, edit only affected pages
async function runLlmIncremental(files, sha, sample, readme) {
  const lastSha = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8')).sha
    : null

  // Only look at source files — exclude generated docs output and state files
  const allChanged = changedFilesSince(root, lastSha)
  const sourceChanged = allChanged.filter(
    (f) => !f.startsWith('docs/') && f !== 'scripts/.last-sha.json',
  )

  if (sourceChanged.length === 0) {
    console.log('No source changes since last run — updating reference pages only.')
    await updateOverview(files, sha)
    await updateChangelog(sha, 'llm')
    return
  }

  console.log(`Source changes: ${sourceChanged.join(', ')}`)
  const diff = diffForFiles(root, lastSha, sourceChanged)

  const config = JSON.parse(readFileSync(generatedConfigPath, 'utf8'))
  const existingPages = collectPages(config)

  console.log('Analyzing what changed…')
  const analysis = await analyzeChanges(diff, existingPages, readme, config.title)

  // Update existing pages that the diff affects
  for (const update of analysis.pagesToUpdate || []) {
    const fullPath = join(docsDir, update.path)
    if (!existsSync(fullPath)) {
      console.warn(`Page not found, skipping: ${update.path}`)
      continue
    }
    console.log(`Updating ${update.path} — ${update.reason}`)
    const current = readFileSync(fullPath, 'utf8')
    const updated = await applyPageUpdate(current, diff, update.guidance, update.title, config.title)
    writeFileSync(fullPath, updated)
  }

  // Create brand-new pages for new concepts
  for (const newPage of analysis.newPages || []) {
    console.log(`Creating ${newPage.path}…`)
    const content = await generatePageContent(newPage, sample, readme, config)
    const fullPath = join(docsDir, newPage.path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, `# ${newPage.title}\n\n${content.trim()}\n`)
    addPageToConfig(config, newPage)
  }

  if ((analysis.newPages || []).length > 0) {
    writeFileSync(generatedConfigPath, JSON.stringify(config, null, 2) + '\n')
    console.log('Updated generated-config.json')
  }

  await updateOverview(files, sha)
  await updateChangelog(sha, 'llm')

  console.log('Incremental update complete.')
}

// ── Deterministic mode ────────────────────────────────────────────────────
// No API key. Only updates codebase-overview.md and changelog.md.

async function runDeterministic(files, sha) {
  await updateOverview(files, sha)
  await updateChangelog(sha, 'deterministic')
  console.log('Deterministic generation complete.')
}

// ── Shared reference page update ──────────────────────────────────────────

async function updateOverview(files, sha) {
  const tree = buildTree(files)
  const treeLines = renderTree(tree)
  const graph = buildImportGraph(root, files)
  const graphLines = Object.entries(graph)
    .slice(0, 60)
    .map(([f, imports]) => `- \`${f}\` → ${imports.map((i) => `\`${i}\``).join(', ')}`)

  const body = [
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

  writeFileSync(
    overviewPath,
    `# Codebase Overview\n\n_Generated ${new Date().toISOString()} · commit \`${sha.slice(0, 7)}\`_\n\n${body}\n`,
  )
  console.log('Wrote codebase-overview.md')
}

// ── LLM helpers ───────────────────────────────────────────────────────────

async function generateStructure(sample, readme) {
  const response = await callClaude({
    system:
      'You are a technical documentation architect. Return ONLY valid JSON — no markdown fences, no explanation.',
    prompt: `Design the information architecture for a documentation website.
Analyze the source code and README below, then return a JSON object with this exact shape:

{
  "title": "short project name",
  "description": "one sentence describing what this software does",
  "footer": "short footer note",
  "accentColor": "#hexcolor (vibrant on dark #0f1117 background)",
  "accentColorHover": "#hexcolor (slightly darker hover variant)",
  "nav": [{ "text": "Section Name", "link": "/first-page-in-section" }],
  "sidebar": [
    { "text": "Section Name", "items": [{ "text": "Page Title", "link": "/path/to/page" }] }
  ],
  "pages": [
    { "path": "relative/path.md", "title": "Page Title", "description": "2-3 sentences on what this page covers" }
  ]
}

Rules:
- 8–14 total pages across 3–5 sidebar sections
- 4–6 nav items, each linking to the first page of its section
- Links use clean URL paths — no .md extension, subdirectory format (e.g. /setup/quick-start)
- Home page is always path "index.md" and link "/"
- Always include "codebase-overview.md" (link "/codebase-overview") and "changelog.md" (link "/changelog") in a Reference section
- Accent color must be vibrant and readable on a #0f1117 dark background
- Page topics must be specific to THIS project — not generic template labels

README (first 3000 chars):
${readme.slice(0, 3000)}

Source files (first 8000 chars):
${sample.slice(0, 8000)}`,
    maxTokens: 3000,
  })

  return parseJson(response, 'generateStructure')
}

async function analyzeChanges(diff, existingPages, readme, siteTitle) {
  const pageList = existingPages.map((p) => `- ${p.path} ("${p.title}")`).join('\n')

  const response = await callClaude({
    system:
      'You are a documentation maintainer. Return ONLY valid JSON — no markdown fences, no explanation.',
    prompt: `The repository "${siteTitle}" has new commits. Based on the git diff, decide which existing documentation pages need updating and whether any brand-new pages should be added.

Return JSON with this exact shape:
{
  "pagesToUpdate": [
    {
      "path": "path/to/page.md",
      "title": "Page Title",
      "reason": "one sentence: why this page needs updating",
      "guidance": "specific instructions: what to add, change, or clarify"
    }
  ],
  "newPages": [
    {
      "path": "section/new-page.md",
      "title": "Page Title",
      "description": "2-3 sentences on what this page covers",
      "sidebarSection": "Exact name of the existing sidebar section this belongs in"
    }
  ]
}

Rules:
- Only include pages that genuinely need changes from this diff
- Do NOT suggest updates to pages unaffected by the diff
- Do NOT suggest removing content — only adding or editing
- Only add a new page for a significant new concept with no existing page
- Paths are relative to the docs/ directory and end in .md
- Exclude codebase-overview.md and changelog.md — those are always updated separately

Existing pages:
${pageList}

Git diff (source files only):
${diff.slice(0, 6000)}

README:
${readme.slice(0, 800)}`,
    maxTokens: 2000,
  })

  try {
    return parseJson(response, 'analyzeChanges')
  } catch {
    console.warn('analyzeChanges: could not parse response — no updates will be applied')
    return { pagesToUpdate: [], newPages: [] }
  }
}

async function applyPageUpdate(currentContent, diff, guidance, pageTitle, siteTitle) {
  return callClaude({
    system:
      'You are a technical writer maintaining a documentation page. Return ONLY the complete updated markdown — no explanation, no fences.',
    prompt: `Update the documentation page "${pageTitle}" for the "${siteTitle}" project.

What needs to change: ${guidance}

STRICT RULES:
- Only change what the diff makes stale, incomplete, or inaccurate
- Do NOT remove any content that is still accurate and useful
- Add or update sections where the diff introduces changes
- Keep the same writing style, heading structure, and formatting
- Return the COMPLETE updated page content

Current page:
${currentContent}

Code changes (git diff):
${diff.slice(0, 4000)}`,
    maxTokens: 3000,
  })
}

async function generatePageContent(page, sample, readme, structure) {
  return callClaude({
    system:
      'You are a technical writer creating a docs page. Write accurate, specific markdown. Use ## and ### headings, code blocks, and tables where appropriate. Do NOT include a top-level # heading.',
    prompt: `Write the documentation page titled "${page.title}" for the "${structure.title}" docs site.

What this page covers: ${page.description}

Source code (first 6000 chars):
${sample.slice(0, 6000)}

README (first 2000 chars):
${readme.slice(0, 2000)}

Write the full page content. Start directly with the first ## heading or prose. Be specific and technical.`,
    maxTokens: 2500,
  })
}

// ── Config helpers ─────────────────────────────────────────────────────────

function collectPages(config) {
  const pages = []
  for (const group of config.sidebar || []) {
    for (const item of group.items || []) {
      const path = item.link === '/' ? 'index.md' : item.link.replace(/^\//, '') + '.md'
      pages.push({ path, title: item.text, link: item.link })
    }
  }
  return pages
}

function addPageToConfig(config, newPage) {
  const link = '/' + newPage.path.replace(/\.md$/, '')
  const sectionName = newPage.sidebarSection

  let group = config.sidebar.find((g) => g.text === sectionName)
  if (!group) {
    // Insert before the last group (Reference) which is always last
    group = { text: sectionName, items: [] }
    config.sidebar.splice(config.sidebar.length - 1, 0, group)
  }
  group.items.push({ text: newPage.title, link })
}

// ── Changelog ────────────────────────────────────────────────────────────

async function updateChangelog(sha, engine) {
  const lastSha = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8')).sha
    : null
  const commits = commitsSince(root, lastSha)

  if (commits.length === 0) {
    console.log('No new commits — changelog unchanged.')
    writeFileSync(statePath, JSON.stringify({ sha }, null, 2) + '\n')
    return
  }

  let entryBody
  if (engine === 'deterministic') {
    entryBody = commits
      .map((c) => `- ${c.subject} (${c.author}, ${c.date}, \`${c.hash.slice(0, 7)}\`)`)
      .join('\n')
  } else {
    const raw = commits
      .map((c) => `${c.hash.slice(0, 7)} ${c.date} ${c.author}: ${c.subject}`)
      .join('\n')
    entryBody = await callClaude({
      system:
        "You write clean changelog entries from raw commit lists. Group under '### Added', '### Changed', '### Fixed' as appropriate. Omit empty groups. Never invent changes.",
      prompt: `Raw commits, most recent last:\n\n${raw}\n\nWrite the grouped changelog entry.`,
      maxTokens: 1500,
    })
  }

  const date = new Date().toISOString().slice(0, 10)
  const entry = `## ${date} — ${commits.length} commit${commits.length === 1 ? '' : 's'} (\`${sha.slice(0, 7)}\`)\n\n_engine: \`${engine}\`_\n\n${entryBody.trim()}\n`

  const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : CHANGELOG_HEADING
  const afterHeading = existing.startsWith(CHANGELOG_HEADING)
    ? existing.slice(CHANGELOG_HEADING.length).trim()
    : existing.trim()
  const rest = afterHeading.startsWith('##') ? afterHeading : ''

  writeFileSync(
    changelogPath,
    `${CHANGELOG_HEADING}\n${entry}\n${rest}\n`.replace(/\n{3,}/g, '\n\n'),
  )
  writeFileSync(statePath, JSON.stringify({ sha }, null, 2) + '\n')
  console.log(`Updated changelog (${commits.length} new commits)`)
}

// ── Token helpers ─────────────────────────────────────────────────────────

function writeTokens(accent, accentHover) {
  writeFileSync(
    generatedTokensPath,
    `/* AUTO-GENERATED by scripts/generate-site.mjs — do not edit by hand */
:root,
.dark {
  --bb-accent:           ${accent};
  --bb-accent-hover:     ${accentHover};
  --bb-accent-soft:      ${accent}1a;
  --bb-accent-light:     ${lighten(accent, 0.15)};
  --bb-accent-selection: ${accent}4d;
  --bb-accent-shadow:    ${hexToRgba(accent, 0.25)};

  --vp-c-brand-1:    ${accent};
  --vp-c-brand-2:    ${accent};
  --vp-c-brand-3:    ${accentHover};
  --vp-c-brand-soft: ${accent}1a;
}
`,
  )
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`
}

function lighten(hex, amount) {
  const h = hex.replace('#', '')
  const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * (1 + amount)))
  const g = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * (1 + amount)))
  const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * (1 + amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function parseJson(response, caller) {
  const cleaned = response.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`${caller}: Claude returned non-JSON:\n${response.slice(0, 500)}`)
    return JSON.parse(match[0])
  }
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
