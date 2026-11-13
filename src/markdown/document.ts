// Document parsing: splits a Markdown note into raw parts (never sent to any
// translation service) and segments (sentences to translate, with placeholders).
// Joining all parts in order always gives back the original note exactly.
import { hasLetters, protectInline, restoreInline, PLACEHOLDER_PATTERN } from "./inline";

// A piece of text that is a sentence to translate
export interface Segment {
  id: number;
  // `text` segments are plain Markdown text; `yaml` segments are frontmatter values
  kind: `text` | `yaml`;
  // Text to translate, with numbered placeholders
  text: string;
  // Protected strings behind each placeholder
  tokens: string[];
  // The original text, used when a translation is rejected
  source: string;
}

// A document is a sequence of raw text and references to segments
export type Part = { kind: `raw`; text: string } | { kind: `segment`; id: number };

export interface ParsedDocument {
  parts: Part[];
  segments: Segment[];
}

export interface ParseOptions {
  // Frontmatter keys whose single-line values should be translated (default: none)
  frontmatterKeys: string[];
}

const BT = String.fromCharCode(96);

interface Line {
  text: string;
  eol: string;
}

// Split into lines while remembering each original line ending (LF or CRLF)
function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  const re = /\r\n|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    lines.push({ text: source.slice(last, m.index), eol: m[0] });
    last = m.index + m[0].length;
  }
  lines.push({ text: source.slice(last), eol: `` });
  return lines;
}

// Accumulates parts and segments while the document is scanned
class Builder {
  parts: Part[] = [];
  segments: Segment[] = [];

  // Add text that must stay untouched (adjacent raw pieces are merged)
  raw(text: string): void {
    if (text === ``) return;
    const last = this.parts[this.parts.length - 1];
    if (last !== undefined && last.kind === `raw`) {
      last.text += text;
    } else {
      this.parts.push({ kind: `raw`, text });
    }
  }

  // Add a piece of text that may contain translatable sentences
  text(body: string): void {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(body);
    const lead = m?.[1] ?? ``;
    const core = m?.[2] ?? ``;
    const trail = m?.[3] ?? ``;
    if (core === ``) {
      this.raw(body);
      return;
    }
    const { text, tokens } = protectInline(core);
    // Nothing to translate when only symbols, numbers or placeholders remain
    if (!hasLetters(text)) {
      this.raw(body);
      return;
    }
    this.raw(lead);
    this.addSegment(`text`, text, tokens, core);
    this.raw(trail);
  }

  // Add a frontmatter value (already unquoted) as a segment
  yamlValue(value: string, original: string): void {
    if (!hasLetters(value)) {
      this.raw(original);
      return;
    }
    this.addSegment(`yaml`, value, [], original);
  }

  private addSegment(kind: Segment[`kind`], text: string, tokens: string[], source: string): void {
    const id = this.segments.length;
    this.segments.push({ id, kind, text, tokens, source });
    this.parts.push({ kind: `segment`, id });
  }
}

// Remove blockquote markers at the start of a line (used for table detection)
function stripQuote(text: string): string {
  return text.replace(/^(?:[ \t]*>[ \t]?)*/, ``);
}

const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// Find table lines following the GitHub rule: a header row, then a separator row
function detectTables(lines: Line[]): Map<number, `header` | `separator` | `row`> {
  const kinds = new Map<number, `header` | `separator` | `row`>();
  for (let i = 1; i < lines.length; i++) {
    const sep = stripQuote(lines[i].text);
    const head = stripQuote(lines[i - 1].text);
    if (!sep.includes(`|`) || !TABLE_SEPARATOR.test(sep) || !head.includes(`|`) || head.trim() === ``) {
      continue;
    }
    kinds.set(i - 1, `header`);
    kinds.set(i, `separator`);
    let j = i + 1;
    while (j < lines.length) {
      const row = stripQuote(lines[j].text);
      if (row.trim() === `` || !row.includes(`|`)) break;
      kinds.set(j, `row`);
      j++;
    }
    i = j - 1;
  }
  return kinds;
}

