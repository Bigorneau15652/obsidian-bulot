// Provider for any server that speaks the OpenAI chat completions protocol:
// Ollama, LM Studio, vLLM, llama.cpp server... running on this computer or on the local network.
import { requestUrl } from "obsidian";
import { SYSTEM_PROMPT, buildUserMessage, errorDetail, kindFromStatus, parseJsonArray } from "./shared";
import { ProviderError, TranslateContext, TranslationProvider } from "./types";

export const DEFAULT_LOCAL_URL = `http://localhost:11434/v1`;

// True when the host is this computer or a private network address
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ``);
  if (h === `localhost` || h === `::1` || h.endsWith(`.localhost`)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m !== null && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^169\.254\./.test(h)) return true;
  // Names without a dot (a computer name) and typical local suffixes
  return !h.includes(`.`) || h.endsWith(`.local`) || h.endsWith(`.lan`) || h.endsWith(`.home.arpa`);
}

// Check an endpoint address: https is always accepted, plain http only for this computer or the
// local network (text must never travel unencrypted over the internet). Returns a problem or null.
export function validateEndpoint(url: string): `invalid` | `insecure` | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `invalid`;
  }
  if (parsed.protocol === `https:`) return null;
  if (parsed.protocol === `http:`) return isPrivateHost(parsed.hostname) ? null : `insecure`;
  return `invalid`;
}

export class LocalProvider implements TranslationProvider {
  readonly id = `local` as const;
  readonly label = `Local server`;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    // Optional key, for servers that require one
    private readonly readKey: () => string | null
  ) {}

  async translate(texts: readonly string[], context: TranslateContext): Promise<string[]> {
    const problem = validateEndpoint(this.baseUrl);
    if (problem !== null) {
      throw new ProviderError(`auth`, problem === `insecure` ? `Plain http is only allowed for this computer or the local network` : `Invalid server address`);
    }
    if (this.model.trim() === ``) {
      throw new ProviderError(`auth`, `No model name configured`);
    }
    if (context.signal.aborted) {
      throw new ProviderError(`other`, `Cancelled`);
    }

    const headers: Record<string, string> = {};
    const key = this.readKey();
    if (key !== null && key.trim() !== ``) headers.Authorization = `Bearer ${key.trim()}`;

    let response;
    try {
      response = await requestUrl({
        url: `${this.baseUrl.replace(/\/+$/, ``)}/chat/completions`,
        method: `POST`,
        contentType: `application/json`,
        headers,
        body: JSON.stringify({
          model: this.model.trim(),
          temperature: 0,
          stream: false,
          messages: [
            { role: `system`, content: SYSTEM_PROMPT },
            { role: `user`, content: buildUserMessage(texts, context.targetLanguage) },
          ],
        }),
        throw: false,
      });
    } catch {
      throw new ProviderError(`network`, `Cannot reach the server. Check that it is running and that the address is correct`);
    }

    if (response.status >= 400) {
      const detail = errorDetail(response.json);
      throw new ProviderError(kindFromStatus(response.status), `Server error ${response.status}${detail ? `: ${detail}` : ``}`);
    }

    const content = (response.json as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== `string`) {
      throw new ProviderError(`format`, `The server answer has no text`);
    }
    const translated = parseJsonArray(content);
    if (translated.length !== texts.length) {
      throw new ProviderError(`format`, `Expected ${texts.length} translations, received ${translated.length}`);
    }
    return translated;
  }
}
