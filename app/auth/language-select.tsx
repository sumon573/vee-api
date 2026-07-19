/**
 * LanguageSelectScreen
 *
 * Premium first-launch screen shown once before Login/Signup.
 * Matches Vee's dark-purple aesthetic.
 * After a language is picked and "Continue" tapped, the selection is
 * persisted and the user is forwarded to Login.
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import ScalePress from '@/components/ScalePress';
import { useLanguage } from '@/src/context/LanguageContext';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '@/src/i18n';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  border: '#2A2542',
  cardBg: 'rgba(139,92,246,0.08)',
  cardBgSelected: 'rgba(139,92,246,0.16)',
  cardBorder: '#2A2542',
  cardBorderSelected: '#8B5CF6',
} as const;

export default function LanguageSelectScreen() {
  const { t } = useTranslation();
  const { language, changeLanguage, markLanguageSelected, isLoading } = useLanguage();

  // Seed local selection from the already-applied language (default: 'en')
  const [selected, setSelected] = useState<SupportedLanguage>(language);
  const [saving, setSaving] = useState(false);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function handleSelect(code: SupportedLanguage) {
    if (code === selected) return;
    await Haptics.selectionAsync();
    setSelected(code);
    // Update i18next live so the Continue button label and subtitle translate
    await changeLanguage(code);
  }

  async function handleContinue() {
    try {
      setSaving(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await markLanguageSelected();
      router.replace('/auth/login');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Soft gradient glow at the top */}
      <LinearGradient
        colors={['rgba(124,58,237,0.24)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 26,
            paddingTop: 44,
            paddingBottom: Platform.OS === 'web' ? 40 : 56,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            {/* Globe icon */}
            <View style={{
              width: 90, height: 90, borderRadius: 45,
              backgroundColor: 'rgba(139,92,246,0.14)',
              borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.38)',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.glow, shadowOpacity: 0.38, shadowRadius: 26,
              shadowOffset: { width: 0, height: 8 }, elevation: 10,
            }}>
              <Feather name="globe" size={40} color={C.glow} />
            </View>

            {/* Wordmark */}
            <Text style={{
              color: C.glow, fontSize: 12, fontWeight: '900',
              letterSpacing: 7, marginTop: 22, opacity: 0.65,
            }}>
              VEE
            </Text>

            {/* Title */}
            <Text style={{
              color: C.text, fontSize: 27, fontWeight: '900',
              textAlign: 'center', marginTop: 10, lineHeight: 36,
            }}>
              {t('languageSelect.title')}
            </Text>

            {/* Subtitle */}
            <Text style={{
              color: C.muted, fontSize: 14, textAlign: 'center',
              marginTop: 9, lineHeight: 22, paddingHorizontal: 18,
            }}>
              {t('languageSelect.subtitle')}
            </Text>
          </View>

          {/* ── Language cards ─────────────────────────────────────────────── */}
          <View style={{ gap: 12 }}>
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = selected === lang.code;
              return (
                <ScalePress
                  key={lang.code}
                  scaleTo={0.97}
                  onPress={() => handleSelect(lang.code)}
                >
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 20,
                    borderWidth: 1.8,
                    borderColor: isSelected ? C.cardBorderSelected : C.cardBorder,
                    backgroundColor: isSelected ? C.cardBgSelected : C.cardBg,
                    paddingHorizontal: 20,
                    paddingVertical: 18,
                    shadowColor: C.glow,
                    shadowOpacity: isSelected ? 0.24 : 0,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: isSelected ? 6 : 0,
                  }}>
                    {/* Flag */}
                    <Text style={{ fontSize: 32, marginRight: 16 }}>
                      {lang.flag}
                    </Text>

                    {/* Names */}
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        color: C.text,
                        fontSize: 18,
                        fontWeight: '800',
                        marginBottom: 2,
                      }}>
                        {lang.nativeName}
                      </Text>
                      <Text style={{
                        color: C.muted,
                        fontSize: 13,
                        fontWeight: '500',
                      }}>
                        {lang.name}
                      </Text>
                    </View>

                    {/* Selection indicator */}
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      borderWidth: 2,
                      borderColor: isSelected ? C.primary : C.border,
                      backgroundColor: isSelected ? C.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {isSelected && (
                        <Feather name="check" size={15} color="#fff" />
                      )}
                    </View>
                  </View>
                </ScalePress>
              );
            })}
          </View>

          <View style={{ height: 44 }} />

          {/* ── Continue button ────────────────────────────────────────────── */}
          <ScalePress onPress={handleContinue} disabled={saving || isLoading}>
            <View style={{
              height: 62, borderRadius: 32, backgroundColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.glow, shadowOpacity: 0.55, shadowRadius: 28,
              shadowOffset: { width: 0, height: 10 }, elevation: 14,
            }}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{
                    color: '#fff', fontSize: 16,
                    fontWeight: '900', letterSpacing: 2,
                  }}>
                    {t('languageSelect.continue').toUpperCase()}
                  </Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </View>
              )}
            </View>
          </ScalePress>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
