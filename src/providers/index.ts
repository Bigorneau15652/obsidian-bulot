// Registry of translation services: builds a provider from the plugin settings.
import { ANTHROPIC_MODELS, AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";
import { LocalProvider, isPrivateHost, validateEndpoint } from "./local";
import { ProviderId, TranslationProvider } from "./types";

// Subset of the plugin settings that providers need
export interface ProviderSettings {
  anthropicModel: string;
  // Names of secrets (in Obsidian secret storage) that hold the keys; the keys are never saved elsewhere
  anthropicSecretName: string;
  googleSecretName: string;
  localSecretName: string;
  localBaseUrl: string;
  localModel: string;
}

// Reads a secret from Obsidian secret storage by name
export type SecretReader = (name: string) => string | null;

// All services available in this version, in display order
export const PROVIDER_IDS: readonly ProviderId[] = [`anthropic`, `google`, `local`];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: `Anthropic`,
  google: `Google Cloud Translation`,
  local: `Local server (Ollama, LM Studio...)`,
};

// A service is local when the text stays on this computer or on the local network: the server
// address must be a private one, even if the service is labelled local
export function isLocalProvider(id: ProviderId, settings: ProviderSettings): boolean {
  if (id !== `local`) return false;
  try {
    return isPrivateHost(new URL(settings.localBaseUrl).hostname);
  } catch {
    return false;
  }
}

// Human readable description of the configuration used by a service, for the confirmation window
export function describeProvider(id: ProviderId, settings: ProviderSettings): string {
  if (id === `anthropic`) {
    const model = ANTHROPIC_MODELS.find((m) => m.id === settings.anthropicModel)?.label ?? settings.anthropicModel;
    return `${PROVIDER_LABELS[id]} (${model})`;
  }
  if (id === `local`) return `${settings.localModel} @ ${settings.localBaseUrl}`;
  return PROVIDER_LABELS[id];
}

// True when the secret with this name holds a non empty value
function hasSecret(name: string, readSecret: SecretReader): boolean {
  if (name === ``) return false;
  const value = readSecret(name);
  return value !== null && value.trim() !== ``;
}

// A service is usable when its key (or address and model) is present
export function isConfigured(id: ProviderId, settings: ProviderSettings, readSecret: SecretReader): boolean {
  switch (id) {
    case `anthropic`:
      return hasSecret(settings.anthropicSecretName, readSecret);
    case `google`:
      return hasSecret(settings.googleSecretName, readSecret);
    case `local`:
      return validateEndpoint(settings.localBaseUrl) === null && settings.localModel.trim() !== ``;
  }
}

export function createProvider(id: ProviderId, settings: ProviderSettings, readSecret: SecretReader): TranslationProvider {
  const read = (name: string) => (): string | null => (name === `` ? null : readSecret(name));
  switch (id) {
    case `anthropic`:
      return new AnthropicProvider(read(settings.anthropicSecretName), settings.anthropicModel);
    case `google`:
      return new GoogleProvider(read(settings.googleSecretName));
    case `local`:
      return new LocalProvider(settings.localBaseUrl, settings.localModel, read(settings.localSecretName));
  }
}
