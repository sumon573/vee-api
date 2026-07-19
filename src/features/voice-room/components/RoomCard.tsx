import { View, Text, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ScalePress from '@/components/ScalePress';
import { VoiceRoom } from '../types/room';

const SIZE = 108;

type Props = { room: VoiceRoom; onPress?: () => void };

export default function RoomCard({ room, onPress }: Props) {
  const { t } = useTranslation();
  const previews = room.memberPreviews?.slice(0, 4) ?? [];

  return (
    <ScalePress onPress={onPress}>
      <View style={{ width: 130, marginRight: 14 }}>
        <View style={{
          width: SIZE, height: SIZE, borderRadius: 22,
          backgroundColor: room.themeColor,
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
          shadowColor: room.themeColor, shadowOpacity: 0.45,
          shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
        }}>
          {room.coverImageUrl ? (
            <Image
              source={{ uri: room.coverImageUrl }}
              style={{ position: 'absolute', width: SIZE, height: SIZE }}
              resizeMode="cover"
            />
          ) : (
            <>
              {/* Background circle decoration */}
              <View style={{
                position: 'absolute', width: SIZE * 1.2, height: SIZE * 1.2,
                borderRadius: SIZE, top: -SIZE * 0.45, left: -SIZE * 0.25,
                backgroundColor: 'rgba(255,255,255,0.12)',
              }} />
              <Feather name="mic" size={28} color="rgba(255,255,255,0.9)" />
            </>
          )}

          {/* Member DPs row — bottom left */}
          {previews.length > 0 && (
            <View style={{
              position: 'absolute', left: 6, bottom: 6,
              flexDirection: 'row',
            }}>
              {previews.map((p, i) => (
                <View key={i} style={{
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: p.color,
                  borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.4)',
                  alignItems: 'center', justifyContent: 'center',
                  marginLeft: i === 0 ? 0 : -5,
                }}>
                  <Text style={{ color: '#fff', fontSize: 7, fontWeight: '900' }}>
                    {p.initials.charAt(0)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Member count — bottom right */}
          <View style={{
            position: 'absolute', right: 6, bottom: 6,
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderRadius: 999, paddingHorizontal: 5, paddingVertical: 2,
          }}>
            <Feather name="volume-2" size={8} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', marginLeft: 3 }}>
              {room.memberCount}
            </Text>
          </View>
        </View>

        {/* Name */}
        <Text numberOfLines={1} style={{
          color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 8,
        }}>
          {room.isPublic === false ? '🔒 ' : ''}{room.name}
        </Text>

        {/* Topic pill */}
        {!!room.topic && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 5, flexWrap: 'wrap' }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: '#F97316', borderRadius: 999,
              paddingHorizontal: 7, paddingVertical: 3,
            }}>
              <Text style={{ fontSize: 8 }}>💬</Text>
              <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>{t('voiceRoom.card.topic')}</Text>
            </View>
            <Text numberOfLines={1} style={{
              color: 'rgba(255,255,255,0.75)', fontSize: 10, flex: 1,
            }}>
              {room.topic}
            </Text>
          </View>
        )}
      </View>
    </ScalePress>
  );
}
