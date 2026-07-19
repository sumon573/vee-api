/**
 * LanguageContext
 *
 * BUG 17 fix: Added a 6-second timeout fallback on the AsyncStorage load
 * so the app never stays permanently stuck on the loading screen if
 * AsyncStorage hangs (common after a crash on some Android devices).
 *
 * Responsibilities:
 *  - Load the previously-selected language from AsyncStorage on app start.
 *  - Apply it to i18next and React Native's I18nManager (RTL).
 *  - Expose helpers so screens can change / confirm the language.
 *  - Track whether the user has ever completed language selection (used by
 *    AuthGuard to gate the language-select screen on first launch).
 *
 * RTL note: forceRTL() takes effect after the next JS bundle reload.
 * The first time a user picks Arabic the layout will flip on next start.
 * This is standard React Native behaviour — no redesign is needed now.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { SupportedLanguage, RTL_LANGUAGES } from '@/src/i18n';

// ─── Storage keys ──────────────────────────────────────────────────────────────

const LANG_KEY     = '@vee/language';
const SELECTED_KEY = '@vee/language_selected';

/** Maximum ms to wait for AsyncStorage on app start. */
const LANG_LOADING_TIMEOUT_MS = 6_000;

// ─── Context shape ─────────────────────────────────────────────────────────────

interface LanguageContextValue {
  /** Active language code */
  language: SupportedLanguage;
  /** True when the active language is RTL */
  isRTL: boolean;
  /** True once the user has completed the language-selection screen */
  isLanguageSelected: boolean;
  /** True while the context is loading from AsyncStorage */
  isLoading: boolean;
  /** Change the active language and persist it */
  changeLanguage: (lang: SupportedLanguage) => Promise<void>;
  /** Mark that the user has completed the language-selection step */
  markLanguageSelected: () => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  isRTL: false,
  isLanguageSelected: false,
  isLoading: true,
  changeLanguage: async () => {},
  markLanguageSelected: async () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage]                 = useState<SupportedLanguage>('en');
  const [isLanguageSelected, setIsLangSelected] = useState(false);
  const [isLoading, setIsLoading]               = useState(true);
  const loadingDoneRef = useRef(false);

  // Load persisted settings once on mount
  useEffect(() => {
    // BUG 17 fix: hard timeout so we never block the app permanently
    const timeoutId = setTimeout(() => {
      if (!loadingDoneRef.current) {
        loadingDoneRef.current = true;
        setIsLoading(false);
      }
    }, LANG_LOADING_TIMEOUT_MS);

    (async () => {
      try {
        const [savedLang, selected] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(SELECTED_KEY),
        ]);

        if (savedLang && isValidLang(savedLang)) {
          await applyLanguage(savedLang as SupportedLanguage, false);
        }

        setIsLangSelected(selected === 'true');
      } catch {
        // Silently fall back to English defaults
      } finally {
        if (!loadingDoneRef.current) {
          loadingDoneRef.current = true;
          clearTimeout(timeoutId);
        }
        setIsLoading(false);
      }
    })();

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Apply language to i18next + RTL manager, optionally persisting it. */
  async function applyLanguage(lang: SupportedLanguage, persist: boolean) {
    await i18n.changeLanguage(lang);
    setLanguage(lang);

    const shouldBeRTL = RTL_LANGUAGES.includes(lang);
    if (I18nManager.isRTL !== shouldBeRTL) {
      // Queues a layout direction change; takes effect after next bundle reload.
      I18nManager.forceRTL(shouldBeRTL);
    }

    if (persist) {
      await AsyncStorage.setItem(LANG_KEY, lang);
    }
  }

  async function changeLanguage(lang: SupportedLanguage) {
    await applyLanguage(lang, true);
  }

  async function markLanguageSelected() {
    await AsyncStorage.setItem(SELECTED_KEY, 'true');
    setIsLangSelected(true);
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        isRTL: RTL_LANGUAGES.includes(language),
        isLanguageSelected,
        isLoading,
        changeLanguage,
        markLanguageSelected,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useLanguage() {
  return useContext(LanguageContext);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isValidLang(value: string): value is SupportedLanguage {
  return ['en', 'bn', 'hi', 'ar'].includes(value);
}
