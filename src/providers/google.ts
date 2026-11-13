// Google Cloud Translation provider (Basic edition, API version 2).
import { requestUrl } from "obsidian";
import { PLACEHOLDER_PATTERN } from "../markdown/inline";
import { errorDetail, kindFromStatus } from "./shared";
import { ProviderError, TranslateContext, TranslationProvider } from "./types";

const API_URL = `https://translation.googleapis.com/language/translate/v2`;

// Google uses a regional code for simplified Chinese
export function googleLanguageCode(code: string): string {
  return code === `zh` ? `zh-CN` : code;
}

// Turn a segment into the HTML that Google expects: markup characters are escaped and every
// placeholder is wrapped in a span that Google is told not to translate
export function encodeForGoogle(text: string): string {
  const escaped = text.replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`);
  return escaped.replace(PLACEHOLDER_PATTERN, (all) => `<span translate="no">${all}</span>`);
}

const NAMED_ENTITIES: Record<string, string> = { amp: `&`, lt: `<`, gt: `>`, quot: `"`, apos: `'`, nbsp: ` ` };

// Reverse of encodeForGoogle: drop the tags Google may have added or kept, then decode entities
export function decodeFromGoogle(html: string): string {
  const withoutTags = html.replace(/<\/?[A-Za-z][^<>]*>/g, ``);
  return withoutTags.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([A-Za-z]+));/g, (all, dec?: string, hex?: string, name?: string) => {
    if (dec !== undefined) return String.fromCodePoint(Number(dec));
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED_ENTITIES[name ?? ``] ?? all;
  });
}

export class GoogleProvider implements TranslationProvider {
  readonly id = `google` as const;
  readonly label = `Google Cloud Translation`;

  // The key is read at call time from Obsidian secret storage
  constructor(private readonly readKey: () => string | null) {}

  async translate(texts: readonly string[], context: TranslateContext): Promise<string[]> {
    const key = this.readKey();
    if (key === null || key.trim() === ``) {
      throw new ProviderError(`auth`, `No API key configured`);
    }
    if (context.signal.aborted) {
      throw new ProviderError(`other`, `Cancelled`);
    }

    let response;
    try {
      response = await requestUrl({
        url: API_URL,
        method: `POST`,
        contentType: `application/json`,
        // The key goes in a header, not in the address, so it never appears in logs
        headers: { "x-goog-api-key": key.trim() },
        body: JSON.stringify({ q: texts.map(encodeForGoogle), target: googleLanguageCode(context.targetCode), format: `html` }),
        throw: false,
      });
    } catch {
      throw new ProviderError(`network`, `Network error while contacting Google`);
    }

    if (response.status >= 400) {
      const detail = errorDetail(response.json);
      // Google reports an invalid key as a 400 error
      const kind = response.status === 400 && /api key/i.test(detail) ? `auth` : kindFromStatus(response.status);
      throw new ProviderError(kind, `Google error ${response.status}${detail ? `: ${detail}` : ``}`);
    }

    const translations = (response.json as { data?: { translations?: Array<{ translatedText?: unknown }> } }).data?.translations ?? [];
    if (translations.length !== texts.length || !translations.every((t) => typeof t.translatedText === `string`)) {
      throw new ProviderError(`format`, `Expected ${texts.length} translations, received ${translations.length}`);
    }
    return translations.map((t) => decodeFromGoogle(t.translatedText as string));
  }
}
