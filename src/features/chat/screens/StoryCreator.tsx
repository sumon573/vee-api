import { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TextInput, Pressable, Alert, Image,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import ScalePress from '@/components/ScalePress';
import { uploadStoryImage } from '../services/cloudinaryService';
import { useAuth } from '@/src/context/AuthContext';
import { ref, get } from 'firebase/database';
import { database } from '@/src/config/firebase';

const { width } = Dimensions.get('window');

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  dim: '#4A3D6E',
  border: '#2A2542',
  inputBg: 'rgba(139,92,246,0.07)',
  glass: 'rgba(255,255,255,0.055)',
  glassBorder: 'rgba(255,255,255,0.09)',
} as const;

const BG_PRESETS: [string, string][] = [
  ['#7C3AED', '#A855F7'],
  ['#4F46E5', '#6366F1'],
  ['#0EA5E9', '#38BDF8'],
  ['#EC4899', '#F472B6'],
  ['#F97316', '#FB923C'],
  ['#22C55E', '#4ADE80'],
  ['#1a1a2e', '#16213e'],
  ['#0f2027', '#203a43'],
];

type TabType = 'text' | 'photo';

function BgPicker({
  selected, onSelect,
}: {
  selected: [string, string];
  onSelect: (g: [string, string]) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
      {BG_PRESETS.map((g, i) => (
        <Pressable key={i} onPress={() => onSelect(g)}>
          <View style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: g[0],
            borderWidth: selected[0] === g[0] ? 2.5 : 0,
            borderColor: '#fff',
          }} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

type Contact = { id: string; name: string };

function MentionPicker({
  contacts,
  mentions,
  onToggle,
}: {
  contacts: Contact[];
  mentions: string[];
  onToggle: (id: string) => void;
}) {
  if (contacts.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {contacts.map((contact) => {
        const selected = mentions.includes(contact.id);
        return (
          <Pressable key={contact.id} onPress={() => onToggle(contact.id)}>
            <View style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
              backgroundColor: selected ? C.primary : C.glass,
              borderWidth: 1,
              borderColor: selected ? C.primary : C.glassBorder,
            }}>
              <Text style={{ color: selected ? '#fff' : C.muted, fontSize: 13, fontWeight: '700' }}>
                {contact.name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPublish: (story: {
    type: 'text' | 'image';
    content: string;
    bgGradient: [string, string];
    mentions: string[];
    privacy: 'public' | 'contacts';
  }) => Promise<void>;
};

export default function StoryCreator({ visible, onClose, onPublish }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab]           = useState<TabType>('text');
  const [text, setText]         = useState('');
  const [bgGradient, setBg]     = useState<[string, string]>(BG_PRESETS[0]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [privacy, setPrivacy]   = useState<'public' | 'contacts'>('public');

  // Real Firebase contacts (from userChats)
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => {
    if (!visible || !user?.uid) return;
    get(ref(database, `userChats/${user.uid}`)).then((snap) => {
      if (!snap.exists()) return;
      const list: Contact[] = [];
      snap.forEach((child) => {
        const v = child.val() as { participantId?: string; participantName?: string };
        if (v.participantId && v.participantName) {
          list.push({ id: v.participantId, name: v.participantName });
        }
      });
      setContacts(list.slice(0, 12));
    }).catch(() => {});
  }, [visible, user?.uid]);

  const toggleMention = (id: string) => {
    setMentions(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id],
    );
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [9, 16], quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const handlePublish = async () => {
    if (tab === 'text' && !text.trim()) {
      Alert.alert(t('chat.storyEmptyAlert'), t('chat.storyEmptyMsg')); return;
    }
    if (tab === 'photo' && !photoUri) {
      Alert.alert(t('chat.storyNoPhotoAlert'), t('chat.storyNoPhotoMsg')); return;
    }
    setPublishing(true);
    try {
      let content = text.trim();
      if (tab === 'photo' && photoUri) {
        // Upload to Cloudinary — returns CloudinaryUploadResult, extract .url
        const result = await uploadStoryImage(photoUri);
        content = result.url;
      }
      await onPublish({
        type: tab === 'photo' ? 'image' : 'text',
        content,
        bgGradient,
        mentions,
        privacy,
      });
      // Reset
      setText('');
      setPhotoUri(null);
      setMentions([]);
      setBg(BG_PRESETS[0]);
      setPrivacy('public');
      onClose();
    } catch {
      Alert.alert(t('chat.error'), t('chat.storyPublishError'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <Pressable onPress={onClose} style={{ padding: 6, marginRight: 12 }}>
                  <Feather name="x" size={22} color={C.muted} />
                </Pressable>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
                  {t('chat.storyCreate')}
                </Text>
                <ScalePress onPress={handlePublish} disabled={publishing}>
                  <View style={{
                    backgroundColor: C.primary, borderRadius: 20,
                    paddingHorizontal: 18, paddingVertical: 9,
                    opacity: publishing ? 0.6 : 1,
                  }}>
                    {publishing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('chat.storyPost')}</Text>
                    }
                  </View>
                </ScalePress>
              </View>

              {/* Tab selector */}
              <View style={{
                flexDirection: 'row', backgroundColor: C.glass,
                borderRadius: 12, padding: 4, marginBottom: 20,
                borderWidth: 1, borderColor: C.glassBorder,
              }}>
                {(['text', 'photo'] as TabType[]).map((tabKey) => (
                  <Pressable
                    key={tabKey}
                    onPress={() => setTab(tabKey)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 10,
                      backgroundColor: tab === tabKey ? C.primary : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      color: tab === tabKey ? '#fff' : C.muted,
                      fontWeight: '800', fontSize: 14,
                    }}>
                      {tabKey === 'text' ? t('chat.storyTabText') : t('chat.storyTabPhoto')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {tab === 'text' ? (
                <>
                  {/* Background color */}
                  <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
                    {t('chat.storyBackground')}
                  </Text>
                  <BgPicker selected={bgGradient} onSelect={setBg} />

                  {/* Preview box */}
                  <View style={{
                    width: '100%', aspectRatio: 9 / 16,
                    borderRadius: 20, overflow: 'hidden',
                    marginTop: 16, marginBottom: 20,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: bgGradient[0],
                    borderWidth: 1, borderColor: C.glassBorder,
                  }}>
                    <TextInput
                      style={{
                        color: '#fff', fontSize: 22, fontWeight: '800',
                        textAlign: 'center', paddingHorizontal: 24,
                        width: '100%',
                      }}
                      placeholder={t('chat.storyTextPlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      value={text}
                      onChangeText={setText}
                      multiline
                      maxLength={200}
                    />
                  </View>
                </>
              ) : (
                <>
                  {/* Photo picker */}
                  <ScalePress onPress={pickPhoto}>
                    <View style={{
                      width: '100%', aspectRatio: 9 / 16,
                      borderRadius: 20, overflow: 'hidden',
                      backgroundColor: C.glass,
                      borderWidth: 1.5, borderColor: C.border,
                      borderStyle: 'dashed',
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 20,
                    }}>
                      {photoUri ? (
                        <View style={{ width: '100%', height: '100%' }}>
                          <Image
                            source={{ uri: photoUri }}
                            style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                          />
                          {/* Tap-to-change overlay */}
                          <View style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 8,
                            alignItems: 'center',
                          }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                              {t('chat.storyTapToChange', { defaultValue: 'Tap to change photo' })}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <>
                          <Feather name="image" size={40} color={C.dim} />
                          <Text style={{ color: C.muted, fontSize: 15, fontWeight: '700', marginTop: 12 }}>
                            {t('chat.storyPickPhoto')}
                          </Text>
                          <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                            {t('chat.storyGalleryHint')}
                          </Text>
                        </>
                      )}
                    </View>
                  </ScalePress>
                </>
              )}

              {/* Privacy selector */}
              <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 10, letterSpacing: 0.5 }}>
                {t('chat.storyPrivacy', { defaultValue: 'Who can see this?' })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {(['public', 'contacts'] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPrivacy(p)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: privacy === p ? C.primary : C.glassBorder,
                      backgroundColor: privacy === p ? C.primary + '22' : C.glass,
                      alignItems: 'center', flexDirection: 'row',
                      justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Feather
                      name={p === 'public' ? 'globe' : 'users'}
                      size={14}
                      color={privacy === p ? C.primary : C.muted}
                    />
                    <Text style={{
                      color: privacy === p ? C.primary : C.muted,
                      fontSize: 13, fontWeight: '700',
                    }}>
                      {p === 'public'
                        ? t('chat.storyPrivacyPublic', { defaultValue: 'Public' })
                        : t('chat.storyPrivacyContacts', { defaultValue: 'Contacts' })
                      }
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Mention contacts */}
              {contacts.length > 0 && (
                <>
                  <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
                    {t('chat.storyMentionFriends')}
                  </Text>
                  <MentionPicker
                    contacts={contacts}
                    mentions={mentions}
                    onToggle={toggleMention}
                  />
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
