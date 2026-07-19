import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import ScalePress from '@/components/ScalePress';
import { C } from '../constants/theme';

const REACTION_EMOJIS = ['😂', '👍', '🥰', '😘', '😭', '👋', '😯', '🙂', '🫣'];

/* ─────────────────────────── Emoji Panel ─────────────────────────── */
export function EmojiPanel({ visible, onSelect, onClose, bottomOffset }: {
  visible: boolean; onSelect: (emoji: string) => void; onClose: () => void; bottomOffset: number;
}) {
  const slideAnim   = useRef(new Animated.Value(80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim,   { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim,   { toValue: 80, duration: 160, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,  duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} onPress={onClose} />
      <Animated.View style={{
        position: 'absolute', bottom: bottomOffset, left: 12, right: 12, zIndex: 100,
        transform: [{ translateY: slideAnim }], opacity: opacityAnim,
        backgroundColor: '#0F0A1E', borderRadius: 22, borderWidth: 1.5, borderColor: C.border,
        paddingVertical: 14, paddingHorizontal: 18,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 20,
        shadowOffset: { width: 0, height: -4 }, elevation: 20,
      }}>
        {REACTION_EMOJIS.map(emoji => (
          <ScalePress key={emoji} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSelect(emoji); }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center',
              justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.10)' }}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </View>
          </ScalePress>
        ))}
      </Animated.View>
    </>
  );
}
