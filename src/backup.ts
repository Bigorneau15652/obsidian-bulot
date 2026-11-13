// Backup copies of notes, kept in the plugin folder before a note is replaced.
import { App } from "obsidian";

// Two-digit helper for timestamps
const pad = (n: number): string => String(n).padStart(2, `0`);

// Timestamp such as 20261113-094530, sortable as text
function timestamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Keep only safe characters in file names
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, `_`).slice(0, 60) || `note`;
}

// Save the original text; returns the path of the copy. Throws when it cannot be written.
export async function saveBackup(app: App, pluginDir: string, noteName: string, content: string, keep: number): Promise<string> {
  const adapter = app.vault.adapter;
  const folder = `${pluginDir}/backups`;
  if (!(await adapter.exists(folder))) {
    await adapter.mkdir(folder);
  }
  const path = `${folder}/${timestamp(new Date())}-${safeName(noteName)}.md`;
  await adapter.write(path, content);
  await pruneBackups(app, folder, keep);
  return path;
}

// Delete the oldest copies beyond the number to keep
async function pruneBackups(app: App, folder: string, keep: number): Promise<void> {
  const adapter = app.vault.adapter;
  const listing = await adapter.list(folder);
  // Names start with a sortable timestamp, so alphabetical order is chronological order
  const files = listing.files.filter((f) => f.endsWith(`.md`)).sort();
  const excess = files.length - Math.max(1, keep);
  for (let i = 0; i < excess; i++) {
    await adapter.remove(files[i]);
  }
}
