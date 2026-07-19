/**
 * Forgot Password Screen
 * Sends a password reset email via Firebase Auth.
 */

import { useState, useRef } from 'react';
import {
  View, Text, TextInput, Animated,
  ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import ScalePress from '@/components/ScalePress';
import WaveTopHeader from '@/components/WaveTopHeader';
import { resetPassword, getAuthErrorMessage } from '@/src/services/authService';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  border: '#2A2542',
  borderFocus: '#8B5CF6',
  inputBg: 'rgba(139,92,246,0.07)',
  error: '#FF4B4B',
  success: '#22C55E',
} as const;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [focused, setFocused] = useState(false);

  const anim = useRef(new Animated.Value(0)).current;
  const fade = (v: number) =>
    Animated.timing(anim, { toValue: v, duration: 200, useNativeDriver: false }).start();
  const borderColor = anim.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.borderFocus] });
  const shadowOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] });

  async function handleReset() {
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim()) {
      setErrorMsg(t('auth.forgotPassword.errorNoEmail'));
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrorMsg(t('auth.forgotPassword.errorInvalidEmail'));
      return;
    }

    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await resetPassword(email);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessMsg(
        t('auth.forgotPassword.successMessage', { email: email.trim() }),
      );
    } catch (err) {
      setErrorMsg(getAuthErrorMessage(err));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <WaveTopHeader
        title={t('auth.forgotPassword.headerTitle')}
        subtitle={t('auth.forgotPassword.headerSubtitle')}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 32 }}>

          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: 'rgba(139,92,246,0.14)',
              borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.35)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="mail" size={34} color={C.glow} />
            </View>
            <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', marginTop: 18, textAlign: 'center' }}>
              {t('auth.forgotPassword.heading')}
            </Text>
            <Text style={{ color: C.muted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
              {t('auth.forgotPassword.description')}
            </Text>
          </View>

          {/* Error */}
          {!!errorMsg && (
            <View style={{
              backgroundColor: 'rgba(255,75,75,0.12)', borderRadius: 14,
              borderWidth: 1, borderColor: 'rgba(255,75,75,0.3)',
              paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Feather name="alert-circle" size={16} color={C.error} />
              <Text style={{ color: C.error, fontSize: 14, flex: 1, lineHeight: 20 }}>{errorMsg}</Text>
            </View>
          )}

          {/* Success */}
          {!!successMsg && (
            <View style={{
              backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 14,
              borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
              paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
              flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            }}>
              <Feather name="check-circle" size={18} color={C.success} style={{ marginTop: 2 }} />
              <Text style={{ color: C.success, fontSize: 14, flex: 1, lineHeight: 22 }}>{successMsg}</Text>
            </View>
          )}

          {/* Email field */}
          <Animated.View style={{
            flexDirection: 'row', alignItems: 'center',
            borderRadius: 32, borderWidth: 1.5, borderColor,
            backgroundColor: C.inputBg, paddingHorizontal: 18, height: 60, marginBottom: 24,
            shadowColor: C.glow, shadowOpacity, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
          }}>
            <Feather name="mail" size={18} color={focused ? C.glow : C.muted} style={{ marginRight: 12 }} />
            <TextInput
              style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: '500', height: '100%' }}
              placeholder={t('auth.forgotPassword.emailPlaceholder')}
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => { setFocused(true); fade(1); }}
              onBlur={() => { setFocused(false); fade(0); }}
            />
          </Animated.View>

          {/* Send button */}
          <ScalePress onPress={handleReset} disabled={loading || !!successMsg}>
            <View style={{
              height: 60, borderRadius: 32,
              backgroundColor: successMsg ? 'rgba(34,197,94,0.6)' : C.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.glow, shadowOpacity: successMsg ? 0 : 0.55, shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 }, elevation: 14,
            }}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name={successMsg ? 'check' : 'send'} size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 2 }}>
                      {successMsg
                        ? t('auth.forgotPassword.sentButton')
                        : t('auth.forgotPassword.sendButton')}
                    </Text>
                  </View>
                )}
            </View>
          </ScalePress>

          <View style={{ height: 20 }} />

          {/* Back to login */}
          <ScalePress onPress={() => router.back()}>
            <View style={{
              height: 54, borderRadius: 32, borderWidth: 1.4, borderColor: C.border,
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8,
            }}>
              <Feather name="arrow-left" size={16} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 14, fontWeight: '700' }}>
                {t('auth.forgotPassword.backToLogin')}
              </Text>
            </View>
          </ScalePress>

          <View style={{ height: Platform.OS === 'web' ? 34 : 48 }} />
        </View>
      </SafeAreaView>
    </View>
  );
}
