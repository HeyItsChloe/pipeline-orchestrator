# Codebase Overview

_Generated 2026-07-18T02:48:38.729Z · commit `ef9c49a`_

## File tree

```
├── .github/
│   └── workflows/
│       └── docs-site.yml (2.2KB)
├── .gitignore (74B)
├── README.md (3.3KB)
├── docs/
│   ├── .vitepress/
│   │   ├── config.ts (1.2KB)
│   │   ├── generated-config.json (1.8KB)
│   │   └── theme/
│   │       ├── Layout.vue (254B)
│   │       ├── NavLogo.vue (213B)
│   │       ├── custom.css (12.3KB)
│   │       ├── generated-tokens.css (546B)
│   │       └── index.ts (154B)
│   ├── changelog.md (2.5KB)
│   ├── codebase-overview.md (2.1KB)
│   ├── configuration/
│   │   ├── engines.md (2.2KB)
│   │   ├── secrets-variables.md (1.9KB)
│   │   └── trigger-modes.md (2.0KB)
│   ├── how-it-works/
│   │   ├── architecture.md (3.3KB)
│   │   ├── claude-integration.md (2.6KB)
│   │   ├── git-log.md (1.9KB)
│   │   ├── repo-scanner.md (2.2KB)
│   │   └── workflow.md (3.7KB)
│   ├── index.md (2.1KB)
│   └── setup/
│       ├── local-development.md (1.7KB)
│       └── quick-setup.md (2.3KB)
├── package-lock.json (86.0KB)
├── package.json (459B)
└── scripts/
    ├── .last-sha.json (56B)
    ├── generate-changelog.mjs (2.5KB)
    ├── generate-overview.mjs (2.3KB)
    ├── generate-site.mjs (17.4KB)
    └── lib/
        ├── claude.mjs (1.3KB)
        ├── git-log.mjs (1.6KB)
        └── repo-scan.mjs (2.8KB)
```

## Local import graph (4 files with local imports)

- `docs/.vitepress/theme/index.ts` → `./Layout.vue`
- `scripts/generate-changelog.mjs` → `./lib/git-log.mjs`, `./lib/claude.mjs`
- `scripts/generate-overview.mjs` → `./lib/repo-scan.mjs`, `./lib/git-log.mjs`, `./lib/claude.mjs`
- `scripts/generate-site.mjs` → `./lib/git-log.mjs`, `./lib/claude.mjs`
