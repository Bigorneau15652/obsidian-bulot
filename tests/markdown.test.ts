// Tests for the Markdown protection layer: what is translated, what is protected,
// and the guarantee that the note layout always survives a translation round trip.
import { describe, expect, it } from "vitest";
import {
  findStructureMismatch,
  parseDocument,
  protectInline,
  rebuildDocument,
  restoreInline,
  validateTranslation,
} from "../src/markdown";

// A single backtick, so test notes can contain code without escaping trouble
const BT = String.fromCharCode(96);
const FENCE = BT.repeat(3);

// Texts that would be sent to a translator for a given note
function texts(source: string, frontmatterKeys: string[] = []): string[] {
  return parseDocument(source, { frontmatterKeys }).segments.map((s) => s.text);
}

// Pretend translator: upper-cases everything (placeholders contain no letters, so they survive)
function shout(source: string, frontmatterKeys: string[] = []): string {
  const parsed = parseDocument(source, { frontmatterKeys });
  const translations = new Map(parsed.segments.map((s) => [s.id, s.text.toUpperCase()] as [number, string]));
  return rebuildDocument(parsed, translations).text;
}

// Identity translator: gives back each segment unchanged
function identity(source: string, frontmatterKeys: string[] = []): string {
  const parsed = parseDocument(source, { frontmatterKeys });
  const translations = new Map(parsed.segments.map((s) => [s.id, s.text] as [number, string]));
  return rebuildDocument(parsed, translations).text;
}

const SAMPLE = [
  `---`,
  `title: Heating plan`,
  `tags: [energy, building]`,
  `---`,
  `# Main title`,
  ``,
  `Some **bold** text with ${BT}inline code${BT} and a [[Other note|display text]] plus a [site](https://example.com/a_b).`,
  ``,
  `- first item ^abc123`,
  `  - [ ] a nested task`,
  `1. numbered item`,
  ``,
  `> [!warning]- Careful here`,
  `> quoted sentence with a #tag and \$x^2\$ math.`,
  ``,
  `| Name | Value |`,
  `| ---- | ----- |`,
  `| Boiler | 12 kW |`,
  ``,
  `${FENCE}js`,
  `const text = \`not translated\`;`,
  `${FENCE}`,
  ``,
  `$$`,
  `E = mc^2`,
  `$$`,
  ``,
  `Final line with a footnote[^1] and a bare link https://example.com/path.`,
  ``,
  `[^1]: The footnote text.`,
  ``,
].join(`\n`);

describe(`round trip`, () => {
  it(`gives back the exact note when nothing is translated`, () => {
    const parsed = parseDocument(SAMPLE);
    expect(rebuildDocument(parsed, new Map()).text).toBe(SAMPLE);
  });

  it(`gives back the exact note when segments are returned unchanged`, () => {
    expect(identity(SAMPLE)).toBe(SAMPLE);
    expect(identity(SAMPLE, [`title`])).toBe(SAMPLE.replace(`title: Heating plan`, `title: "Heating plan"`));
  });

  it(`keeps the block structure when text is changed`, () => {
    const result = shout(SAMPLE);
    expect(findStructureMismatch(SAMPLE, result)).toBe(-1);
    // Code, math and links are untouched by the pretend translator
    expect(result).toContain(`const text = \`not translated\`;`);
    expect(result).toContain(`E = mc^2`);
    expect(result).toContain(`[[Other note|DISPLAY TEXT]]`);
    expect(result).toContain(`https://example.com/a_b`);
  });

  it(`keeps Windows line endings`, () => {
    const crlf = `# Title\r\n\r\nSome text.\r\n`;
    expect(identity(crlf)).toBe(crlf);
    expect(shout(crlf)).toBe(`# TITLE\r\n\r\nSOME TEXT.\r\n`);
  });

  it(`survives random Markdown-like input (fixed seed, 400 notes)`, () => {
    const pieces = [
      `# `, `## `, `- `, `* `, `1. `, `> `, `> [!note] `, `- [ ] `, `| `, ` | `, `|---|---|`, `---`,
      FENCE, `~~~`, BT, `$`, `$$`, `%%`, `<!--`, `-->`, `**`, `_`, `[[`, `]]`, `](`, `)`, `[`, `]`,
      `#tag`, `^id`, `text`, `Hello world`, `  `, `\\`, `⟦`, `⟧`, `\n`, `\n`, `\r\n`, `http://x.io/a`, `é`, `日本語`,
    ];
    // Small deterministic pseudo random generator so failures can be reproduced
    let state = 12345;
    const next = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state;
    };
    for (let n = 0; n < 400; n++) {
      let note = ``;
      const length = 5 + (next() % 40);
      for (let k = 0; k < length; k++) note += pieces[next() % pieces.length];
      expect(identity(note), JSON.stringify(note)).toBe(note);
      expect(findStructureMismatch(note, shout(note)), JSON.stringify(note)).toBe(-1);
    }
  });
});

