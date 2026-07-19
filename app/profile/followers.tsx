/**
 * Followers / Following List Screen
 * Route params: type ('followers' | 'following'), uid (whose list to show)
 */

import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  Pressable, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ref, get, onValue } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { VeeUser } from '@/src/services/userService';
import * as Haptics from 'expo-haptics';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  dim: '#4A3D6E',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.055)',
} as const;

function UserRow({ user, onPress }: { user: VeeUser; onPress: () => void }) {
  const initials = user.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.surface, borderRadius: 16,
        padding: 12, marginBottom: 10,
        borderWidth: 1, borderColor: C.border,
      }}
    >
      {user.photoURL ? (
        <Image
          source={{ uri: user.photoURL }}
          style={{ width: 48, height: 48, borderRadius: 24, marginRight: 14 }}
        />
      ) : (
        <View style={{
          width: 48, height: 48, borderRadius: 24, marginRight: 14,
          backgroundColor: 'rgba(139,92,246,0.25)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>{initials}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{user.name}</Text>
        {user.vId ? (
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>#{user.vId}</Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={16} color={C.dim} />
    </Pressable>
  );
}

export default function FollowersScreen() {
  const { type, uid } = useLocalSearchParams<{ type: string; uid: string }>();
  const isFollowers = type === 'followers';
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const [users, setUsers] = useState<VeeUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }

    // Listen to the correct path
    const path = isFollowers ? `followers/${uid}` : `following/${uid}`;
    const unsub = onValue(ref(database, path), async (snap) => {
      if (!snap.exists()) {
        setUsers([]);
        setLoading(false);
        return;
      }
      const uids = Object.keys(snap.val() as Record<string, boolean>);
      const results = await Promise.all(
        uids.map((u) =>
          get(ref(database, `users/${u}`)).then((s) =>
            s.exists() ? { ...(s.val() as VeeUser), uid: u } : null,
          ),
        ),
      );
      setUsers(results.filter(Boolean) as VeeUser[]);
      setLoading(false);
    }, () => { setUsers([]); setLoading(false); });

    return unsub;
  }, [uid, isFollowers]);

  const handleUserPress = (u: VeeUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/user-profile?uid=${encodeURIComponent(u.uid)}&name=${encodeURIComponent(u.name)}` as never,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: topPad + 10, paddingBottom: 16,
        }}>
          <Pressable onPress={() => router.back()} hitSlop={14} style={{ marginRight: 12 }}>
            <Feather name="arrow-left" size={24} color={C.text} />
          </Pressable>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
            {isFollowers ? 'Followers' : 'Following'}
          </Text>
          <Text style={{ color: C.muted, fontSize: 14 }}>{users.length}</Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.glow} size="large" />
          </View>
        ) : users.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <Feather name="users" size={40} color={C.dim} />
            <Text style={{ color: C.muted, fontSize: 16, marginTop: 16 }}>
              {isFollowers ? 'No followers yet' : 'Not following anyone yet'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.uid}
            renderItem={({ item }) => (
              <UserRow user={item} onPress={() => handleUserPress(item)} />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
