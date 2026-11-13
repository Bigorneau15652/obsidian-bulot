// Minimal internationalisation layer: English and French UI strings.
import { getLanguage } from "obsidian";

// Language choices exposed in the settings tab
export type UiLanguageSetting = `auto` | `en` | `fr`;
type Locale = `en` | `fr`;

// All translatable interface strings, keyed by identifier
const STRINGS = {
  en: {
    ribbonTooltip: `Bulot: translate this note`,
    notReady: `Bulot is installed. Translation will arrive in the next development step.`,
    settingsTitle: `Bulot`,
    uiLanguageName: `Interface language`,
    uiLanguageDesc: `Language of the plugin menus and messages.`,
    uiLanguageAuto: `Same as Obsidian`,
    uiLanguageEn: `English`,
    uiLanguageFr: `Français`,
    privacyNote: `No text leaves your device until you configure a translation provider and start a translation.`,
  },
  fr: {
    ribbonTooltip: `Bulot : traduire cette note`,
    notReady: `Bulot est installé. La traduction arrivera à la prochaine étape du développement.`,
    settingsTitle: `Bulot`,
    uiLanguageName: `Langue de l'interface`,
    uiLanguageDesc: `Langue des menus et des messages du plugin.`,
    uiLanguageAuto: `Identique à Obsidian`,
    uiLanguageEn: `English`,
    uiLanguageFr: `Français`,
    privacyNote: `Aucun texte ne quitte votre appareil tant que vous n'avez pas configuré un fournisseur de traduction et lancé une traduction.`,
  },
} as const;

export type StringKey = keyof typeof STRINGS.en;

// Resolve the effective locale from the user setting, falling back to Obsidian language
export function resolveLocale(setting: UiLanguageSetting): Locale {
  if (setting === `en` || setting === `fr`) {
    return setting;
  }
  // Obsidian returns codes such as "fr" or "en-GB"; only the prefix matters here
  return getLanguage().toLowerCase().startsWith(`fr`) ? `fr` : `en`;
}

// Build a translate function bound to one locale
export function makeTranslator(locale: Locale): (key: StringKey) => string {
  return (key: StringKey): string => STRINGS[locale][key];
}
