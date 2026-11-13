// Tests for the translation pipeline and the Anthropic provider, using fake services.
import { beforeEach, describe, expect, it } from "vitest";
import { parseDocument } from "../src/markdown";
import { AnthropicProvider, parseJsonArray } from "../src/providers/anthropic";
import { ProviderError, TranslateContext, TranslationProvider } from "../src/providers/types";
import { MAX_BATCH_CHARS, MAX_BATCH_SEGMENTS, countCharacters, makeBatches, translateDocument } from "../src/translator";
import { stubState } from "./obsidian-stub";

// Fake provider whose behaviour is given by a function; records every call
function fakeProvider(behaviour: (texts: readonly string[], call: number) => string[] | ProviderError): TranslationProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    id: `anthropic`,
    label: `Fake`,
    calls,
    async translate(texts) {
      calls.push([...texts]);
      const out = behaviour(texts, calls.length);
      if (out instanceof ProviderError) throw out;
      return out;
    },
  };
}

const shout = (texts: readonly string[]): string[] => texts.map((t) => t.toUpperCase());
const noWait = async (): Promise<void> => undefined;
const run = (source: string, provider: TranslationProvider, signal = new AbortController().signal) =>
  translateDocument(parseDocument(source), { provider, targetLanguage: `French`, signal, sleep: noWait });

describe(`batching`, () => {
  it(`keeps every segment in exactly one batch within the limits`, () => {
    const note = Array.from({ length: 100 }, (_v, i) => `Sentence number ${i} with some words.`).join(`\n`);
    const parsed = parseDocument(note);
    const batches = makeBatches(parsed);
    expect(batches.flat()).toEqual(parsed.segments.map((s) => s.id));
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(MAX_BATCH_SEGMENTS);
      expect(batch.reduce((n, id) => n + parsed.segments[id].text.length, 0)).toBeLessThanOrEqual(MAX_BATCH_CHARS);
    }
    expect(countCharacters(parsed)).toBeGreaterThan(0);
  });
});

describe(`translateDocument`, () => {
  it(`translates the text and keeps the layout`, async () => {
    const provider = fakeProvider(shout);
    const outcome = await run(`# Title\n\nSome **bold** text.\n`, provider);
    expect(outcome.rebuilt.text).toBe(`# TITLE\n\nSOME **BOLD** TEXT.\n`);
    expect(outcome.failed).toBe(0);
    expect(outcome.fatal).toBeNull();
  });

  it(`retries a temporary error and then succeeds`, async () => {
    const provider = fakeProvider((texts, call) => (call < 3 ? new ProviderError(`rate`, `slow down`) : shout(texts)));
    const outcome = await run(`Hello there\n`, provider);
    expect(provider.calls).toHaveLength(3);
    expect(outcome.rebuilt.text).toBe(`HELLO THERE\n`);
  });

  it(`gives up after the retries and keeps the original text`, async () => {
    const provider = fakeProvider(() => new ProviderError(`server`, `down`));
    const outcome = await run(`Hello there\n`, provider);
    expect(provider.calls).toHaveLength(4);
    expect(outcome.rebuilt.text).toBe(`Hello there\n`);
    expect(outcome.failed).toBe(1);
  });

  it(`splits a batch with an unusable answer to isolate the bad segment`, async () => {
    const provider = fakeProvider((texts) => {
      if (texts.some((t) => t.includes(`poison`))) {
        return texts.length > 1 ? new ProviderError(`format`, `bad`) : new ProviderError(`format`, `still bad`);
      }
      return shout(texts);
    });
    const outcome = await run(`alpha\nbeta\npoison\ngamma\n`, provider);
    expect(outcome.rebuilt.text).toBe(`ALPHA\nBETA\npoison\nGAMMA\n`);
    expect(outcome.failed).toBe(1);
  });

  it(`stops at once on an authentication error and writes nothing translated`, async () => {
    const provider = fakeProvider(() => new ProviderError(`auth`, `bad key`));
    const note = Array.from({ length: 200 }, (_v, i) => `Line number ${i} of text`).join(`\n`);
    const outcome = await run(note, provider);
    expect(outcome.fatal?.kind).toBe(`auth`);
    expect(outcome.rebuilt.text).toBe(note);
    expect(provider.calls.length).toBeLessThanOrEqual(2);
  });

  it(`stops when cancelled`, async () => {
    const controller = new AbortController();
    const provider = fakeProvider((texts) => {
      controller.abort();
      return shout(texts);
    });
    const note = Array.from({ length: 200 }, (_v, i) => `Line number ${i} of text`).join(`\n`);
    const outcome = await run(note, provider, controller.signal);
    expect(outcome.cancelled).toBe(true);
    expect(provider.calls.length).toBeLessThan(makeBatches(parseDocument(note)).length);
  });

  it(`refuses a translation that lost a placeholder and keeps the source`, async () => {
    const provider = fakeProvider((texts) => texts.map((t) => t.replace(/⟦\d+⟧/g, ``)));
    const outcome = await run(`A **bold** word\n`, provider);
    expect(outcome.rebuilt.text).toBe(`A **bold** word\n`);
    expect(outcome.failed).toBe(1);
  });
});

