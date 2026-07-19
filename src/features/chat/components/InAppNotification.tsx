import { useEffect, useRef, useState } from 'react';
import {
  Animated, View, Text, Pressable, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  subscribeNotifications,
  dismissNotification,
} from '../services/notificationService';

const C = {
  bg: 'rgba(18,10,35,0.97)',
  border: 'rgba(124,58,237,0.5)',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.65)',
} as const;

export default function InAppNotification() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const [notif, setNotif] = useState<{
    chatId: string; senderName: string; message: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeNotifications((n) => {
      if (n) {
        setNotif({ chatId: n.chatId, senderName: n.senderName, message: n.message });
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();
      } else {
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setNotif(null));
      }
    });
    return unsub;
  }, []);

  if (!notif) return null;

  const topPad = Platform.OS === 'web' ? 67 : insets.top + 8;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: topPad,
        left: 16,
        right: 16,
        zIndex: 9999,
        transform: [{ translateY: slideAnim }],
      }}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          dismissNotification();
          try {
            if (notif.chatId) {
              router.push(`/inbox/${notif.chatId}` as any);
            } else {
              // Missing chatId — never crash, fall back to the Inbox list.
              router.push('/chat' as any);
            }
          } catch {
            router.push('/chat' as any);
          }
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: C.bg,
          borderRadius: 18,
          padding: 14,
          gap: 12,
          borderWidth: 1,
          borderColor: C.border,
          shadowColor: C.primary,
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 12,
        }}
      >
        {/* Avatar */}
        <View style={{
          width: 42, height: 42, borderRadius: 21,
          backgroundColor: 'rgba(124,58,237,0.25)',
          borderWidth: 2, borderColor: C.glow,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
            {notif.senderName[0]?.toUpperCase()}
          </Text>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontWeight: '800', fontSize: 13, marginBottom: 2 }}>
            {notif.senderName}
          </Text>
          <Text
            style={{ color: C.muted, fontSize: 12 }}
            numberOfLines={1}
          >
            {notif.message}
          </Text>
        </View>

        {/* Dismiss */}
        <Pressable onPress={dismissNotification} hitSlop={12}>
          <Feather name="x" size={16} color={C.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
