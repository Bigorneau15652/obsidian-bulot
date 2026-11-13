// Small windows used by the commands: confirmation before sending, and choice lists.
import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";
import type { Translator } from "./i18n";

export interface ConfirmInfo {
  service: string;
  language: string;
  lines: number;
  chars: number;
  // True when the text stays on this computer or the local network
  local: boolean;
}

// Confirmation window listing what is about to be sent
class ConfirmModal extends Modal {
  private decided = false;

  constructor(
    app: App,
    private readonly t: Translator,
    private readonly info: ConfirmInfo,
    private readonly finish: (accepted: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, t, info } = this;
    contentEl.createEl(`h3`, { text: t(`confirmTitle`) });
    contentEl.createEl(`p`, { text: t(`confirmService`, { service: info.service }) });
    contentEl.createEl(`p`, { text: t(`confirmLanguage`, { language: info.language }) });
    contentEl.createEl(`p`, {
      text: t(`confirmVolume`, { lines: info.lines, chars: info.chars, tokens: Math.ceil(info.chars / 4) }),
    });
    contentEl.createEl(`p`, { cls: `bulot-setting-note`, text: t(info.local ? `confirmWarningLocal` : `confirmWarning`) });
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t(`confirmOk`))
          .setCta()
          .onClick(() => {
            this.decided = true;
            this.finish(true);
            this.close();
          })
      )
      .addButton((button) => button.setButtonText(t(`confirmCancel`)).onClick(() => this.close()));
  }

  onClose(): void {
    // Closing the window any other way means "no"
    if (!this.decided) this.finish(false);
    this.contentEl.empty();
  }
}

// Ask the user to confirm; resolves true only on an explicit click on the main button
export function confirmTranslation(app: App, t: Translator, info: ConfirmInfo): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, t, info, resolve).open());
}

// Searchable list used for the service and language choices
class ChoiceModal<T> extends FuzzySuggestModal<T> {
  constructor(
    app: App,
    placeholder: string,
    private readonly items: readonly T[],
    private readonly labelOf: (item: T) => string,
    private readonly finish: (item: T | null) => void
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): T[] {
    return [...this.items];
  }

  getItemText(item: T): string {
    return this.labelOf(item);
  }

  onChooseItem(item: T): void {
    this.finish(item);
  }

  onClose(): void {
    // Obsidian closes the window before reporting the chosen item: wait one tick so the choice wins
    setTimeout(() => this.finish(null), 0);
  }
}

// Let the user pick one item; resolves null when the window is dismissed
export function pickOne<T>(app: App, placeholder: string, items: readonly T[], labelOf: (item: T) => string): Promise<T | null> {
  return new Promise((resolve) => new ChoiceModal(app, placeholder, items, labelOf, resolve).open());
}
