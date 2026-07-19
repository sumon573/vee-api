import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, ActivityIndicator, Modal, Text, Pressable, Image } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { ThemeProvider } from '@/src/context/ThemeContext';
import { LanguageProvider, useLanguage } from '@/src/context/LanguageContext';
// Side-effect import: initialises i18next with all four language resources.
// Must be imported before any component that calls useTranslation().
import i18n from '@/src/i18n';
// Import type-augmentation so useTranslation() is fully typed everywhere.
import '@/src/i18n/types';
import { cleanExpiredStories } from '@/src/features/chat/services/firebaseStoryService';
import { ONESIGNAL_APP_ID } from '@/src/config/onesignal';
import {
  initializeOneSignal,
  loginOneSignal,
  logoutOneSignal,
  registerNotificationOpenedHandler,
} from '@/src/services/pushNotificationService';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  subscribeIncomingCall,
  removeCallSignal,
  type IncomingCall,
} from '@/src/features/audio-call/services/firebaseCallService';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

// ─── Auth + Language Guard ────────────────────────────────────────────────────
//
// Navigation rules (evaluated in order):
//   1. While loading (auth or language) → show spinner.
//   2. Language not yet selected + not already on language-select → go there.
//   3. Language selected, no user, not in auth group → go to login.
//   4. Language selected, user present, in auth group → go to home.

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isLanguageSelected, isLoading: langLoading } = useLanguage();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || langLoading) return;

    const segs             = segments as string[];
    const inAuthGroup      = segs[0] === 'auth';
    const onLanguageSelect = inAuthGroup && segs[1] === 'language-select';

    if (!isLanguageSelected && !onLanguageSelect) {
      // First launch — must pick a language before anything else.
      router.replace('/auth/language-select');
    } else if (isLanguageSelected && !user && !inAuthGroup) {
      // Language done, not yet logged in.
      router.replace('/auth/login');
    } else if (user && inAuthGroup) {
      // Already authenticated — leave auth screens.
      router.replace('/home');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, segments, isLanguageSelected, langLoading, router]);

  // RC8-B2: Clean expired stories for the current user only (fire-and-forget).
  // Global cleanup across all users is now handled by the server-side scheduler
  // (artifacts/api-server/src/jobs/scheduler.ts, runs every 60 min).
  // Previously: cleanAllExpiredStories() downloaded ALL stories on every app start.
  useEffect(() => {
    if (user && !authLoading) {
      cleanExpiredStories(user.uid).catch(() => {/* non-critical */});
    }
  }, [user?.uid]);

  // BUG 13 fix: initializeOneSignal is Expo-Go-safe — it checks executionEnvironment
  // internally and is a no-op in Expo Go. Safe to call unconditionally here.
  useEffect(() => {
    initializeOneSignal(ONESIGNAL_APP_ID).catch(() => {/* non-critical */});

    // RC8-B2: Warm up the API server (Render free tier sleeps when idle;
    // cold start takes 30-60 s, silently dropping the first push notification).
    // Fixed URL: /health did not exist — correct endpoint is /api/healthz.
    fetch('https://vee-api.onrender.com/api/healthz', { method: 'GET' }).catch(() => {});
  }, []);

  // OneSignal: tapping a background/killed-state push opens the right chat
  useEffect(() => {
    let unsubFn: (() => void) | undefined;
    let cancelled = false;

    // RC8-B2: Added onRoom handler for seat-approved / room-invite / seat-invite
    // notifications so tapping them navigates directly to the voice room.
    registerNotificationOpenedHandler(
      (chatId) => router.push(`/inbox/${chatId}` as any),
      (roomId) => router.push({ pathname: '/voice-room', params: { roomId } } as any),
      () => router.push('/chat' as any),
    ).then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        unsubFn = unsub;
      }
    }).catch(() => {/* non-critical — Expo Go safe */});

    return () => {
      cancelled = true;
      unsubFn?.();
    };
  }, []);

  // OneSignal: link to authenticated user
  useEffect(() => {
    if (user?.uid) {
      loginOneSignal(user.uid).catch(() => {/* non-critical */});
    } else if (!authLoading) {
      logoutOneSignal().catch(() => {/* non-critical */});
    }
  }, [user?.uid, authLoading]);

  // BUG 17 fix: Never show an infinite spinner — the loading states already
  // have internal timeouts (AuthContext: 10s, LanguageContext: 6s) so this
  // block will always resolve in a bounded amount of time.
  if (authLoading || langLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#07020F', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  // RC6 fix Issue 8: when the user is authenticated, mount a global listener
  // for incoming 1-to-1 audio calls. The IncomingCallListener renders a Modal
  // that sits on top of all screens without interrupting navigation state.
  return (
    <>
      {children}
      {user && (
        <IncomingCallListener
          uid={user.uid}
          myName={user.displayName ?? 'Vee User'}
        />
      )}
    </>
  );
}

// ─── Incoming Call Listener (RC6 Issue 8) ─────────────────────────────────────
//
// Mounted globally inside AuthGuard so it survives route changes. Subscribes to
// Firebase RTDB `calls/{uid}` for real-time incoming call signaling.
// Shows a bottom-sheet Modal — Accept navigates to /audio-call (callee role),
// Decline removes the Firebase signal.

