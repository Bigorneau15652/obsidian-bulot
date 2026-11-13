// Target languages offered in the plugin. The English name is what is sent to the
// translation service; the native name is shown to the user next to it.
export interface Language {
  code: string;
  english: string;
  native: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: `fr`, english: `French`, native: `Français` },
  { code: `en`, english: `English`, native: `English` },
  { code: `es`, english: `Spanish`, native: `Español` },
  { code: `de`, english: `German`, native: `Deutsch` },
  { code: `it`, english: `Italian`, native: `Italiano` },
  { code: `pt`, english: `Portuguese`, native: `Português` },
  { code: `nl`, english: `Dutch`, native: `Nederlands` },
  { code: `ca`, english: `Catalan`, native: `Català` },
  { code: `oc`, english: `Occitan`, native: `Occitan` },
  { code: `pl`, english: `Polish`, native: `Polski` },
  { code: `cs`, english: `Czech`, native: `Čeština` },
  { code: `sv`, english: `Swedish`, native: `Svenska` },
  { code: `da`, english: `Danish`, native: `Dansk` },
  { code: `no`, english: `Norwegian`, native: `Norsk` },
  { code: `fi`, english: `Finnish`, native: `Suomi` },
  { code: `el`, english: `Greek`, native: `Ελληνικά` },
  { code: `ro`, english: `Romanian`, native: `Română` },
  { code: `hu`, english: `Hungarian`, native: `Magyar` },
  { code: `ru`, english: `Russian`, native: `Русский` },
  { code: `uk`, english: `Ukrainian`, native: `Українська` },
  { code: `tr`, english: `Turkish`, native: `Türkçe` },
  { code: `ar`, english: `Arabic`, native: `العربية` },
  { code: `he`, english: `Hebrew`, native: `עברית` },
  { code: `hi`, english: `Hindi`, native: `हिन्दी` },
  { code: `zh`, english: `Chinese (Simplified)`, native: `简体中文` },
  { code: `zh-TW`, english: `Chinese (Traditional)`, native: `繁體中文` },
  { code: `ja`, english: `Japanese`, native: `日本語` },
  { code: `ko`, english: `Korean`, native: `한국어` },
  { code: `vi`, english: `Vietnamese`, native: `Tiếng Việt` },
  { code: `id`, english: `Indonesian`, native: `Bahasa Indonesia` },
];

// Find a language by code; falls back to the first entry (French) when unknown
export function findLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
