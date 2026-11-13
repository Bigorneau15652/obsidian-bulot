// Common contract for every translation service. Adding a service means writing
// one class that implements TranslationProvider and registering it in index.ts.

// Identifiers of the available services
export type ProviderId = `anthropic` | `google` | `local`;

// Information given to a provider for each batch
export interface TranslateContext {
  // English name of the target language, for example `French`
  targetLanguage: string;
  // Language code of the target language, for example `fr`
  targetCode: string;
  // Cancellation signal of the whole translation
  signal: AbortSignal;
}

// Why a call failed; drives retries in the translator
export type ProviderErrorKind = `auth` | `rate` | `server` | `network` | `format` | `other`;

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = `ProviderError`;
    this.kind = kind;
  }

  // Temporary problems worth retrying after a short pause
  get retriable(): boolean {
    return this.kind === `rate` || this.kind === `server` || this.kind === `network`;
  }
}

export interface TranslationProvider {
  readonly id: ProviderId;
  // Name shown to the user
  readonly label: string;
  // Translate a batch of segments; the answer must have the same length and order
  translate(texts: readonly string[], context: TranslateContext): Promise<string[]>;
}
