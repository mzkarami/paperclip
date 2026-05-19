# Paperclip Triage

Queue workbench for triaging arbitrary items with a teachable assistant.

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm typecheck
pnpm test
pnpm build
```

`pnpm dev` rebuilds the worker, manifest, and UI bundles into `dist/`.
When this package is installed from a local path, Paperclip watches that rebuilt
output and reloads the plugin worker. Local installs run trusted code from this
folder on your machine.

## Phase 2 Scope

This package scaffold declares:

- plugin id `paperclipai.plugin-triage`
- page, sidebar, route sidebar, and settings page slots
- managed `Triage Assistant` agent
- managed `Triage` project
- managed triage skills
- worker health data plus a settings-page reconcile action

## Install Into Paperclip

```bash
paperclipai plugin install /Users/dotta/paperclip/.paperclip/worktrees/PAP-9815-triage-plugin/packages/plugins/plugin-triage
```

## Build Options

- `pnpm build` uses esbuild presets from `@paperclipai/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.

## Focused Verification

From the repository root:

```bash
pnpm --filter @paperclipai/plugin-triage typecheck
pnpm --filter @paperclipai/plugin-triage test
pnpm --filter @paperclipai/plugin-triage build
```
