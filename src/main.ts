// Bulot plugin entry point: commands, ribbon button and the translation workflow.
import { MarkdownView, Notice, Plugin, TFile, addIcon } from "obsidian";
import { saveBackup } from "./backup";
import { BULOT_ICON_ID, BULOT_ICON_SVG } from "./icon";
import { makeTranslator, resolveLocale, Translator } from "./i18n";
import { LANGUAGES, Language, findLanguage } from "./languages";
import { findStructureMismatch, parseDocument } from "./markdown";
import { confirmTranslation, pickOne } from "./modals";
import { PROVIDER_IDS, PROVIDER_LABELS, createProvider, describeProvider, isConfigured } from "./providers";
import { ProviderError, ProviderId } from "./providers/types";
import { BulotSettings, BulotSettingTab, DEFAULT_SETTINGS, sanitizeSettings } from "./settings";
import { countCharacters, translateDocument } from "./translator";

// What a translation run needs to know
interface RunRequest {
  scope: `note` | `selection`;
  // Overrides of the settings, used by the "choose service and language" command
  provider?: ProviderId;
  language?: Language;
}

export default class BulotPlugin extends Plugin {
  settings: BulotSettings = { ...DEFAULT_SETTINGS };
  // Current translate function; rebuilt whenever the language setting changes
  t: Translator = makeTranslator(`en`);
  // Cancellation handle of the running translation, if any
  private running: AbortController | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    addIcon(BULOT_ICON_ID, BULOT_ICON_SVG);

    // Left ribbon button: translate the current note with the default service and language
    this.addRibbonIcon(BULOT_ICON_ID, this.t(`ribbonTooltip`), () => {
      void this.runTranslation({ scope: `note` });
    });

    // Commands are looked up by name in the command palette (Ctrl+P). The names below are
    // fixed at load time; a restart applies a changed interface language to them.
    this.addCommand({
      id: `translate-note`,
      name: this.t(`cmdTranslateNote`),
      callback: () => void this.runTranslation({ scope: `note` }),
    });
    this.addCommand({
      id: `translate-note-choose`,
      name: this.t(`cmdTranslateChoose`),
      callback: () => void this.runWithChoices(`note`),
    });
    this.addCommand({
      id: `translate-selection`,
      name: this.t(`cmdTranslateSelection`),
      callback: () => void this.runTranslation({ scope: `selection` }),
    });
    this.addCommand({
      id: `cancel-translation`,
      name: this.t(`cmdCancel`),
      callback: () => this.running?.abort(),
    });

