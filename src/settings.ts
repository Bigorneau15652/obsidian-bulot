// Plugin settings: data model, defaults and the settings tab.
import { App, PluginSettingTab, Setting } from "obsidian";
import type BulotPlugin from "./main";
import { UiLanguageSetting } from "./i18n";

// Persisted settings (stored in data.json inside the plugin folder)
export interface BulotSettings {
  uiLanguage: UiLanguageSetting;
}

export const DEFAULT_SETTINGS: BulotSettings = {
  uiLanguage: `auto`,
};

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
    containerEl.empty();

    new Setting(containerEl).setName(t(`settingsTitle`)).setHeading();

    // Static privacy reminder, built with DOM helpers (never innerHTML)
    containerEl.createDiv({ cls: `bulot-setting-note`, text: t(`privacyNote`) });

    new Setting(containerEl)
      .setName(t(`uiLanguageName`))
      .setDesc(t(`uiLanguageDesc`))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(`auto`, t(`uiLanguageAuto`))
          .addOption(`en`, t(`uiLanguageEn`))
          .addOption(`fr`, t(`uiLanguageFr`))
          .setValue(this.plugin.settings.uiLanguage)
          .onChange(async (value) => {
            this.plugin.settings.uiLanguage = value as UiLanguageSetting;
            await this.plugin.saveSettings();
            // Redraw so the new language applies immediately
            this.display();
          })
      );
  }
}
