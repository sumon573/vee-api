/**
 * Privacy Settings Screen — Firebase-backed
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Switch, Pressable, Image,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ref, update, onValue } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { useTranslation } from 'react-i18next';
import {
  subscribeBlockedUsers, unblockUser, BlockRecord,
} from '@/src/services/blockService';

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

type PrivacySettings = {
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  allowMessageFromAll: boolean;
  showProfileToAll: boolean;
  allowRoomInvites: boolean;
};

const DEFAULTS: PrivacySettings = {
  showOnlineStatus: true,
  showLastSeen: true,
  allowMessageFromAll: true,
  showProfileToAll: true,
  allowRoomInvites: true,
};

function SettingRow({
  icon, label, subtitle, value, onChange,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface, borderRadius: 16,
      padding: 16, marginBottom: 10,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(139,92,246,0.14)',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14,
      }}>
        <Feather name={icon} size={18} color={C.glow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        {subtitle ? (
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.mutedDim, true: C.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function PrivacyScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockRecord[]>([]);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onValue(ref(database, `users/${user.uid}/privacy`), (snap) => {
      if (snap.exists()) {
        setSettings({ ...DEFAULTS, ...(snap.val() as Partial<PrivacySettings>) });
      }
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // Subscribe to blocked users list
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeBlockedUsers(user.uid, setBlockedUsers);
  }, [user?.uid]);

  const handleUnblock = async (targetUid: string, targetName: string) => {
    if (!user?.uid) return;
    Alert.alert(
      'Unblock User',
      `Remove ${targetName} from your blocked list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setUnblockingUid(targetUid);
            try {
              await unblockUser(user.uid, targetUid);
            } catch {
              Alert.alert('Error', 'Could not unblock this user. Try again.');
            } finally {
              setUnblockingUid(null);
            }
          },
        },
      ],
    );
  };

  const handleToggle = async (key: keyof PrivacySettings) => {
    if (!user?.uid) return;
    const newValue = !settings[key];
    const updated = { ...settings, [key]: newValue };
    setSettings(updated);
    setSaving(true);
    try {
      await update(ref(database, `users/${user.uid}/privacy`), { [key]: newValue });
    } catch {
      setSettings(settings); // revert on error
      Alert.alert(t('privacy.error'), t('privacy.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.glow} size="large" />
      </View>
    );
  }

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
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
              {t('privacy.title')}
            </Text>
            {saving && <ActivityIndicator color={C.glow} size="small" />}
          </View>

          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginBottom: 10,
          }}>
            {t('privacy.sectionProfileStatus')}
          </Text>

          <SettingRow
            icon="eye"
            label={t('privacy.showOnlineStatus')}
            subtitle={t('privacy.showOnlineStatusSub')}
            value={settings.showOnlineStatus}
            onChange={() => handleToggle('showOnlineStatus')}
          />
          <SettingRow
            icon="clock"
            label={t('privacy.showLastSeen')}
            subtitle={t('privacy.showLastSeenSub')}
            value={settings.showLastSeen}
            onChange={() => handleToggle('showLastSeen')}
          />
          <SettingRow
            icon="globe"
            label={t('privacy.publicProfile')}
            subtitle={t('privacy.publicProfileSub')}
            value={settings.showProfileToAll}
            onChange={() => handleToggle('showProfileToAll')}
          />

          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginTop: 16, marginBottom: 10,
          }}>
            {t('privacy.sectionMessagesRooms')}
          </Text>

          <SettingRow
            icon="message-circle"
            label={t('privacy.allowMessageFromAll')}
            subtitle={t('privacy.allowMessageFromAllSub')}
            value={settings.allowMessageFromAll}
            onChange={() => handleToggle('allowMessageFromAll')}
          />
          <SettingRow
            icon="mic"
            label={t('privacy.allowRoomInvites')}
            subtitle={t('privacy.allowRoomInvitesSub')}
            value={settings.allowRoomInvites}
            onChange={() => handleToggle('allowRoomInvites')}
          />

          {/* ── Blocked Users ── */}
          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginTop: 24, marginBottom: 10,
          }}>
            BLOCKED USERS
          </Text>

          {blockedUsers.length === 0 ? (
            <View style={{
              backgroundColor: C.surface, borderRadius: 16, padding: 20,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
              alignItems: 'center',
            }}>
              <Feather name="slash" size={24} color={C.mutedDim} />
              <Text style={{ color: C.mutedDim, fontSize: 13, marginTop: 10 }}>
                No blocked users
              </Text>
            </View>
          ) : (
            blockedUsers.map((b) => (
              <View
                key={b.targetUid}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: C.surface, borderRadius: 16,
                  padding: 14, marginBottom: 10,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
                }}
              >
                {b.targetAvatar ? (
                  <Image
                    source={{ uri: b.targetAvatar }}
                    style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }}
                  />
                ) : (
                  <View style={{
                    width: 44, height: 44, borderRadius: 22, marginRight: 12,
                    backgroundColor: 'rgba(239,68,68,0.15)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="user" size={20} color="#EF4444" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                    {b.targetName}
                  </Text>
                  <Text style={{ color: C.mutedDim, fontSize: 11, marginTop: 2 }}>
                    Blocked
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleUnblock(b.targetUid, b.targetName)}
                  disabled={unblockingUid === b.targetUid}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: 'rgba(139,92,246,0.14)',
                    borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
                  }}
                >
                  {unblockingUid === b.targetUid ? (
                    <ActivityIndicator color={C.glow} size="small" />
                  ) : (
                    <Text style={{ color: C.glow, fontSize: 12, fontWeight: '700' }}>
                      Unblock
                    </Text>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
