/**
 * Chat Screen — ধাপ ৪ + ৫
 * Chat list: Firebase Realtime DB।
 * Story bar: Firebase real-time stories (ধাপ ৫)।
 * New Chat: UserSearchModal দিয়ে user খুঁজে DM শুরু।
 * Pin/Unpin: Long-press on chat item।
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable,
  FlatList, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import StoryBar from '@/src/features/chat/components/StoryBar';
import ChatListItem from '@/src/features/chat/components/ChatListItem';
import StoryViewer from '@/src/features/chat/screens/StoryViewer';
import StoryCreator from '@/src/features/chat/screens/StoryCreator';
import UserSearchModal from '@/src/features/user-search/UserSearchModal';
import { Chat } from '@/src/features/chat/types';
import {
  subscribeUserChats, pinChat, unpinChat, clearChat,
} from '@/src/features/chat/services/firebaseDmService';
import { deleteStory } from '@/src/features/chat/services/firebaseStoryService';
import { useStories } from '@/src/features/chat/hooks/useStories';
import { useAuth } from '@/src/context/AuthContext';
import { VeeUser } from '@/src/services/userService';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  dim: '#4A3D6E',
  border: '#1E1830',
  inputBg: 'rgba(255,255,255,0.055)',
  glass: 'rgba(255,255,255,0.04)',
} as const;

type ChatScreenProps = {
  /** Called when the user taps the Planet bubble in the story bar. */
  onOpenPlanet?: () => void;
};