// Find the end of an inline code span starting at index i (or i + 1 when there is none)
function codeSpanEnd(text: string, i: number): number {
  let n = 1;
  while (text[i + n] === BT) n++;
  const fence = BT.repeat(n);
  const close = text.indexOf(fence, i + n);
  return close === -1 ? i + n : close + n;
}

// Split a table row into cells, keeping escaped pipes and code spans inside cells
function splitCells(row: string): string[] {
  const cells: string[] = [];
  let current = ``;
  let i = 0;
  while (i < row.length) {
    const c = row[i];
    if (c === `\\` && row[i + 1] === `|`) {
      current += `\\|`;
      i += 2;
    } else if (c === BT) {
      const end = codeSpanEnd(row, i);
      current += row.slice(i, end);
      i = end;
    } else if (c === `|`) {
      cells.push(current);
      current = ``;
      i++;
    } else {
      current += c;
      i++;
    }
  }
  cells.push(current);
  return cells;
}

// Quote characters of a frontmatter value, if any
function parseYamlScalar(value: string): { inner: string; ok: boolean } {
  if (value.length >= 2 && value.startsWith(`"`) && value.endsWith(`"`)) {
    return { inner: value.slice(1, -1).replace(/\\(["\\])/g, `$1`), ok: true };
  }
  if (value.length >= 2 && value.startsWith(`'`) && value.endsWith(`'`)) {
    return { inner: value.slice(1, -1).replace(/''/g, `'`), ok: true };
  }
  // Skip anything that is not a plain one-line text (lists, objects, anchors, block scalars)
  if (/^[\[{|>&*!%@]/.test(value)) return { inner: ``, ok: false };
  return { inner: value, ok: true };
}

const OPENING_FENCE = /^(?:[ \t]*>[ \t]?)*[ \t]*(`{3,}|~{3,})/;
const CLOSING_FENCE = /^(?:[ \t]*>[ \t]?)*[ \t]*(`{3,}|~{3,})[ \t]*$/;

// Parse a note into raw parts and translatable segments
export function parseDocument(source: string, options: Partial<ParseOptions> = {}): ParsedDocument {
  const frontmatterKeys = options.frontmatterKeys ?? [];
  const builder = new Builder();
  const lines = splitLines(source);
  const tableKinds = detectTables(lines);

  // Frontmatter occupies the first lines, between two `---` markers
  let frontmatterEnd = -1;
  if (lines[0].text.trimEnd() === `---`) {
    for (let k = 1; k < lines.length; k++) {
      const t = lines[k].text.trimEnd();
      if (t === `---` || t === `...`) {
        frontmatterEnd = k;
        break;
      }
    }
  }

  let fence: { char: string; length: number } | null = null;
  let inMath = false;
  let inComment = false;
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    const { text, eol } = lines[i];

    if (i <= frontmatterEnd) {
      handleFrontmatterLine(builder, text, i === 0 || i === frontmatterEnd, frontmatterKeys);
      builder.raw(eol);
      continue;
    }

    // Inside a fenced code block everything is raw until the closing fence
    if (fence !== null) {
      const close = CLOSING_FENCE.exec(text);
      if (close !== null && close[1][0] === fence.char && close[1].length >= fence.length) {
        fence = null;
      }
      builder.raw(text + eol);
      continue;
    }
    const open = OPENING_FENCE.exec(text);
    if (open !== null && !(open[1][0] === BT && text.slice(open[0].length).includes(BT))) {
      fence = { char: open[1][0], length: open[1].length };
      builder.raw(text + eol);
      continue;
    }

    // Display math blocks delimited by $$
    const mathCount = text.split(`$$`).length - 1;
    if (inMath) {
      if (mathCount > 0) inMath = false;
      builder.raw(text + eol);
      continue;
    }
    if (mathCount > 0) {
      if (mathCount % 2 === 1) inMath = true;
      builder.raw(text + eol);
      continue;
    }

    // Obsidian comments delimited by %%
    const commentCount = text.split(`%%`).length - 1;
    if (inComment) {
      if (commentCount > 0) inComment = false;
      builder.raw(text + eol);
      continue;
    }
    if (commentCount % 2 === 1) {
      inComment = true;
      builder.raw(text + eol);
      continue;
    }

    // HTML comments spanning several lines
    if (inHtmlComment) {
      if (text.includes(`-->`)) inHtmlComment = false;
      builder.raw(text + eol);
      continue;
    }
    if (text.includes(`<!--`) && !text.slice(text.indexOf(`<!--`)).includes(`-->`)) {
      inHtmlComment = true;
      builder.raw(text + eol);
      continue;
    }

    if (text.trim() === ``) {
      builder.raw(text + eol);
      continue;
    }

    const tableKind = tableKinds.get(i);
    if (tableKind === `separator`) {
      builder.raw(text + eol);
    } else if (tableKind !== undefined) {
      handleTableRow(builder, text);
      builder.raw(eol);
    } else {
      handleBlockLine(builder, text);
      builder.raw(eol);
    }
  }

  return { parts: builder.parts, segments: builder.segments };
}

// One line of the frontmatter: markers stay raw, listed keys get their value translated
function handleFrontmatterLine(builder: Builder, text: string, isMarker: boolean, keys: string[]): void {
  if (isMarker) {
    builder.raw(text);
    return;
  }
  const m = /^([\w-]+):([ \t]+)(.*?)([ \t]*)$/.exec(text);
  if (m === null || !keys.includes(m[1]) || m[3] === ``) {
    builder.raw(text);
    return;
  }
  const scalar = parseYamlScalar(m[3]);
  if (!scalar.ok) {
    builder.raw(text);
    return;
  }
  builder.raw(`${m[1]}:${m[2]}`);
  builder.yamlValue(scalar.inner, m[3]);
  builder.raw(m[4]);
}

// One row of a table: pipes stay raw, each cell is translated on its own
function handleTableRow(builder: Builder, text: string): void {
  const prefix = /^(?:[ \t]*>[ \t]?)*/.exec(text)?.[0] ?? ``;
  builder.raw(prefix);
  const cells = splitCells(text.slice(prefix.length));
  cells.forEach((cell, index) => {
    if (index > 0) builder.raw(`|`);
    builder.text(cell);
  });
}

// One ordinary line: block prefixes (quote, heading, list, task, callout) stay raw
function handleBlockLine(builder: Builder, text: string): void {
  const quote = /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(text)?.[0] ?? ``;
  let protectedPrefix = quote;
  let rest = text.slice(quote.length);

  // Lines that carry no translatable text at all
  if (
    /^\^[\w-]+[ \t]*$/.test(rest) ||
    /^([-*_])([ \t]*\1){2,}[ \t]*$/.test(rest) ||
    /^(=+|-+)[ \t]*$/.test(rest) ||
    /^\[[^\]]+\]:[ \t]*\S+(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/.test(rest)
  ) {
    builder.raw(text);
    return;
  }

  // Callout marker such as [!note]- (only inside a blockquote)
  if (quote.includes(`>`)) {
    const callout = /^\[![\w-]+\][+-]?(?:[ \t]+|$)/.exec(rest);
    if (callout !== null) {
      protectedPrefix += callout[0];
      rest = rest.slice(callout[0].length);
    }
  }

  const heading = /^#{1,6}[ \t]+/.exec(rest);
  if (heading !== null) {
    protectedPrefix += heading[0];
    rest = rest.slice(heading[0].length);
  } else {
    const list = /^(?:[-*+]|\d{1,9}[.)])[ \t]+/.exec(rest);
    if (list !== null) {
      protectedPrefix += list[0];
      rest = rest.slice(list[0].length);
      const task = /^\[[^\]\n]\][ \t]+/.exec(rest);
      if (task !== null) {
        protectedPrefix += task[0];
        rest = rest.slice(task[0].length);
      }
    } else {
      const footnote = /^\[\^[^\]]+\]:[ \t]+/.exec(rest);
      if (footnote !== null) {
        protectedPrefix += footnote[0];
        rest = rest.slice(footnote[0].length);
      }
    }
  }

  // Trailing part kept raw: closing heading hashes, block identifier, hard line break
  let tail = ``;
  if (heading !== null) {
    const closing = /[ \t]+#+[ \t]*$/.exec(rest);
    if (closing !== null) {
      tail = closing[0];
      rest = rest.slice(0, closing.index);
    }
  }
  const end = /(?:[ \t]+\^[A-Za-z0-9-]+)?[ \t]*\\?[ \t]*$/.exec(rest);
  if (end !== null && end[0] !== ``) {
    tail = end[0] + tail;
    rest = rest.slice(0, end.index);
  }

  builder.raw(protectedPrefix);
  builder.text(rest);
  builder.raw(tail);
}

// A translation that was refused, with the reason
export interface RejectedSegment {
  id: number;
  reason: `missing` | `empty` | `newline` | `placeholders`;
}

export interface RebuildResult {
  // The document with accepted translations in place; rejected segments keep their source text
  text: string;
  rejected: RejectedSegment[];
}

// Tolerate spaces added by a translator inside a placeholder
export function normalizePlaceholders(text: string): string {
  return text.replace(/\u27E6\s*(\d+)\s*\u27E7/g, `\u27E6$1\u27E7`);
}

// Check one translation against its segment; returns the reason of the refusal, or null
export function validateTranslation(segment: Segment, translated: string | undefined): RejectedSegment[`reason`] | null {
  if (translated === undefined) return `missing`;
  const value = normalizePlaceholders(translated).trim();
  if (value === ``) return `empty`;
  // One line in, one line out: the layout of the note depends on it
  if (/[\r\n]/.test(value)) return `newline`;
  const seen = new Array<number>(segment.tokens.length).fill(0);
  for (const m of value.matchAll(PLACEHOLDER_PATTERN)) {
    const n = Number(m[1]);
    if (n >= seen.length) return `placeholders`;
    seen[n]++;
  }
  return seen.every((count) => count === 1) ? null : `placeholders`;
}

// Format a translated frontmatter value as a double-quoted YAML string
function toYamlString(value: string): string {
  return `"${value.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`)}"`;
}

