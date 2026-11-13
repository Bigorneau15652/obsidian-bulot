// Interface strings in English and French, with a tiny {name} template syntax.
import { getLanguage } from "obsidian";

// Language choices exposed in the settings tab
export type UiLanguageSetting = `auto` | `en` | `fr`;
type Locale = `en` | `fr`;

const en = {
  // Commands and ribbon
  cmdTranslateNote: `Translate the current note`,
  cmdTranslateChoose: `Translate the current note: choose service and language`,
  cmdTranslateSelection: `Translate the selection`,
  cmdCancel: `Cancel the running translation`,
  ribbonTooltip: `Bulot: translate the current note`,
  // Notices
  noEditor: `Open a note in the editor first.`,
  busy: `A translation is already running.`,
  emptyText: `Nothing to translate in this text.`,
  notConfigured: `{service} is not configured. Add your API key in the Bulot settings.`,
  progress: `Bulot: {done} / {total} lines translated...`,
  cancelled: `Translation cancelled. Nothing was changed.`,
  authFailed: `{service} refused the API key. Check it in the Bulot settings. Nothing was changed.`,
  noteChanged: `The note changed during the translation. Nothing was written.`,
  structureError: `Safety check failed: the translated note does not have the same layout as the original. Nothing was written.`,
  backupFailed: `Could not save a backup copy of the note. Nothing was changed.`,
  doneSummary: `Translation done: {count} lines translated.`,
  doneFailed: `{failed} lines could not be translated and were kept in their original language.`,
  copyCreated: `Translated copy created: {path}`,
  // Confirmation window
  confirmTitle: `Send this text for translation?`,
  confirmService: `Service: {service}`,
  confirmLanguage: `Target language: {language}`,
  confirmVolume: `{lines} lines, {chars} characters (about {tokens} tokens)`,
  confirmWarning: `The text of this note will be sent over the internet to the selected service.`,
  confirmOk: `Translate`,
  confirmCancel: `Cancel`,
  // Pickers
  pickService: `Choose a translation service...`,
  pickLanguage: `Choose the target language...`,
  notConfiguredSuffix: `(not configured)`,
  // Settings
  settingsTitle: `Bulot`,
  privacyNote: `No text leaves your device until you configure a translation service and start a translation.`,
  uiLanguageName: `Interface language`,
  uiLanguageDesc: `Language of the plugin menus and messages.`,
  uiLanguageAuto: `Same as Obsidian`,
  uiLanguageEn: `English`,
  uiLanguageFr: `Français`,
  sectionTranslation: `Translation`,
  defaultService: `Default service`,
  defaultServiceDesc: `Service used by the ribbon button and by the quick command.`,
  targetLanguage: `Default target language`,
  targetLanguageDesc: `The source language is detected automatically.`,
  outputMode: `Result`,
  outputModeDesc: `Replace the note (you can undo with Ctrl+Z and a backup copy is kept) or create a translated copy next to it.`,
  outputReplace: `Replace the note`,
  outputCopy: `Create a translated copy`,
  backupCount: `Backup copies to keep`,
  backupCountDesc: `Before a note is replaced, its original text is saved in the plugin folder. Older copies are deleted beyond this number.`,
  confirmThreshold: `Ask for confirmation above (characters)`,
  confirmThresholdDesc: `A confirmation window shows the volume before sending. Use 0 to be asked every time.`,
  frontmatterKeys: `Properties to translate`,
  frontmatterKeysDesc: `Names of properties (frontmatter) whose text value is translated, separated by commas. Leave empty to keep all properties unchanged.`,
  sectionAnthropic: `Anthropic`,
  anthropicKey: `API key`,
  anthropicKeyDesc: `Stored in the secure storage of Obsidian. Choose an existing secret or create one.`,
  anthropicModel: `Model`,
  testConnection: `Test the connection`,
  testConnectionDesc: `Sends one short word to the service to check the key.`,
  testButton: `Test`,
  testOk: `Connection works: {service} answered.`,
  testFail: `Connection failed: {reason}`,
} as const;

export type StringKey = keyof typeof en;

