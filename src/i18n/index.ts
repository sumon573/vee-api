/**
 * i18n initialisation — import this module once at app root to configure i18next.
 * Uses in-memory resources (no backend) so init is synchronous.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import bn from './locales/bn';
import hi from './locales/hi';
import ar from './locales/ar';

export type SupportedLanguage = 'en' | 'bn' | 'hi' | 'ar';

export interface LanguageOption {
  code: SupportedLanguage;
  /** English name */
  name: string;
  /** Name in the language itself */
  nativeName: string;
  /** Flag emoji */
  flag: string;
  /** Whether this is an RTL language */
  rtl: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English',  nativeName: 'English',   flag: '🇬🇧', rtl: false },
  { code: 'bn', name: 'Bengali',  nativeName: 'বাংলা',     flag: '🇧🇩', rtl: false },
  { code: 'hi', name: 'Hindi',    nativeName: 'हिन्दी',    flag: '🇮🇳', rtl: false },
  { code: 'ar', name: 'Arabic',   nativeName: 'العربية',   flag: '🇸🇦', rtl: true  },
];

export const RTL_LANGUAGES: SupportedLanguage[] = ['ar'];

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        bn: { translation: bn },
        hi: { translation: hi },
        ar: { translation: ar },
      },
      lng: 'en',
      fallbackLng: 'en',
      interpolation: {
        // React already escapes values — no need for i18next to double-escape
        escapeValue: false,
      },
      // Suppress the missing-key warning noise in dev; English fallback covers it
      saveMissing: false,
    });
}

export default i18n;