describe(`what is translated`, () => {
  it(`sends headings, list items, tasks and quotes without their markers`, () => {
    expect(texts(`# Main title`)).toEqual([`Main title`]);
    expect(texts(`- first item`)).toEqual([`first item`]);
    expect(texts(`  - [x] done task`)).toEqual([`done task`]);
    expect(texts(`1. numbered`)).toEqual([`numbered`]);
    expect(texts(`> a quote`)).toEqual([`a quote`]);
    expect(texts(`> > nested quote`)).toEqual([`nested quote`]);
  });

  it(`keeps the callout type and translates its title`, () => {
    const parsed = parseDocument(`> [!warning]- Careful here\n> body`);
    expect(parsed.segments.map((s) => s.text)).toEqual([`Careful here`, `body`]);
    expect(parsed.parts[0]).toEqual({ kind: `raw`, text: `> [!warning]- ` });
  });

  it(`translates table cells one by one and keeps the separator row`, () => {
    const table = `| Name | Value |\n| --- | --- |\n| Boiler | 12 kW |\n`;
    expect(texts(table)).toEqual([`Name`, `Value`, `Boiler`, `12 kW`]);
    expect(identity(table)).toBe(table);
  });

  it(`does not touch code blocks, math blocks, comments and horizontal rules`, () => {
    const note = [`${FENCE}\nsome code words\n${FENCE}`, `$$\nsome math words\n$$`, `%%\nhidden words\n%%`, `<!--\nhtml words\n-->`, `---`].join(`\n`);
    expect(texts(note)).toEqual([]);
  });

  it(`ignores lines that only hold numbers or symbols`, () => {
    expect(texts(`2024-01-01\n\n12.5 %\n`)).toEqual([]);
  });

  it(`translates frontmatter values only for the listed keys`, () => {
    const note = `---\ntitle: Heating plan\nauthor: Someone\n---\nBody text\n`;
    expect(texts(note)).toEqual([`Body text`]);
    expect(texts(note, [`title`])).toEqual([`Heating plan`, `Body text`]);
  });

  it(`writes translated frontmatter values as safe quoted YAML`, () => {
    const parsed = parseDocument(`---\ntitle: Heating plan\n---\n`, { frontmatterKeys: [`title`] });
    const out = rebuildDocument(parsed, new Map([[0, `Plan: "chauffage"`]])).text;
    expect(out).toBe(`---\ntitle: "Plan: \\"chauffage\\""\n---\n`);
  });
});

