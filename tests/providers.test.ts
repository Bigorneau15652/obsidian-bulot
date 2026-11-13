// Tests for the Google and local server providers and the provider registry.
import { beforeEach, describe, expect, it } from "vitest";
import { parseDocument, rebuildDocument } from "../src/markdown";
import { GoogleProvider, decodeFromGoogle, encodeForGoogle, googleLanguageCode } from "../src/providers/google";
import { LocalProvider, isPrivateHost, validateEndpoint } from "../src/providers/local";
import { createProvider, isConfigured, isLocalProvider, ProviderSettings } from "../src/providers";
import { parseJsonArray } from "../src/providers/shared";
import { TranslateContext } from "../src/providers/types";
import { StubRequest, stubState } from "./obsidian-stub";

const context: TranslateContext = { targetLanguage: `French`, targetCode: `fr`, signal: new AbortController().signal };

describe(`Google encoding`, () => {
  it(`escapes markup and protects placeholders`, () => {
    expect(encodeForGoogle(`a < b & c ⟦0⟧ end`)).toBe(`a &lt; b &amp; c <span translate="no">⟦0⟧</span> end`);
  });

  it(`decodes the answer, dropping tags and reading entities`, () => {
    expect(decodeFromGoogle(`a &lt; b &amp; c <span translate="no">⟦0⟧</span> d&#39;e &quot;f&quot;`)).toBe(`a < b & c ⟦0⟧ d'e "f"`);
  });

  it(`gives back the original text after an encode and decode round trip`, () => {
    const text = `Tom & Jerry <b> said ⟦0⟧ "hello" it's`;
    expect(decodeFromGoogle(encodeForGoogle(text))).toBe(text);
  });

  it(`maps the Chinese code`, () => {
    expect(googleLanguageCode(`zh`)).toBe(`zh-CN`);
    expect(googleLanguageCode(`fr`)).toBe(`fr`);
  });
});

describe(`GoogleProvider`, () => {
  let seen: StubRequest | null;
  beforeEach(() => {
    seen = null;
    stubState.handler = (request) => {
      seen = request;
      return { status: 200, json: { data: { translations: [{ translatedText: `bonjour <span translate="no">⟦0⟧</span>` }] } } };
    };
  });

  it(`sends the key in a header and decodes the translations`, async () => {
    const provider = new GoogleProvider(() => `g-key`);
    expect(await provider.translate([`hello ⟦0⟧`], context)).toEqual([`bonjour ⟦0⟧`]);
    const sent = seen as unknown as StubRequest;
    expect(sent.url).toBe(`https://translation.googleapis.com/language/translate/v2`);
    expect(sent.url).not.toContain(`g-key`);
    expect(sent.headers?.[`x-goog-api-key`]).toBe(`g-key`);
    const body = JSON.parse(sent.body as string);
    expect(body).toMatchObject({ target: `fr`, format: `html` });
    expect(body.q).toEqual([`hello <span translate="no">⟦0⟧</span>`]);
  });

  it(`reports a missing key without any request`, async () => {
    const provider = new GoogleProvider(() => null);
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `auth` });
    expect(seen).toBeNull();
  });

  it(`treats an invalid key (400) and a forbidden call (403) as authentication errors`, async () => {
    const provider = new GoogleProvider(() => `g-key`);
    stubState.handler = () => ({ status: 400, json: { error: { message: `API key not valid. Please pass a valid API key.` } } });
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `auth` });
    stubState.handler = () => ({ status: 403, json: { error: { message: `Cloud Translation API has not been used in project` } } });
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `auth` });
    stubState.handler = () => ({ status: 400, json: { error: { message: `Invalid Value` } } });
    await expect(provider.translate([`hello`], context)).rejects.toMatchObject({ kind: `other` });
  });

  it(`reports a format error when the count differs`, async () => {
    const provider = new GoogleProvider(() => `g-key`);
    await expect(provider.translate([`a`, `b`], context)).rejects.toMatchObject({ kind: `format` });
  });

  it(`keeps a note layout intact end to end with an html style answer`, async () => {
    stubState.handler = (request) => {
      const q = (JSON.parse(request.body as string) as { q: string[] }).q;
      return { status: 200, json: { data: { translations: q.map((text) => ({ translatedText: text.toUpperCase().replace(/TRANSLATE="NO"/g, `translate="no"`).replace(/SPAN/g, `span`).replace(/&AMP;/g, `&amp;`) })) } } };
    };
    const provider = new GoogleProvider(() => `g-key`);
    const parsed = parseDocument(`Some **bold** text & more\n`);
    const out = new Map<number, string>();
    const texts = parsed.segments.map((s) => s.text);
    (await provider.translate(texts, context)).forEach((t, i) => out.set(i, t));
    expect(rebuildDocument(parsed, out).text).toBe(`SOME **BOLD** TEXT & MORE\n`);
  });
});

