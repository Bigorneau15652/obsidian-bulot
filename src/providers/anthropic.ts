// Anthropic (Claude) translation provider, using the Messages API.
import { requestUrl } from "obsidian";
import { SYSTEM_PROMPT, buildUserMessage, errorDetail, kindFromStatus, parseJsonArray } from "./shared";
import { ProviderError, TranslateContext, TranslationProvider } from "./types";

const API_URL = `https://api.anthropic.com/v1/messages`;
const API_VERSION = `2023-06-01`;

// Models offered in the settings (first one is the default)
export const ANTHROPIC_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: `claude-haiku-5-5`, label: `Claude Haiku 5.5` },
  { id: `claude-sonnet-5-5`, label: `Claude Sonnet 5.5` },
  { id: `claude-opus-5-5`, label: `Claude Opus 5.5` },
];
export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODELS[0].id;

export class AnthropicProvider implements TranslationProvider {
  readonly id = `anthropic` as const;
  readonly label = `Anthropic`;

  // The key is read at call time from Obsidian secret storage, never kept in memory longer than needed
  constructor(
    private readonly readKey: () => string | null,
    private readonly model: string
  ) {}

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
        headers: { "x-api-key": key.trim(), "anthropic-version": API_VERSION },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [
            { role: `user`, content: buildUserMessage(texts, context.targetLanguage) },
          ],
        }),
        // Handle HTTP errors ourselves so the message never leaks request headers
        throw: false,
      });
    } catch {
      throw new ProviderError(`network`, `Network error while contacting Anthropic`);
    }

    if (response.status >= 400) {
      const detail = errorDetail(response.json);
      throw new ProviderError(kindFromStatus(response.status), `Anthropic error ${response.status}${detail ? `: ${detail}` : ``}`);
    }

    const blocks = (response.json as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const answer = blocks.filter((b) => b.type === `text`).map((b) => b.text ?? ``).join(``);
    const translated = parseJsonArray(answer);
    if (translated.length !== texts.length) {
      throw new ProviderError(`format`, `Expected ${texts.length} translations, received ${translated.length}`);
    }
    return translated;
  }
}
