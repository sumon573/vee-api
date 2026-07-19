/**
 * GlobalSearchModal — Users + Rooms একসাথে খোঁজা
 * FIX: router.push() before onClose() to prevent modal animation blocking navigation
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TextInput, Pressable,
  FlatList, ActivityIndicator, Image, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ref, get } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { VeeUser } from '@/src/services/userService';
import { useAuth } from '@/src/context/AuthContext';
import { subscribeActiveRooms, RoomInfo } from '@/src/features/voice-room/services/firebaseRoomService';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#07020F',
  surface: 'rgba(255,255,255,0.055)',
  border: 'rgba(255,255,255,0.10)',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.55)',
  dim: 'rgba(255,255,255,0.28)',
  inputBg: 'rgba(255,255,255,0.07)',
  online: '#22C55E',
} as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectRoom?: (room: RoomInfo) => void;
};

function UserAvatar({ user }: { user: VeeUser }) {
  const initials = user.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  if (user.photoURL) {
    return (
      <Image
        source={{ uri: user.photoURL }}
        style={{ width: 44, height: 44, borderRadius: 22 }}
      />
    );
  }
  return (
    <View style={{
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: 'rgba(139,92,246,0.3)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{initials}</Text>
    </View>
  );
}

export default function GlobalSearchModal({ visible, onClose, onSelectRoom }: Props) {
  const { user: me } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<VeeUser[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [allRooms, setAllRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to active rooms list
  useEffect(() => {
    if (!visible) return;
    const unsub = subscribeActiveRooms((r) => setAllRooms(r));
    return unsub;
  }, [visible]);

  const search = useCallback(async (text: string) => {
    if (!text.trim() || text.trim().length < 2) {
      setUsers([]);
      setRooms([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const q = text.trim().toLowerCase();

    // Search users
    try {
      const snap = await get(ref(database, 'users'));
      const found: VeeUser[] = [];
      if (snap.exists()) {
        snap.forEach((child) => {
          // FIX: always set uid from child.key so it is never undefined
          const u = { ...(child.val() as VeeUser), uid: child.key! };
          if (u.uid === me?.uid) return;
          if (
            u.name?.toLowerCase().includes(q) ||
            (u as any).displayName?.toLowerCase().includes(q) ||
            u.vId?.toLowerCase().includes(q)
          ) found.push(u);
        });
      }
      setUsers(found.slice(0, 10));
    } catch {
      setUsers([]);
    }

    // Search rooms by name, topic, or numeric room ID
    const matchedRooms = allRooms.filter((r) =>
      r.name?.toLowerCase().includes(q) ||
      r.topic?.toLowerCase().includes(q) ||
      r.id?.includes(q),
    );
    setRooms(matchedRooms.slice(0, 10));

    setLoading(false);
  }, [me?.uid, allRooms]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setUsers([]);
      setRooms([]);
      setSearched(false);
    }
  }, [visible]);

  // ✅ FIX: Push navigation FIRST, then close modal after a short delay.
  // Closing modal first blocks the router.push due to Modal animation running simultaneously.
  const handleUserPress = useCallback((user: VeeUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/user-profile?uid=${encodeURIComponent(user.uid)}&name=${encodeURIComponent(user.name)}` as never,
    );
    setTimeout(() => onClose(), 80);
  }, [onClose, router]);

  const handleRoomPress = useCallback((room: RoomInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onSelectRoom) {
      onClose();
      onSelectRoom(room);
    } else {
      router.push(`/voice-room?roomId=${encodeURIComponent(room.id)}` as never);
      setTimeout(() => onClose(), 80);
    }
  }, [onClose, router, onSelectRoom]);

  const sections = [
    ...(users.length > 0 ? [{ title: t('voiceRoom.home.globalSearch.usersSection'), data: users, type: 'user' as const }] : []),
    ...(rooms.length > 0 ? [{ title: t('voiceRoom.home.globalSearch.roomsSection'), data: rooms, type: 'room' as const }] : []),
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
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Pressable onPress={onClose} style={{ padding: 6, marginRight: 12 }}>
              <Feather name="x" size={22} color={C.muted} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', flex: 1 }}>
              {t('voiceRoom.home.globalSearch.title')}
            </Text>
          </View>

          {/* Search input */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            marginHorizontal: 20, marginTop: 14, marginBottom: 6,
            backgroundColor: C.inputBg,
            borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
            borderWidth: 1, borderColor: C.border,
          }}>
            <Feather name="search" size={18} color={C.muted} style={{ marginRight: 10 }} />
            <TextInput
              style={{ flex: 1, color: C.text, fontSize: 15 }}
              placeholder={t('voiceRoom.home.globalSearch.placeholder')}
              placeholderTextColor={C.dim}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Feather name="x-circle" size={16} color={C.muted} />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator color={C.glow} />
            </View>
          ) : sections.length > 0 ? (
            <SectionList
              sections={sections as any}
              keyExtractor={(item: any) => item.uid ?? item.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }: any) => (
                <Text style={{
                  color: C.muted, fontSize: 11, fontWeight: '700',
                  letterSpacing: 0.8, marginTop: 16, marginBottom: 8,
                }}>
                  {section.title}
                </Text>
              )}
              renderItem={({ item, section }: any) => {
                if (section.type === 'user') {
                  const user = item as VeeUser;
                  return (
                    <Pressable
                      onPress={() => handleUserPress(user)}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingVertical: 10, borderBottomWidth: 1,
                        borderBottomColor: C.border,
                      }}
                    >
                      <UserAvatar user={user} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                          {user.name}
                        </Text>
                        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                          #{user.vId}
                        </Text>
                      </View>
                      {user.online && (
                        <View style={{
                          width: 8, height: 8, borderRadius: 4,
                          backgroundColor: C.online,
                        }} />
                      )}
                      <Feather name="chevron-right" size={16} color={C.dim} style={{ marginLeft: 8 }} />
                    </Pressable>
                  );
                } else {
                  const room = item as RoomInfo;
                  return (
                    <Pressable
                      onPress={() => handleRoomPress(room)}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingVertical: 10, borderBottomWidth: 1,
                        borderBottomColor: C.border,
                      }}
                    >
                      <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: 'rgba(139,92,246,0.2)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Feather name="mic" size={20} color={C.glow} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                          {room.name}
                        </Text>
                        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                          {room.memberCount} members · {room.topic}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 6,
                        paddingHorizontal: 6, paddingVertical: 2,
                      }}>
                        <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>LIVE</Text>
                      </View>
                    </Pressable>
                  );
                }
              }}
            />
          ) : searched && query.trim().length >= 2 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Feather name="search" size={40} color={C.dim} />
              <Text style={{ color: C.muted, fontSize: 15, marginTop: 14 }}>
                {t('voiceRoom.home.globalSearch.noResults')}
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Feather name="search" size={40} color={C.dim} />
              <Text style={{ color: C.muted, fontSize: 15, marginTop: 14, textAlign: 'center', paddingHorizontal: 40 }}>
                {t('voiceRoom.home.globalSearch.hint')}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
