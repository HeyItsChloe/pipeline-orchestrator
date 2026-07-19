import { execFileSync } from 'node:child_process'

export function currentSha(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
}

export function commitsSince(root, sinceSha) {
  // If sinceSha was rewritten by a rebase it won't exist — fall back to full history
  if (sinceSha) {
    try {
      execFileSync('git', ['cat-file', '-e', sinceSha], { cwd: root })
    } catch {
      console.warn(`commitsSince: SHA ${sinceSha.slice(0, 7)} not found (rebase?), using full history`)
      sinceSha = null
    }
  }

  const range = sinceSha ? `${sinceSha}..HEAD` : 'HEAD'
  const format = '%H%x1f%ad%x1f%an%x1f%s'
  const out = execFileSync(
    'git',
    ['log', range, `--pretty=format:${format}`, '--date=short'],
    { cwd: root },
  )
    .toString()
    .trim()

  if (!out) return []

  return out.split('\n').map((line) => {
    const [hash, date, author, subject] = line.split('\x1f')
    return { hash, date, author, subject }
  })
}

export function changedFilesSince(root, sinceSha) {
  if (!sinceSha) return []
  try {
    const out = execFileSync(
      'git', ['diff', '--name-only', `${sinceSha}..HEAD`],
      { cwd: root },
    ).toString().trim()
    return out ? out.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

export function diffForFiles(root, sinceSha, files) {
  if (!sinceSha || files.length === 0) return ''
  try {
    return execFileSync(
      'git', ['diff', `${sinceSha}..HEAD`, '--', ...files],
      { cwd: root, maxBuffer: 10 * 1024 * 1024 },
    ).toString()
  } catch {
    return ''
  }
}
