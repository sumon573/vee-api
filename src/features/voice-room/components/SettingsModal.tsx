import type { FC } from 'react';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Pressable, Modal, TextInput, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C, ROOM_THEMES } from '../constants/theme';

/* ─────────────────────────── Settings Modal ─────────────────────────── */

/**
 * SettingsModal — room settings for owner/admin.
 *
 * Fix: "Public Room" and "Lock Room" toggles are now wired to Firebase via
 * the `roomIsPublic`, `roomIsLocked` props (initial values from room info)
 * and the `onSaveSettings` callback (called on Save with the new values).
 * "Mute New Joiners" toggle has been removed as per product decision.
 */
export function SettingsModal({
  visible, onClose, isOwnerOrAdmin,
  topic, setTopic,
  activeThemeId, onThemeChange,
  onOpenHistory, accent,
  roomIsPublic, roomIsLocked,
  onSaveSettings,
}: {
  visible: boolean; onClose: () => void; isOwnerOrAdmin: boolean;
  topic: string; setTopic: (t: string) => void;
  activeThemeId: string; onThemeChange: (id: string) => void;
  onOpenHistory: () => void; accent: string;
  /** Current persisted value of isPublic from Firebase room info. */
  roomIsPublic: boolean;
  /** Current persisted value of isLocked from Firebase room info. */
  roomIsLocked: boolean;
  /** Called on Save with the new (isPublic, isLocked) pair to persist to Firebase. */
  onSaveSettings: (isPublic: boolean, isLocked: boolean) => void;
}) {
  const { t } = useTranslation();
  const [localTopic, setLocalTopic] = useState(topic);
  const [isPublic,   setIsPublic]   = useState(roomIsPublic);
  const [lockRoom,   setLockRoom]   = useState(roomIsLocked);
  const [showThemes, setShowThemes] = useState(false);

  // Sync local state from props whenever the modal opens (or props change while open)
  useEffect(() => {
    if (visible) {
      setLocalTopic(topic);
      setIsPublic(roomIsPublic);
      setLockRoom(roomIsLocked);
    }
  }, [visible, topic, roomIsPublic, roomIsLocked]);

  const handleSave = () => {
    const trimmedTopic = localTopic.trim() || topic;
    setTopic(trimmedTopic);
    onSaveSettings(isPublic, lockRoom);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  const toggleRows = [
    {
      label: t('voiceRoom.settings.publicRoom'),
      sub:   t('voiceRoom.settings.publicRoomSub'),
      val:   isPublic,
      set:   setIsPublic,
    },
    {
      label: t('voiceRoom.settings.lockRoom'),
      sub:   t('voiceRoom.settings.lockRoomSub'),
      val:   lockRoom,
      set:   setLockRoom,
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: accent + '44', maxHeight: '92%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
        <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 20 }}>
            {t('voiceRoom.settings.title')}
          </Text>

          {/* Topic */}
          <Text style={{ color: C.sub, fontSize: 13, marginBottom: 8, fontWeight: '700' }}>
            {t('voiceRoom.settings.topicLabel')}
          </Text>
          <TextInput
            value={localTopic}
            onChangeText={setLocalTopic}
            placeholderTextColor={C.muted}
            editable={isOwnerOrAdmin}
            style={{ backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 16,
              paddingVertical: 12, color: C.text, fontSize: 14, borderWidth: 1,
              borderColor: isOwnerOrAdmin ? accent + '55' : C.borderFaint, marginBottom: 16 }}
          />

          {/* Toggles — Public Room + Lock Room (Firebase-persisted on Save) */}
          {toggleRows.map(row => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center',
              paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.borderFaint }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{row.sub}</Text>
              </View>
              <Switch
                value={row.val}
                onValueChange={isOwnerOrAdmin ? row.set : undefined}
                trackColor={{ false: C.muted, true: accent }}
                thumbColor={C.text}
                disabled={!isOwnerOrAdmin}
              />
            </View>
          ))}

          {/* Room Themes */}
          <View style={{ borderTopWidth: 1, borderTopColor: C.borderFaint, paddingTop: 16, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                if (!isOwnerOrAdmin) {
                  Alert.alert(t('voiceRoom.settings.permissionDenied'), t('voiceRoom.settings.permissionDeniedMsg'));
                  return;
                }
                setShowThemes((v: boolean) => !v);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                  {t('voiceRoom.settings.themeLabel')}
                </Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  {isOwnerOrAdmin ? t('voiceRoom.settings.themeTapHint') : t('voiceRoom.settings.themeAdminOnly')}
                </Text>
              </View>
              <View style={{
                backgroundColor: accent + '33', borderRadius: 20,
                paddingHorizontal: 10, paddingVertical: 4,
                flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8,
              }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />
                <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700' }}>
                  {ROOM_THEMES.find((th: { id: string; name: string; accent: string }) => th.id === activeThemeId)?.name ?? 'Cosmic'}
                </Text>
              </View>
              <Feather name={showThemes ? 'chevron-up' : 'chevron-down'} size={16}
                color={isOwnerOrAdmin ? C.sub : C.muted} />
            </Pressable>

            {showThemes && isOwnerOrAdmin && (
              <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ROOM_THEMES.map(theme => {
                  const isActive = activeThemeId === theme.id;
                  return (
                    <Pressable key={theme.id}
                      onPress={() => { onThemeChange(theme.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 7,
                        backgroundColor: isActive ? theme.accent + '33' : C.card,
                        borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
                        borderWidth: 1.5, borderColor: isActive ? theme.accent : C.borderFaint,
                      }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent }} />
                      <Text style={{ color: isActive ? theme.accent : C.sub, fontSize: 12,
                        fontWeight: isActive ? '800' : '600' }}>{theme.name}</Text>
                      {isActive && <Feather name="check" size={10} color={theme.accent} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Operation History */}
          {isOwnerOrAdmin && (
            <Pressable
              onPress={onOpenHistory}
              style={{ flexDirection: 'row', alignItems: 'center',
                marginTop: 20, backgroundColor: 'rgba(239,68,68,0.08)',
                borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12,
                backgroundColor: 'rgba(239,68,68,0.15)',
                alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Feather name="clock" size={18} color={C.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                  {t('voiceRoom.settings.operationHistory')}
                </Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  {t('voiceRoom.settings.operationHistorySub')}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={C.muted} />
            </Pressable>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable onPress={onClose}
              style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', borderWidth: 1, borderColor: C.borderFaint }}>
              <Text style={{ color: C.sub, fontWeight: '700' }}>
                {t('voiceRoom.settings.cancel')}
              </Text>
            </Pressable>
            <Pressable onPress={handleSave}
              style={{ flex: 2, backgroundColor: accent, borderRadius: 14,
                paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>
                {t('voiceRoom.settings.save')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
