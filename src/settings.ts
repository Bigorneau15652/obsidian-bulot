// Plugin settings: data model, defaults, validation and the settings tab.
import { App, Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type BulotPlugin from "./main";
import { UiLanguageSetting } from "./i18n";
import { LANGUAGES } from "./languages";
import { ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODEL } from "./providers/anthropic";
import { PROVIDER_IDS, PROVIDER_LABELS } from "./providers";
import { DEFAULT_LOCAL_URL } from "./providers/local";
import { ProviderError, ProviderId } from "./providers/types";

export type OutputMode = `replace` | `copy`;

// Persisted settings (stored in data.json inside the plugin folder; secrets are NOT stored here)
export interface BulotSettings {
  uiLanguage: UiLanguageSetting;
  provider: ProviderId;
  targetLanguage: string;
  outputMode: OutputMode;
  backupCount: number;
  confirmThreshold: number;
  // Comma separated frontmatter property names to translate
  frontmatterKeys: string;
  anthropicModel: string;
  // Name of the secret in Obsidian secret storage (the key itself is never saved in data.json)
  anthropicSecretName: string;
  googleSecretName: string;
  localBaseUrl: string;
  localModel: string;
  localSecretName: string;
  // When on, only services that keep the text on this computer or local network can be used
  localOnly: boolean;
}

export const DEFAULT_SETTINGS: BulotSettings = {
  uiLanguage: `auto`,
  provider: `anthropic`,
  targetLanguage: `fr`,
  outputMode: `replace`,
  backupCount: 10,
  confirmThreshold: 20000,
  frontmatterKeys: ``,
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  anthropicSecretName: ``,
  googleSecretName: ``,
  localBaseUrl: DEFAULT_LOCAL_URL,
  localModel: ``,
  localSecretName: ``,
  localOnly: false,
};

// Merge saved data over the defaults and drop anything invalid
export function sanitizeSettings(saved: unknown): BulotSettings {
  const raw = (typeof saved === `object` && saved !== null ? saved : {}) as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS, ...raw } as BulotSettings;
  if (!PROVIDER_IDS.includes(merged.provider)) merged.provider = DEFAULT_SETTINGS.provider;
  if (merged.outputMode !== `replace` && merged.outputMode !== `copy`) merged.outputMode = `replace`;
  if (![`auto`, `en`, `fr`].includes(merged.uiLanguage)) merged.uiLanguage = `auto`;
  if (!LANGUAGES.some((l) => l.code === merged.targetLanguage)) merged.targetLanguage = DEFAULT_SETTINGS.targetLanguage;
  if (!ANTHROPIC_MODELS.some((m) => m.id === merged.anthropicModel)) merged.anthropicModel = DEFAULT_ANTHROPIC_MODEL;
  merged.backupCount = Number.isFinite(merged.backupCount) ? Math.max(1, Math.floor(merged.backupCount)) : 10;
  merged.confirmThreshold = Number.isFinite(merged.confirmThreshold) ? Math.max(0, Math.floor(merged.confirmThreshold)) : 20000;
  merged.frontmatterKeys = typeof merged.frontmatterKeys === `string` ? merged.frontmatterKeys : ``;
  for (const key of [`anthropicSecretName`, `googleSecretName`, `localSecretName`, `localModel`] as const) {
    if (typeof merged[key] !== `string`) merged[key] = ``;
  }
  if (typeof merged.localBaseUrl !== `string` || merged.localBaseUrl.trim() === ``) merged.localBaseUrl = DEFAULT_LOCAL_URL;
  merged.localOnly = merged.localOnly === true;
  return merged;
}

export class BulotSettingTab extends PluginSettingTab {
  private plugin: BulotPlugin;

