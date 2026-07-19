import { memo, useRef, useState } from 'react';
import {
  View, Text, Pressable, Animated, Alert,
  ActionSheetIOS, Platform, Image, Dimensions,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DmMessage } from '../types/dm';
import { addReaction, deleteMessage } from '../services/firebaseDmService';

const { width } = Dimensions.get('window');
const BUBBLE_MAX = width * 0.72;

const C = {
  myBubble: '#7C3AED',
  theirBubble: 'rgba(255,255,255,0.08)',
  myText: '#FFFFFF',
  theirText: '#FFFFFF',
  muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.25)',
  border: 'rgba(255,255,255,0.12)',
  reactionBg: 'rgba(18,10,35,0.95)',
  seen: '#8B5CF6',
  sent: 'rgba(255,255,255,0.45)',
} as const;

const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

function formatMsgTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

type Props = {
  message: DmMessage;
  chatId: string;
  myUid: string;
  onReply: (msg: DmMessage) => void;
  onMediaPress?: (uri: string, type: 'image' | 'video') => void;
};

// Memoized: the DM thread FlatList renders one of these per message.
function MessageBubble({ message, chatId, myUid, onReply, onMediaPress }: Props) {
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [showReactions, setShowReactions] = useState(false);

  const isMe = message.senderId === myUid;

  if (message.deletedForMe) return null;

  const bounce = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();
  };

  const handleLongPress = () => {
    bounce();
    setShowReactions(true);
  };

  const handleReaction = (emoji: string) => {
    setShowReactions(false);
    addReaction(chatId, message.id, myUid, emoji).catch(() => {});
  };

  const handleOptions = () => {
    const options: string[] = message.deletedForEveryone
      ? [t('chat.cancel')]
      : isMe
        ? [t('chat.msgReply'), t('chat.msgDeleteForMe'), t('chat.msgDeleteForEveryone'), t('chat.cancel')]
        : [t('chat.msgReply'), t('chat.msgSaveToGallery'), t('chat.msgDeleteForMe'), t('chat.cancel')];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: options.includes(t('chat.msgDeleteForEveryone'))
            ? options.indexOf(t('chat.msgDeleteForEveryone'))
            : undefined,
        },
        (idx) => handleOptionSelect(options[idx]),
      );
    } else {
      // Android — Alert.alert with typed buttons
      type BtnStyle = 'cancel' | 'destructive' | 'default';
      const buttons: Array<{ text: string; style: BtnStyle; onPress: () => void }> = options
        .filter((o) => o !== t('chat.cancel'))
        .map((label) => ({
          text: label,
          style: (label === t('chat.msgDeleteForMe') || label === t('chat.msgDeleteForEveryone') ? 'destructive' : 'default') as BtnStyle,
          onPress: () => handleOptionSelect(label),
        }));
      buttons.push({ text: t('chat.cancel'), style: 'cancel' as BtnStyle, onPress: () => {} });
      Alert.alert(t('chat.messageOptions'), '', buttons);
    }
  };

  const handleOptionSelect = async (action: string) => {
    if (action === t('chat.msgReply')) { onReply(message); return; }
    if (action === t('chat.msgDeleteForMe')) { deleteMessage(chatId, message.id, myUid, false).catch(() => {}); return; }
    if (action === t('chat.msgDeleteForEveryone')) { deleteMessage(chatId, message.id, myUid, true).catch(() => {}); return; }
    if (action === t('chat.msgSaveToGallery')) {
      if (message.type !== 'image' && message.type !== 'video') return;
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('chat.permissionRequired'), t('chat.galleryPermission'));
          return;
        }
        await MediaLibrary.saveToLibraryAsync(message.content);
        Alert.alert(t('chat.saved'), t('chat.msgSaveToGallery'));
      } catch {
        Alert.alert(t('chat.error'), t('chat.saveToGalleryFailed'));
      }
      return;
    }
  };

  const bubbleBg  = isMe ? C.myBubble : C.theirBubble;
  const textColor = isMe ? C.myText : C.theirText;
  const align     = isMe ? 'flex-end' : 'flex-start';

  const reactions = message.reactions
    ? Object.entries(
        Object.values(message.reactions).reduce<Record<string, number>>((acc, emoji) => {
          acc[emoji] = (acc[emoji] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <View style={{ alignItems: align, marginHorizontal: 14, marginBottom: 2 }}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }], maxWidth: BUBBLE_MAX }}>
        {/* Reply preview inside bubble */}
        {message.replyTo && !message.deletedForEveryone && (
          <View style={{
            backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 6,
            marginBottom: 4, borderLeftWidth: 3, borderLeftColor: C.seen,
          }}>
            <Text style={{ color: C.seen, fontSize: 11, fontWeight: '700', marginBottom: 2 }}>
              {message.replyTo.senderName}
            </Text>
            <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>
              {message.replyTo.type !== 'text' ? '📷 Media' : message.replyTo.preview}
            </Text>
          </View>
        )}

        {/* Main bubble */}
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={200}
          style={{
            backgroundColor: bubbleBg,
            borderRadius: 18,
            borderBottomRightRadius: isMe ? 4 : 18,
            borderBottomLeftRadius: isMe ? 18 : 4,
            paddingHorizontal: 14, paddingVertical: 10,
            borderWidth: isMe ? 0 : 1, borderColor: C.border,
          }}
        >
          {message.deletedForEveryone ? (
            <Text style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>
              {isMe ? '🗑 You deleted this message' : '🗑 This message was deleted'}
            </Text>
          ) : message.type === 'image' ? (
            <Pressable onPress={() => onMediaPress?.(message.content, 'image')}>
              <Image
                source={{ uri: message.content }}
                style={{ width: 200, height: 200, borderRadius: 12 }}
                resizeMode="cover"
              />
            </Pressable>
          ) : message.type === 'video' ? (
            <Pressable
              onPress={() => onMediaPress?.(message.content, 'video')}
              style={{
                width: 200, height: 140, borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.5)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Feather name="play-circle" size={48} color="#fff" />
              <Text style={{ color: C.muted, marginTop: 6, fontSize: 12 }}>
                {t('chat.videoMessage')}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: textColor, fontSize: 15, lineHeight: 22 }}>
              {message.content}
            </Text>
          )}

          {/* Timestamp + seen */}
          {!message.deletedForEveryone && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
              <Text style={{ color: C.muted, fontSize: 10 }}>
                {formatMsgTime(message.createdAt)}
              </Text>
              {isMe && (
                <Feather
                  name={message.status === 'seen' ? 'check-circle' : 'check'}
                  size={12}
                  color={message.status === 'seen' ? C.seen : C.sent}
                />
              )}
            </View>
          )}
        </Pressable>

        {/* Reactions display */}
        {reactions.length > 0 && (
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap', gap: 4,
            marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start',
          }}>
            {reactions.map(([emoji, count]) => (
              <Pressable
                key={emoji}
                onPress={() => handleReaction(emoji)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: C.reactionBg, borderRadius: 14,
                  paddingHorizontal: 8, paddingVertical: 4,
                  borderWidth: 1,
                  borderColor: message.reactions?.[myUid] === emoji
                    ? 'rgba(124,58,237,0.6)'
                    : 'rgba(255,255,255,0.12)',
                }}
              >
                <Text style={{ fontSize: 13 }}>{emoji}</Text>
                {count > 1 && (
                  <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>{count}</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Quick reaction picker overlay */}
        {showReactions && (
          <View style={{
            position: 'absolute',
            bottom: 48,
            [isMe ? 'right' : 'left']: 0,
            flexDirection: 'row',
            backgroundColor: 'rgba(18,10,35,0.97)',
            borderRadius: 30, paddingVertical: 8, paddingHorizontal: 12, gap: 6,
            borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
            shadowColor: '#7C3AED', shadowOpacity: 0.3, shadowRadius: 12,
            shadowOffset: { width: 0, height: 2 }, elevation: 10, zIndex: 100,
          }}>
            {REACTIONS.map((emoji) => (
              <Pressable key={emoji} onPress={() => handleReaction(emoji)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => { setShowReactions(false); handleOptions(); }}
              style={{ padding: 4, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="more-horizontal" size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>
        )}

        {/* Dismiss reaction overlay if tapped outside */}
        {showReactions && (
          <Pressable
            style={{ position: 'absolute', inset: -200, zIndex: 99 }}
            onPress={() => setShowReactions(false)}
          />
        )}
      </Animated.View>
    </View>
  );
}

export default memo(MessageBubble);
