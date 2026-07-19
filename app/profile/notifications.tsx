/**
 * Notifications Settings Screen — Firebase-backed
 * Persists all toggles to: users/{uid}/notificationSettings
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Switch, Pressable, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ref, get, update } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { useAuth } from '@/src/context/AuthContext';

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

type NotifSettings = {
  messages: boolean;
  voiceRooms: boolean;
  follows: boolean;
  mentions: boolean;
  stories: boolean;
  sounds: boolean;
  vibration: boolean;
};

const DEFAULTS: NotifSettings = {
  messages: true,
  voiceRooms: true,
  follows: true,
  mentions: true,
  stories: false,
  sounds: true,
  vibration: true,
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

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const [settings, setSettings] = useState<NotifSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // ── Load from Firebase on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    get(ref(database, `users/${user.uid}/notificationSettings`))
      .then((snap) => {
        if (snap.exists()) {
          setSettings((prev) => ({ ...prev, ...(snap.val() as Partial<NotifSettings>) }));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [user?.uid]);

  // ── Toggle + persist ──────────────────────────────────────────────────
  const toggle = useCallback(
    (key: keyof NotifSettings) => {
      setSettings((prev) => {
        const newVal = !prev[key];
        const next = { ...prev, [key]: newVal };
        if (user?.uid) {
          update(ref(database, `users/${user.uid}/notificationSettings`), { [key]: newVal })
            .catch(() => {});
        }
        return next;
      });
    },
    [user?.uid],
  );

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
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>
              {t('notifications.title')}
            </Text>
          </View>

          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginBottom: 10,
          }}>
            {t('notifications.sectionAlerts')}
          </Text>

          <SettingRow
            icon="message-circle"
            label={t('notifications.messages')}
            subtitle={t('notifications.messagesSub')}
            value={settings.messages}
            onChange={() => toggle('messages')}
          />
          <SettingRow
            icon="mic"
            label={t('notifications.voiceRooms')}
            subtitle={t('notifications.voiceRoomsSub')}
            value={settings.voiceRooms}
            onChange={() => toggle('voiceRooms')}
          />
          <SettingRow
            icon="user-plus"
            label={t('notifications.newFollowers')}
            subtitle={t('notifications.newFollowersSub')}
            value={settings.follows}
            onChange={() => toggle('follows')}
          />
          <SettingRow
            icon="at-sign"
            label={t('notifications.mentions')}
            subtitle={t('notifications.mentionsSub')}
            value={settings.mentions}
            onChange={() => toggle('mentions')}
          />
          <SettingRow
            icon="circle"
            label={t('notifications.stories')}
            subtitle={t('notifications.storiesSub')}
            value={settings.stories}
            onChange={() => toggle('stories')}
          />

          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginTop: 16, marginBottom: 10,
          }}>
            {t('notifications.sectionSound')}
          </Text>

          <SettingRow
            icon="volume-2"
            label={t('notifications.sounds')}
            value={settings.sounds}
            onChange={() => toggle('sounds')}
          />
          <SettingRow
            icon="activity"
            label={t('notifications.vibration')}
            value={settings.vibration}
            onChange={() => toggle('vibration')}
          />

          <View style={{
            backgroundColor: 'rgba(139,92,246,0.08)',
            borderRadius: 14, padding: 14, marginTop: 20,
            borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)',
          }}>
            <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
              {t('notifications.pushHint')}
            </Text>
          </View>

          {!loaded && (
            <Text style={{ color: C.mutedDim, fontSize: 11, textAlign: 'center', marginTop: 10 }}>
              Loading preferences…
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
