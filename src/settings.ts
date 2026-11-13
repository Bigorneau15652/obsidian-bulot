// Plugin settings: data model, defaults, validation and the settings tab.
import { App, Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type BulotPlugin from "./main";
import { UiLanguageSetting } from "./i18n";
import { LANGUAGES } from "./languages";
import { ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODEL } from "./providers/anthropic";
import { PROVIDER_IDS, PROVIDER_LABELS } from "./providers";
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
  merged.anthropicSecretName = typeof merged.anthropicSecretName === `string` ? merged.anthropicSecretName : ``;
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

    new Setting(containerEl)
      .setName(t(`anthropicKey`))
      .setDesc(t(`anthropicKeyDesc`))
      .addComponent((el) =>
        new SecretComponent(this.app, el).setValue(settings.anthropicSecretName).onChange(async (name) => {
          // Only the name of the secret is saved here, never the key
          settings.anthropicSecretName = name ?? ``;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t(`anthropicModel`))
      .addDropdown((dropdown) => {
        for (const m of ANTHROPIC_MODELS) dropdown.addOption(m.id, m.label);
        dropdown.setValue(settings.anthropicModel).onChange(async (value) => {
          settings.anthropicModel = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t(`testConnection`))
      .setDesc(t(`testConnectionDesc`))
      .addButton((button) =>
        button.setButtonText(t(`testButton`)).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.testConnection();
            new Notice(t(`testOk`, { service: PROVIDER_LABELS.anthropic }));
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
