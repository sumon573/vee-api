import { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable,
  Animated, Alert, ScrollView, ActivityIndicator, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import WaveTopHeader from '@/components/WaveTopHeader';
import ScalePress from '@/components/ScalePress';
import { signUp, getAuthErrorMessage } from '@/src/services/authService';
import { deleteUser } from 'firebase/auth';
import { createUser, setupPresence, generateAndReserveVId } from '@/src/services/userService';
import { initializeWallet } from '@/src/features/wallet/walletService';
import { uploadImage } from '@/src/services/cloudinaryService';
import generateVId from '@/src/utils/generateVId';

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
  avatarBg: 'rgba(139,92,246,0.14)',
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
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'words'}
        autoCorrect={false}
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

// ─── Signup Screen ────────────────────────────────────────────────────────────

export default function SignupScreen() {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoLocalUri, setPhotoLocalUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // ─── Avatar picker ────────────────────────────────────────────────────────

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('auth.signup.photoUploadTitle'), t('auth.signup.permissionDenied', 'Gallery access is required to upload a photo.'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoLocalUri(result.assets[0].uri);
    }
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!name.trim())                         return t('auth.signup.errorNoName');
    if (!email.trim())                        return t('auth.signup.errorNoEmail');
    if (!/\S+@\S+\.\S+/.test(email))         return t('auth.signup.errorInvalidEmail');
    if (password.length < 6)                  return t('auth.signup.errorShortPassword');
    if (password !== confirmPass)             return t('auth.signup.errorPasswordMismatch');
    if (!agreed)                              return t('auth.signup.errorNoTerms');
    return null;
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleSignUp() {
    setErrorMsg('');
    const err = validate();
    if (err) { setErrorMsg(err); return; }

    try {
      setLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const firebaseUser = await signUp(email, password, name);

      // Generate a unique Vee ID (atomic reserve — safe under concurrent signups)
      let vId: string;
      try {
        vId = await generateAndReserveVId(firebaseUser.uid, generateVId);
      } catch (vidErr) {
        // VID reservation failed — roll back the Firebase Auth account so the
        // user can retry cleanly (otherwise they'd have an orphaned auth entry).
        await deleteUser(firebaseUser).catch(() => {});
        throw vidErr;
      }

      // Upload avatar to Cloudinary if selected
      let photoURL = '';
      if (photoLocalUri) {
        try {
          setPhotoUploading(true);
          const uploaded = await uploadImage(photoLocalUri, { folder: 'vee/avatars', transformation: 'c_fill,w_400,h_400,q_auto' });
          photoURL = uploaded.url;
        } catch {
          // Non-fatal — continue without avatar
        } finally {
          setPhotoUploading(false);
        }
      }

      // Save user profile to Firebase Realtime DB.
      // If this fails, roll back the Firebase Auth account so the user isn't
      // stuck with an auth entry that has no corresponding DB profile.
      try {
        await createUser({
          uid: firebaseUser.uid,
          vId,
          name: name.trim(),
          email: firebaseUser.email ?? email.trim(),
          photoURL,
          bio: '',
          createdAt: Date.now(),
          lastSeen: Date.now(),
          online: true,
        });
      } catch (dbErr) {
        await deleteUser(firebaseUser).catch(() => {});
        throw dbErr;
      }

      // Give new user 500 free diamonds to start (server-authoritative)
      await initializeWallet(firebaseUser.uid).catch(() => {});

      setupPresence(firebaseUser.uid);
      // AuthGuard handles redirect to /home
    } catch (err) {
      setErrorMsg(getAuthErrorMessage(err));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <WaveTopHeader
        title={t('auth.signup.headerTitle')}
        subtitle={t('auth.signup.headerSubtitle')}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar picker */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Pressable onPress={handlePickAvatar} disabled={photoUploading}>
              <View style={{
                width: 90, height: 90, borderRadius: 45,
                backgroundColor: C.avatarBg,
                borderWidth: 2, borderColor: C.primary,
                borderStyle: photoLocalUri ? 'solid' : 'dashed',
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                shadowColor: C.glow, shadowOpacity: 0.3, shadowRadius: 18,
                shadowOffset: { width: 0, height: 6 }, elevation: 8,
              }}>
                {photoLocalUri
                  ? <Image source={{ uri: photoLocalUri }} style={{ width: 90, height: 90, borderRadius: 45 }} />
                  : photoUploading
                    ? <ActivityIndicator color={C.glow} />
                    : <Feather name="user" size={28} color={C.glow} />
                }
              </View>
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: C.primary, borderWidth: 2, borderColor: C.bg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="camera" size={12} color="#fff" />
              </View>
            </Pressable>
          </View>

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

          <Field icon="user" placeholder={t('auth.signup.namePlaceholder')} value={name} onChange={setName} />
          <Field icon="mail" placeholder={t('auth.signup.emailPlaceholder')} value={email} onChange={setEmail} keyboard="email-address" />
          <Field icon="lock" placeholder={t('auth.signup.passwordPlaceholder')} value={password} onChange={setPassword} secure />
          <Field icon="lock" placeholder={t('auth.signup.confirmPasswordPlaceholder')} value={confirmPass} onChange={setConfirmPass} secure />

          {/* Terms checkbox */}
          <Pressable
            onPress={() => setAgreed(!agreed)}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28, gap: 10 }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 6,
              borderWidth: 1.8, borderColor: C.primary,
              backgroundColor: agreed ? C.primary : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {agreed && <Feather name="check" size={13} color="#fff" />}
            </View>
            <Text style={{ color: C.muted, fontSize: 13, flex: 1 }}>
              {t('auth.signup.termsPrefix')}
              <Text style={{ color: C.glow, fontWeight: '700' }}>{t('auth.signup.termsLink')}</Text>
              {t('auth.signup.termsAnd')}
              <Text style={{ color: C.glow, fontWeight: '700' }}>{t('auth.signup.privacyLink')}</Text>
              {t('auth.signup.termsSuffix')}
            </Text>
          </Pressable>

          {/* Signup button */}
          <ScalePress onPress={handleSignUp} disabled={loading}>
            <View style={{
              height: 60, borderRadius: 32, backgroundColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.glow, shadowOpacity: 0.55, shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 }, elevation: 14,
            }}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 2.5 }}>
                    {t('auth.signup.createButton')}
                  </Text>}
            </View>
          </ScalePress>

          <View style={{ height: 14 }} />

          <ScalePress onPress={() => router.replace('/auth/login')}>
            <View style={{
              height: 58, borderRadius: 32, borderWidth: 1.6, borderColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(124,58,237,0.05)',
            }}>
              <Text style={{ color: C.primary, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 }}>
                {t('auth.signup.alreadyHaveAccount')}
              </Text>
            </View>
          </ScalePress>

          <View style={{ height: Platform.OS === 'web' ? 34 : 48 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
