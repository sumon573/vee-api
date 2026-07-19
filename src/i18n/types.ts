/**
 * Augments i18next's CustomTypeOptions so that useTranslation() and t()
 * are fully typed against the English translation file (the source of truth).
 */
import type en from './locales/en';

type EnTranslation = typeof en;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: EnTranslation;
    };
  }
}
