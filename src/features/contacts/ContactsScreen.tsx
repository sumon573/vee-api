/**
 * ContactsScreen — Friends + Friend Requests
 * Following/Followers tabs removed — those live in Profile only.
 * Requests tab split into: People → Me (received) | Me → People (sent).
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator,
  Pressable, Image, Alert, TextInput, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ref, get, remove } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { VeeUser } from '@/src/services/userService';
import { buildChatId } from '@/src/features/chat/services/firebaseDmService';
import { update } from 'firebase/database';
import UserSearchModal from '@/src/features/user-search/UserSearchModal';
import {
  FriendRequest, subscribeIncomingRequests, subscribeFriendUids,
  acceptFriendRequest, rejectFriendRequest, removeFriend,
  cancelFriendRequest, subscribeSentRequestUids,
} from '@/src/services/friendRequestService';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  dim: '#4A3D6E',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.05)',
  inputBg: 'rgba(255,255,255,0.07)',
  online: '#22C55E',
  red: '#EF4444',
  subTabBg: 'rgba(255,255,255,0.04)',
} as const;

function UserAvatar({ user }: { user: VeeUser }) {
  const initials = user.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  if (user.photoURL) {
    return (
      <Image
        source={{ uri: user.photoURL }}
        style={{ width: 52, height: 52, borderRadius: 26 }}
      />
    );
  }
  return (
    <View style={{
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: 'rgba(139,92,246,0.3)',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{initials}</Text>
    </View>
  );
}

type Tab = 'friends' | 'requests';
type RequestSubTab = 'received' | 'sent';

export default function ContactsScreen() {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('friends');
  const [requestSubTab, setRequestSubTab] = useState<RequestSubTab>('received');

  // Friends list
  const [contacts, setContacts] = useState<VeeUser[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Incoming (received) requests
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [requestActionUid, setRequestActionUid] = useState<string | null>(null);

  // Sent requests
  const [sentRequestUids, setSentRequestUids] = useState<string[]>([]);
  const [sentRequestUsers, setSentRequestUsers] = useState<VeeUser[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [cancellingUid, setCancellingUid] = useState<string | null>(null);

  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // ─── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async (uids: string[]): Promise<VeeUser[]> => {
    if (uids.length === 0) return [];
    const results = await Promise.all(
      uids.map((uid) =>
        get(ref(database, `users/${uid}`)).then((snap) =>
          snap.exists() ? { ...(snap.val() as VeeUser), uid } : null,
        ),
      ),
    );
    return results.filter(Boolean) as VeeUser[];
  }, []);

  // ─── Friends subscription ────────────────────────────────────────────────

  useEffect(() => {
    if (!me?.uid || tab !== 'friends') return;
    setContactsLoading(true);
    let stale = false;
    const unsub = subscribeFriendUids(me.uid, async (uids) => {
      const users = await fetchUsers(uids);
      if (stale) return;
      setContacts(users);
      setContactsLoading(false);
    });
    return () => { stale = true; unsub(); };
  }, [me?.uid, tab, fetchUsers]);

  // ─── Incoming requests subscription ─────────────────────────────────────

  useEffect(() => {
    if (!me?.uid) return;
    const unsub = subscribeIncomingRequests(me.uid, setIncomingRequests);
    return unsub;
  }, [me?.uid]);

  // ─── Sent requests subscription ──────────────────────────────────────────

  useEffect(() => {
    if (!me?.uid) return;
    const unsub = subscribeSentRequestUids(me.uid, setSentRequestUids);
    return unsub;
  }, [me?.uid]);

  // When sentRequestUids change, fetch full user objects
  useEffect(() => {
    if (sentRequestUids.length === 0) { setSentRequestUsers([]); return; }
    setSentLoading(true);
    fetchUsers(sentRequestUids).then((users) => {
      setSentRequestUsers(users);
      setSentLoading(false);
    });
  }, [sentRequestUids, fetchUsers]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleAcceptRequest = useCallback(async (req: FriendRequest) => {
    if (!me?.uid) return;
    setRequestActionUid(req.fromUid);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await acceptFriendRequest(me.uid, req.fromUid);
      // Accepted → now a friend; switch to friends tab
      setTab('friends');
    } catch {
      Alert.alert(t('contacts.error'), t('contacts.acceptError'));
    } finally {
      setRequestActionUid(null);
    }
  }, [me?.uid, t]);

  const handleRejectRequest = useCallback(async (req: FriendRequest) => {
    if (!me?.uid) return;
    setRequestActionUid(req.fromUid);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await rejectFriendRequest(me.uid, req.fromUid);
    } catch {
      Alert.alert(t('contacts.error'), t('contacts.rejectError'));
    } finally {
      setRequestActionUid(null);
    }
  }, [me?.uid, t]);

  const handleCancelSentRequest = useCallback(async (targetUid: string) => {
    if (!me?.uid) return;
    Alert.alert(
      t('contacts.cancelRequestTitle'),
      t('contacts.cancelRequestMsg'),
      [
        { text: t('contacts.cancel'), style: 'cancel' },
        {
          text: t('contacts.cancelRequest'),
          style: 'destructive',
          onPress: async () => {
            setCancellingUid(targetUid);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await cancelFriendRequest(me.uid, targetUid);
            } catch {
              Alert.alert(t('contacts.error'), t('contacts.cancelError'));
            } finally {
              setCancellingUid(null);
            }
          },
        },
      ],
    );
  }, [me?.uid, t]);

  const handleRemoveFriend = useCallback(async (targetUser: VeeUser) => {
    if (!me?.uid) return;
    Alert.alert(
      t('contacts.removeFriendTitle'),
      t('contacts.removeFriendMsg', { name: targetUser.name }),
      [
        { text: t('contacts.cancel'), style: 'cancel' },
        {
          text: t('contacts.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              await removeFriend(me.uid, targetUser.uid);
              // Also remove the DM chat list entry for both users so it
              // no longer appears in either person's chat list.
              const chatId = buildChatId(me.uid, targetUser.uid);
              remove(ref(database, `userChats/${me.uid}/${chatId}`)).catch(() => {});
              remove(ref(database, `userChats/${targetUser.uid}/${chatId}`)).catch(() => {});
            } catch {
              Alert.alert(t('contacts.error'), t('contacts.removeError'));
            }
          },
        },
      ],
    );
  }, [me?.uid, t]);

  const handleMessage = useCallback(async (targetUser: VeeUser) => {
    if (!me?.uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = buildChatId(me.uid, targetUser.uid);

    // Use RTDB as the authoritative name source — Auth displayName can be null
    // for social-login or legacy accounts even when RTDB has the correct name.
    const meSnap = await get(ref(database, `users/${me.uid}`));
    const meProfile = meSnap.exists() ? (meSnap.val() as VeeUser) : null;
    const myName = meProfile?.name || me.displayName || 'Vee User';
    const myAvatar = meProfile?.photoURL || me.photoURL || '';

    await Promise.all([
      update(ref(database, `userChats/${me.uid}/${chatId}`), {
        id: chatId,
        participantId: targetUser.uid,
        participantName: targetUser.name,
        participantAvatar: targetUser.photoURL || '',
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        isOnline: targetUser.online ?? false,
        hasStory: false,
        storySeen: false,
        isPinned: false,
      }),
      update(ref(database, `userChats/${targetUser.uid}/${chatId}`), {
        id: chatId,
        participantId: me.uid,
        participantName: myName,
        participantAvatar: myAvatar,
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        isOnline: true,
        hasStory: false,
        storySeen: false,
        isPinned: false,
      }),
    ]);
    router.push(
      `/inbox/${chatId}?participantId=${encodeURIComponent(targetUser.uid)}&participantName=${encodeURIComponent(targetUser.name)}` as never,
    );
  }, [me, router]);

  const handleViewProfile = useCallback((targetUser: VeeUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/user-profile?uid=${encodeURIComponent(targetUser.uid)}&name=${encodeURIComponent(targetUser.name)}` as never,
    );
  }, [router]);

  const handleUserFound = useCallback(async (selectedUser: VeeUser, _chatId: string) => {
    setSearchModalOpen(false);
    router.push(
      `/user-profile?uid=${encodeURIComponent(selectedUser.uid)}&name=${encodeURIComponent(selectedUser.name)}` as never,
    );
  }, [router]);

  // ─── Derived data ────────────────────────────────────────────────────────────

  const filtered = search.trim()
    ? contacts.filter((u) =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.vId?.toLowerCase().includes(search.toLowerCase()),
      )
    : contacts;

  const totalRequestsBadge = incomingRequests.length;
  const topPad = Platform.OS === 'web' ? 67 : 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ width: '100%', flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingTop: topPad + 14,
        paddingHorizontal: 20,
        paddingBottom: 12,
      }}>
        <Text style={{ flex: 1, color: C.text, fontSize: 26, fontWeight: '900' }}>
          {t('contacts.title')}
        </Text>
        <Pressable
          onPress={() => setSearchModalOpen(true)}
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: C.surface,
            borderWidth: 1, borderColor: C.border,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Feather name="user-plus" size={18} color={C.muted} />
        </Pressable>
      </View>

      {/* Main Tab selector — Friends | Requests */}
      <View style={{
        flexDirection: 'row',
        marginHorizontal: 20, marginBottom: 14,
        backgroundColor: C.surface,
        borderRadius: 14, padding: 4,
        borderWidth: 1, borderColor: C.border,
      }}>
        {(['friends', 'requests'] as Tab[]).map((t_) => (
          <Pressable
            key={t_}
            onPress={() => { setTab(t_); setSearch(''); }}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
              backgroundColor: tab === t_ ? C.primary : 'transparent',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{
                color: tab === t_ ? '#fff' : C.muted,
                fontWeight: tab === t_ ? '800' : '500',
                fontSize: 13,
              }}>
                {t_ === 'friends' ? t('contacts.tabFriends') : t('contacts.tabRequests')}
              </Text>
              {t_ === 'requests' && totalRequestsBadge > 0 && (
                <View style={{
                  minWidth: 16, height: 16, borderRadius: 8,
                  backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 3,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                    {totalRequestsBadge}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}
      </View>

      {/* ── REQUESTS TAB ── */}
      {tab === 'requests' ? (
        <View style={{ flex: 1 }}>
          {/* Sub-tab: received | sent */}
          <View style={{
            flexDirection: 'row',
            marginHorizontal: 20, marginBottom: 12,
            backgroundColor: C.subTabBg,
            borderRadius: 12, padding: 3,
            borderWidth: 1, borderColor: C.border,
          }}>
            <Pressable
              onPress={() => setRequestSubTab('received')}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: requestSubTab === 'received' ? 'rgba(124,58,237,0.6)' : 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{
                  color: requestSubTab === 'received' ? '#fff' : C.muted,
                  fontWeight: requestSubTab === 'received' ? '700' : '500',
                  fontSize: 12,
                }}>
                  {t('contacts.requestsReceived')}
                </Text>
                {incomingRequests.length > 0 && (
                  <View style={{
                    minWidth: 14, height: 14, borderRadius: 7,
                    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>
                      {incomingRequests.length}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => setRequestSubTab('sent')}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: requestSubTab === 'sent' ? 'rgba(124,58,237,0.6)' : 'transparent',
              }}
            >
              <Text style={{
                color: requestSubTab === 'sent' ? '#fff' : C.muted,
                fontWeight: requestSubTab === 'sent' ? '700' : '500',
                fontSize: 12,
              }}>
                {t('contacts.requestsSent')}
              </Text>
            </Pressable>
          </View>

          {/* Received requests list */}
          {requestSubTab === 'received' ? (
            incomingRequests.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: 'rgba(139,92,246,0.12)',
                  borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                }}>
                  <Feather name="user-plus" size={32} color={C.glow} />
                </View>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>
                  {t('contacts.noFriendRequests')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={incomingRequests}
                keyExtractor={(item) => item.fromUid}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: C.surface,
                    borderRadius: 16, padding: 12, marginBottom: 10,
                    borderWidth: 1, borderColor: C.border,
                  }}>
                    <Pressable
                      onPress={() => handleViewProfile({ uid: item.fromUid, name: item.fromName, vId: item.fromVId, photoURL: item.fromPhoto } as VeeUser)}
                      style={{ marginRight: 12 }}
                    >
                      <UserAvatar user={{ uid: item.fromUid, name: item.fromName, vId: item.fromVId, photoURL: item.fromPhoto } as VeeUser} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleViewProfile({ uid: item.fromUid, name: item.fromName, vId: item.fromVId, photoURL: item.fromPhoto } as VeeUser)}
                      style={{ flex: 1 }}
                    >
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                        {item.fromName}
                      </Text>
                      <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
                        #{item.fromVId}
                      </Text>
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {/* Accept */}
                      <Pressable
                        onPress={() => handleAcceptRequest(item)}
                        disabled={requestActionUid === item.fromUid}
                        style={{
                          width: 36, height: 36, borderRadius: 18,
                          backgroundColor: 'rgba(34,197,94,0.18)',
                          borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {requestActionUid === item.fromUid ? (
                          <ActivityIndicator color={C.online} size="small" />
                        ) : (
                          <Feather name="check" size={16} color={C.online} />
                        )}
                      </Pressable>
                      {/* Reject */}
                      <Pressable
                        onPress={() => handleRejectRequest(item)}
                        disabled={requestActionUid === item.fromUid}
                        style={{
                          width: 36, height: 36, borderRadius: 18,
                          backgroundColor: 'rgba(239,68,68,0.1)',
                          borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Feather name="x" size={16} color={C.red} />
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            )
          ) : (
            /* Sent requests list */
            sentLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={C.glow} size="large" />
              </View>
            ) : sentRequestUsers.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: 'rgba(139,92,246,0.12)',
                  borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                }}>
                  <Feather name="send" size={32} color={C.glow} />
                </View>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>
                  {t('contacts.noSentRequests')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={sentRequestUsers}
                keyExtractor={(item) => item.uid}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: C.surface,
                    borderRadius: 16, padding: 12, marginBottom: 10,
                    borderWidth: 1, borderColor: C.border,
                  }}>
                    <Pressable onPress={() => handleViewProfile(item)} style={{ marginRight: 12 }}>
                      <UserAvatar user={item} />
                    </Pressable>
                    <Pressable onPress={() => handleViewProfile(item)} style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
                        #{item.vId}
                      </Text>
                      <Text style={{ color: 'rgba(124,58,237,0.7)', fontSize: 11, marginTop: 3, fontWeight: '600' }}>
                        {t('contacts.pendingLabel')}
                      </Text>
                    </Pressable>
                    {/* Cancel sent request */}
                    <Pressable
                      onPress={() => handleCancelSentRequest(item.uid)}
                      disabled={cancellingUid === item.uid}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: 'rgba(239,68,68,0.1)',
                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {cancellingUid === item.uid ? (
                        <ActivityIndicator color={C.red} size="small" />
                      ) : (
                        <Text style={{ color: C.red, fontSize: 12, fontWeight: '700' }}>
                          {t('contacts.cancelRequest')}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}
              />
            )
          )}
        </View>
      ) : (
        /* ── FRIENDS TAB ── */
        <>
          {/* Search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            marginHorizontal: 20, marginBottom: 12,
            backgroundColor: C.inputBg, borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 10,
            borderWidth: 1, borderColor: C.border, gap: 8,
          }}>
            <Feather name="search" size={16} color={C.dim} />
            <TextInput
              style={{ flex: 1, color: C.text, fontSize: 14 }}
              placeholder={t('contacts.searchPlaceholder')}
              placeholderTextColor={C.dim}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Feather name="x-circle" size={15} color={C.muted} />
              </Pressable>
            )}
          </View>

          {contactsLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.glow} size="large" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: 'rgba(139,92,246,0.12)',
                borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <Feather name="users" size={32} color={C.glow} />
              </View>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>
                {search ? t('contacts.noResults') : t('contacts.noFriends')}
              </Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
                {t('contacts.findPeopleCta')}
              </Text>
              {!search && (
                <Pressable
                  onPress={() => setSearchModalOpen(true)}
                  style={{
                    marginTop: 20, backgroundColor: C.primary,
                    borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    {t('contacts.findPeopleBtn')}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleViewProfile(item)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: C.surface,
                    borderRadius: 16, padding: 12, marginBottom: 10,
                    borderWidth: 1, borderColor: C.border,
                  }}
                >
                  {/* Avatar */}
                  <View style={{ position: 'relative', marginRight: 12 }}>
                    <UserAvatar user={item} />
                    {item.online && (
                      <View style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: 12, height: 12, borderRadius: 6,
                        backgroundColor: C.online, borderWidth: 2, borderColor: C.bg,
                      }} />
                    )}
                  </View>
                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
                      #{item.vId}
                    </Text>
                  </View>
                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => handleMessage(item)}
                      style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: 'rgba(139,92,246,0.18)',
                        borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Feather name="message-circle" size={16} color={C.glow} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemoveFriend(item)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: 'rgba(239,68,68,0.1)',
                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: C.red, fontSize: 11, fontWeight: '700' }}>
                        {t('contacts.remove')}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              )}
            />
          )}
        </>
      )}

      {/* Find People Modal */}
      <UserSearchModal
        visible={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectUser={handleUserFound}
      />
    </View>
  );
}