describe(`parseJsonArray`, () => {
  it(`reads a plain array and an array inside a code fence`, () => {
    expect(parseJsonArray(`["a","b"]`)).toEqual([`a`, `b`]);
    expect(parseJsonArray(`${"```"}json\n["a"]\n${"```"}`)).toEqual([`a`]);
  });

  it(`rejects anything else`, () => {
    expect(() => parseJsonArray(`Sure, here it is`)).toThrow(ProviderError);
    expect(() => parseJsonArray(`{"a":1}`)).toThrow(ProviderError);
    expect(() => parseJsonArray(`[1,2]`)).toThrow(ProviderError);
  });
});

describe(`AnthropicProvider`, () => {
  const context: TranslateContext = { targetLanguage: `French`, signal: new AbortController().signal };
  const answer = (text: string) => ({ status: 200, json: { content: [{ type: `text`, text }] } });

  beforeEach(() => {
    stubState.handler = () => answer(`["bonjour"]`);
  });

  it(`sends the key and the model in the request and returns the translations`, async () => {
    let seen: { url: string; headers?: Record<string, string>; body?: string } | null = null;
    stubState.handler = (request) => {
      seen = request;
      return answer(`["bonjour"]`);
    };
    const provider = new AnthropicProvider(() => `secret-key`, `claude-haiku-5-5`);
    expect(await provider.translate([`hello`], context)).toEqual([`bonjour`]);
    const sent = seen as unknown as { url: string; headers: Record<string, string>; body: string };
    expect(sent.url).toBe(`https://api.anthropic.com/v1/messages`);
    expect(sent.headers[`x-api-key`]).toBe(`secret-key`);
    const body = JSON.parse(sent.body);
    expect(body.model).toBe(`claude-haiku-5-5`);
    expect(JSON.parse(body.messages[0].content)).toEqual({ target_language: `French`, segments: [`hello`] });
  });

  it(`fails with an auth error when no key is set, without any request`, async () => {
    let requests = 0;
    stubState.handler = () => {
      requests++;
      return answer(`[]`);
    };
    const provider = new AnthropicProvider(() => null, `claude-haiku-5-5`);
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `auth` });
    expect(requests).toBe(0);
  });

  it(`maps HTTP errors to error kinds and never exposes the key`, async () => {
    const provider = new AnthropicProvider(() => `secret-key`, `claude-haiku-5-5`);
    stubState.handler = () => ({ status: 401, json: { error: { message: `invalid x-api-key` } } });
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `auth` });
    stubState.handler = () => ({ status: 429, json: {} });
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `rate` });
    stubState.handler = () => ({ status: 529, json: {} });
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `server` });
    stubState.handler = () => ({ status: 400, json: {} });
    try {
      await provider.translate([`hello`], context);
    } catch (error) {
      expect(String(error)).not.toContain(`secret-key`);
    }
  });

  it(`reports a format error when the number of translations is wrong`, async () => {
    stubState.handler = () => answer(`["un","deux"]`);
    const provider = new AnthropicProvider(() => `secret-key`, `claude-haiku-5-5`);
    await expect(provider.translate([`one`], context)).rejects.toMatchObject({ kind: `format` });
  });
});
