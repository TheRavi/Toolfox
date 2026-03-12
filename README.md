# Toolfox

Toolfox is a desktop-first developer utility toolbox built with React + Vite and packaged with Tauri.

The app ships multiple focused tools behind a single UI shell, with dynamic tool registration and worker-based processing for heavy operations.

## Current Tools

### Text
- **Text Diff** — Side-by-side Monaco diff editor with live LCS-based diff summary (hunks, lines added/removed), swap sides, and whitespace options

### Formatters
- **JSON Formatter** — Format, minify, and validate JSON with output search
- **JSON ↔ YAML** — Convert between JSON and YAML in either direction
- **XML Formatter** — Format and minify XML

### Generators
- **ULID Generator** — Batch generation of monotonic ULIDs with per-row and copy-all actions
- **UUID Generator** — Batch generation of UUIDs with per-row and copy-all actions
- **Lorem Ipsum** — Configurable placeholder text generation

### Encoders / Decoders
- **JWT** — Decode, encode (HS256 / none), and verify JWTs using Web Crypto with no external dependencies

## Keyboard Shortcuts

Shortcuts adapt to the current OS — `⌘` on macOS, `Ctrl` on Windows/Linux.

| Tool | Shortcut | Action |
|---|---|---|
| JSON Formatter | `⌘↵` | Format |
| JSON Formatter | `⌘⇧M` | Minify |
| JSON Formatter | `⌘⇧V` | Validate |
| JSON Formatter | `⌘F` | Focus search |
| JSON ↔ YAML | `⌘↵` | Convert |
| JSON ↔ YAML | `⌘⇧Y` | JSON → YAML |
| JSON ↔ YAML | `⌘⇧J` | YAML → JSON |
| JSON ↔ YAML | `⌘C` | Copy output |
| JWT | `⌘↵` | Run operation |
| JWT | `⌘⇧C` | Copy output |
| Any tool | `⌘⇧P` | Open command palette |

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Monaco Editor (`@monaco-editor/react`)
- Tauri 2 (desktop packaging)
- Web Workers for parser/generator/crypto workloads

## Project Structure

- `src/app` — Main shell and tool navigation
- `src/components` — Shared UI primitives (toolbar, split pane, status bar, command palette)
- `src/core` — Tool registry, settings store, and platform utilities
- `src/tools` — One folder per tool (metadata + component + optional worker)
- `src-tauri` — Tauri desktop configuration and Rust entrypoint

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run web dev server:

```bash
npm run dev
```

3. Run desktop app via Tauri:

```bash
npm run tauri:dev
```

## Build and Quality

- Lint:

```bash
npm run lint
```

- Production build:

```bash
npm run build
```

- Tauri production build:

```bash
npm run tauri:build
```

## Add a New Tool

Tool discovery is file-system based — no central registry edits needed.

1. Create a folder under `src/tools/<tool-name>/`
2. Add `toolMeta.js` exporting a `toolMeta` object with:
   - `id` — unique kebab-case identifier
   - `name` — display name
   - `icon` — emoji or short string
   - `category` — groups tools in the sidebar (create a new string to add a new category)
3. Add a component file named `<ToolNamePascalCase>.jsx`
   - Example: `src/tools/xml-formatter/XmlFormatter.jsx`
4. Optionally add a `<toolName>Worker.js` for CPU-intensive work. Spawn it with:
   ```js
   new Worker(new URL('./myWorker.js', import.meta.url), { type: 'module' })
   ```

The registry resolves components by preferring `<ToolNamePascalCase>.jsx`, then `index.jsx`.

## Notes

- User preferences (theme, indentation, last tool) are persisted in `localStorage`.
- Keyboard shortcut display adapts to macOS vs Windows/Linux via `src/core/platform.js`.
- For security hardening in desktop builds, review Tauri CSP settings before release.
