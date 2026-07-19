/**
 * UserSearchModal — search Firebase users by name or Vee ID
 * Actions per result: Visit Profile | Follow | Send Friend Request
 * Message button REMOVED — messaging is via Friends list or Profile screen.
 *
 * Fix: uid always set from child.key so participantId is never undefined.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TextInput, Pressable, FlatList,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ref, get } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { VeeUser, subscribeUser } from '@/src/services/userService';
import { useAuth } from '@/src/context/AuthContext';
import { followUser } from '@/src/services/followService';
import {
  sendFriendRequest,
  getFriendStatus,
  FriendStatus,
} from '@/src/services/friendRequestService';
import { isFollowing as checkIsFollowing } from '@/src/services/followService';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Alerts from 'react-native';

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
  green: '#22C55E',
} as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (user: VeeUser, chatId: string) => void;
};

// Track per-user action state for this session
type UserActionState = {
  followLoading?: boolean;
  friendLoading?: boolean;
  followed?: boolean;    // optimistic: user pressed follow this session
  friendSent?: boolean;  // optimistic: user sent request this session
  friendStatus?: FriendStatus;
  isFollowing?: boolean;
};

function UserAvatar({ user }: { user: VeeUser }) {
  const initials = user.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  if (user.photoURL) {
    return (
      <Image
        source={{ uri: user.photoURL }}
        style={{ width: 48, height: 48, borderRadius: 24 }}
      />
    );
  }
  return (
    <View style={{
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: 'rgba(139,92,246,0.3)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>{initials}</Text>
    </View>
  );
}

export default function UserSearchModal({ visible, onClose, onSelectUser }: Props) {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [query_, setQuery] = useState('');
  const [results, setResults] = useState<VeeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // My full VeeUser profile (needed for sendFriendRequest)
  const [myProfile, setMyProfile] = useState<VeeUser | null>(null);

  // Per-user action states (optimistic UI + status cache)
  const [userActions, setUserActions] = useState<Record<string, UserActionState>>({});

  useEffect(() => {
    if (!me?.uid || !visible) return;
    const unsub = subscribeUser(me.uid, setMyProfile);
    return unsub;
  }, [me?.uid, visible]);

  const updateAction = useCallback((uid: string, patch: Partial<UserActionState>) => {
    setUserActions((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ...patch },
    }));
  }, []);

  const search = useCallback(async (text: string) => {
    if (!text.trim() || text.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const snap = await get(ref(database, 'users'));
      if (!snap.exists()) { setResults([]); setLoading(false); return; }

      const q = text.trim().toLowerCase();
      const found: VeeUser[] = [];
      snap.forEach((child) => {
        // FIX: always use child.key as uid — guarantees uid is never undefined
        const u = { ...(child.val() as VeeUser), uid: child.key! };
        if (u.uid === me?.uid) return;
        const nameMatch        = u.name?.toLowerCase().includes(q);
        const displayNameMatch = (u as any).displayName?.toLowerCase().includes(q);
        const vidMatch         = u.vId?.toLowerCase().includes(q);
        if (nameMatch || displayNameMatch || vidMatch) found.push(u);
      });

      const slice = found.slice(0, 20);
      setResults(slice);

      // Load initial statuses for each result in the background
      if (me?.uid) {
        slice.forEach(async (u) => {
          const [fStatus, following] = await Promise.all([
            getFriendStatus(me.uid!, u.uid),
            checkIsFollowing(me.uid!, u.uid),
          ]);
          updateAction(u.uid, { friendStatus: fStatus, isFollowing: following });
        });
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [me?.uid, updateAction]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query_), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query_, search]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setUserActions({});
    }
  }, [visible]);

  // ── Visit Profile ──────────────────────────────────────────────────────────
  const handleVisitProfile = useCallback((user: VeeUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/user-profile?uid=${encodeURIComponent(user.uid)}&name=${encodeURIComponent(user.name)}` as never,
    );
    setTimeout(() => onClose(), 80);
  }, [router, onClose]);

  // ── Follow ─────────────────────────────────────────────────────────────────
  const handleFollow = useCallback(async (user: VeeUser) => {
    if (!me?.uid) return;
    const current = userActions[user.uid];
    if (current?.followLoading || current?.followed || current?.isFollowing) return;
    updateAction(user.uid, { followLoading: true });
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await followUser(me.uid, user.uid);
      updateAction(user.uid, { followLoading: false, followed: true, isFollowing: true });
    } catch (err) {
      updateAction(user.uid, { followLoading: false });
      Alerts.Alert.alert(t('userProfile.error'), t('userProfile.tryAgain'));
    }
  }, [me?.uid, userActions, updateAction, t]);

  // ── Send Friend Request ────────────────────────────────────────────────────
  const handleSendFriendRequest = useCallback(async (user: VeeUser) => {
    if (!me?.uid || !myProfile) return;
    const current = userActions[user.uid];
    if (
      current?.friendLoading ||
      current?.friendSent ||
      current?.friendStatus === 'request-sent' ||
      current?.friendStatus === 'friends'
    ) return;
    updateAction(user.uid, { friendLoading: true });
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await sendFriendRequest(myProfile, user.uid);
      updateAction(user.uid, { friendLoading: false, friendSent: true, friendStatus: 'request-sent' });
    } catch (err) {
      updateAction(user.uid, { friendLoading: false });
      const msg = err instanceof Error ? err.message : t('userProfile.tryAgain');
      Alerts.Alert.alert(t('userProfile.error'), msg);
    }
  }, [me?.uid, myProfile, userActions, updateAction, t]);

  // ── Action button rendering ────────────────────────────────────────────────

  const renderActionButtons = useCallback((item: VeeUser) => {
    const a = userActions[item.uid] ?? {};

    const alreadyFollowing = a.followed || a.isFollowing;
    const friendSent = a.friendSent || a.friendStatus === 'request-sent';
    const alreadyFriends = a.friendStatus === 'friends';

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 }}>
        {/* Online dot */}
        {item.online && (
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: C.online,
          }} />
        )}

        {/* Follow button */}
        <Pressable
          onPress={() => handleFollow(item)}
          disabled={!!alreadyFollowing || !!a.followLoading}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: alreadyFollowing
              ? 'rgba(34,197,94,0.18)'
              : 'rgba(139,92,246,0.15)',
            borderWidth: 1,
            borderColor: alreadyFollowing
              ? 'rgba(34,197,94,0.4)'
              : 'rgba(139,92,246,0.35)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {a.followLoading ? (
            <ActivityIndicator size="small" color={C.glow} />
          ) : alreadyFollowing ? (
            <Feather name="user-check" size={15} color={C.green} />
          ) : (
            <Feather name="user-plus" size={15} color={C.glow} />
          )}
        </Pressable>

        {/* Friend Request button */}
        {!alreadyFriends && (
          <Pressable
            onPress={() => handleSendFriendRequest(item)}
            disabled={!!friendSent || !!a.friendLoading}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: friendSent
                ? 'rgba(124,58,237,0.25)'
                : 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: friendSent
                ? 'rgba(124,58,237,0.5)'
                : 'rgba(255,255,255,0.15)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {a.friendLoading ? (
              <ActivityIndicator size="small" color={C.glow} />
            ) : friendSent ? (
              <Feather name="check" size={15} color={C.glow} />
            ) : (
              <Feather name="users" size={15} color={C.muted} />
            )}
          </Pressable>
        )}
        {alreadyFriends && (
          <View style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(34,197,94,0.18)',
            borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name="users" size={15} color={C.green} />
          </View>
        )}

        {/* Visit Profile button */}
        <Pressable
          onPress={() => handleVisitProfile(item)}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(139,92,246,0.25)',
            borderWidth: 1, borderColor: 'rgba(139,92,246,0.5)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Feather name="eye" size={15} color={C.glow} />
        </Pressable>
      </View>
    );
  }, [userActions, handleFollow, handleSendFriendRequest, handleVisitProfile]);

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
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: C.border,
          }}>
            <Pressable onPress={onClose} style={{ padding: 6, marginRight: 12 }}>
              <Feather name="x" size={22} color={C.muted} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', flex: 1 }}>
              {t('userSearch.title')}
            </Text>
          </View>

          {/* Search box */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            marginHorizontal: 20, marginTop: 16, marginBottom: 8,
            backgroundColor: C.inputBg,
            borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
            borderWidth: 1, borderColor: C.border,
          }}>
            <Feather name="search" size={18} color={C.muted} style={{ marginRight: 10 }} />
            <TextInput
              style={{ flex: 1, color: C.text, fontSize: 15 }}
              placeholder={t('userSearch.searchPlaceholder')}
              placeholderTextColor={C.dim}
              value={query_}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            {query_.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Feather name="x-circle" size={16} color={C.muted} />
              </Pressable>
            )}
          </View>

          {/* Hint text */}
          {results.length > 0 && (
            <Text style={{
              color: C.dim, fontSize: 11, textAlign: 'center',
              marginBottom: 4,
            }}>
              {t('userSearch.searchActionHint')}
            </Text>
          )}

          {/* Results */}
          {loading ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator color={C.glow} />
            </View>
          ) : results.length > 0 ? (
            <FlatList
              data={results}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8 }}
              renderItem={({ item }) => (
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 10, borderBottomWidth: 1,
                  borderBottomColor: C.border,
                }}>
                  {/* Avatar + Info — tap to visit profile */}
                  <Pressable
                    onPress={() => handleVisitProfile(item)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                  >
                    <UserAvatar user={item} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                        #{item.vId}
                      </Text>
                    </View>
                  </Pressable>

                  {renderActionButtons(item)}
                </View>
              )}
            />
          ) : searched && query_.trim().length >= 2 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Feather name="user-x" size={40} color={C.dim} />
              <Text style={{ color: C.muted, fontSize: 15, marginTop: 14 }}>
                {t('userSearch.noResults')}
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Feather name="search" size={40} color={C.dim} />
              <Text style={{ color: C.muted, fontSize: 15, marginTop: 14, textAlign: 'center', paddingHorizontal: 40 }}>
                {t('userSearch.searchHint')}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
