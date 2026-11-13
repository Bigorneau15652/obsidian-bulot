// Inline protection: replaces every piece of Markdown syntax that must never be
// translated (code, links targets, math, tags, emphasis markers...) by a numbered
// placeholder, so that a translation service only ever sees plain sentences.

// Placeholder delimiters. These characters are very rare in notes, and any
// occurrence found in a note is itself protected (see matchToken).
export const PLACEHOLDER_OPEN = `⟦`;
export const PLACEHOLDER_CLOSE = `⟧`;

// A single backtick, built from its char code so source files stay free of escaping problems
const BT = String.fromCharCode(96);

// Result of protecting one piece of text
export interface InlineResult {
  // Text with placeholders such as [[0]] in place of the protected pieces
  text: string;
  // Original protected strings, indexed by placeholder number
  tokens: string[];
}

// Build the placeholder string for token number n
export function placeholder(n: number): string {
  return `${PLACEHOLDER_OPEN}${n}${PLACEHOLDER_CLOSE}`;
}

// Matches any placeholder in a string (global, so use with replace or matchAll)
export const PLACEHOLDER_PATTERN = /⟦(\d+)⟧/g;

// True when the text still contains at least one letter once placeholders are removed
export function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text.replace(PLACEHOLDER_PATTERN, ``));
}

// Returns a matcher that only succeeds when the pattern matches exactly at index i
type Matcher = (input: string, i: number) => string | null;

function anchored(re: RegExp): Matcher {
  const flags = re.flags.includes(`y`) ? re.flags : `${re.flags}y`;
  const sticky = new RegExp(re.source, flags);
  return (input, i) => {
    sticky.lastIndex = i;
    const m = sticky.exec(input);
    return m ? m[0] : null;
  };
}

// True when the character is a letter or a digit (used for word boundary checks)
function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}]/u.test(c);
}

// Inline code span: a run of backticks, content, then a run of the same length
function matchInlineCode(input: string, i: number): string | null {
  let n = 1;
  while (input[i + n] === BT) n++;
  const fence = BT.repeat(n);
  let from = i + n;
  while (from < input.length) {
    const j = input.indexOf(fence, from);
    if (j === -1) break;
    const end = j + n;
    // The closing run must be exactly as long as the opening run
    if (input[j - 1] !== BT && input[end] !== BT) {
      return input.slice(i, end);
    }
    let k = j;
    while (input[k] === BT) k++;
    from = k;
  }
  // No closing run: only protect the opening run itself
  return fence;
}

// Fixed-shape matchers, grouped by the character they start with
const embed = anchored(/!\[\[[^\]\n]*\]\]/);
const wikiPlain = anchored(/\[\[[^\]|\n]*\]\]/);
const wikiAliasOpen = anchored(/\[\[[^\]|\n]*\|/);
const footnoteRef = anchored(/\[\^[^\]\n]+\]/);
const linkOpen = anchored(/!?\[(?=[^\[\]\n]*\][(\[])/);
const wikiClose = anchored(/\]\]/);
const linkTarget = anchored(/\]\([^)\n]*\)/);
const linkRef = anchored(/\]\[[^\]\n]*\]/);
const autolink = anchored(/<(?:https?:\/\/|mailto:)[^>\s]+>/);
const htmlComment = anchored(/<!--[\s\S]*?-->/);
const htmlTag = anchored(/<\/?[A-Za-z][^<>\n]*>/);
const displayMath = anchored(/\$\$[^$\n]+\$\$/);
const inlineMath = anchored(/\$(?:[^\s$\\]|[^\s$][^$\n]*[^\s$\\])\$(?!\d)/);
const obsidianComment = anchored(/%%[^\n]*?%%/);
const escapedChar = anchored(/\\[\\`*_{}\[\]()#+\-.!|~=<>$%^&@]/);
const entity = anchored(/&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/);
const emphasisRun = anchored(/\*{1,3}|~~|==/);
const underscoreRun = anchored(/_{1,3}/);
const tag = anchored(/#(?=[\p{L}\p{N}_\/-]*[\p{L}_\/-])[\p{L}\p{N}_\/-]+/u);
const blockId = anchored(/\^[A-Za-z0-9-]+$/);
const bareUrl = anchored(/(?:https?:\/\/|www\.)[^\s<>\]()]+/);
const inlineField = anchored(/[\w-]+::/);

// Try every protected construct at position i; returns the matched string or null
function matchToken(input: string, i: number): string | null {
  const c = input[i];
  const prev = i > 0 ? input[i - 1] : undefined;
  switch (c) {
    case BT:
      return matchInlineCode(input, i);
    case `!`:
      return embed(input, i) ?? linkOpen(input, i);
    case `[`:
      return wikiPlain(input, i) ?? wikiAliasOpen(input, i) ?? footnoteRef(input, i) ?? linkOpen(input, i);
    case `]`:
      return wikiClose(input, i) ?? linkTarget(input, i) ?? linkRef(input, i);
    case `<`:
      return autolink(input, i) ?? htmlComment(input, i) ?? htmlTag(input, i);
    case `$`:
      return displayMath(input, i) ?? inlineMath(input, i);
    case `%`:
      return obsidianComment(input, i);
    case `\\`:
      return escapedChar(input, i);
    case `&`:
      return entity(input, i);
    case `*`:
    case `~`:
    case `=`:
      return emphasisRun(input, i);
    case `_`: {
      // Underscores inside a word (snake_case) are not emphasis
      const run = underscoreRun(input, i);
      if (run === null) return null;
      const next = input[i + run.length];
      return isWordChar(prev) && isWordChar(next) ? null : run;
    }
    case `#`:
      // A tag must start a word
      return prev === undefined || /[\s(]/.test(prev) ? tag(input, i) : null;
    case `^`:
      // Block identifier at the very end of the text, after a space
      return prev !== undefined && /\s/.test(prev) ? blockId(input, i) : null;
    case PLACEHOLDER_OPEN:
    case PLACEHOLDER_CLOSE:
      // Literal placeholder characters from the note must never be confused with ours
      return c;
    default:
      break;
  }
  // Constructs that start with a letter, only at the beginning of a word
  if (c !== undefined && /[\p{L}\p{N}]/u.test(c) && !isWordChar(prev)) {
    const url = bareUrl(input, i);
    if (url !== null) {
      // Trailing punctuation belongs to the sentence, not to the address
      return url.replace(/[.,;:!?'"]+$/, ``);
    }
    return inlineField(input, i);
  }
  return null;
}

// Replace every protected construct of the input by a numbered placeholder.
// Adjacent protected pieces are merged into one placeholder.
export function protectInline(input: string): InlineResult {
  const tokens: string[] = [];
  let out = ``;
  let pending = ``;

  // Emit the accumulated protected pieces as one placeholder
  const flush = (): void => {
    if (pending !== ``) {
      out += placeholder(tokens.length);
      tokens.push(pending);
      pending = ``;
    }
  };

  let i = 0;
  while (i < input.length) {
    const hit = matchToken(input, i);
    if (hit !== null && hit.length > 0) {
      pending += hit;
      i += hit.length;
      continue;
    }
    flush();
    out += input[i];
    i++;
  }
  flush();
  return { text: out, tokens };
}

// Put the original protected strings back in place of the placeholders
export function restoreInline(text: string, tokens: readonly string[]): string {
  return text.replace(PLACEHOLDER_PATTERN, (_all, n: string) => tokens[Number(n)] ?? ``);
}
