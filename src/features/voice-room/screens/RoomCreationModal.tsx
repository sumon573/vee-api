import type { ComponentProps } from 'react';
import { useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Modal, ScrollView,
  Animated, Alert, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import ScalePress from '@/components/ScalePress';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/src/context/AuthContext';
import { createRoom, getUserColor, getInitials, getUserRoomCounts } from '../services/firebaseRoomService';
import { uploadRoomCover } from '@/src/services/cloudinaryService';

const C = {
  bg:          '#07020F',
  card:        '#0F0A1E',
  primary:     '#7C3AED',
  glow:        '#8B5CF6',
  text:        '#FFFFFF',
  muted:       '#B8A6D9',
  mutedDim:    '#6B5E8A',
  border:      'rgba(139,92,246,0.28)',
  borderFaint: 'rgba(255,255,255,0.09)',
  inputBg:     'rgba(139,92,246,0.07)',
  error:       '#FF4B4B',
  gold:        '#F59E0B',
} as const;

const AVATAR_COLORS = [
  '#7C3AED', '#EC4899', '#3B82F6', '#10B981',
  '#F97316', '#A855F7', '#0EA5E9', '#22C55E',
  '#EF4444', '#F59E0B',
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onRoomCreated: (roomId: string) => void;
};

function Field({
  icon, placeholder, value, onChange, multiline, maxLength,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  placeholder: string;
  value: string;
  onChange: (t: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const fade = (v: number) =>
    Animated.timing(anim, { toValue: v, duration: 200, useNativeDriver: false }).start();

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.border, C.glow],
  });

  return (
    <Animated.View style={{
      flexDirection: multiline ? 'column' : 'row',
      alignItems: multiline ? 'flex-start' : 'center',
      borderRadius: 16, borderWidth: 1.5, borderColor,
      backgroundColor: C.inputBg,
      paddingHorizontal: 16, paddingVertical: multiline ? 12 : 0,
      minHeight: multiline ? 90 : 56, marginBottom: 14,
      shadowColor: C.glow, shadowOpacity: focused ? 0.2 : 0,
      shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        marginBottom: multiline ? 6 : 0, marginRight: multiline ? 0 : 10,
      }}>
        <Feather name={icon} size={16} color={focused ? C.glow : C.mutedDim} />
      </View>
      <TextInput
        style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '500',
          height: multiline ? undefined : '100%',
          textAlignVertical: multiline ? 'top' : 'center' }}
        placeholder={placeholder}
        placeholderTextColor={C.mutedDim}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        maxLength={maxLength}
        onFocus={() => { setFocused(true); fade(1); }}
        onBlur={() => { setFocused(false); fade(0); }}
        autoCorrect={false}
      />
      {maxLength && value.length > 0 && (
        <Text style={{ color: C.mutedDim, fontSize: 10, alignSelf: 'flex-end' }}>
          {value.length}/{maxLength}
        </Text>
      )}
    </Animated.View>
  );
}

