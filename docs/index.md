---
title: pipeline-orchestrator
---

<p class="bb-breadcrumb">Documentation</p>

# <span class="bb-accent">pipeline</span>-orchestrator

<p class="bb-hero-desc">A generic, skill-driven GitHub App pipeline engine. It doesn't know what a "ticket" or a "resume" is — it knows how to receive a trigger, look up a registered pipeline (a skill + a trigger pattern + an execution strategy, all config, not code), and run it.</p>

<div class="bb-card-grid">
  <a href="https://github.com/HeyItsChloe/pipeline-orchestrator#quick-start-standalone" class="bb-card">
    <div class="bb-card-icon bb-icon-blue">🚀</div>
    <div class="bb-card-title">Quick Start</div>
    <div class="bb-card-desc">Clone it, fill in .env, run it standalone with the shipped dev-ticket-pipeline handler.</div>
  </a>
  <a href="https://github.com/HeyItsChloe/pipeline-orchestrator#registry-format" class="bb-card">
    <div class="bb-card-icon bb-icon-green">⚙️</div>
    <div class="bb-card-title">Registry Format</div>
    <div class="bb-card-desc">One pipelines.yaml, one entry per pipeline — a skill, a trigger pattern, an execution strategy, and handler-specific params.</div>
  </a>
  <a href="https://github.com/HeyItsChloe/pipeline-orchestrator#writing-a-custom-pipeline-handler" class="bb-card">
    <div class="bb-card-icon bb-icon-purple">🏗️</div>
    <div class="bb-card-title">Custom Handlers</div>
    <div class="bb-card-desc">Implement the PipelineHandler interface and register it alongside the shipped default — any pipeline, no engine changes.</div>
  </a>
  <a href="/codebase-overview" class="bb-card">
    <div class="bb-card-icon bb-icon-orange">📁</div>
    <div class="bb-card-title">Reference</div>
    <div class="bb-card-desc">Auto-generated codebase overview and running changelog, regenerated on every run.</div>
  </a>
</div>

<div class="bb-quick-start">

## Quick Start

```sh
git clone https://github.com/HeyItsChloe/pipeline-orchestrator.git
cd pipeline-orchestrator
npm install
cp .env.example .env   # your own GitHub App, secrets, registry path
npm run dev
```

Self-hosted: every deployment is your own — your own GitHub App
registration, your own secrets, your own `pipelines.yaml`. There is no
shared hosted instance.

See the [full README](https://github.com/HeyItsChloe/pipeline-orchestrator#readme) for the registry format, writing a custom pipeline handler, and deployment.

</div>
