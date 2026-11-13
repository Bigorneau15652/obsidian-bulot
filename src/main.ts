// Bulot plugin entry point.
import { Notice, Plugin, addIcon } from "obsidian";
import { BULOT_ICON_ID, BULOT_ICON_SVG } from "./icon";
import { makeTranslator, resolveLocale, StringKey } from "./i18n";
import { BulotSettings, BulotSettingTab, DEFAULT_SETTINGS } from "./settings";

export default class BulotPlugin extends Plugin {
  settings: BulotSettings = { ...DEFAULT_SETTINGS };
  // Current translate function; rebuilt whenever the language setting changes
  t: (key: StringKey) => string = makeTranslator(`en`);

  async onload(): Promise<void> {
    await this.loadSettings();

    addIcon(BULOT_ICON_ID, BULOT_ICON_SVG);

    // Ribbon button: placeholder until the translation engine exists
    this.addRibbonIcon(BULOT_ICON_ID, this.t(`ribbonTooltip`), () => {
      new Notice(this.t(`notReady`));
    });

    this.addSettingTab(new BulotSettingTab(this.app, this));
  }

  // Load saved settings and merge them over the defaults
  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<BulotSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    this.refreshTranslator();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshTranslator();
  }

  // Recompute the translate function from the current language setting
  private refreshTranslator(): void {
    this.t = makeTranslator(resolveLocale(this.settings.uiLanguage));
  }
}
