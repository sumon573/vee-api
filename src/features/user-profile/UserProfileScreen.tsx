/**
 * UserProfileScreen — অন্যের Profile দেখা + Follow/Unfollow + Message
 * Real Firebase data.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Image, Pressable,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ref, update } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { subscribeUser, VeeUser } from '@/src/services/userService';
import {
  followUser, unfollowUser,
  subscribeIsFollowing, subscribeFollowCounts,
} from '@/src/services/followService';
import {
  sendFriendRequest, cancelFriendRequest, acceptFriendRequest,
  subscribeFriendStatus, FriendStatus,
} from '@/src/services/friendRequestService';
import { buildChatId } from '@/src/features/chat/services/firebaseDmService';
import { canSendMessage } from '@/src/services/privacyService';
import { blockUser, unblockUser, isBlockedByMe } from '@/src/services/blockService';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  mutedDim: '#4A3D6E',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.055)',
  online: '#22C55E',
  red: '#EF4444',
} as const;

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <View style={{
      flex: 1, alignItems: 'center', paddingVertical: 14,
      backgroundColor: C.surface, borderRadius: 14,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    }}>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

type Props = {
  uid: string;
  name: string;
};

export default function UserProfileScreen({ uid, name: fallbackName }: Props) {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const myUid = me?.uid ?? '';

  const [profile, setProfile] = useState<VeeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [myProfile, setMyProfile] = useState<VeeUser | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    const unsub = subscribeUser(uid, (u) => {
      setProfile(u);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!myUid || myUid === uid) return;
    const unsub = subscribeIsFollowing(myUid, uid, setIsFollowing);
    return unsub;
  }, [myUid, uid]);

  useEffect(() => {
    const unsub = subscribeFollowCounts(uid, setFollowCounts);
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!myUid || myUid === uid) return;
    const unsub = subscribeFriendStatus(myUid, uid, setFriendStatus);
    return unsub;
  }, [myUid, uid]);

  useEffect(() => {
    if (!myUid || myUid === uid) { setMyProfile(null); return; }
    const unsub = subscribeUser(myUid, setMyProfile);
    return unsub;
  }, [myUid, uid]);

  // Check if I have blocked this user
  useEffect(() => {
    if (!myUid || myUid === uid) return;
    isBlockedByMe(myUid, uid).then(setIsBlocked).catch(() => {});
  }, [myUid, uid]);

  const handleFriendAction = useCallback(async () => {
    if (!myUid || myUid === uid || !myProfile) return;
    setFriendActionLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (friendStatus === 'none') {
        await sendFriendRequest(myProfile, uid);
      } else if (friendStatus === 'request-sent') {
        await cancelFriendRequest(myUid, uid);
      } else if (friendStatus === 'request-received') {
        await acceptFriendRequest(myUid, uid);
      } else if (friendStatus === 'friends') {
        Alert.alert(t('userProfile.alreadyFriendsTitle'), t('userProfile.alreadyFriendsMsg'));
      }
    } catch (err) {
      Alert.alert(t('userProfile.error'), err instanceof Error ? err.message : t('userProfile.tryAgain'));
    } finally {
      setFriendActionLoading(false);
    }
  }, [myUid, uid, myProfile, friendStatus, t]);

  const handleFollow = useCallback(async () => {
    if (!myUid || myUid === uid) return;
    setFollowLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (isFollowing) {
        await unfollowUser(myUid, uid);
      } else {
        await followUser(myUid, uid);
      }
    } catch {
      Alert.alert(t('userProfile.error'), t('userProfile.tryAgain'));
    } finally {
      setFollowLoading(false);
    }
  }, [myUid, uid, isFollowing, t]);

  const handleBlock = useCallback(() => {
    if (!myUid || myUid === uid || !profile) return;
    if (isBlocked) {
      Alert.alert(
        'Unblock User',
        `Remove ${profile.name} from your blocked list?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              setBlockLoading(true);
              try {
                await unblockUser(myUid, uid);
                setIsBlocked(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {
                Alert.alert(t('userProfile.error'), t('userProfile.tryAgain'));
              } finally {
                setBlockLoading(false);
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Block User',
        `Block ${profile.name}? They won't be able to send you messages.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              setBlockLoading(true);
              try {
                await blockUser(myUid, uid, profile.name, profile.photoURL ?? undefined);
                setIsBlocked(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch {
                Alert.alert(t('userProfile.error'), t('userProfile.tryAgain'));
              } finally {
                setBlockLoading(false);
              }
            },
          },
        ],
      );
    }
  }, [myUid, uid, profile, isBlocked, t]);

  const handleMessage = useCallback(async () => {
    if (!me?.uid || !profile) return;
    // Privacy check — respect the target user's messaging preference.
    if (profile.privacy?.allowMessageFromAll === false) {
      Alert.alert(t('userProfile.messagingBlocked'), t('userProfile.messagingBlockedMsg'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = buildChatId(me.uid, uid);
    await Promise.all([
      update(ref(database, `userChats/${me.uid}/${chatId}`), {
        id: chatId,
        participantId: uid,
        participantName: profile.name,
        participantAvatar: profile.photoURL || '',
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        isOnline: profile.online ?? false,
        hasStory: false,
        storySeen: false,
        isPinned: false,
      }),
      update(ref(database, `userChats/${uid}/${chatId}`), {
        id: chatId,
        participantId: me.uid,
        participantName: me.displayName || 'Vee User',
        participantAvatar: me.photoURL || '',
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
      `/inbox/${chatId}?participantId=${encodeURIComponent(uid)}&participantName=${encodeURIComponent(profile.name)}` as never,
    );
  }, [me, uid, profile]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.glow} size="large" />
      </View>
    );
  }

  const displayName = profile?.name ?? fallbackName;
  const photoURL    = profile?.photoURL;
  const bio         = profile?.bio ?? '';
  const vId         = profile?.vId ?? '';
  // Respect the target user's showOnlineStatus privacy toggle.
  const isOnline    = (profile?.privacy?.showOnlineStatus !== false) && (profile?.online ?? false);
  const isMe        = myUid === uid;

  const initials = displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Back header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingTop: topPad + 10, paddingBottom: 8,
          }}>
            <Pressable onPress={() => router.back()} hitSlop={14} style={{ marginRight: 12 }}>
              <Feather name="arrow-left" size={24} color={C.text} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', flex: 1 }} numberOfLines={1}>
              {displayName}
            </Text>
          </View>

          {/* Avatar + Info */}
          <View style={{
            alignItems: 'center',
            paddingTop: 24, paddingBottom: 28,
            paddingHorizontal: 20,
          }}>
            {/* Avatar */}
            {photoURL ? (
              <Image
                source={{ uri: photoURL }}
                style={{
                  width: 100, height: 100, borderRadius: 50,
                  borderWidth: 3, borderColor: C.glow,
                }}
              />
            ) : (
              <View style={{
                width: 100, height: 100, borderRadius: 50,
                backgroundColor: 'rgba(139,92,246,0.25)',
                borderWidth: 3, borderColor: C.glow,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900' }}>{initials}</Text>
              </View>
            )}

            {/* Name */}
            <Text style={{
              color: C.text, fontSize: 22, fontWeight: '900',
              marginTop: 14, textAlign: 'center',
            }}>
              {displayName}
            </Text>

            {/* VID */}
            {vId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Feather name="hash" size={12} color={C.mutedDim} />
                <Text style={{ color: C.mutedDim, fontSize: 13 }}>{vId}</Text>
              </View>
            ) : null}

            {/* Bio */}
            {bio ? (
              <Text style={{
                color: C.muted, fontSize: 14, textAlign: 'center',
                lineHeight: 20, marginTop: 10, paddingHorizontal: 20,
              }}>
                {bio}
              </Text>
            ) : null}

            {/* Online */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: isOnline ? C.online : C.mutedDim,
              }} />
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: isOnline ? C.online : C.mutedDim,
              }}>
                {isOnline ? t('userProfile.online') : t('userProfile.offline')}
              </Text>
            </View>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 24 }}>
            <StatBox label={t('userProfile.statFollowers')} value={followCounts.followers} />
            <StatBox label={t('userProfile.statFollowing')} value={followCounts.following} />
          </View>

          {/* Action buttons */}
          {!isMe && (
            <View style={{
              flexDirection: 'row', gap: 12,
              marginHorizontal: 20, marginBottom: 24,
            }}>
              {/* Follow / Unfollow */}
              <Pressable
                onPress={handleFollow}
                disabled={followLoading}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 16,
                  backgroundColor: isFollowing ? 'transparent' : C.primary,
                  borderWidth: isFollowing ? 1.5 : 0,
                  borderColor: isFollowing ? C.mutedDim : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: isFollowing ? 'transparent' : C.glow,
                  shadowOpacity: 0.4, shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 }, elevation: isFollowing ? 0 : 8,
                }}
              >
                {followLoading ? (
                  <ActivityIndicator color={isFollowing ? C.muted : '#fff'} size="small" />
                ) : (
                  <Text style={{
                    color: isFollowing ? C.muted : '#fff',
                    fontSize: 15, fontWeight: '800',
                  }}>
                    {isFollowing ? t('userProfile.following') : t('userProfile.follow')}
                  </Text>
                )}
              </Pressable>

              {/* Message */}
              <Pressable
                onPress={handleMessage}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 16,
                  backgroundColor: C.surface,
                  borderWidth: 1, borderColor: C.border,
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
              >
                <Feather name="message-circle" size={18} color={C.glow} />
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>
                  {t('userProfile.message')}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Friend request action */}
          {!isMe && (
            <View style={{ marginHorizontal: 20, marginTop: -12, marginBottom: 24 }}>
              <Pressable
                onPress={handleFriendAction}
                disabled={friendActionLoading || !myProfile}
                style={{
                  paddingVertical: 14, borderRadius: 16,
                  backgroundColor: friendStatus === 'friends' ? 'rgba(34,197,94,0.12)'
                    : friendStatus === 'request-received' ? C.primary
                    : 'transparent',
                  borderWidth: 1.5,
                  borderColor: friendStatus === 'friends' ? C.online
                    : friendStatus === 'request-received' ? C.primary
                    : C.mutedDim,
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
              >
                {friendActionLoading ? (
                  <ActivityIndicator color={C.muted} size="small" />
                ) : (
                  <>
                    <Feather
                      name={
                        friendStatus === 'friends' ? 'user-check'
                          : friendStatus === 'request-sent' ? 'clock'
                          : 'user-plus'
                      }
                      size={16}
                      color={friendStatus === 'friends' ? C.online : friendStatus === 'request-received' ? '#fff' : C.muted}
                    />
                    <Text style={{
                      color: friendStatus === 'friends' ? C.online : friendStatus === 'request-received' ? '#fff' : C.muted,
                      fontSize: 14, fontWeight: '800',
                    }}>
                      {friendStatus === 'friends'
                        ? t('userProfile.alreadyFriends')
                        : friendStatus === 'request-sent'
                        ? t('userProfile.cancelRequest')
                        : friendStatus === 'request-received'
                        ? t('userProfile.acceptFriendRequest')
                        : t('userProfile.addFriend')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* Block / Unblock button */}
          {!isMe && (
            <View style={{ marginHorizontal: 20, marginTop: -12, marginBottom: 24 }}>
              <Pressable
                onPress={handleBlock}
                disabled={blockLoading}
                style={{
                  paddingVertical: 12, borderRadius: 16,
                  borderWidth: 1.5, borderColor: isBlocked ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.25)',
                  backgroundColor: isBlocked ? 'rgba(239,68,68,0.08)' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
              >
                {blockLoading ? (
                  <ActivityIndicator color={C.red} size="small" />
                ) : (
                  <>
                    <Feather name="slash" size={15} color={C.red} />
                    <Text style={{ color: C.red, fontSize: 13, fontWeight: '800' }}>
                      {isBlocked ? 'Unblock User' : 'Block User'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* Divider */}
          <View style={{
            marginHorizontal: 20,
            borderTopWidth: 1, borderTopColor: C.border,
            paddingTop: 20,
          }}>
            <Text style={{ color: C.mutedDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>
              {t('userProfile.sectionVeeProfile')}
            </Text>
            <View style={{
              backgroundColor: C.surface, borderRadius: 14,
              borderWidth: 1, borderColor: C.border,
              padding: 16, marginTop: 12, gap: 12,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="hash" size={16} color={C.mutedDim} />
                <Text style={{ color: C.muted, fontSize: 14 }}>Vee ID: {vId || 'N/A'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="users" size={16} color={C.mutedDim} />
                <Text style={{ color: C.muted, fontSize: 14 }}>
                  {followCounts.followers} {t('userProfile.statFollowers')} · {followCounts.following} {t('userProfile.statFollowing')}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
