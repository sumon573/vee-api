import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Pressable, Modal, TextInput, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C, ROOM_META } from '../constants/theme';
import { Participant } from '../types/room';
import { fmtDiamonds } from '../utils/format';
import { uploadRoomCover } from '@/src/services/cloudinaryService';

/* ─────────────────────────── Room Info Modal ─────────────────────────── */
export function RoomInfoModal({ visible, onClose, allMembers, weeklyEarned, roomTopic, accent,
  roomName, onChangeRoomName, roomImageUri, onChangeRoomImage, roomId, description,
  isOwner, onDisband, onLeave }: {
  visible: boolean; onClose: () => void;
  allMembers: Participant[];
  /** Fix 9: Weekly diamonds earned (from wallets/{uid}/weeklyEarned). */
  weeklyEarned: number;
  /** Room description text (may be empty). */
  description?: string;
  roomTopic: string; accent: string;
  roomName: string; onChangeRoomName: (name: string) => void;
  roomImageUri: string | null;
  /** Called with the Cloudinary URL after upload. */
  onChangeRoomImage: (cloudUrl: string) => void;
  roomId: string;
  /** Whether the current user is the room owner. */
  isOwner?: boolean;
  /** Called when the owner confirms "Disband Room". */
  onDisband?: () => void;
  /** Called when a non-owner taps "Leave Room". */
  onLeave?: () => void;
}) {
  const { t } = useTranslation();
  const owner   = allMembers.find((m: Participant) => m.role === 'host');
  const admins  = allMembers.filter((m: Participant) => m.role === 'admin');
  const regular = allMembers.filter((m: Participant) => m.role === 'member');

  const [editingName,    setEditingName]    = useState(false);
  const [nameInput,      setNameInput]      = useState(roomName);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => { if (!editingName) setNameInput(roomName); }, [roomName, editingName]);

  // Fix 3/8: Pick image, upload to Cloudinary, then persist via onChangeRoomImage
  async function pickRoomImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('voiceRoom.info.permissionRequired'), t('voiceRoom.info.permissionMsg'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const localUri = result.assets[0].uri;
    setUploadingImage(true);
    try {
      const uploaded = await uploadRoomCover(localUri);
      onChangeRoomImage(uploaded.url);
    } catch {
      // Do NOT store the local device URI — it is inaccessible to other users.
      // Silently discard and leave the existing room image unchanged.
      Alert.alert(
        t('voiceRoom.info.uploadError', 'Upload failed'),
        t('voiceRoom.info.uploadErrorMsg', 'Could not upload the image. Please try again.'),
      );
    } finally {
      setUploadingImage(false);
    }
  }

  function commitName() {
    const trimmed = nameInput.trim();
    if (trimmed.length >= 2) onChangeRoomName(trimmed);
    else setNameInput(roomName);
    setEditingName(false);
  }

  function MRow({ m, badge }: { m: Participant; badge?: string }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19,
          backgroundColor: m.color + '33', alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: m.speaking ? C.gold : C.borderFaint, marginRight: 12,
          overflow: 'hidden' }}>
          {m.photoURL
            ? <Image source={{ uri: m.photoURL }} style={{ width: 38, height: 38, borderRadius: 19 }} />
            : <Text style={{ color: m.color, fontSize: 13, fontWeight: '800' }}>{m.initials}</Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
          {badge && <Text style={{ color: C.sub, fontSize: 11, marginTop: 1 }}>{badge}</Text>}
        </View>
        {m.speaking && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.mic }} />}
      </View>
    );
  }

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <View style={{ flexDirection: 'row', paddingVertical: 9,
        borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
        <Text style={{ flex: 1, color: C.muted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{value}</Text>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: accent + '44', maxHeight: '88%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {/* ── Profile section ── */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            {/* Tappable room profile picture — Fix 3/8 */}
            <Pressable onPress={pickRoomImage} disabled={uploadingImage} style={{ marginBottom: 14 }}>
              <View style={{ width: 84, height: 84, borderRadius: 42,
                backgroundColor: accent + '33',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2.5, borderColor: accent + '66', overflow: 'hidden' }}>
                {uploadingImage
                  ? <ActivityIndicator color={accent} />
                  : roomImageUri
                    ? <Image source={{ uri: roomImageUri }} style={{ width: 84, height: 84 }} />
                    : <Feather name="mic" size={34} color={accent} />
                }
              </View>
              {/* Camera badge */}
              <View style={{ position: 'absolute', bottom: 2, right: 2,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#0F0A1E' }}>
                <Feather name="camera" size={13} color="#fff" />
              </View>
            </Pressable>

            {/* Room name — tap > to edit */}
            {editingName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                  style={{ color: C.text, fontSize: 19, fontWeight: '900',
                    borderBottomWidth: 1.5, borderBottomColor: accent,
                    minWidth: 120, textAlign: 'center', paddingBottom: 2 }}
                  onSubmitEditing={commitName}
                  maxLength={30}
                />
                <Pressable onPress={commitName} hitSlop={8}>
                  <Feather name="check" size={22} color={accent} />
                </Pressable>
                <Pressable onPress={() => { setNameInput(roomName); setEditingName(false); }} hitSlop={8}>
                  <Feather name="x" size={19} color={C.muted} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setNameInput(roomName); setEditingName(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>{roomName}</Text>
                <Feather name="chevron-right" size={18} color={accent} />
              </Pressable>
            )}

            <Text style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>{roomTopic}</Text>
          </View>

          {/* ── Info rows ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: C.borderFaint, marginBottom: description ? 12 : 20 }}>
            <Row label={t('voiceRoom.info.roomId')}      value={roomId} />
            <Row label={t('voiceRoom.info.type')}        value={ROOM_META.type} />
            <Row label={t('voiceRoom.info.members')}     value={t('voiceRoom.info.membersTotal', { count: allMembers.length })} />
            <Row label={t('voiceRoom.info.coinsWeekly')} value={fmtDiamonds(weeklyEarned)} />
          </View>

          {/* ── Room description ── */}
          {!!description && (
            <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14,
              borderWidth: 1, borderColor: C.borderFaint, marginBottom: 20 }}>
              <Text style={{ color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 0.8,
                textTransform: 'uppercase', marginBottom: 8 }}>
                {t('voiceRoom.info.description', { defaultValue: 'Description' })}
              </Text>
              <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>
                {description}
              </Text>
            </View>
          )}

          {owner && (
            <>
              <Text style={{ color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2,
                marginBottom: 8, textTransform: 'uppercase' }}>
                {t('voiceRoom.info.ownerSection')}
              </Text>
              <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14,
                borderWidth: 1, borderColor: C.borderFaint, marginBottom: 20 }}>
                <MRow m={owner} badge={t('voiceRoom.info.ownerBadge')} />
              </View>
            </>
          )}
          {admins.length > 0 && (
            <>
              <Text style={{ color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2,
                marginBottom: 8, textTransform: 'uppercase' }}>
                {t('voiceRoom.info.adminsSection', { count: admins.length })}
              </Text>
              <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14,
                borderWidth: 1, borderColor: C.borderFaint, marginBottom: 20 }}>
                {admins.map(m => <MRow key={m.id} m={m} badge={t('voiceRoom.info.adminBadge')} />)}
              </View>
            </>
          )}
          {regular.length > 0 && (
            <>
              <Text style={{ color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2,
                marginBottom: 8, textTransform: 'uppercase' }}>
                {t('voiceRoom.info.membersSection', { count: regular.length })}
              </Text>
              <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14,
                borderWidth: 1, borderColor: C.borderFaint, marginBottom: 20 }}>
                {regular.map(m => <MRow key={m.id} m={m} />)}
              </View>
            </>
          )}
        </ScrollView>

        <View style={{ padding: 16, gap: 10 }}>
          {isOwner ? (
            <Pressable
              onPress={() => {
                Alert.alert(
                  t('voiceRoom.info.disbandTitle', { defaultValue: 'Disband Room' }),
                  t('voiceRoom.info.disbandMsg', { defaultValue: 'This will permanently delete the room for everyone. Are you sure?' }),
                  [
                    { text: t('voiceRoom.info.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                    {
                      text: t('voiceRoom.info.disbandConfirm', { defaultValue: 'Disband' }),
                      style: 'destructive',
                      onPress: () => { onClose(); onDisband?.(); },
                    },
                  ],
                );
              }}
              style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                {t('voiceRoom.info.disbandRoom', { defaultValue: '🗑 Disband Room' })}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { onClose(); onLeave?.(); }}
              style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                {t('voiceRoom.info.leaveRoom', { defaultValue: '🚪 Leave Room' })}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={{ backgroundColor: accent + '33', borderRadius: 16,
            paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: accent + '55' }}>
            <Text style={{ color: accent, fontWeight: '700', fontSize: 14 }}>
              {t('voiceRoom.info.close')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
