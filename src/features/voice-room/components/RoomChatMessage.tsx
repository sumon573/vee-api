import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { ChatMsg } from '../types/room';
import { fmt } from '../utils/format';
import { MsgText } from './Avatar';

type Props = {
  item: ChatMsg;
  accentColor: string;
  onReply: (msg: ChatMsg) => void;
};

/**
 * A single row in the room chat FlatList.
 *
 * Long-press → set as reply target (shown as a reply preview above input).
 * @mention tokens are highlighted in the accent color via MsgText.
 * Memoized: every incoming message would otherwise re-render the whole list.
 */
function RoomChatMessage({ item, accentColor, onReply }: Props) {
  const { t } = useTranslation();
  const isSystem = item.sender === 'System';

  /* ── System messages: centered pill ── */
  if (isSystem) {
    return (
      <View style={{ alignItems: 'center', marginVertical: 5 }}>
        <View style={{
          backgroundColor: accentColor + '18',
          borderRadius: 999,
          paddingHorizontal: 14, paddingVertical: 5,
          borderWidth: 1, borderColor: accentColor + '33',
        }}>
          <Text style={{ color: accentColor + 'CC', fontSize: 11, fontWeight: '600' }}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  }

  const bubbleBg    = item.isMe ? accentColor + '30' : 'rgba(255,255,255,0.075)';
  const borderColor = item.isMe ? accentColor + '55' : 'rgba(255,255,255,0.1)';

  return (
    <Pressable
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onReply(item);
      }}
      style={{ marginBottom: 10, alignItems: item.isMe ? 'flex-end' : 'flex-start' }}
    >
      {/* Sender name (other users only) */}
      {!item.isMe && (
        <Text style={{
          color: item.color,
          fontSize: 11, fontWeight: '800',
          marginBottom: 3, marginLeft: 4,
          letterSpacing: 0.2,
        }}>
          {item.sender}
        </Text>
      )}

      <View style={{
        backgroundColor: bubbleBg,
        borderRadius: 16,
        borderBottomRightRadius: item.isMe ? 4 : 16,
        borderBottomLeftRadius:  item.isMe ? 16 : 4,
        paddingHorizontal: 13, paddingVertical: 9,
        maxWidth: '82%',
        borderWidth: 1, borderColor,
      }}>
        {/* Reply-to block */}
        {item.replyTo && (
          <View style={{
            borderLeftWidth: 3, borderLeftColor: item.replyTo.color,
            paddingLeft: 9, marginBottom: 7,
            backgroundColor: 'rgba(0,0,0,0.22)',
            borderRadius: 8, padding: 6,
          }}>
            <Text style={{
              color: item.replyTo.color,
              fontSize: 10, fontWeight: '800', marginBottom: 2,
            }}>
              ↩ {item.replyTo.sender}
            </Text>
            <Text style={{ color: C.sub, fontSize: 11 }} numberOfLines={2}>
              {item.replyTo.text}
            </Text>
          </View>
        )}

        <MsgText text={item.text} accent={accentColor} />
      </View>

      {/* Timestamp + hint */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
        marginTop: 3, marginHorizontal: 4 }}>
        <Text style={{ color: C.muted, fontSize: 9 }}>{fmt(item.ts)}</Text>
        <Text style={{ color: C.muted + '66', fontSize: 9 }}>
          {t('voiceRoom.chat.holdToReply')}
        </Text>
      </View>
    </Pressable>
  );
}

export default memo(RoomChatMessage);
