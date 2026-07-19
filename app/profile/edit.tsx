/**
 * Edit Profile Screen — ধাপ ২
 * নাম, bio পরিবর্তন + Cloudinary photo upload
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, Alert,
  ActivityIndicator, Image, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import ScalePress from '@/components/ScalePress';
import { useAuth } from '@/src/context/AuthContext';
import { updateUser, VeeUser, subscribeUser } from '@/src/services/userService';
import { uploadProfilePhoto, deleteCloudinaryAsset } from '@/src/services/cloudinaryService';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  mutedDim: '#4A3D6E',
  border: 'rgba(255,255,255,0.10)',
  surface: 'rgba(255,255,255,0.055)',
  error: '#EF4444',
  success: '#22C55E',
} as const;

function InputField({
  label, value, onChangeText, placeholder, multiline, maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.mutedDim}
        multiline={multiline}
        maxLength={maxLength}
        style={{
          backgroundColor: C.surface,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          color: C.text,
          fontSize: 15,
          borderWidth: 1,
          borderColor: C.border,
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? 'top' : 'auto',
        }}
      />
      {maxLength && (
        <Text style={{ color: C.mutedDim, fontSize: 11, textAlign: 'right', marginTop: 4 }}>
          {value.length}/{maxLength}
        </Text>
      )}
    </View>
  );
}

export default function EditProfileScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const [profile, setProfile] = useState<VeeUser | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURI, setPhotoURI] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Track whether we've already done the initial load from Firebase.
  // Without this, every Firebase update (e.g. after photo upload writes
  // the new URL) would reset the user's in-progress name/bio edits.
  const hasLoadedRef = useRef(false);

  // Load current profile from Firebase — only seed name/bio on first snapshot.
  useEffect(() => {
    if (!user?.uid) return;
    hasLoadedRef.current = false; // reset on uid change (re-mount)
    const unsub = subscribeUser(user.uid, (veeUser) => {
      if (!veeUser) return;
      setProfile(veeUser);
      // Always keep photo in sync (upload may update it at any time)
      setPhotoURI(veeUser.photoURL ?? '');
      // Only seed the text fields once — do not reset the user's in-progress edits
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        setName(veeUser.name ?? '');
        setBio(veeUser.bio ?? '');
      }
    });
    return () => { hasLoadedRef.current = false; unsub(); };
  }, [user?.uid]);

  // ── Upload to Cloudinary + save URL to Firebase ───────────────────────────
  const uploadPhoto = useCallback(async (localUri: string) => {
    if (!user?.uid) return;
    setUploadingPhoto(true);
    try {
      // RC8-B2: Delete old Cloudinary asset before uploading a new one to prevent
      // orphaned images accumulating in the Cloudinary account. The publicId is
      // stored in users/{uid}/photoPublicId by the previous upload call.
      const oldPublicId = profile?.photoPublicId;
      if (oldPublicId) {
        deleteCloudinaryAsset(oldPublicId).catch(() => {/* non-critical */});
      }

      const result = await uploadProfilePhoto(localUri);
      setPhotoURI(result.url);
      await updateUser(user.uid, {
        photoURL: result.url,
        ...(result.publicId ? { photoPublicId: result.publicId } : {}),
      });
    } catch (err) {
      Alert.alert(t('editProfile.error'), err instanceof Error ? err.message : t('editProfile.uploadFailedMsg'));
    } finally {
      setUploadingPhoto(false);
    }
  }, [user?.uid, profile?.photoPublicId, t]);

  // ── Pick photo from gallery ────────────────────────────────────────────────
  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('editProfile.permissionNeeded'), t('editProfile.galleryPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  }, [uploadPhoto, t]);

  // ── Take photo with camera ────────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('editProfile.permissionNeeded'), t('editProfile.cameraPermission'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  }, [uploadPhoto, t]);

  // ── Show photo picker options ─────────────────────────────────────────────
  const handlePhotoPress = useCallback(() => {
    Alert.alert(t('editProfile.photoPicker'), '', [
      { text: t('editProfile.photoCamera'), onPress: takePhoto },
      { text: t('editProfile.photoGallery'), onPress: pickPhoto },
      { text: t('editProfile.photoCancel'), style: 'cancel' },
    ]);
  }, [takePhoto, pickPhoto, t]);

  // ── Save name + bio to Firebase ───────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user?.uid) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t('editProfile.error'), t('editProfile.errorNoName'));
      return;
    }
    setSaving(true);
    try {
      await updateUser(user.uid, {
        name: trimmedName,
        bio: bio.trim(),
      });
      Alert.alert(t('editProfile.savedTitle'), t('editProfile.savedMsg'), [
        { text: t('editProfile.savedOk'), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(t('editProfile.error'), err instanceof Error ? err.message : t('editProfile.saveError'));
    } finally {
      setSaving(false);
    }
  }, [user?.uid, name, bio, t]);

  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60, paddingTop: topPad + 12 }}
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 18, marginBottom: 32,
            }}>
              <ScalePress onPress={() => router.back()}>
                <View style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
                  alignItems: 'center', justifyContent: 'center', marginRight: 14,
                }}>
                  <Feather name="arrow-left" size={18} color={C.text} />
                </View>
              </ScalePress>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
                {t('editProfile.title')}
              </Text>
              <ScalePress onPress={handleSave} disabled={saving || uploadingPhoto}>
                <View style={{
                  backgroundColor: C.primary, borderRadius: 22,
                  paddingHorizontal: 20, paddingVertical: 10,
                  opacity: saving ? 0.6 : 1,
                  shadowColor: C.glow, shadowOpacity: 0.4, shadowRadius: 12,
                }}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{t('editProfile.save')}</Text>}
                </View>
              </ScalePress>
            </View>

            {/* Avatar picker */}
            <View style={{ alignItems: 'center', marginBottom: 36 }}>
              <ScalePress onPress={handlePhotoPress}>
                <View style={{ position: 'relative' }}>
                  {/* Avatar */}
                  <View style={{
                    width: 110, height: 110, borderRadius: 55,
                    borderWidth: 3, borderColor: C.glow,
                    shadowColor: C.glow, shadowOpacity: 0.45, shadowRadius: 22,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(139,92,246,0.2)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {uploadingPhoto ? (
                      <ActivityIndicator color={C.glow} size="large" />
                    ) : photoURI ? (
                      <Image source={{ uri: photoURI }} style={{ width: 110, height: 110 }} />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900' }}>{initials}</Text>
                    )}
                  </View>

                  {/* Camera badge */}
                  <View style={{
                    position: 'absolute', bottom: 2, right: 2,
                    width: 34, height: 34, borderRadius: 17,
                    backgroundColor: C.primary,
                    borderWidth: 2.5, borderColor: C.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="camera" size={15} color="#fff" />
                  </View>
                </View>
              </ScalePress>

              <Text style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>
                {t('editProfile.photoTapHint')}
              </Text>
            </View>

            {/* Form */}
            <View style={{ paddingHorizontal: 22 }}>
              <InputField
                label={t('editProfile.fieldName')}
                value={name}
                onChangeText={setName}
                placeholder={t('editProfile.namePlaceholder')}
                maxLength={40}
              />
              <InputField
                label={t('editProfile.fieldBio')}
                value={bio}
                onChangeText={setBio}
                placeholder={t('editProfile.bioPlaceholder')}
                multiline
                maxLength={150}
              />

              {/* Vee ID (read-only) */}
              <View style={{ marginBottom: 18 }}>
                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
                  {t('editProfile.fieldVeeId')}
                </Text>
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                }}>
                  <Feather name="hash" size={15} color={C.mutedDim} />
                  <Text style={{ color: C.mutedDim, fontSize: 15 }}>
                    {profile?.vId ?? '...'}
                  </Text>
                  <Feather name="lock" size={13} color={C.mutedDim} style={{ marginLeft: 'auto' }} />
                </View>
              </View>

              {/* Email (read-only) */}
              <View style={{ marginBottom: 18 }}>
                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
                  {t('editProfile.fieldEmail')}
                </Text>
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                }}>
                  <Feather name="mail" size={15} color={C.mutedDim} />
                  <Text style={{ color: C.mutedDim, fontSize: 15 }}>
                    {user?.email ?? '...'}
                  </Text>
                  <Feather name="lock" size={13} color={C.mutedDim} style={{ marginLeft: 'auto' }} />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
