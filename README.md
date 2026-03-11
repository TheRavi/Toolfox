# Toolfox

Toolfox is a desktop-first developer utility toolbox built with React + Vite and packaged with Tauri.

The app ships multiple focused tools behind a single UI shell, with dynamic tool registration and worker-based processing for heavy operations.

## Current Tools

- JSON Formatter
	- Format
	- Minify
	- Validate
	- Search in output
- JSON <-> YAML
	- JSON to YAML conversion
	- YAML to JSON conversion
- XML Formatter
	- Format
	- Minify
	- Validate
- ULID Generator
	- Batch generation
	- Monotonic ULIDs within same millisecond
	- Per-row and copy-all actions
- UUID Generator
	- Batch generation
	- Per-row and copy-all actions

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Monaco Editor
- Tauri 2 (desktop packaging)
- Web Workers for parser/generator workloads

## Project Structure

- src/app
	- Main shell and tool navigation
- src/components
	- Shared UI primitives (toolbar, split pane, status bar, etc.)
- src/core
	- Tool registry and local settings store
- src/tools
	- One folder per tool (metadata + component + optional worker)
- src-tauri
	- Tauri desktop configuration and Rust entrypoint

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

Tool discovery is file-system based via the registry.

1. Create a folder under `src/tools/<tool-name>/`
2. Add `toolMeta.js` with:
	 - `id`
	 - `name`
	 - `icon`
	 - `category`
3. Add component file named `<ToolNamePascalCase>.jsx`
	 - Example: `src/tools/xml-formatter/XmlFormatter.jsx`
4. If needed, add a worker file for heavy work.

The registry prefers `<ToolNamePascalCase>.jsx`, then `index.jsx`.

## Notes

- User preferences (theme, indentation, last tool) are stored in localStorage.
- For security hardening in desktop builds, review Tauri CSP settings before release.
