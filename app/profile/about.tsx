/**
 * About Vee Screen
 *
 * Phase 2 QA fix:
 * - Removed Tech Stack section (no Firebase / Expo / React Native / ZEGOCloud / Cloudinary).
 * - Professional About text.
 * - Official Vee logo (app icon image).
 */

import {
  View, Text, ScrollView, Pressable, Platform, Linking, Image,
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

function LinkButton({
  icon, label, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <ScalePress onPress={onPress}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.surface, borderRadius: 16,
        padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
      }}>
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: 'rgba(139,92,246,0.14)',
          alignItems: 'center', justifyContent: 'center', marginRight: 14,
        }}>
          <Feather name={icon} size={18} color={C.glow} />
        </View>
        <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        <Feather name="external-link" size={16} color={C.mutedDim} />
      </View>
    </ScalePress>
  );
}

export default function AboutScreen() {
  const { t } = useTranslation();
  const topPad = Platform.OS === 'web' ? 67 : 0;

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
            paddingTop: topPad + 10, paddingBottom: 24,
          }}>
            <Pressable onPress={() => router.back()} hitSlop={14} style={{ marginRight: 12 }}>
              <Feather name="arrow-left" size={24} color={C.text} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>
              {t('about.title')}
            </Text>
          </View>

          {/* App branding — official Vee logo */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{
              width: 96, height: 96, borderRadius: 28,
              overflow: 'hidden',
              shadowColor: C.glow, shadowOpacity: 0.5,
              shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
              elevation: 16, marginBottom: 16,
            }}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={{ width: 96, height: 96 }}
                resizeMode="cover"
              />
            </View>
            <Text style={{ color: C.text, fontSize: 28, fontWeight: '900' }}>Vee</Text>
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{t('about.version')}</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              marginTop: 10, backgroundColor: 'rgba(34,197,94,0.12)',
              borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
            }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
              <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '700' }}>
                {t('about.productionBuild')}
              </Text>
            </View>
          </View>

          {/* About text */}
          <View style={{
            backgroundColor: C.surface, borderRadius: 16,
            padding: 18, marginBottom: 24,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
          }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }}>
              {t('about.aboutHeading')}
            </Text>
            <Text style={{ color: C.muted, fontSize: 14, lineHeight: 22 }}>
              {t('about.aboutText')}
            </Text>
          </View>

          {/* Legal */}
          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginBottom: 10,
          }}>
            {t('about.sectionLegal')}
          </Text>
          <LinkButton
            icon="file-text"
            label={t('about.termsOfService')}
            onPress={() => Linking.openURL('https://veeapp.com/terms').catch(() => {})}
          />
          <LinkButton
            icon="shield"
            label={t('about.privacyPolicy')}
            onPress={() => Linking.openURL('https://welcome-to-vee-privacy-guidance.netlify.app/').catch(() => {})}
          />

          <Text style={{
            color: C.mutedDim, fontSize: 12,
            textAlign: 'center', marginTop: 24, lineHeight: 18,
          }}>
            {t('about.footer')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
