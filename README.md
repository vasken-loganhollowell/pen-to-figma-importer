# Pen to Figma Importer

Free Figma plugin that imports Pencil (.pen) design files as fully editable Figma documents.

[![GitHub release](https://img.shields.io/github/v/release/cloverxlimited/pen-to-figma-importer)](https://github.com/cloverxlimited/pen-to-figma-importer/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What it does

Drop a JSON export of any .pen file and the plugin builds your entire design in Figma:

- **Frames** with auto-layout (horizontal/vertical, gap, padding, alignment)
- **Components** from reusable .pen nodes
- **Instances** with property overrides and component swapping
- **Text layers** with font families, weights, sizes, letter spacing, line height
- **Shapes** (rectangles, ellipses, polygons, lines, SVG paths)
- **Variable Collection** from .pen design tokens (colors, numbers, strings, booleans)
- **Fills** (solid colors, linear/radial/angular gradients)
- **Strokes** (per-side thickness, dash patterns, alignment)
- **Effects** (drop shadows, inner shadows, layer blurs, background blurs)
- **Annotations** (prompt, note, and context nodes imported as styled text)

## Installation

### From Figma Community

*(In review — coming soon)*

### As a development plugin

1. Clone this repo
2. Run `npm install && npm run build`
3. In Figma: **Plugins → Development → Import plugin from manifest**
4. Select `manifest.json` from the cloned folder

## Usage

### Step 1: Export your .pen file

Open your .pen file in Pencil, then use Claude Code with this prompt:

```
Export my .pen file to JSON for the Figma importer.
Use batch_get with readDepth 10 to get all nodes,
and get_variables to get all design tokens.
Combine into: { "variables": {...}, "children": [...] }
Save as export.json.
```

Or manually run the MCP calls:

```
batch_get(filePath: "your-file.pen", readDepth: 10)   → nodes array
get_variables(filePath: "your-file.pen")               → variables object
```

Combine into one JSON file:

```json
{
  "variables": { "...result from get_variables..." },
  "children": [ "...result from batch_get..." ]
}
```

See [export-pen.md](export-pen.md) for detailed instructions and more prompts.

### Step 2: Import into Figma

1. Open any Figma file
2. Run **Pen to Figma Importer** from the plugins menu
3. Drag your `.json` file into the drop zone
4. Wait for the import to complete

Components are placed at x=4000 (off to the right). Page frames appear at their original positions.

## File structure

```
pen-to-figma-importer/
├── manifest.json        ← Figma plugin manifest
├── ui.html              ← Drag-drop UI with progress and error reporting
├── dist/code.js         ← Built plugin code (ES2015)
├── src/main.ts          ← Source (TypeScript)
├── build.mjs            ← esbuild bundler script
├── package.json
├── assets/
│   ├── plugin-icon.png  ← 128x128 plugin icon
│   └── plugin-cover.png ← 1920x1080 cover image
├── export-pen.md        ← How to export .pen files
└── LISTING.md           ← Figma Community listing copy
```

## Developing

```bash
npm install
npm run build        # one-time build
npm run watch        # rebuild on file changes
```

The build targets ES2015 for compatibility with Figma's JavaScript sandbox.

## Known limitations

- **Image fills** become grey placeholder rectangles (the JSON export doesn't include image bytes — re-add images manually after import)
- **Mesh gradients** are approximated using the first color at 50% opacity (Figma has no mesh gradient support)
- **Icon fonts** (Lucide, Material Symbols, etc.) render as text with the icon ligature name — install the font locally for correct display
- **Fonts** must be installed on your machine. The plugin falls back to Inter Regular if a font can't be loaded
- **Non-instance slot replacement** inside instances logs a warning (Figma API limitation)

## Links

- [Documentation & Export Guide](https://cloverxlimited.github.io/pen-to-figma/)
- [Release Notes](https://github.com/cloverxlimited/pen-to-figma-importer/releases)
- [Report a Bug](https://github.com/cloverxlimited/pen-to-figma-importer/issues)

## License

MIT

---

Built by [Vasken](https://vaskendesign.com) at [CloverX Limited](https://github.com/cloverxlimited)
