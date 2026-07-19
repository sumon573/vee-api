import { memo } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { Participant, SeatReaction } from '../types/room';
import { Avatar } from './Avatar';

/* ─────────────────────────── Seat Card ───────────────────────────
   Premium themed seat card.
   - Occupied seat: colored avatar ring (speaking → gold pulse, idle → accent ring)
     + colored owner/admin badge + subtle shadow glow
   - Empty seat: accent-colored dashed border, accent-tinted background
   - Locked seat: gold styling (unchanged)
   Memoized so a single chat message doesn't re-render all 10 seats. */
export const SeatCard = memo(function SeatCard({
  seatIndex, member, onPress, reaction, isLocked, accentColor,
}: {
  seatIndex: number;
  member: Participant | null | undefined;
  onPress: () => void;
  reaction?: SeatReaction;
  isLocked?: boolean;
  accentColor: string;
  myId?: string;
}) {
  const { t } = useTranslation();
  const seatNum = seatIndex + 1;
  const locked  = isLocked;
  const accent  = accentColor;
  const isOwner = member?.role === 'host';
  const isAdmin = member?.role === 'admin';

  return (
    <Pressable
      onPress={onPress}
      style={{ alignItems: 'center', width: '20%', paddingVertical: 10, paddingHorizontal: 2 }}
    >
      {/* ── Seat number badge ── */}
      <View style={{
        position: 'absolute', top: 8, left: '12%', zIndex: 10,
        width: 17, height: 17, borderRadius: 8.5,
        backgroundColor: isOwner ? C.gold : isAdmin ? accent : accent + '55',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: isOwner ? C.gold : accent,
        shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
        elevation: 3,
      }}>
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{seatNum}</Text>
      </View>

      {/* ── Lock badge ── */}
      {locked && (
        <View style={{
          position: 'absolute', top: 8, right: '12%', zIndex: 10,
          width: 17, height: 17, borderRadius: 8.5,
          backgroundColor: C.gold + 'DD',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: C.gold, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
        }}>
          <Feather name="lock" size={8} color="#fff" />
        </View>
      )}

      {member ? (
        /* ── Occupied seat ── */
        <>
          <View style={{
            marginTop: 6, position: 'relative',
            shadowColor: accent,
            shadowOpacity: member.speaking ? 0 : 0.35,
            shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
            elevation: member.speaking ? 0 : 4,
          }}>
            {reaction && (
              <Animated.Text style={{
                position: 'absolute', top: -24, left: 0, right: 0,
                textAlign: 'center', fontSize: 22,
                transform: [{ translateY: reaction.translateY }],
                opacity: reaction.opacity, zIndex: 20,
              }}>
                {reaction.emoji}
              </Animated.Text>
            )}
            <Avatar
              initials={member.initials}
              color={member.color}
              size={52}
              speaking={member.speaking}
              accent={accent}
              photoURL={member.photoURL}
            />
            {/* Mic status dot */}
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: member.muted ? C.red : C.mic,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.5, borderColor: C.bg,
              shadowColor: member.muted ? C.red : C.mic,
              shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
            }}>
              <Feather name={member.muted ? 'mic-off' : 'mic'} size={8} color="#fff" />
            </View>
          </View>

          {/* Name */}
          <Text style={{
            color: C.text, fontSize: 10, fontWeight: '700', marginTop: 5,
            textAlign: 'center',
          }} numberOfLines={1}>{member.name}</Text>

          {/* Role badge */}
          {isOwner && (
            <View style={{
              backgroundColor: C.gold + '33', borderRadius: 8,
              paddingHorizontal: 7, paddingVertical: 2, marginTop: 2,
              borderWidth: 1, borderColor: C.gold + '66',
              shadowColor: C.gold, shadowOpacity: 0.3, shadowRadius: 4,
            }}>
              <Text style={{ color: C.gold, fontSize: 8, fontWeight: '900' }}>
                {t('voiceRoom.seatCard.owner')}
              </Text>
            </View>
          )}
          {isAdmin && (
            <View style={{
              backgroundColor: accent + '33', borderRadius: 8,
              paddingHorizontal: 7, paddingVertical: 2, marginTop: 2,
              borderWidth: 1, borderColor: accent + '66',
              shadowColor: accent, shadowOpacity: 0.3, shadowRadius: 4,
            }}>
              <Text style={{ color: accent, fontSize: 8, fontWeight: '800' }}>
                {t('voiceRoom.seatCard.admin')}
              </Text>
            </View>
          )}
        </>
      ) : (
        /* ── Empty / locked seat ── */
        <>
          <View style={{
            marginTop: 6,
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: locked ? C.gold + '11' : accent + '0D',
            borderWidth: locked ? 1.5 : 1.5,
            borderColor: locked ? C.gold + '55' : accent + '44',
            borderStyle: locked ? 'solid' : 'dashed',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: locked ? C.gold : accent,
            shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
            elevation: 2,
          }}>
            <Feather
              name={locked ? 'lock' : 'user-plus'}
              size={16}
              color={locked ? C.gold : accent + 'BB'}
            />
          </View>
          <Text style={{
            color: locked ? C.gold : accent + 'AA',
            fontSize: 10, marginTop: 5, fontWeight: '600',
          }}>
            {locked ? t('voiceRoom.seatCard.locked') : t('voiceRoom.seatCard.empty')}
          </Text>
        </>
      )}
    </Pressable>
  );
});