const fr: Record<StringKey, string> = {
  cmdTranslateNote: `Traduire la note active`,
  cmdTranslateChoose: `Traduire la note active : choisir le service et la langue`,
  cmdTranslateSelection: `Traduire la sélection`,
  cmdCancel: `Annuler la traduction en cours`,
  ribbonTooltip: `Bulot : traduire la note active`,
  noEditor: `Ouvrez d'abord une note dans l'éditeur.`,
  busy: `Une traduction est déjà en cours.`,
  emptyText: `Rien à traduire dans ce texte.`,
  notConfigured: `{service} n'est pas configuré. Ajoutez votre clé API dans les réglages de Bulot.`,
  progress: `Bulot : {done} / {total} lignes traduites...`,
  cancelled: `Traduction annulée. Rien n'a été modifié.`,
  authFailed: `{service} a refusé la clé API. Vérifiez-la dans les réglages de Bulot. Rien n'a été modifié.`,
  noteChanged: `La note a changé pendant la traduction. Rien n'a été écrit.`,
  structureError: `Contrôle de sécurité échoué : la note traduite n'a pas la même mise en page que l'original. Rien n'a été écrit.`,
  backupFailed: `Impossible d'enregistrer une copie de sauvegarde de la note. Rien n'a été modifié.`,
  doneSummary: `Traduction terminée : {count} lignes traduites.`,
  doneFailed: `{failed} lignes n'ont pas pu être traduites et sont restées dans leur langue d'origine.`,
  copyCreated: `Copie traduite créée : {path}`,
  confirmTitle: `Envoyer ce texte pour traduction ?`,
  confirmService: `Service : {service}`,
  confirmLanguage: `Langue cible : {language}`,
  confirmVolume: `{lines} lignes, {chars} caractères (environ {tokens} jetons)`,
  confirmWarning: `Le texte de cette note sera envoyé par Internet au service sélectionné.`,
  confirmOk: `Traduire`,
  confirmCancel: `Annuler`,
  pickService: `Choisissez un service de traduction...`,
  pickLanguage: `Choisissez la langue cible...`,
  notConfiguredSuffix: `(non configuré)`,
  settingsTitle: `Bulot`,
  privacyNote: `Aucun texte ne quitte votre appareil tant que vous n'avez pas configuré un service de traduction et lancé une traduction.`,
  uiLanguageName: `Langue de l'interface`,
  uiLanguageDesc: `Langue des menus et des messages du plugin.`,
  uiLanguageAuto: `Identique à Obsidian`,
  uiLanguageEn: `English`,
  uiLanguageFr: `Français`,
  sectionTranslation: `Traduction`,
  defaultService: `Service par défaut`,
  defaultServiceDesc: `Service utilisé par le bouton de la barre latérale et par la commande rapide.`,
  targetLanguage: `Langue cible par défaut`,
  targetLanguageDesc: `La langue source est détectée automatiquement.`,
  outputMode: `Résultat`,
  outputModeDesc: `Remplacer la note (annulation possible avec Ctrl+Z et copie de sauvegarde conservée) ou créer une copie traduite à côté.`,
  outputReplace: `Remplacer la note`,
  outputCopy: `Créer une copie traduite`,
  backupCount: `Copies de sauvegarde à conserver`,
  backupCountDesc: `Avant le remplacement d'une note, son texte d'origine est enregistré dans le dossier du plugin. Les copies plus anciennes sont supprimées au-delà de ce nombre.`,
  confirmThreshold: `Demander confirmation au-delà de (caractères)`,
  confirmThresholdDesc: `Une fenêtre de confirmation affiche le volume avant l'envoi. Saisissez 0 pour être prévenu à chaque fois.`,
  frontmatterKeys: `Propriétés à traduire`,
  frontmatterKeysDesc: `Noms des propriétés (frontmatter) dont la valeur texte est traduite, séparés par des virgules. Laissez vide pour ne modifier aucune propriété.`,
  sectionAnthropic: `Anthropic`,
  anthropicKey: `Clé API`,
  anthropicKeyDesc: `Conservée dans le stockage sécurisé d'Obsidian. Choisissez un secret existant ou créez-en un.`,
  anthropicModel: `Modèle`,
  testConnection: `Tester la connexion`,
  testConnectionDesc: `Envoie un mot au service pour vérifier la clé.`,
  testButton: `Tester`,
  testOk: `La connexion fonctionne : {service} a répondu.`,
  testFail: `Échec de la connexion : {reason}`,
};

export type Translator = (key: StringKey, vars?: Record<string, string | number>) => string;

const TABLES: Record<Locale, Record<StringKey, string>> = { en, fr };

// Resolve the effective locale from the user setting, falling back to Obsidian language
export function resolveLocale(setting: UiLanguageSetting): Locale {
  if (setting === `en` || setting === `fr`) return setting;
  return getLanguage().toLowerCase().startsWith(`fr`) ? `fr` : `en`;
}

// Build a translate function bound to one locale; {name} markers are replaced from vars
export function makeTranslator(locale: Locale): Translator {
  return (key, vars) => {
    const template = TABLES[locale][key];
    if (vars === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
  };
}
