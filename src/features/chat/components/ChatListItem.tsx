import { memo, useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import ScalePress from '@/components/ScalePress';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ref, get } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { Chat } from '../types';
import { formatTime } from '../data/mockChats';

const C = {
  text: '#FFFFFF',
  muted: '#B8A6D9',
  dim: '#4A3D6E',
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  card: 'rgba(255,255,255,0.038)',
  cardUnread: 'rgba(124,58,237,0.09)',
  cardPinned: 'rgba(245,158,11,0.06)',
  border: 'rgba(255,255,255,0.07)',
  borderUnread: 'rgba(139,92,246,0.25)',
  borderPinned: 'rgba(245,158,11,0.18)',
  accent: '#8B5CF6',
  online: '#22C55E',
  gold: '#F59E0B',
} as const;

const AVATAR_SIZE = 52;

const AVATAR_COLORS = [
  '#7C3AED', '#0EA5E9', '#EC4899', '#F97316',
  '#22C55E', '#EAB308', '#8B5CF6', '#06B6D4', '#EF4444', '#10B981',
];
function colorFor(id: string): string {
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

type Props = {
  chat: Chat;
  onPress: () => void;
  onLongPress?: () => void;
};

function ChatListItem({ chat, onPress, onLongPress }: Props) {
  const { t } = useTranslation();
  const hasUnread = chat.unreadCount > 0;
  const isPinned  = chat.isPinned === true;

  // RC6 fix Issue 5: fetch the participant's live photoURL from RTDB so the
  // avatar stays current even after the other user changes their profile photo.
  // The stored chat.participantAvatar may be stale (it is only written once when
  // the chat is first created). We do a one-time get() per chat item — cheap and
  // doesn't leave a permanent listener for every chat in the list.
  const [livePhotoURL, setLivePhotoURL] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!chat.participantId) return;
    get(ref(database, `users/${chat.participantId}/photoURL`))
      .then(snap => {
        if (!cancelled && snap.exists() && snap.val()) {
          setLivePhotoURL(snap.val() as string);
        }
      })
      .catch(() => {/* non-critical — fall back to stored avatar or initials */});
    return () => { cancelled = true; };
  }, [chat.participantId]);

  const avatarUri = livePhotoURL ?? chat.participantAvatar ?? null;

  /** Label for the last message type */
  function messagePreview(c: Chat): { icon: React.ComponentProps<typeof Feather>['name'] | null; text: string } {
    switch (c.lastMessageType) {
      case 'image':        return { icon: 'image',    text: t('chat.mediaPhoto') };
      case 'video':        return { icon: 'video',     text: t('chat.mediaVideo') };
      case 'voice':        return { icon: 'mic',       text: t('chat.mediaVoice') };
      case 'story_share':  return { icon: 'share-2',  text: t('chat.mediaStoryShare') };
      case 'sticker':      return { icon: 'smile',     text: t('chat.mediaSticker') };
      default:             return { icon: null,         text: c.lastMessage };
    }
  }

  const preview = messagePreview(chat);

  return (
    <ScalePress onPress={onPress} onLongPress={onLongPress} scaleTo={0.97}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: isPinned ? C.cardPinned : hasUnread ? C.cardUnread : C.card,
        borderRadius: 20,
        marginHorizontal: 16, marginBottom: 8,
        paddingVertical: 12, paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: isPinned ? C.borderPinned : hasUnread ? C.borderUnread : C.border,
        shadowColor: isPinned ? C.gold : hasUnread ? C.glow : 'transparent',
        shadowOpacity: 0.18, shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 }, elevation: (isPinned || hasUnread) ? 6 : 0,
      }}>

        {/* Left accent stripe */}
        {(hasUnread || isPinned) && (
          <View style={{
            position: 'absolute', left: 0, top: 14, bottom: 14,
            width: 3, borderRadius: 99,
            backgroundColor: isPinned ? C.gold : C.accent,
          }} />
        )}

        {/* Avatar */}
        <View style={{ position: 'relative', marginRight: 14 }}>
          {/* Story ring */}
          {chat.hasStory && (
            <View style={{
              position: 'absolute', top: -3, left: -3,
              width: AVATAR_SIZE + 6, height: AVATAR_SIZE + 6,
              borderRadius: (AVATAR_SIZE + 6) / 2,
              borderWidth: 2,
              borderColor: chat.storySeen ? C.dim : C.glow,
              shadowColor: chat.storySeen ? 'transparent' : C.glow,
              shadowOpacity: 0.6, shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            }} />
          )}

          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
            />
          ) : (
            <View style={{
              width: AVATAR_SIZE, height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: colorFor(chat.participantId),
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                {initials(chat.participantName)}
              </Text>
            </View>
          )}

          {/* Online dot */}
          {chat.isOnline && (
            <View style={{
              position: 'absolute', bottom: 1, right: 1,
              width: 12, height: 12, borderRadius: 6,
              backgroundColor: C.online,
              borderWidth: 2, borderColor: C.bg,
            }} />
          )}
        </View>

        {/* Text content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            {/* Pin icon */}
            {isPinned && (
              <Feather name="bookmark" size={12} color={C.gold} style={{ marginRight: 4 }} />
            )}
            <Text numberOfLines={1} style={{
              flex: 1, color: C.text,
              fontSize: 15, fontWeight: hasUnread ? '900' : '700',
            }}>
              {chat.participantName}
            </Text>

            {/* Time badge */}
            <View style={{
              backgroundColor: hasUnread ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
              borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8,
            }}>
              <Text style={{
                color: hasUnread ? C.accent : C.dim,
                fontSize: 11, fontWeight: '700',
              }}>
                {formatTime(chat.lastMessageTime)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {chat.isTyping
              ? (
                <Text style={{ color: C.accent, fontSize: 13, fontStyle: 'italic' }}>
                  {t('chat.typingIndicator')}
                </Text>
              )
              : (
                <>
                  {preview.icon && (
                    <Feather name={preview.icon} size={13} color={hasUnread ? C.muted : C.dim} />
                  )}
                  <Text numberOfLines={1} style={{
                    flex: 1,
                    color: hasUnread ? C.muted : C.dim,
                    fontSize: 13, fontWeight: hasUnread ? '600' : '400',
                  }}>
                    {preview.text}
                  </Text>
                </>
              )}

            {/* Unread badge */}
            {hasUnread && (
              <View style={{
                minWidth: 20, height: 20, borderRadius: 10,
                backgroundColor: C.accent,
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 5,
                shadowColor: C.glow, shadowOpacity: 0.6,
                shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
              }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>
                  {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </ScalePress>
  );
}

export default memo(ChatListItem);
