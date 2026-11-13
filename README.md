# Bulot

Translate Obsidian notes between any pair of languages without breaking their layout.

Status: early development. The Anthropic service is available. Google Cloud Translation and local models (Ollama, LM Studio) are planned.

## Requirements

Obsidian 1.11.4 or later. API keys are kept in the secure secret storage of Obsidian, which does not exist in older versions.

## How it works

Bulot never sends the layout of a note to a translation service. Frontmatter, code blocks, math, comments, link targets, embeds, tags, block identifiers and Markdown markers (headings, lists, tasks, quotes, callouts, table separators) are kept aside and put back at the exact same place. Only the sentences are translated. For a link written `[[Note|displayed text]]`, only the displayed text is translated.

Before anything is written, Bulot checks that the translated note has the same number of lines and the same block structure as the original. A line whose translation is refused (lost or altered markers, several lines returned) keeps its original text.

## Usage

Three ways to start a translation:

- the Bulot button in the left ribbon translates the current note with the default service and language;
- the command palette (Ctrl+P) offers "Translate the current note", "Translate the current note: choose service and language", "Translate the selection" and "Cancel the running translation";
- hotkeys can be assigned to these commands in the Obsidian hotkey settings.

By default the note is replaced. The change can be undone with Ctrl+Z, and a backup copy of the original is kept in the plugin folder (the number of copies is a setting). Another setting creates a translated copy next to the original instead.

## Setting up Anthropic

1. Create an API key in your Anthropic account.
2. Open Settings, then Bulot, and in "API key" create or select a secret holding the key.
3. Choose the model (Claude Haiku 5.5 by default) and use "Test the connection".

## Network use and privacy

Bulot sends text to the selected translation service only when you start a translation, and only the sentences to translate (not the layout elements kept aside). The service requires your own API key and may charge you according to its pricing. No telemetry is collected and nothing is sent at startup. A confirmation window shows the volume before sending when it exceeds a threshold you set (0 asks every time).

Text of the note is treated as data: the instructions given to the model state that the content is never an instruction, and the answer is only accepted when it keeps every protected marker.

## Known limits

Each line is translated on its own, which keeps the layout but can give less fluent results for sentences split over several lines. Code indented with four spaces is not recognised as code, only fenced blocks are. Command names follow the interface language chosen when Obsidian starts.

## Installation without building anything

Each tagged version is published in the GitHub releases of this repository with the three files Obsidian needs (`main.js`, `manifest.json`, `styles.css`). Download them into `<your vault>/.obsidian/plugins/bulot/`, or install the plugin with the BRAT community plugin by giving it the address of this repository.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