    this.addSettingTab(new BulotSettingTab(this.app, this));
  }

  onunload(): void {
    // Stop any running translation when the plugin is disabled
    this.running?.abort();
  }

  async loadSettings(): Promise<void> {
    this.settings = sanitizeSettings(await this.loadData());
    this.refreshTranslator();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshTranslator();
  }

  private refreshTranslator(): void {
    this.t = makeTranslator(resolveLocale(this.settings.uiLanguage));
  }

  // Read a secret from the secure storage of Obsidian
  private readSecret = (name: string): string | null => this.app.secretStorage.getSecret(name);

  // Check the configured key with one short request (used by the settings tab)
  async testConnection(): Promise<void> {
    const provider = createProvider(this.settings.provider, this.settings, this.readSecret);
    await provider.translate([`Hello`], { targetLanguage: `French`, signal: new AbortController().signal });
  }

  // "Choose service and language" command: two pickers, then the translation
  private async runWithChoices(scope: RunRequest[`scope`]): Promise<void> {
    const t = this.t;
    const provider = await pickOne(this.app, t(`pickService`), PROVIDER_IDS, (id) =>
      isConfigured(id, this.settings, this.readSecret) ? PROVIDER_LABELS[id] : `${PROVIDER_LABELS[id]} ${t(`notConfiguredSuffix`)}`
    );
    if (provider === null) return;
    const language = await pickOne(this.app, t(`pickLanguage`), LANGUAGES, (l) => `${l.native} (${l.english})`);
    if (language === null) return;
    await this.runTranslation({ scope, provider, language });
  }

  // The whole workflow: read, plan, confirm, translate, verify, back up, write
  private async runTranslation(request: RunRequest): Promise<void> {
    const t = this.t;
    if (this.running !== null) {
      new Notice(t(`busy`));
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view === null) {
      new Notice(t(`noEditor`));
      return;
    }
    const editor = view.editor;
    const file = view.file;

    const providerId = request.provider ?? this.settings.provider;
    const language = request.language ?? findLanguage(this.settings.targetLanguage);
    if (!isConfigured(providerId, this.settings, this.readSecret)) {
      new Notice(t(`notConfigured`, { service: PROVIDER_LABELS[providerId] }));
      return;
    }

    const original = request.scope === `selection` ? editor.getSelection() : editor.getValue();
    const frontmatterKeys = this.settings.frontmatterKeys
      .split(`,`)
      .map((k) => k.trim())
      .filter((k) => k !== ``);
    // Frontmatter is never part of a selection
    const parsed = parseDocument(original, { frontmatterKeys: request.scope === `selection` ? [] : frontmatterKeys });
    if (parsed.segments.length === 0) {
      new Notice(t(`emptyText`));
      return;
    }

    // Ask before sending a large text (threshold 0 means always ask)
    const chars = countCharacters(parsed);
    if (chars >= this.settings.confirmThreshold) {
      const accepted = await confirmTranslation(this.app, t, {
        service: describeProvider(providerId, this.settings),
        language: `${language.native} (${language.english})`,
        lines: parsed.segments.length,
        chars,
      });
      if (!accepted) return;
    }

    const controller = new AbortController();
    this.running = controller;
    const progress = new Notice(t(`progress`, { done: 0, total: parsed.segments.length }), 0);
    try {
      const provider = createProvider(providerId, this.settings, this.readSecret);
      const outcome = await translateDocument(parsed, {
        provider,
        targetLanguage: language.english,
        signal: controller.signal,
        onProgress: (done, total) => progress.setMessage(t(`progress`, { done, total })),
      });

      if (outcome.fatal !== null) {
        new Notice(t(`authFailed`, { service: PROVIDER_LABELS[providerId] }));
        return;
      }
      if (outcome.cancelled) {
        new Notice(t(`cancelled`));
        return;
      }
      const translated = parsed.segments.length - outcome.failed;
      if (translated === 0) {
        new Notice(t(`doneFailed`, { failed: outcome.failed }));
        return;
      }

      // Safety checks before anything is written
      const result = outcome.rebuilt.text;
      if (findStructureMismatch(original, result) !== -1) {
        new Notice(t(`structureError`));
        return;
      }
      const current = request.scope === `selection` ? editor.getSelection() : editor.getValue();
      if (current !== original) {
        new Notice(t(`noteChanged`));
        return;
      }

      if (request.scope === `note` && this.settings.outputMode === `copy` && file !== null) {
        const created = await this.createCopy(file, result, language);
        new Notice(t(`copyCreated`, { path: created.path }));
      } else {
        // Replacing: keep a copy of the whole original note first, and stop if that fails
        try {
          await saveBackup(this.app, this.manifest.dir ?? ``, file?.basename ?? `note`, editor.getValue(), this.settings.backupCount);
        } catch {
          new Notice(t(`backupFailed`));
          return;
        }
        if (request.scope === `selection`) {
          editor.replaceSelection(result);
        } else {
          const cursor = editor.getCursor();
          const scroll = editor.getScrollInfo();
          editor.setValue(result);
          editor.setCursor(cursor);
          editor.scrollTo(scroll.left, scroll.top);
        }
      }

      let summary = t(`doneSummary`, { count: translated });
      if (outcome.failed > 0) summary += ` ${t(`doneFailed`, { failed: outcome.failed })}`;
      new Notice(summary, 8000);
    } catch (error) {
      new Notice(error instanceof ProviderError ? error.message : String(error));
    } finally {
      progress.hide();
      this.running = null;
    }
  }

  // Create "Name (fr).md" next to the original note and open it
  private async createCopy(file: TFile, content: string, language: Language): Promise<TFile> {
    const folder = file.parent?.path === `/` ? `` : `${file.parent?.path ?? ``}/`;
    let path = `${folder}${file.basename} (${language.code}).md`;
    for (let n = 2; this.app.vault.getAbstractFileByPath(path) !== null; n++) {
      path = `${folder}${file.basename} (${language.code} ${n}).md`;
    }
    const created = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf(`tab`).openFile(created);
    return created;
  }
}
