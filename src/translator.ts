// Translation pipeline: cuts a parsed note into batches, calls the provider with
// retries and automatic splitting, then rebuilds the note with safety checks.
import { ParsedDocument, RebuildResult, rebuildDocument } from "./markdown";
import { ProviderError, TranslationProvider } from "./providers/types";

// Limits of one request, to keep answers short and failures cheap to retry
export const MAX_BATCH_CHARS = 4000;
export const MAX_BATCH_SEGMENTS = 40;
// Number of requests running at the same time
const CONCURRENCY = 2;
// Pauses (in milliseconds) before each retry of a temporary failure
const RETRY_DELAYS = [1000, 3000, 8000];

export interface TranslateOptions {
  provider: TranslationProvider;
  targetLanguage: string;
  // Language code, for services that use codes instead of names
  targetCode: string;
  signal: AbortSignal;
  // Called after each batch with the number of segments finished so far
  onProgress?: (done: number, total: number) => void;
  // Waiting function, replaced in tests to avoid real delays
  sleep?: (ms: number) => Promise<void>;
}

export interface TranslateOutcome {
  rebuilt: RebuildResult;
  // Segments the service could not translate (kept in the original language)
  failed: number;
  // Set when the whole run stopped early because of a blocking error (for example a bad key)
  fatal: ProviderError | null;
  // Message of the last error that made a group of lines fail, to help the user understand
  lastError: string | null;
  cancelled: boolean;
}

// Number of characters that would be sent to the service
export function countCharacters(parsed: ParsedDocument): number {
  return parsed.segments.reduce((sum, s) => sum + s.text.length, 0);
}

// Group segment ids into batches bounded by size
export function makeBatches(parsed: ParsedDocument): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  for (const segment of parsed.segments) {
    const full = current.length >= MAX_BATCH_SEGMENTS || (current.length > 0 && chars + segment.text.length > MAX_BATCH_CHARS);
    if (full) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(segment.id);
    chars += segment.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Translate a whole parsed note and rebuild it
export async function translateDocument(parsed: ParsedDocument, options: TranslateOptions): Promise<TranslateOutcome> {
  const sleep = options.sleep ?? defaultSleep;
  const results = new Map<number, string>();
  const failedIds = new Set<number>();
  let fatal: ProviderError | null = null;
  let lastError: string | null = null;
  let done = 0;
  const total = parsed.segments.length;

  // Send one group of segments; split it in two when the answer is unusable
  const runGroup = async (ids: number[]): Promise<void> => {
    if (fatal !== null || options.signal.aborted) return;
    const texts = ids.map((id) => parsed.segments[id].text);
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await options.provider.translate(texts, {
          targetLanguage: options.targetLanguage,
          targetCode: options.targetCode,
          signal: options.signal,
        });
        ids.forEach((id, i) => results.set(id, out[i]));
        done += ids.length;
        options.onProgress?.(done, total);
        return;
      } catch (error) {
        const err = error instanceof ProviderError ? error : new ProviderError(`other`, String(error));
        // A rejected key or a cancellation makes every further call pointless
        lastError = err.message;
        if (err.kind === `auth`) {
          fatal = err;
          return;
        }
        if (options.signal.aborted) return;
        if (err.retriable && attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
        if (err.kind === `format` && ids.length > 1) {
          // Unusable answer: try again with two smaller groups
          const middle = Math.ceil(ids.length / 2);
          await runGroup(ids.slice(0, middle));
          await runGroup(ids.slice(middle));
          return;
        }
        ids.forEach((id) => failedIds.add(id));
        done += ids.length;
        options.onProgress?.(done, total);
        return;
      }
    }
  };

  // Simple worker pool: each worker takes the next batch until none is left
  const queue = makeBatches(parsed);
  const worker = async (): Promise<void> => {
    for (let ids = queue.shift(); ids !== undefined; ids = queue.shift()) {
      await runGroup(ids);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  const rebuilt = rebuildDocument(parsed, results);
  return {
    rebuilt,
    failed: failedIds.size + rebuilt.rejected.length,
    fatal,
    lastError,
    cancelled: options.signal.aborted,
  };
}
