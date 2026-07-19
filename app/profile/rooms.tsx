/**
 * Profile — My Rooms Screen (CRITICAL-10 fix)
 *
 * Shows all rooms the user is associated with, sorted by role:
 *   1. Owner (golden badge)
 *   2. Admin (purple badge)
 *   3. Member (muted badge)
 *
 * Tapping a room navigates into it. Active rooms show a green live dot;
 * closed rooms show a grey dot so the user can still see their history.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ref as dbRef, onValue } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { useAuth } from '@/src/context/AuthContext';
import {
  subscribeMyRoomsCombined,
  type RoomInfo,
} from '@/src/features/voice-room/services/firebaseRoomService';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:      '#07020F',
  primary: '#7C3AED',
  glow:    '#8B5CF6',
  text:    '#FFFFFF',
  muted:   '#B8A6D9',
  border:  '#1E1830',
  surface: 'rgba(255,255,255,0.055)',
  gold:    '#F59E0B',
  green:   '#22C55E',
} as const;

// ─── Role helpers ─────────────────────────────────────────────────────────────

type UserRole = 'owner' | 'admin' | 'member';

const ROLE_ORDER: Record<UserRole, number> = { owner: 0, admin: 1, member: 2 };

const ROLE_CONFIG: Record<UserRole, { color: string; bg: string; border: string; label: string }> = {
  owner:  { color: C.gold,    bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.35)',  label: 'Owner'  },
  admin:  { color: '#7C3AED', bg: 'rgba(124,58,237,0.15)',  border: 'rgba(124,58,237,0.35)',  label: 'Admin'  },
  member: { color: C.muted,   bg: 'rgba(184,166,217,0.08)', border: 'rgba(184,166,217,0.18)', label: 'Member' },
};

function RoleBadge({ role }: { role: UserRole }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
      backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border,
    }}>
      <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '700' }}>{cfg.label}</Text>
    </View>
  );
}

// ─── Room card ────────────────────────────────────────────────────────────────

function RoomCard({
  room, role,
}: { room: RoomInfo; role: UserRole }) {
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/voice-room', params: { roomId: room.id } } as never)
      }
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: C.surface, borderRadius: 16,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        padding: 12, marginBottom: 10,
      }}
    >
      {/* Thumbnail */}
      {room.coverImageUrl ? (
        <Image
          source={{ uri: room.coverImageUrl }}
          style={{ width: 52, height: 52, borderRadius: 12 }}
        />
      ) : (
        <View style={{
          width: 52, height: 52, borderRadius: 12,
          backgroundColor: (room.themeColor || C.glow) + '33',
          borderWidth: 1, borderColor: (room.themeColor || C.glow) + '66',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name="mic" size={22} color={room.themeColor || C.glow} />
        </View>
      )}

      {/* Info */}
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{ color: C.text, fontSize: 15, fontWeight: '700', flex: 1 }}
            numberOfLines={1}
          >
            {room.name}
          </Text>
          <RoleBadge role={role} />
        </View>

        <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>
          {room.topic}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: room.active ? C.green : C.muted,
          }} />
          <Text style={{ color: room.active ? C.green : C.muted, fontSize: 11 }}>
            {room.active ? 'Live' : 'Closed'} · {room.memberCount ?? 0} members
          </Text>
        </View>
      </View>

      <Feather name="chevron-right" size={16} color={C.muted} />
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileRoomsScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleMap, setRoleMap] = useState<Record<string, UserRole>>({});

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }

    // Subscribe to the user's role map from Firebase
    const unsubRoles = onValue(
      dbRef(database, `userRooms/${user.uid}`),
      (snap) => {
        const map: Record<string, UserRole> = {};
        if (snap.exists()) {
          snap.forEach((child) => {
            const v = child.val() as { role?: string };
            map[child.key!] = (v.role as UserRole) ?? 'member';
          });
        }
        setRoleMap(map);
      },
    );

    // Subscribe to combined room list (created + joined)
    const unsubRooms = subscribeMyRoomsCombined(user.uid, (r) => {
      setRooms(r);
      setLoading(false);
    });

    return () => { unsubRoles(); unsubRooms(); };
  }, [user?.uid]);

  const getRole = (room: RoomInfo): UserRole => {
    if (room.ownerId === user?.uid) return 'owner';
    return roleMap[room.id] ?? 'member';
  };

  const sorted = [...rooms].sort((a, b) => {
    const diff = ROLE_ORDER[getRole(a)] - ROLE_ORDER[getRole(b)];
    return diff !== 0 ? diff : b.createdAt - a.createdAt;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 14 }}>
          <Feather name="arrow-left" size={24} color={C.text} />
        </Pressable>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
          {t('profile.statRooms', { defaultValue: 'My Rooms' })}
        </Text>
        <Text style={{ color: C.muted, fontSize: 14 }}>{sorted.length}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.glow} size="large" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <Feather name="mic-off" size={44} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>No rooms yet</Text>
          <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
            Create or join a voice room to see it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RoomCard room={item} role={getRole(item)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