function IncomingCallListener({
  uid, myName,
}: {
  uid: string;
  myName: string;
}) {
  const router    = useRouter();
  const segmentsRef = useRef<string[]>([]);
  const segments  = useSegments();
  segmentsRef.current = segments as string[];

  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useEffect(() => {
    return subscribeIncomingCall(uid, (call) => {
      // Ignore incoming calls while already on the audio-call screen (avoids
      // stacking modals when both devices are active in the same call).
      const segs = segmentsRef.current;
      if (segs[0] === 'audio-call') {
        if (call) removeCallSignal(uid).catch(() => {});
        return;
      }
      setIncoming(call);
    });
  }, [uid]);

  const handleAccept = useCallback(() => {
    if (!incoming) return;
    const call = incoming;
    setIncoming(null);
    // Remove signal (callee side)
    removeCallSignal(uid).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(
      `/audio-call?roomId=${encodeURIComponent(call.roomId)}&role=callee&remoteUid=${encodeURIComponent(call.callerId)}&remoteName=${encodeURIComponent(call.callerName)}&calleeUid=${encodeURIComponent(uid)}&myUid=${encodeURIComponent(uid)}&myName=${encodeURIComponent(myName)}${call.callerPhotoURL ? `&remotePhotoURL=${encodeURIComponent(call.callerPhotoURL)}` : ''}` as never,
    );
  }, [incoming, uid, myName, router]);

  const handleDecline = useCallback(() => {
    if (!incoming) return;
    setIncoming(null);
    removeCallSignal(uid).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [incoming, uid]);

  if (!incoming) return null;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={handleDecline}
    >
      <View style={{
        flex: 1, justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.55)',
      }}>
        <View style={{
          backgroundColor: '#0F0A1E',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: 28, paddingTop: 28, paddingBottom: 48,
          alignItems: 'center',
          borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: 'rgba(139,92,246,0.3)',
        }}>
          {/* Caller avatar */}
          <View style={{
            width: 84, height: 84, borderRadius: 42,
            backgroundColor: 'rgba(124,58,237,0.25)',
            borderWidth: 2, borderColor: '#8B5CF6',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', marginBottom: 14,
            shadowColor: '#8B5CF6', shadowOpacity: 0.4,
            shadowRadius: 18, shadowOffset: { width: 0, height: 4 },
          }}>
            {incoming.callerPhotoURL ? (
              <Image
                source={{ uri: incoming.callerPhotoURL }}
                style={{ width: 84, height: 84 }}
              />
            ) : (
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>
                {incoming.callerName[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>

          <Text style={{ color: '#fff', fontSize: 21, fontWeight: '900' }}>
            {incoming.callerName}
          </Text>
          <Text style={{
            color: 'rgba(255,255,255,0.55)', fontSize: 14,
            marginTop: 5, marginBottom: 32, fontWeight: '500',
          }}>
            Incoming Voice Call
          </Text>

          {/* Accept / Decline */}
          <View style={{ flexDirection: 'row', gap: 36, alignItems: 'center' }}>
            {/* Decline */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={handleDecline}
                style={{
                  width: 68, height: 68, borderRadius: 34,
                  backgroundColor: '#EF4444',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#EF4444', shadowOpacity: 0.5, shadowRadius: 14,
                  elevation: 8,
                }}
              >
                <Feather name="phone-off" size={28} color="#fff" />
              </Pressable>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Decline</Text>
            </View>

            {/* Accept */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={handleAccept}
                style={{
                  width: 68, height: 68, borderRadius: 34,
                  backgroundColor: '#22C55E',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#22C55E', shadowOpacity: 0.5, shadowRadius: 14,
                  elevation: 8,
                }}
              >
                <Feather name="phone" size={28} color="#fff" />
              </Pressable>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Navigation Stack ────────────────────────────────────────────────────────

function RootLayoutNav() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#07020F' },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="index" />
        {/* Language selection — shown once before login */}
        <Stack.Screen
          name="auth/language-select"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/signup" />
        <Stack.Screen name="auth/forgot-password" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="home/index" />
        <Stack.Screen
          name="voice-room"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen
          name="inbox/[chatId]"
          options={{ animation: 'slide_from_right' }}
        />
        {/* ── User Profile ── */}
        <Stack.Screen
          name="user-profile"
          options={{ animation: 'slide_from_right' }}
        />
        {/* ── Profile sub-screens ── */}
        <Stack.Screen
          name="profile/index"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/edit"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/rooms"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/notifications"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/privacy"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/settings"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/help"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/about"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="profile/wallet"
          options={{ animation: 'slide_from_right' }}
        />
        {/* RC6 fix Issue 8: real 1-to-1 audio call screen */}
        <Stack.Screen
          name="audio-call"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

// ─── Root Layout ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // BUG 17 fix: hard timeout so splash never blocks forever on slow devices
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    // I18nextProvider makes the i18n instance available to useTranslation()
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <SafeAreaProvider>
          {/* BUG 18 fix: ErrorBoundary at the root catches all unhandled render
              errors and shows a recovery UI instead of freezing the app. */}
          <ErrorBoundary>
            <AuthProvider>
              {/* Issue 7: ThemeProvider inside AuthProvider so it can read user uid */}
              <ThemeProvider>
                <QueryClientProvider client={queryClient}>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <AuthGuard>
                      <RootLayoutNav />
                    </AuthGuard>
                  </GestureHandlerRootView>
                </QueryClientProvider>
              </ThemeProvider>
            </AuthProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </LanguageProvider>
    </I18nextProvider>
  );
}