// Rebuild the note from its parts, using the given translations (segment id to text)
export function rebuildDocument(parsed: ParsedDocument, translations: ReadonlyMap<number, string>): RebuildResult {
  const rejected: RejectedSegment[] = [];
  let out = ``;
  for (const part of parsed.parts) {
    if (part.kind === `raw`) {
      out += part.text;
      continue;
    }
    const segment = parsed.segments[part.id];
    const translated = translations.get(segment.id);
    const reason = validateTranslation(segment, translated);
    if (reason !== null) {
      // A missing translation is simply not translated yet; other reasons are reported
      if (reason !== `missing`) rejected.push({ id: segment.id, reason });
      out += segment.source;
      continue;
    }
    const clean = normalizePlaceholders(translated as string).trim();
    out += segment.kind === `yaml` ? toYamlString(clean) : restoreInline(clean, segment.tokens);
  }
  return { text: out, rejected };
}

// Signature of the block structure of a line (blank, quote depth, heading, list marker)
function lineSignature(line: string): string {
  const m = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:#{1,6}(?=\s)|[-*+](?=\s)|\d{1,9}[.)](?=\s))?/.exec(line);
  return `${line.trim() === `` ? `blank` : `text`}|${m?.[0].replace(/\s+/g, ` `) ?? ``}`;
}

// Safety check before writing: same number of lines and same block structure line by line.
// Returns the index of the first differing line, or -1 when the structure is identical.
export function findStructureMismatch(original: string, rebuilt: string): number {
  const a = original.split(/\r?\n/);
  const b = rebuilt.split(/\r?\n/);
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    if (lineSignature(a[i]) !== lineSignature(b[i])) return i;
  }
  return -1;
}
