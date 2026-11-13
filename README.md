# Bulot

Translate Obsidian notes between any pair of languages without breaking their layout.

Status: early development (step 1: project skeleton, icon and bilingual settings). Translation is not available yet.

## Planned features

- Translation of the current note or of a selection, with automatic source language detection.
- Layout is never sent to the translator: code, links, embeds, formulas, frontmatter and other protected parts are kept as they are.
- Several providers: Google Cloud Translation, Anthropic, local models (Ollama, LM Studio and other OpenAI-compatible servers).
- Works on desktop and mobile.
- Interface available in English and French.

## Network use and privacy

Bulot sends text to a translation service only when you start a translation and after you configured a provider with your own API key. No telemetry is collected. A "local only" mode will restrict requests to servers on your own network.

## Installation without building anything

Each tagged version is published in the GitHub releases of this repository with the three files Obsidian needs (`main.js`, `manifest.json`, `styles.css`). Download them into `<your vault>/.obsidian/plugins/bulot/`, or install the plugin with the BRAT community plugin by giving it the address of this repository.

## Development

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/bulot/`, then enable the plugin in Obsidian.

## License

MIT
