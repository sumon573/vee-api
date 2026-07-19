import { View, Text, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ScalePress from '@/components/ScalePress';
import { VoiceRoom } from '../types/room';

const C = {
  text: '#FFFFFF',
  muted: '#B8A6D9',
  surface: 'rgba(255,255,255,0.055)',
  border: 'rgba(255,255,255,0.09)',
};

type Props = { room: VoiceRoom; onPress?: () => void };

export default function RoomListItem({ room, onPress }: Props) {
  const { t } = useTranslation();
  const previews = room.memberPreviews?.slice(0, 5) ?? [];
  const isPrivate = room.isPublic === false;

  return (
    <ScalePress onPress={onPress}>
      <View style={{
        borderRadius: 18, padding: 14, marginBottom: 12,
        backgroundColor: C.surface,
        borderWidth: 1, borderColor: C.border,
        shadowColor: '#8B5CF6', shadowOpacity: 0.1,
        shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Room color tile */}
          <View style={{
            width: 50, height: 50, borderRadius: 14,
            backgroundColor: room.themeColor,
            alignItems: 'center', justifyContent: 'center',
            marginRight: 12, overflow: 'hidden',
            shadowColor: room.themeColor, shadowOpacity: 0.4,
            shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
          }}>
            {room.coverImageUrl ? (
              <Image
                source={{ uri: room.coverImageUrl }}
                style={{ width: 50, height: 50 }}
                resizeMode="cover"
              />
            ) : (
              <Feather name="mic" size={20} color="rgba(255,255,255,0.9)" />
            )}
          </View>

          <View style={{ flex: 1 }}>
            {/* Room name with public/private icon */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {isPrivate ? (
                <Feather name="lock" size={13} color="#F59E0B" />
              ) : (
                <Feather name="globe" size={13} color="#10B981" />
              )}
              <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '800', flex: 1 }}>
                {room.name}
              </Text>
            </View>
          </View>

          {room.isLive && (
            <View style={{
              backgroundColor: 'rgba(239,68,68,0.18)',
              borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
            }}>
              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '900' }}>{t('voiceRoom.listItem.live')}</Text>
            </View>
          )}
        </View>

        {/* Topic pill */}
        {!!room.topic && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: '#F97316', borderRadius: 999,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ fontSize: 11 }}>💬</Text>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{t('voiceRoom.card.topic')}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, flex: 1 }}>
              {room.topic}
            </Text>
          </View>
        )}

        {/* Bottom row: member count + DP previews */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <Feather name="users" size={13} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 13 }}>{t('voiceRoom.listItem.members', { count: room.memberCount })}</Text>

          {previews.length > 0 && (
            <View style={{ flexDirection: 'row', marginLeft: 4 }}>
              {previews.map((p, i) => (
                <View key={i} style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: p.color,
                  borderWidth: 1.5, borderColor: 'rgba(10,7,21,0.6)',
                  alignItems: 'center', justifyContent: 'center',
                  marginLeft: i === 0 ? 0 : -6,
                }}>
                  <Text style={{ color: '#fff', fontSize: 7, fontWeight: '900' }}>
                    {p.initials.charAt(0)}
                  </Text>
                </View>
              ))}
              {room.memberCount > (previews.length) && (
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderWidth: 1.5, borderColor: 'rgba(10,7,21,0.6)',
                  alignItems: 'center', justifyContent: 'center',
                  marginLeft: -6,
                }}>
                  <Text style={{ color: '#fff', fontSize: 6, fontWeight: '900' }}>
                    +{room.memberCount - previews.length}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Private room badge */}
          {isPrivate && (
            <View style={{
              marginLeft: 'auto',
              backgroundColor: 'rgba(245,158,11,0.15)',
              borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
              borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Feather name="lock" size={9} color="#F59E0B" />
              <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>Private</Text>
            </View>
          )}
        </View>
      </View>
    </ScalePress>
  );
}