  constructor(app: App, plugin: BulotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Rebuild the whole tab; called by Obsidian when it opens and after a language change
  display(): void {
    const { containerEl } = this;
    const t = this.plugin.t;
    const settings = this.plugin.settings;
    containerEl.empty();

    containerEl.createDiv({ cls: `bulot-setting-note`, text: t(`privacyNote`) });

    new Setting(containerEl)
      .setName(t(`uiLanguageName`))
      .setDesc(t(`uiLanguageDesc`))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(`auto`, t(`uiLanguageAuto`))
          .addOption(`en`, t(`uiLanguageEn`))
          .addOption(`fr`, t(`uiLanguageFr`))
          .setValue(settings.uiLanguage)
          .onChange(async (value) => {
            settings.uiLanguage = value as UiLanguageSetting;
            await this.plugin.saveSettings();
            // Redraw so the new language applies immediately
            this.display();
          })
      );

    new Setting(containerEl).setName(t(`sectionTranslation`)).setHeading();

    new Setting(containerEl)
      .setName(t(`defaultService`))
      .setDesc(t(`defaultServiceDesc`))
      .addDropdown((dropdown) => {
        for (const id of PROVIDER_IDS) dropdown.addOption(id, PROVIDER_LABELS[id]);
        dropdown.setValue(settings.provider).onChange(async (value) => {
          settings.provider = value as ProviderId;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(`localOnly`))
      .setDesc(t(`localOnlyDesc`))
      .addToggle((toggle) =>
        toggle.setValue(settings.localOnly).onChange(async (value) => {
          settings.localOnly = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t(`targetLanguage`))
      .setDesc(t(`targetLanguageDesc`))
      .addDropdown((dropdown) => {
        for (const l of LANGUAGES) dropdown.addOption(l.code, `${l.native} (${l.english})`);
        dropdown.setValue(settings.targetLanguage).onChange(async (value) => {
          settings.targetLanguage = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(`outputMode`))
      .setDesc(t(`outputModeDesc`))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(`replace`, t(`outputReplace`))
          .addOption(`copy`, t(`outputCopy`))
          .setValue(settings.outputMode)
          .onChange(async (value) => {
            settings.outputMode = value as OutputMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t(`backupCount`))
      .setDesc(t(`backupCountDesc`))
      .addText((text) =>
        text.setValue(String(settings.backupCount)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          if (Number.isFinite(n) && n >= 1) {
            settings.backupCount = n;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName(t(`confirmThreshold`))
      .setDesc(t(`confirmThresholdDesc`))
      .addText((text) =>
        text.setValue(String(settings.confirmThreshold)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          if (Number.isFinite(n) && n >= 0) {
            settings.confirmThreshold = n;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName(t(`frontmatterKeys`))
      .setDesc(t(`frontmatterKeysDesc`))
      .addText((text) =>
        text.setValue(settings.frontmatterKeys).onChange(async (value) => {
          settings.frontmatterKeys = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName(t(`sectionAnthropic`)).setHeading();

    this.addSecretSetting(containerEl, t(`anthropicKey`), t(`anthropicKeyDesc`), settings.anthropicSecretName, (name) => (settings.anthropicSecretName = name));

    new Setting(containerEl)
      .setName(t(`anthropicModel`))
      .addDropdown((dropdown) => {
        for (const m of ANTHROPIC_MODELS) dropdown.addOption(m.id, m.label);
        dropdown.setValue(settings.anthropicModel).onChange(async (value) => {
          settings.anthropicModel = value;
          await this.plugin.saveSettings();
        });
      });

    this.addTestButton(containerEl, `anthropic`);

    new Setting(containerEl).setName(t(`sectionGoogle`)).setHeading();
    this.addSecretSetting(containerEl, t(`googleKey`), t(`googleKeyDesc`), settings.googleSecretName, (name) => (settings.googleSecretName = name));
    this.addTestButton(containerEl, `google`);

    new Setting(containerEl).setName(t(`sectionLocal`)).setHeading();
    new Setting(containerEl)
      .setName(t(`localUrl`))
      .setDesc(t(`localUrlDesc`))
      .addText((text) =>
        text.setValue(settings.localBaseUrl).onChange(async (value) => {
          settings.localBaseUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName(t(`localModel`))
      .setDesc(t(`localModelDesc`))
      .addText((text) =>
        text.setValue(settings.localModel).onChange(async (value) => {
          settings.localModel = value.trim();
          await this.plugin.saveSettings();
        })
      );
    this.addSecretSetting(containerEl, t(`localKey`), t(`localKeyDesc`), settings.localSecretName, (name) => (settings.localSecretName = name));
    this.addTestButton(containerEl, `local`);
  }

  // A line that links the setting to a secret of the Obsidian secret storage (only the name is saved here)
  private addSecretSetting(container: HTMLElement, name: string, desc: string, current: string, assign: (secretName: string) => void): void {
    new Setting(container)
      .setName(name)
      .setDesc(desc)
      .addComponent((el) =>
        new SecretComponent(this.app, el).setValue(current).onChange(async (secretName) => {
          assign(secretName ?? ``);
          await this.plugin.saveSettings();
        })
      );
  }

  // A button that checks the settings of one service with a one word request
  private addTestButton(container: HTMLElement, id: ProviderId): void {
    const t = this.plugin.t;
    new Setting(container)
      .setName(t(`testConnection`))
      .setDesc(t(`testConnectionDesc`))
      .addButton((button) =>
        button.setButtonText(t(`testButton`)).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.testConnection(id);
            new Notice(t(`testOk`, { service: PROVIDER_LABELS[id] }));
          } catch (error) {
            const reason = error instanceof ProviderError ? error.message : String(error);
            new Notice(t(`testFail`, { reason }));
          } finally {
            button.setDisabled(false);
          }
        })
      );
  }
}
