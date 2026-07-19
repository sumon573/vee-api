import { useEffect, useRef } from 'react';
import { Text, Animated, Image } from 'react-native';
import { C } from '../constants/theme';

/* ─────────────────────────── MsgText ─────────────────────────── */
export function MsgText({ text, accent }: { text: string; accent: string }) {
  const parts = text.split(/(@\S+)/g);
  return (
    <Text style={{ color: C.text, fontSize: 13 }}>
      {parts.map((part, i) =>
        /^@\S+/.test(part)
          ? <Text key={i} style={{ color: accent, fontWeight: '800' }}>{part}</Text>
          : part
      )}
    </Text>
  );
}

/* ─────────────────────────── Avatar ─────────────────────────── */
// Pulsates ONLY when speaking === true.
// For demo data, all speaking values are false so there are NO fake animations.
// When ZEGOCLOUD is connected, set speaking:true for users who are actually talking.
export function Avatar({ initials, color, size, speaking, accent, photoURL }: {
  initials: string; color: string; size: number; speaking: boolean; accent: string;
  photoURL?: string;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!speaking) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.09, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [speaking]);

  return (
    <Animated.View style={{
      width: size, height: size, borderRadius: size / 2,
      transform: [{ scale: pulse }],
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: color + '2A',
      borderWidth: speaking ? 2.5 : 1.5,
      borderColor: speaking ? C.gold : (accent + '55'),
      overflow: 'hidden',
    }}>
      {photoURL ? (
        <Image
          source={{ uri: photoURL }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={{ color, fontSize: size * 0.34, fontWeight: '800' }}>{initials}</Text>
      )}
    </Animated.View>
  );
}
