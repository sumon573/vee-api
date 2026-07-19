/**
 * Help & Support Screen
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Platform, Linking, LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import ScalePress from '@/components/ScalePress';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  mutedDim: '#4A3D6E',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.055)',
} as const;

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen((p) => !p);
      }}
      style={{
        backgroundColor: C.surface, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        marginBottom: 10, overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
        <Text style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: '700', lineHeight: 20 }}>
          {question}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.mutedDim} />
      </View>
      {open && (
        <View style={{
          paddingHorizontal: 16, paddingBottom: 16,
          borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
        }}>
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 10 }}>
            {answer}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function HelpScreen() {
  const { t } = useTranslation();
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const faqs = [
    { q: t('help.faq1Q'), a: t('help.faq1A') },
    { q: t('help.faq2Q'), a: t('help.faq2A') },
    { q: t('help.faq3Q'), a: t('help.faq3A') },
    { q: t('help.faq4Q'), a: t('help.faq4A') },
    { q: t('help.faq5Q'), a: t('help.faq5A') },
    { q: t('help.faq6Q'), a: t('help.faq6A') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {/* Back header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: topPad + 10, paddingBottom: 20,
          }}>
            <Pressable onPress={() => router.back()} hitSlop={14} style={{ marginRight: 12 }}>
              <Feather name="arrow-left" size={24} color={C.text} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>
              {t('help.title')}
            </Text>
          </View>

          {/* Contact */}
          <View style={{
            backgroundColor: 'rgba(139,92,246,0.1)',
            borderRadius: 16, padding: 18, marginBottom: 24,
            borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
          }}>
            <Text style={{ color: C.glow, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>
              {t('help.contactHeading')}
            </Text>
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 20 }}>
              {t('help.contactSub')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <ScalePress
                onPress={() => Linking.openURL('mailto:veesupport0@gmail.com').catch(() => {})}
              >
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: C.primary, borderRadius: 12,
                  paddingHorizontal: 16, paddingVertical: 10,
                }}>
                  <Feather name="mail" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                    {t('help.emailUs')}
                  </Text>
                </View>
              </ScalePress>
            </View>
          </View>

          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginBottom: 12,
          }}>
            {t('help.faqSection')}
          </Text>

          {faqs.map((faq, i) => (
            <FAQItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
