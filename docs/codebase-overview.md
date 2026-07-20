# Codebase Overview

_Generated 2026-07-20T23:08:39.484Z · commit `29c8c05`_

## File tree

```
├── .env.example (1.0KB)
├── .github/
│   └── workflows/
│       ├── dev-pipeline-reusable.yml (16.5KB)
│       ├── docs-site.yml (2.2KB)
│       └── publish.yml (1.2KB)
├── .gitignore (31B)
├── Dockerfile (608B)
├── LICENSE (1.0KB)
├── README.md (4.4KB)
├── docs/
│   ├── .vitepress/
│   │   ├── config.ts (1.4KB)
│   │   ├── generated-config.json (666B)
│   │   └── theme/
│   │       ├── Layout.vue (254B)
│   │       ├── NavLogo.vue (213B)
│   │       ├── custom.css (12.3KB)
│   │       ├── generated-tokens.css (546B)
│   │       └── index.ts (154B)
│   ├── changelog.md (1010B)
│   ├── codebase-overview.md (3.8KB)
│   └── index.md (2.4KB)
├── package-lock.json (167.6KB)
├── package.json (1.6KB)
├── scripts/
│   ├── .last-sha.json (56B)
│   ├── generate-changelog.mjs (2.5KB)
│   ├── generate-overview.mjs (2.3KB)
│   ├── generate-site.mjs (17.4KB)
│   └── lib/
│       ├── claude.mjs (1.3KB)
│       ├── git-log.mjs (1.6KB)
│       └── repo-scan.mjs (2.8KB)
├── src/
│   ├── auth.ts (2.7KB)
│   ├── handlers/
│   │   ├── dev_ticket_pipeline.ts (2.5KB)
│   │   └── scaffold.ts (6.1KB)
│   ├── index.ts (1.8KB)
│   ├── integrations/
│   │   ├── github.ts (5.7KB)
│   │   └── mcp_server.ts (5.0KB)
│   ├── jobs/
│   │   ├── open_pr.ts (882B)
│   │   └── quality_gate.ts (940B)
│   ├── logging.ts (1.3KB)
│   ├── registry/
│   │   └── load.ts (2.7KB)
│   ├── server.ts (5.6KB)
│   ├── triggers/
│   │   ├── chat_command.ts (6.0KB)
│   │   ├── github_label.ts (1.4KB)
│   │   ├── github_mention.ts (1.5KB)
│   │   └── http_api.ts (2.9KB)
│   └── types.ts (2.5KB)
├── templates/
│   └── dev-pipeline-caller.yml (1.4KB)
└── tsconfig.json (359B)
```

## Local import graph (16 files with local imports)

- `docs/.vitepress/theme/index.ts` → `./Layout.vue`
- `scripts/generate-changelog.mjs` → `./lib/git-log.mjs`, `./lib/claude.mjs`
- `scripts/generate-overview.mjs` → `./lib/repo-scan.mjs`, `./lib/git-log.mjs`, `./lib/claude.mjs`
- `scripts/generate-site.mjs` → `./lib/git-log.mjs`, `./lib/claude.mjs`
- `src/auth.ts` → `./logging.js`
- `src/handlers/dev_ticket_pipeline.ts` → `../integrations/github.js`, `../logging.js`, `../types.js`
- `src/handlers/scaffold.ts` → `../integrations/github.js`, `../registry/load.js`, `../logging.js`, `../types.js`
- `src/index.ts` → `./server.js`, `./handlers/dev_ticket_pipeline.js`, `./logging.js`
- `src/jobs/open_pr.ts` → `../logging.js`
- `src/jobs/quality_gate.ts` → `../logging.js`
- `src/registry/load.ts` → `../types.js`
- `src/server.ts` → `./auth.js`, `./logging.js`, `./registry/load.js`, `./triggers/github_label.js`, `./triggers/github_mention.js`, `./triggers/http_api.js`, `./triggers/chat_command.js`, `./jobs/open_pr.js`, `./jobs/quality_gate.js`, `./integrations/mcp_server.js`, `./handlers/dev_ticket_pipeline.js`, `./types.js`, `./integrations/github.js`
- `src/triggers/chat_command.ts` → `../integrations/github.js`, `../registry/load.js`, `../handlers/scaffold.js`, `../logging.js`, `../types.js`
- `src/triggers/github_label.ts` → `../registry/load.js`, `../logging.js`, `../types.js`
- `src/triggers/github_mention.ts` → `../auth.js`, `../registry/load.js`, `../logging.js`, `../types.js`
- `src/triggers/http_api.ts` → `../registry/load.js`, `../logging.js`, `../types.js`