describe(`local server address checks`, () => {
  it(`accepts https anywhere and http on this computer or the local network`, () => {
    expect(validateEndpoint(`https://api.example.com/v1`)).toBeNull();
    expect(validateEndpoint(`http://localhost:11434/v1`)).toBeNull();
    expect(validateEndpoint(`http://127.0.0.1:1234/v1`)).toBeNull();
    expect(validateEndpoint(`http://192.168.1.20:11434/v1`)).toBeNull();
    expect(validateEndpoint(`http://10.0.0.5:8000/v1`)).toBeNull();
    expect(validateEndpoint(`http://172.20.1.1/v1`)).toBeNull();
    expect(validateEndpoint(`http://mon-pc:11434/v1`)).toBeNull();
    expect(validateEndpoint(`http://studio.local:1234/v1`)).toBeNull();
  });

  it(`refuses plain http over the internet and nonsense`, () => {
    expect(validateEndpoint(`http://example.com/v1`)).toBe(`insecure`);
    expect(validateEndpoint(`http://172.32.0.1/v1`)).toBe(`insecure`);
    expect(validateEndpoint(`ftp://localhost/v1`)).toBe(`invalid`);
    expect(validateEndpoint(`not a url`)).toBe(`invalid`);
    expect(validateEndpoint(``)).toBe(`invalid`);
  });

  it(`tells private hosts from public ones`, () => {
    expect(isPrivateHost(`localhost`)).toBe(true);
    expect(isPrivateHost(`[::1]`)).toBe(true);
    expect(isPrivateHost(`8.8.8.8`)).toBe(false);
    expect(isPrivateHost(`api.example.com`)).toBe(false);
  });
});

describe(`LocalProvider`, () => {
  const answer = (content: string) => ({ status: 200, json: { choices: [{ message: { content } }] } });

  it(`calls the chat completions endpoint and reads the translations`, async () => {
    let seen: StubRequest | null = null;
    stubState.handler = (request) => {
      seen = request;
      return answer(`Voici : ["bonjour"]`);
    };
    const provider = new LocalProvider(`http://localhost:11434/v1/`, `llama3.1:8b`, () => null);
    expect(await provider.translate([`hello`], context)).toEqual([`bonjour`]);
    const sent = seen as unknown as StubRequest;
    expect(sent.url).toBe(`http://localhost:11434/v1/chat/completions`);
    expect(sent.headers).toEqual({});
    expect(JSON.parse(sent.body as string)).toMatchObject({ model: `llama3.1:8b`, temperature: 0, stream: false });
  });

  it(`adds the optional key as a bearer header`, async () => {
    let seen: StubRequest | null = null;
    stubState.handler = (request) => {
      seen = request;
      return answer(`["bonjour"]`);
    };
    await new LocalProvider(`http://localhost:1234/v1`, `m`, () => `abc`).translate([`hello`], context);
    expect((seen as unknown as StubRequest).headers?.Authorization).toBe(`Bearer abc`);
  });

  it(`refuses an insecure address or a missing model before any request`, async () => {
    let requests = 0;
    stubState.handler = () => {
      requests++;
      return answer(`["x"]`);
    };
    await expect(new LocalProvider(`http://example.com/v1`, `m`, () => null).translate([`a`], context)).rejects.toMatchObject({ kind: `auth` });
    await expect(new LocalProvider(`http://localhost:1/v1`, ` `, () => null).translate([`a`], context)).rejects.toMatchObject({ kind: `auth` });
    expect(requests).toBe(0);
  });

  it(`maps a failure to reach the server to a network error`, async () => {
    stubState.handler = () => {
      throw new Error(`ECONNREFUSED`);
    };
    await expect(new LocalProvider(`http://localhost:11434/v1`, `m`, () => null).translate([`a`], context)).rejects.toMatchObject({ kind: `network` });
  });

  it(`reports unusable answers as format errors`, async () => {
    stubState.handler = () => answer(`I cannot do that`);
    const provider = new LocalProvider(`http://localhost:11434/v1`, `m`, () => null);
    await expect(provider.translate([`a`], context)).rejects.toMatchObject({ kind: `format` });
    stubState.handler = () => ({ status: 200, json: {} });
    await expect(provider.translate([`a`], context)).rejects.toMatchObject({ kind: `format` });
  });
});

describe(`parseJsonArray with chatty models`, () => {
  it(`finds the array inside a sentence`, () => {
    expect(parseJsonArray(`Here is the result: ["a", "b"] Hope it helps!`)).toEqual([`a`, `b`]);
  });
});

describe(`provider registry`, () => {
  const settings: ProviderSettings = {
    anthropicModel: `claude-haiku-5-5`,
    anthropicSecretName: `a`,
    googleSecretName: `g`,
    localSecretName: ``,
    localBaseUrl: `http://localhost:11434/v1`,
    localModel: `llama3.1:8b`,
  };
  const secrets: Record<string, string> = { a: `key-a`, g: `` };
  const read = (name: string): string | null => secrets[name] ?? null;

  it(`knows which services are configured`, () => {
    expect(isConfigured(`anthropic`, settings, read)).toBe(true);
    expect(isConfigured(`google`, settings, read)).toBe(false);
    expect(isConfigured(`local`, settings, read)).toBe(true);
    expect(isConfigured(`local`, { ...settings, localModel: `` }, read)).toBe(false);
    expect(isConfigured(`local`, { ...settings, localBaseUrl: `http://example.com/v1` }, read)).toBe(false);
  });

  it(`considers a service local only when its address is private`, () => {
    expect(isLocalProvider(`local`, settings)).toBe(true);
    expect(isLocalProvider(`local`, { ...settings, localBaseUrl: `https://api.example.com/v1` })).toBe(false);
    expect(isLocalProvider(`anthropic`, settings)).toBe(false);
    expect(isLocalProvider(`google`, settings)).toBe(false);
  });

  it(`builds the right provider for each service`, () => {
    expect(createProvider(`anthropic`, settings, read).id).toBe(`anthropic`);
    expect(createProvider(`google`, settings, read).id).toBe(`google`);
    expect(createProvider(`local`, settings, read).id).toBe(`local`);
  });
});