describe(`what is protected inside a line`, () => {
  it(`protects inline code, links targets, embeds and wikilinks without alias`, () => {
    const { text, tokens } = protectInline(`See ${BT}npm run build${BT}, [[Note A]] and ![[image.png]] then [the doc](https://x.io/y) please`);
    expect(text).toBe(`See ⟦0⟧, ⟦1⟧ and ⟦2⟧ then ⟦3⟧the doc⟦4⟧ please`);
    expect(restoreInline(text, tokens)).toBe(`See ${BT}npm run build${BT}, [[Note A]] and ![[image.png]] then [the doc](https://x.io/y) please`);
  });

  it(`translates only the displayed text of an aliased wikilink`, () => {
    const { text, tokens } = protectInline(`Go to [[Folder/Note#Part|the part]] now`);
    expect(text).toBe(`Go to ⟦0⟧the part⟦1⟧ now`);
    expect(tokens).toEqual([`[[Folder/Note#Part|`, `]]`]);
  });

  it(`protects math but not currency`, () => {
    expect(protectInline(`The value $x^2$ is small`).text).toBe(`The value ⟦0⟧ is small`);
    expect(protectInline(`It costs $5 and then $6 more`).text).toBe(`It costs $5 and then $6 more`);
  });

  it(`protects tags, footnote references, bare urls and block identifiers`, () => {
    expect(protectInline(`Tagged #energy/heating here`).text).toBe(`Tagged ⟦0⟧ here`);
    expect(protectInline(`A fact[^2] stated`).text).toBe(`A fact⟦0⟧ stated`);
    expect(protectInline(`Visit https://example.com/a?b=1, then leave`).text).toBe(`Visit ⟦0⟧, then leave`);
    expect(protectInline(`A sentence ^blk-1`).text).toBe(`A sentence ⟦0⟧`);
  });

  it(`does not read snake_case or issue numbers as markup`, () => {
    expect(protectInline(`use my_variable_name here`).text).toBe(`use my_variable_name here`);
    expect(protectInline(`issue #123 is open`).text).toBe(`issue #123 is open`);
  });

  it(`protects emphasis markers and merges adjacent protected pieces`, () => {
    const { text, tokens } = protectInline(`**Bold** and ${BT}a${BT}${BT}b${BT}`);
    expect(text).toBe(`⟦0⟧Bold⟦1⟧ and ⟦2⟧`);
    expect(tokens).toEqual([`**`, `**`, `${BT}a${BT}${BT}b${BT}`]);
  });

  it(`protects placeholder characters found in the note itself`, () => {
    const { text, tokens } = protectInline(`odd ⟦0⟧ character`);
    expect(restoreInline(text, tokens)).toBe(`odd ⟦0⟧ character`);
    // Each literal delimiter is replaced by a real placeholder, so no ambiguity is possible
    expect(text).toBe(`odd ⟦0⟧0⟦1⟧ character`);
  });
});

describe(`checking translations`, () => {
  const parsed = parseDocument(`A **bold** word`);
  const segment = parsed.segments[0];

  it(`accepts a translation that keeps every placeholder once, in any order`, () => {
    expect(validateTranslation(segment, `Un mot ⟦0⟧gras⟦1⟧`)).toBeNull();
    expect(validateTranslation(segment, `⟦1⟧ ⟦0⟧`)).toBeNull();
  });

  it(`tolerates spaces added inside a placeholder`, () => {
    expect(validateTranslation(segment, `Un mot ⟦ 0 ⟧gras⟦ 1 ⟧`)).toBeNull();
  });

  it(`refuses lost, duplicated or invented placeholders`, () => {
    expect(validateTranslation(segment, `Un mot gras`)).toBe(`placeholders`);
    expect(validateTranslation(segment, `⟦0⟧ ⟦0⟧ ⟦1⟧`)).toBe(`placeholders`);
    expect(validateTranslation(segment, `⟦0⟧ ⟦1⟧ ⟦5⟧`)).toBe(`placeholders`);
  });

  it(`refuses empty answers and answers spanning several lines`, () => {
    expect(validateTranslation(segment, `   `)).toBe(`empty`);
    expect(validateTranslation(segment, `⟦0⟧ a\nb ⟦1⟧`)).toBe(`newline`);
    expect(validateTranslation(segment, undefined)).toBe(`missing`);
  });

  it(`keeps the original text of a refused segment and reports it`, () => {
    const result = rebuildDocument(parsed, new Map([[0, `broken answer`]]));
    expect(result.text).toBe(`A **bold** word`);
    expect(result.rejected).toEqual([{ id: 0, reason: `placeholders` }]);
  });
});

describe(`structure check`, () => {
  it(`detects a changed number of lines or a lost marker`, () => {
    expect(findStructureMismatch(`# A\n- b\n`, `# A\n- b\n`)).toBe(-1);
    expect(findStructureMismatch(`# A\n- b\n`, `# A\nb\n`)).toBe(1);
    expect(findStructureMismatch(`a\nb\n`, `a\nb\nc\n`)).toBeGreaterThanOrEqual(0);
  });
});