export default function RoomCreationModal({ visible, onClose, onRoomCreated }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();

  type RoomCategory = 'adda' | 'music' | 'game' | 'talk' | 'study';

  const CATEGORY_OPTIONS: { key: RoomCategory; label: string; emoji: string }[] = [
    { key: 'adda',  label: t('voiceRoom.creation.categoryAdda',  { defaultValue: 'Hangout' }), emoji: '💬' },
    { key: 'music', label: t('voiceRoom.creation.categoryMusic', { defaultValue: 'Music'  }), emoji: '🎵' },
    { key: 'game',  label: t('voiceRoom.creation.categoryGame',  { defaultValue: 'Game'   }), emoji: '🎮' },
    { key: 'talk',  label: t('voiceRoom.creation.categoryTalk',  { defaultValue: 'Talk'   }), emoji: '🗣️' },
    { key: 'study', label: t('voiceRoom.creation.categoryStudy', { defaultValue: 'Study'  }), emoji: '📚' },
  ];

  const [name,        setName]        = useState('');
  const [topic,       setTopic]       = useState('');
  const [description, setDescription] = useState('');
  const [isPublic,    setIsPublic]    = useState(true);
  const [category,    setCategory]    = useState<RoomCategory>('adda');
  const [profileColor, setProfileColor] = useState(AVATAR_COLORS[0]);
  const [profileImage, setProfileImage] = useState<string | undefined>(undefined);
  const [creating,    setCreating]    = useState(false);
  const [pin,         setPin]         = useState('');
  const [pinError,    setPinError]    = useState('');

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setProfileImage(res.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(t('voiceRoom.creation.title'), t('voiceRoom.creation.errorNoName')); return;
    }
    if (!user) {
      Alert.alert(t('voiceRoom.screen.error'), t('voiceRoom.creation.errorNotLoggedIn')); return;
    }
    setCreating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      let coverImageUrl: string | undefined;
      if (profileImage) {
        try {
          const uploaded = await uploadRoomCover(profileImage);
          coverImageUrl = uploaded.url;
        } catch {
          // Non-fatal — the room is still created without a cover image.
          Alert.alert(
            t('voiceRoom.creation.coverUploadFailedTitle'),
            t('voiceRoom.creation.coverUploadFailedMsg'),
          );
        }
      }

      // Fix 6: Silently try to attach geolocation to the room (best-effort)
      let location: { lat: number; lng: number } | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch { /* non-critical — room is created without location */ }

      // Room creation limit check
      const { publicCount, privateCount } = await getUserRoomCounts(user.uid);
      if (isPublic && publicCount >= 1) {
        Alert.alert('Limit Reached', 'You already have a Public Room. Close your existing room before creating a new one.');
        setCreating(false);
        return;
      }
      if (!isPublic && privateCount >= 1) {
        Alert.alert('Limit Reached', 'You already have a Private Room. Close your existing room before creating a new one.');
        setCreating(false);
        return;
      }

      // Validate PIN for private room
      if (!isPublic) {
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
          Alert.alert('PIN Required', 'Please enter a 4-digit numeric PIN for your Private Room.');
          setCreating(false);
          return;
        }
      }

      // Hash PIN for secure storage
      let hashedPin: string | undefined;
      if (!isPublic && pin) {
        hashedPin = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
      }

      const roomId = await createRoom({
        name: name.trim(),
        topic: topic.trim() || t('voiceRoom.creation.defaultTopic'),
        description: description.trim(),
        isPublic,
        category,
        themeColor: profileColor,
        hostId: user.uid,
        hostName: user.displayName ?? t('voiceRoom.screen.defaultUserName'),
        // RC6 fix Issue 5: pass host's photoURL so seat 0 shows the avatar
        // immediately after room creation without a separate fetch.
        hostPhotoURL: user.photoURL ?? undefined,
        coverImageUrl,
        location,
        hashedPin,
      });

      // Reset form
      setName('');
      setTopic('');
      setDescription('');
      setIsPublic(true);
      setPin('');
      setPinError('');
      setCategory('adda');
      setProfileColor(AVATAR_COLORS[0]);
      setProfileImage(undefined);

      onRoomCreated(roomId);
    } catch (e) {
      Alert.alert(t('voiceRoom.screen.error'), t('voiceRoom.creation.errorCreateFailed'));
    } finally {
      setCreating(false);
    }
  };

  const roomTypeOptions = [
    { label: t('voiceRoom.creation.publicLabel'), value: true,  desc: t('voiceRoom.creation.publicDesc') },
    { label: t('voiceRoom.creation.privateLabel'), value: false, desc: t('voiceRoom.creation.privateDesc') },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingTop: Platform.OS === 'web' ? 68 : 12,
              marginBottom: 28,
            }}>
              <Pressable onPress={onClose} style={{ padding: 6, marginRight: 12 }}>
                <Feather name="x" size={22} color={C.muted} />
              </Pressable>
              <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', flex: 1 }}>
                {t('voiceRoom.creation.title')}
              </Text>
            </View>

            {/* Profile image picker */}
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <Pressable onPress={pickImage}>
                <View style={{
                  width: 100, height: 100, borderRadius: 26,
                  backgroundColor: profileImage ? 'transparent' : profileColor,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2.5, borderColor: profileColor,
                  shadowColor: profileColor, shadowOpacity: 0.5,
                  shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                  overflow: 'hidden',
                }}>
                  {profileImage
                    ? <Image source={{ uri: profileImage }} style={{ width: '100%', height: '100%' }} />
                    : <Feather name="mic" size={36} color="rgba(255,255,255,0.9)" />
                  }
                </View>
              </Pressable>
              <Text style={{ color: C.mutedDim, fontSize: 12, marginTop: 8 }}>
                {t('voiceRoom.creation.coverPhotoLabel')}
              </Text>
            </View>

            {/* Color picker */}
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
              {t('voiceRoom.creation.roomColorLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {AVATAR_COLORS.map((color) => (
                <Pressable key={color} onPress={() => setProfileColor(color)}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 17,
                    backgroundColor: color,
                    borderWidth: profileColor === color ? 3 : 0,
                    borderColor: '#fff',
                    shadowColor: color,
                    shadowOpacity: profileColor === color ? 0.7 : 0,
                    shadowRadius: 8,
                  }} />
                </Pressable>
              ))}
            </View>

            {/* Fields */}
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
              {t('voiceRoom.creation.roomInfoLabel')}
            </Text>

            <Field
              icon="mic"
              placeholder={t('voiceRoom.creation.namePlaceholder')}
              value={name}
              onChange={setName}
              maxLength={40}
            />
            <Field
              icon="tag"
              placeholder={t('voiceRoom.creation.topicPlaceholder')}
              value={topic}
              onChange={setTopic}
              maxLength={50}
            />
            <Field
              icon="align-left"
              placeholder={t('voiceRoom.creation.descriptionPlaceholder')}
              value={description}
              onChange={setDescription}
              multiline
              maxLength={150}
            />

            {/* Public / Private toggle */}
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 4, letterSpacing: 0.5 }}>
              {t('voiceRoom.creation.roomTypeLabel')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
              {roomTypeOptions.map((opt) => (
                <ScalePress key={String(opt.value)} onPress={() => setIsPublic(opt.value)}>
                  <View style={{
                    flex: 1, borderRadius: 16, padding: 14,
                    backgroundColor: isPublic === opt.value ? C.primary + '22' : C.inputBg,
                    borderWidth: 1.5,
                    borderColor: isPublic === opt.value ? C.primary : C.border,
                  }}>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 14 }}>
                      {opt.label}
                    </Text>
                    <Text style={{ color: C.mutedDim, fontSize: 11, marginTop: 3 }}>
                      {opt.desc}
                    </Text>
                  </View>
                </ScalePress>
              ))}
            </View>

            {/* 4-digit PIN for Private rooms */}
            {!isPublic && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
                  Room PIN (4-digit number)
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  borderRadius: 16, borderWidth: 1.5,
                  borderColor: pinError ? C.error : C.border,
                  backgroundColor: C.inputBg, paddingHorizontal: 16,
                  minHeight: 56,
                }}>
                  <Feather name={'lock'} size={16} color={pinError ? C.error : C.mutedDim} style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, color: C.text, fontSize: 22, fontWeight: '700', letterSpacing: 10 }}
                    placeholder={'0000'}
                    placeholderTextColor={C.mutedDim}
                    value={pin}
                    onChangeText={(txt) => {
                      const digits = txt.replace(/[^0-9]/g, '').slice(0, 4);
                      setPin(digits);
                      if (pinError) setPinError('');
                    }}
                    keyboardType={'number-pad'}
                    maxLength={4}
                    secureTextEntry={true}
                    autoCorrect={false}
                  />
                  <Text style={{ color: C.mutedDim, fontSize: 11 }}>{pin.length}/4</Text>
                </View>
                {pinError ? (
                  <Text style={{ color: C.error, fontSize: 12, marginTop: 5 }}>{pinError}</Text>
                ) : (
                  <Text style={{ color: C.mutedDim, fontSize: 11, marginTop: 5 }}>
                    This PIN is required to join your Private Room
                  </Text>
                )}
              </View>
            )}

            {/* Category picker */}
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 4, letterSpacing: 0.5 }}>
              {t('voiceRoom.creation.categoryLabel', { defaultValue: 'Room Category' })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
              {CATEGORY_OPTIONS.map((opt) => {
                const isActive = category === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setCategory(opt.key); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
                      backgroundColor: isActive ? C.primary + '22' : C.inputBg,
                      borderWidth: 1.5,
                      borderColor: isActive ? C.primary : C.border,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{opt.emoji}</Text>
                    <Text style={{ color: isActive ? C.text : C.muted, fontSize: 13, fontWeight: isActive ? '800' : '600' }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Create button */}
            <ScalePress onPress={handleCreate} disabled={creating}>
              <View style={{
                borderRadius: 18, padding: 18,
                backgroundColor: C.primary,
                alignItems: 'center',
                shadowColor: C.primary, shadowOpacity: 0.5,
                shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                opacity: creating ? 0.7 : 1,
              }}>
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.3 }}>
                      {t('voiceRoom.creation.createButton')}
                    </Text>
                }
              </View>
            </ScalePress>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
