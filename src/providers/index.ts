// Registry of translation services: builds a provider from the plugin settings.
import { ANTHROPIC_MODELS, AnthropicProvider } from "./anthropic";
import { ProviderId, TranslationProvider } from "./types";

// Subset of the plugin settings that providers need
export interface ProviderSettings {
  anthropicModel: string;
  // Name of the secret (in Obsidian secret storage) that holds the Anthropic key
  anthropicSecretName: string;
}

// Reads a secret from Obsidian secret storage by name
export type SecretReader = (name: string) => string | null;

// All services available in this version, in display order
export const PROVIDER_IDS: readonly ProviderId[] = [`anthropic`];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: `Anthropic`,
};

// Human readable description of the configuration used by a service, for the confirmation window
export function describeProvider(id: ProviderId, settings: ProviderSettings): string {
  const model = ANTHROPIC_MODELS.find((m) => m.id === settings.anthropicModel)?.label ?? settings.anthropicModel;
  return id === `anthropic` ? `${PROVIDER_LABELS[id]} (${model})` : PROVIDER_LABELS[id];
}

// A service is usable when its key is present
export function isConfigured(id: ProviderId, settings: ProviderSettings, readSecret: SecretReader): boolean {
  if (id === `anthropic`) {
    const key = settings.anthropicSecretName === `` ? null : readSecret(settings.anthropicSecretName);
    return key !== null && key.trim() !== ``;
  }
  return false;
}

export function createProvider(id: ProviderId, settings: ProviderSettings, readSecret: SecretReader): TranslationProvider {
  // Only one service exists for now; more will be added here
  const secretName = settings.anthropicSecretName;
  return new AnthropicProvider(() => (secretName === `` ? null : readSecret(secretName)), settings.anthropicModel);
}
