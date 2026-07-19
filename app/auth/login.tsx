import { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable,
  Animated, ScrollView, ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import WaveTopHeader from '@/components/WaveTopHeader';
import ScalePress from '@/components/ScalePress';
import { login, getAuthErrorMessage } from '@/src/services/authService';

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
} as const;

// ─── Field Component ──────────────────────────────────────────────────────────

function Field({
  icon, placeholder, value, onChange, secure, keyboard,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  placeholder: string;
  value: string;
  onChange: (t: string) => void;
  secure?: boolean;
  keyboard?: 'email-address' | 'default';
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const fade = (v: number) =>
    Animated.timing(anim, { toValue: v, duration: 200, useNativeDriver: false }).start();
  const borderColor = anim.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.borderFocus] });
  const shadowOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] });

  return (
    <Animated.View style={{
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 32, borderWidth: 1.5, borderColor,
      backgroundColor: C.inputBg, paddingHorizontal: 18, height: 60, marginBottom: 16,
      shadowColor: C.glow, shadowOpacity, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    }}>
      <Feather name={icon} size={18} color={focused ? C.glow : C.muted} style={{ marginRight: 12 }} />
      <TextInput
        style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: '500', height: '100%' }}
        placeholder={placeholder} placeholderTextColor={C.muted}
        value={value} onChangeText={onChange}
        secureTextEntry={secure && !visible}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none" autoCorrect={false}
        onFocus={() => { setFocused(true); fade(1); }}
        onBlur={() => { setFocused(false); fade(0); }}
      />
      {secure && (
        <Pressable onPress={() => setVisible(!visible)} hitSlop={12}>
          <Feather name={visible ? 'eye' : 'eye-off'} size={18} color={C.muted} />
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin() {
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg(t('auth.login.errorEmptyFields'));
      return;
    }
    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await login(email, password);
      // AuthGuard in _layout.tsx will handle redirect to /home
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
        title={t('auth.login.headerTitle')}
        subtitle={t('auth.login.headerSubtitle')}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Error message */}
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

          <Field
            icon="mail" placeholder={t('auth.login.emailPlaceholder')}
            value={email} onChange={setEmail} keyboard="email-address"
          />
          <Field
            icon="lock" placeholder={t('auth.login.passwordPlaceholder')}
            value={password} onChange={setPassword} secure
          />

          {/* Forgot password */}
          <Pressable
            onPress={() => router.push('/auth/forgot-password')}
            style={{ alignSelf: 'flex-end', marginBottom: 28, marginTop: -6 }}
            hitSlop={12}
          >
            <Text style={{ color: C.glow, fontSize: 13, fontWeight: '700' }}>
              {t('auth.login.forgotPassword')}
            </Text>
          </Pressable>

          {/* Login button */}
          <ScalePress onPress={handleLogin} disabled={loading}>
            <View style={{
              height: 60, borderRadius: 32, backgroundColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.glow, shadowOpacity: 0.55, shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 }, elevation: 14,
            }}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 3 }}>
                    {t('auth.login.loginButton')}
                  </Text>}
            </View>
          </ScalePress>

          <View style={{ height: 14 }} />

          {/* Go to signup */}
          <ScalePress onPress={() => router.push('/auth/signup')}>
            <View style={{
              height: 58, borderRadius: 32, borderWidth: 1.6, borderColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(124,58,237,0.05)',
            }}>
              <Text style={{ color: C.primary, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 }}>
                {t('auth.login.newUser')}
              </Text>
            </View>
          </ScalePress>

          <View style={{ height: Platform.OS === 'web' ? 34 : 48 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
