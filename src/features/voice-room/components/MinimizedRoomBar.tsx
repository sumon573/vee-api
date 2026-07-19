import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, Platform } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import {
  getMinimizedRoom,
  setMinimizedRoom,
  subscribeMinimizedRoom,
  type MinimizedRoom,
} from '@/src/store/minimizedRoom';
import { destroyPersistedZegoEngine } from '@/src/hooks/useZegoVoiceRoom';
import { removeSeat, leaveAudience } from '@/src/features/voice-room/services/firebaseRoomService';

const C = {
  bg: '#0F0A1E',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  border: 'rgba(139,92,246,0.35)',
  micOn: '#22C55E',
  micOff: '#EF4444',
} as const;

export default function MinimizedRoomBar() {
  const [room, setRoom] = useState<MinimizedRoom>(getMinimizedRoom());
  const slideAnim = useRef(new Animated.Value(100)).current;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  useEffect(() => {
    const unsub = subscribeMinimizedRoom((r) => {
      setRoom(r);
      if (r) {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          speed: 14,
          bounciness: 6,
        }).start();
      } else {
        Animated.timing(slideAnim, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    });
    return unsub;
  }, []);

  if (!room) return null;

  const bottomOffset =
    Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 80; // above bottom nav

  const handleReturn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMinimizedRoom(null);
    router.push({ pathname: '/voice-room', params: { roomId: room.id } } as any);
  };

  /**
   * Close (X) button — user is discarding the minimized room entirely.
   * We must:
   *   1. Destroy the persisted ZEGO engine so audio actually stops.
   *   2. Remove the user from Firebase (seat or audience) so they don't
   *      appear as a ghost member in the room.
   *   3. Clear the minimized room store.
   */
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // 1. Tear down ZEGO audio
    destroyPersistedZegoEngine();
    // 2. Firebase cleanup — remove the user from the room
    if (room.mySeatIdx >= 0) {
      removeSeat(room.id, room.mySeatIdx).catch(() => {});
    } else {
      leaveAudience(room.id, room.myUid).catch(() => {});
    }
    // 3. Clear store
    setMinimizedRoom(null);
  };

  // Mic indicator color reflects the muted state captured at minimize time
  const micColor = room.muted ? C.micOff : C.micOn;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 16,
        right: 16,
        transform: [{ translateY: slideAnim }],
        backgroundColor: C.bg,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: C.border,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: C.glow,
        shadowOpacity: 0.45,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 4 },
        elevation: 14,
        zIndex: 999,
      }}
    >
      {/* Mic state indicator */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: micColor + '22',
          borderWidth: 1.5,
          borderColor: micColor + '66',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Feather name={room.muted ? 'mic-off' : 'mic'} size={16} color={micColor} />
      </View>

      {/* Room info */}
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: C.text, fontSize: 13, fontWeight: '800' }}
          numberOfLines={1}
        >
          {room.name}
        </Text>
        <Text
          style={{ color: C.muted, fontSize: 11, marginTop: 1 }}
          numberOfLines={1}
        >
          {room.topic}
        </Text>
      </View>

      {/* Return button */}
      <Pressable
        onPress={handleReturn}
        style={{
          backgroundColor: C.primary,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 7,
          marginRight: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{t('voiceRoom.minimizedBar.return')}</Text>
      </Pressable>

      {/* Close — fully exits the minimized room */}
      <Pressable onPress={handleClose} hitSlop={12}>
        <Feather name="x" size={18} color={C.muted} />
      </Pressable>
    </Animated.View>
  );
}