export default function ChatScreen({ onOpenPlanet }: ChatScreenProps = {}) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  // ── Chat list (Firebase) ──────────────────────────────────────────────────
  const [chats, setChats]               = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUserChats(user.uid, (firebaseChats) => {
      setChats(firebaseChats);
      setLoadingChats(false);
    });
    const timeout = setTimeout(() => setLoadingChats(false), 3000);
    return () => { unsub(); clearTimeout(timeout); };
  }, [user?.uid]);

  // ── Stories (Firebase, ধাপ ৫) ─────────────────────────────────────────────
  const {
    stories, loading: storiesLoading,
    publish, recordView, react: reactStory, markGroupSeen,
  } = useStories();

  const [search, setSearch]             = useState('');
  const [searchActive, setSearchActive] = useState(false);

  // Story viewer
  const [viewerOpen, setViewerOpen]         = useState(false);
  const [viewerStartIdx, setViewerStartIdx] = useState(0);

  // Story creator
  const [creatorOpen, setCreatorOpen] = useState(false);

  // New chat (user search)
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const openStory = useCallback((idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerStartIdx(idx);
    setViewerOpen(true);
    if (stories[idx]) markGroupSeen(stories[idx].userId);
  }, [stories, markGroupSeen]);

  const openCreator = useCallback(() => setCreatorOpen(true), []);

  /** Called by StoryCreator after Cloudinary upload (for images) or text entry */
  const handlePublishStory = useCallback(async (story: {
    type: 'text' | 'image';
    content: string;
    bgGradient: [string, string];
    mentions: string[];
    privacy: 'public' | 'contacts';
  }) => {
    try {
      await publish({
        type: story.type,
        content: story.content,
        bgGradient: story.bgGradient,
        mentions: story.mentions,
        privacy: story.privacy,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [publish]);

  const handleDeleteStory = useCallback((storyId: string, userId: string) => {
    deleteStory(userId, storyId).catch(() => {});
  }, []);

  const handleChatPress = useCallback((chat: Chat) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/inbox/${chat.id}?participantId=${encodeURIComponent(chat.participantId)}&participantName=${encodeURIComponent(chat.participantName)}` as never,
    );
  }, [router]);

  /** Pin/Unpin / View Profile / Delete Chat History — long press on a chat item */
  const handleChatLongPress = useCallback((chat: Chat) => {
    if (!user?.uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isPinned = chat.isPinned === true;
    Alert.alert(
      chat.participantName,
      '',
      [
        {
          text: isPinned ? t('chat.unpinChat') : t('chat.pinChat'),
          onPress: async () => {
            try {
              if (isPinned) {
                await unpinChat(user.uid, chat.id);
              } else {
                await pinChat(user.uid, chat.id);
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert(t('chat.error'), t('chat.pinError'));
            }
          },
        },
        {
          text: 'View Profile',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(
              `/user-profile?uid=${encodeURIComponent(chat.participantId)}&name=${encodeURIComponent(chat.participantName)}` as never,
            );
          },
        },
        {
          text: 'Delete Chat History',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Chat History',
              `Clear all messages with ${chat.participantName}? This only removes them for you.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await clearChat(chat.id, user.uid);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch {
                      Alert.alert(t('chat.error'), 'Could not delete chat history.');
                    }
                  },
                },
              ],
            );
          },
        },
        { text: t('chat.cancel'), style: 'cancel' },
      ],
    );
  }, [user?.uid, t, router]);

  /** Called when user selects someone from UserSearchModal */
  const handleUserSelected = useCallback((selectedUser: VeeUser, chatId: string) => {
    setSearchModalOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(
      `/inbox/${chatId}?participantId=${encodeURIComponent(selectedUser.uid)}&participantName=${encodeURIComponent(selectedUser.name)}` as never,
    );
  }, [router]);

  const filteredChats = search.trim()
    ? chats.filter((c) =>
        c.participantName.toLowerCase().includes(search.toLowerCase()),
      )
    : chats;

  const pinnedChats  = filteredChats.filter(c => c.isPinned);
  const regularChats = filteredChats.filter(c => !c.isPinned);

  // ── Empty state ─────────────────────────────────────────────────────────────
  function EmptyState() {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60 }}>
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: 'rgba(139,92,246,0.12)',
          borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name="message-circle" size={36} color={C.glow} />
        </View>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', marginTop: 18 }}>
          {t('chat.noChats')}
        </Text>
        <Text style={{ color: C.muted, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>
          {t('chat.noChatsSubtitle')}
        </Text>
        <Pressable
          onPress={() => setSearchModalOpen(true)}
          style={{
            marginTop: 22, backgroundColor: C.primary,
            borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
            {t('chat.newChat')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── List header ──────────────────────────────────────────────────────────────
  function ListHeader() {
    return (
      <View>
        {/* Story bar */}
        <StoryBar
          stories={stories}
          loading={storiesLoading}
          onOpenStory={openStory}
          onOpenCreator={openCreator}
          onOpenPlanet={onOpenPlanet}
        />

        {/* Pinned chats */}
        {pinnedChats.length > 0 && (
          <>
            <Text style={{
              color: C.muted, fontSize: 11, fontWeight: '700',
              letterSpacing: 0.8, marginBottom: 8, marginTop: 4,
              paddingHorizontal: 2,
            }}>
              {t('chat.pinned')}
            </Text>
            {pinnedChats.map(item => (
              <ChatListItem
                key={item.id}
                chat={item}
                onPress={() => handleChatPress(item)}
                onLongPress={() => handleChatLongPress(item)}
              />
            ))}
            {regularChats.length > 0 && (
              <Text style={{
                color: C.muted, fontSize: 11, fontWeight: '700',
                letterSpacing: 0.8, marginBottom: 8, marginTop: 12,
                paddingHorizontal: 2,
              }}>
                {t('chat.allMessages')}
              </Text>
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {/* ── Top bar ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: Platform.OS === 'web' ? 67 : 0,
            paddingBottom: 14,
          }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 26, fontWeight: '900' }}>
              {t('chat.title')}
            </Text>

            {/* New Chat button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearchModalOpen(true);
              }}
              style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: C.glass,
                borderWidth: 1, borderColor: C.border,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Feather name="edit" size={18} color={C.muted} />
            </Pressable>
          </View>

          {/* ── Search bar ── */}
          {searchActive || search.length > 0 ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: C.inputBg, borderRadius: 14,
              paddingHorizontal: 12, paddingVertical: 10,
              marginBottom: 12, gap: 8,
              borderWidth: 1, borderColor: C.border,
            }}>
              <Feather name="search" size={16} color={C.muted} />
              <TextInput
                autoFocus
                style={{ flex: 1, color: C.text, fontSize: 15 }}
                placeholder={t('chat.searchActive')}
                placeholderTextColor={C.dim}
                value={search}
                onChangeText={setSearch}
              />
              <Pressable onPress={() => { setSearch(''); setSearchActive(false); }}>
                <Feather name="x" size={16} color={C.muted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setSearchActive(true)}
              style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: C.inputBg, borderRadius: 14,
                paddingHorizontal: 12, paddingVertical: 10,
                marginBottom: 12, gap: 8,
                borderWidth: 1, borderColor: C.border,
              }}
            >
              <Feather name="search" size={16} color={C.dim} />
              <Text style={{ color: C.dim, fontSize: 15 }}>{t('chat.searchPlaceholder')}</Text>
            </Pressable>
          )}

          {/* ── Loading ── */}
          {loadingChats ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator color={C.glow} />
            </View>
          ) : (
            /* ── List ── */
            <FlatList
              data={regularChats}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ChatListItem
                  chat={item}
                  onPress={() => handleChatPress(item)}
                  onLongPress={() => handleChatLongPress(item)}
                />
              )}
              ListHeaderComponent={ListHeader}
              ListEmptyComponent={pinnedChats.length === 0 ? <EmptyState /> : null}
              contentContainerStyle={{ paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={10}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Story Viewer */}
      <StoryViewer
        visible={viewerOpen}
        startUserIndex={viewerStartIdx}
        stories={stories}
        onClose={() => setViewerOpen(false)}
        currentUserId={user?.uid}
        onDelete={handleDeleteStory}
      />

      {/* Story Creator */}
      <StoryCreator
        visible={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onPublish={handlePublishStory}
      />

      {/* User Search Modal — New Chat */}
      <UserSearchModal
        visible={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectUser={handleUserSelected}
      />
    </View>
  );
}
