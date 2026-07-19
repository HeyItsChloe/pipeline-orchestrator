import { defineConfig } from 'vitepress'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = join(__dirname, 'generated-config.json')
const g = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}

export default defineConfig({
  title: g.title ?? 'pipeline-orchestrator',
  description: g.description ?? 'A generic, skill-driven GitHub App pipeline engine — self-hosted, any pipeline.',
  base: '/pipeline-orchestrator/',
  cleanUrls: true,
  appearance: 'force-dark',
  themeConfig: {
    siteTitle: false,
    nav: g.nav ?? [
      { text: 'Introduction', link: '/' },
      { text: 'Codebase Overview', link: '/codebase-overview' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: g.sidebar ?? [
      {
        text: 'Reference',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Codebase Overview', link: '/codebase-overview' },
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/HeyItsChloe/pipeline-orchestrator' }],
    footer: {
      message: g.footer ?? 'Regenerated automatically on merge to main — powered by GitHub Actions.',
    },
  },
})
