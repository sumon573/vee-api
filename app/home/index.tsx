/**
 * HomeScreen — Phase 2 changes applied:
 *
 * 1. Search button removed from top header bar.
 * 2. Planet removed from horizontal pager; accessible ONLY via StoryBar
 *    PlanetTile → opens as a full-screen Modal.
 * 3. Swiping past Contacts never reaches Planet (TOTAL_SECTIONS = 4).
 * 4. Profile avatar always reflects the real RTDB profile photo (subscribeUser),
 *    not the potentially-stale Firebase Auth photoURL.
 * 5. Reduced unnecessary renders: React.memo on TopTab / BottomNav,
 *    goToSection / applyOffset wrapped in useCallback.
 * 6. Loading smoothness: InteractionManager used for router.push in handlers.
 */

import React, {
  useRef, useState, useCallback, useEffect, memo,
} from 'react';
import {
  View, Text, ScrollView, Pressable, Image, Modal,
  Dimensions, NativeScrollEvent, NativeSyntheticEvent,
  Alert, Platform, InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ScalePress from '@/components/ScalePress';
import VoiceRoomHome from '@/src/features/voice-room/screens/VoiceRoomHome';
import ProfileSection from '@/app/profile/index';
import ChatScreen from '@/app/chat/index';
import ContactsScreen from '@/src/features/contacts/ContactsScreen';
import PlanetScreen from '@/src/features/planet/PlanetScreen';
import UserSearchModal from '@/src/features/user-search/UserSearchModal';
import InAppNotification from '@/src/features/chat/components/InAppNotification';
import MinimizedRoomBar from '@/src/features/voice-room/components/MinimizedRoomBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { VeeUser, subscribeUser } from '@/src/services/userService';
import { useAuth } from '@/src/context/AuthContext';

const { width } = Dimensions.get('window');

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#4A3D6E',
  mutedActive: '#B8A6D9',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.045)',
} as const;

/**
 * Section layout (Phase 2 — Planet removed from pager):
 *  0: Profile   ← swipe RIGHT from Chat, or tap profile avatar
 *  1: Chat      ← default
 *  2: Voice Room
 *  3: Contacts
 *
 * Planet is opened as a Modal from StoryBar's PlanetTile.
 */
const TOTAL_SECTIONS = 4;
const DEFAULT_INDEX  = 1; // Chat

const TABS: {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  sectionIndex: number;
}[] = [
  { title: 'Chat',       icon: 'message-circle', sectionIndex: 1 },
  { title: 'Voice Room', icon: 'mic',            sectionIndex: 2 },
  { title: 'Contacts',   icon: 'users',           sectionIndex: 3 },
];

// ─────────────────────────────────────────
// Top tab pill — memoised to avoid re-renders from parent state changes
// ─────────────────────────────────────────
const TopTab = memo(function TopTab({
  title, icon, active, onPress,
}: {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4 }}>
      <Feather name={icon} size={22} color={active ? C.glow : C.muted} />
      <Text style={{
        color: active ? C.text : C.muted,
        fontSize: 11, fontWeight: active ? '800' : '400',
        marginTop: 3, letterSpacing: 0.2,
      }}>
        {title}
      </Text>
      <View style={{
        marginTop: 3,
        width: active ? 5 : 0, height: active ? 5 : 0,
        borderRadius: 3, backgroundColor: C.glow,
      }} />
    </Pressable>
  );
});

// ─────────────────────────────────────────
// Bottom nav — memoised; only re-renders when activeIndex changes
// ─────────────────────────────────────────
const BottomNav = memo(function BottomNav({
  activeIndex, onPress, onPlusPress,
}: {
  activeIndex: number;
  onPress: (sectionIndex: number) => void;
  onPlusPress: () => void;
}) {
  const insets    = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 8;

  const chatActive     = activeIndex === 1;
  const contactsActive = activeIndex === 3;

  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingBottom: bottomPad, paddingTop: 10,
      backgroundColor: 'rgba(7,2,15,0.97)',
      borderTopWidth: 1, borderTopColor: C.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    }}>
      <Pressable onPress={() => onPress(1)} style={{ alignItems: 'center', flex: 1 }}>
        <Feather name="message-circle" size={24} color={chatActive ? C.glow : C.muted} />
        <Text style={{ color: chatActive ? C.glow : C.muted, fontSize: 11, fontWeight: chatActive ? '800' : '400', marginTop: 3 }}>
          Chat
        </Text>
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <ScalePress onPress={onPlusPress} style={{ marginTop: -24 }}>
          <View style={{
            width: 58, height: 58, borderRadius: 29,
            backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: C.glow, shadowOpacity: 0.6,
            shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 14,
            borderWidth: 3, borderColor: '#07020F',
          }}>
            <Feather name="plus" size={28} color="#fff" />
          </View>
        </ScalePress>
      </View>

      <Pressable onPress={() => onPress(3)} style={{ alignItems: 'center', flex: 1 }}>
        <Feather name="users" size={24} color={contactsActive ? C.glow : C.muted} />
        <Text style={{ color: contactsActive ? C.glow : C.muted, fontSize: 11, fontWeight: contactsActive ? '800' : '400', marginTop: 3 }}>
          Contacts
        </Text>
      </Pressable>
    </View>
  );
});

// ─────────────────────────────────────────
// Planet Modal wrapper — adds a close button above the full-screen PlanetScreen
// ─────────────────────────────────────────
const PlanetModal = memo(function PlanetModal({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {/* Close row */}
        <View style={{
          paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) + 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.07)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Feather name="x" size={20} color={C.mutedActive} />
          </Pressable>
          <Text style={{
            color: C.text, fontSize: 17, fontWeight: '800',
            marginLeft: 12, letterSpacing: 0.2,
          }}>
            Planet
          </Text>
        </View>
        <PlanetScreen />
      </View>
    </Modal>
  );
});

// ─────────────────────────────────────────
// Main HomeScreen
// ─────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { t }  = useTranslation();
  const { user } = useAuth();

  const scrollRef      = useRef<ScrollView>(null);
  const activeIndexRef = useRef(DEFAULT_INDEX);
  const [activeIndex, setActiveIndex] = useState(DEFAULT_INDEX);

  // ── RTDB profile subscription for the header avatar ───────────────────────
  // Fix #4: Firebase Auth photoURL can lag after profile edits.
  // Subscribe to the RTDB node directly (same source as ProfileSection).
  const [profile, setProfile] = useState<VeeUser | null>(null);
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUser(user.uid, setProfile);
    return unsub;
  }, [user?.uid]);

  // Derived: prefer RTDB photo; fall back to Auth photo while RTDB loads
  const avatarUri = profile?.photoURL ?? user?.photoURL ?? null;

  // ── Modals ────────────────────────────────────────────────────────────────
  const [newMsgOpen,  setNewMsgOpen]  = useState(false);
  const [planetOpen,  setPlanetOpen]  = useState(false);

  // ── Parent-scroll lock / unlock ──────────────────────────────────────────
  const scrollEnabledRef = useRef(true);
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);

  const lockParentScroll = useCallback(() => {
    if (scrollEnabledRef.current) {
      scrollEnabledRef.current = false;
      setOuterScrollEnabled(false);
    }
  }, []);

  const unlockParentScroll = useCallback(() => {
    if (!scrollEnabledRef.current) {
      scrollEnabledRef.current = true;
      setOuterScrollEnabled(true);
    }
  }, []);

  // ── Navigation helper ─────────────────────────────────────────────────────
  const goToSection = useCallback((i: number) => {
    scrollEnabledRef.current = true;
    setOuterScrollEnabled(true);
    if (i === activeIndexRef.current) return;
    Haptics.selectionAsync();
    activeIndexRef.current = i;
    setActiveIndex(i);
    scrollRef.current?.scrollTo({ x: width * i, animated: true });
  }, []);

  // ── Planet open — from StoryBar PlanetTile tap ────────────────────────────
  const handleOpenPlanet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlanetOpen(true);
  }, []);

  // ── Scroll event handlers ─────────────────────────────────────────────────
  const applyOffset = useCallback((offsetX: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_SECTIONS - 1, Math.round(offsetX / width)));
    scrollEnabledRef.current = true;
    setOuterScrollEnabled(true);
    if (clamped !== activeIndexRef.current) {
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      Haptics.selectionAsync();
    }
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      applyOffset(e.nativeEvent.contentOffset.x),
    [applyOffset],
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      applyOffset(e.nativeEvent.contentOffset.x),
    [applyOffset],
  );

  // ── "+" button handler ────────────────────────────────────────────────────
  const handlePlusPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('home.plusTitle'),
      '',
      [
        {
          text: t('home.plusVoiceRoom'),
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            goToSection(2);
          },
        },
        {
          text: t('home.plusMessage'),
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setNewMsgOpen(true);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [t, goToSection]);

  // ── New message user selected ─────────────────────────────────────────────
  const handleUserSelected = useCallback((selectedUser: VeeUser, chatId: string) => {
    setNewMsgOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Use InteractionManager so the modal close animation completes before navigating
    InteractionManager.runAfterInteractions(() => {
      router.push(
        `/inbox/${chatId}?participantId=${encodeURIComponent(selectedUser.uid)}&participantName=${encodeURIComponent(selectedUser.name)}` as never,
      );
    });
  }, [router]);

  // ── Stable tab press handlers ─────────────────────────────────────────────
  const handleTabPress0 = useCallback(() => goToSection(1), [goToSection]);
  const handleTabPress1 = useCallback(() => goToSection(2), [goToSection]);
  const handleTabPress2 = useCallback(() => goToSection(3), [goToSection]);

  const topPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1, paddingTop: topPad }}>

          {/* ── Top header bar ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 8,
          }}>
            {/* Profile avatar — hidden when already on Profile (Fix: Home avatar removed from Profile) */}
            {activeIndex !== 0 ? (
              <ScalePress onPress={() => goToSection(0)}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: 'rgba(139,92,246,0.18)',
                  borderWidth: 2, borderColor: C.glow,
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                    />
                  ) : (
                    <Feather name="user" size={20} color={C.glow} />
                  )}
                </View>
              </ScalePress>
            ) : (
              /* Spacer to preserve header layout balance when on Profile */
              <View style={{ width: 44, height: 44 }} />
            )}

            {/* Section tabs — Search button removed (Fix #1) */}
            <View style={{
              flex: 1, flexDirection: 'row',
              justifyContent: 'space-evenly', marginHorizontal: 8,
            }}>
              <TopTab
                title={TABS[0].title}
                icon={TABS[0].icon}
                active={activeIndex === TABS[0].sectionIndex}
                onPress={handleTabPress0}
              />
              <TopTab
                title={TABS[1].title}
                icon={TABS[1].icon}
                active={activeIndex === TABS[1].sectionIndex}
                onPress={handleTabPress1}
              />
              <TopTab
                title={TABS[2].title}
                icon={TABS[2].icon}
                active={activeIndex === TABS[2].sectionIndex}
                onPress={handleTabPress2}
              />
            </View>
          </View>

          {/* ── Horizontal pager — 4 sections only (Fix #2 & #3) ── */}
          <ScrollView
            ref={scrollRef}
            horizontal
            snapToInterval={width}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            bounces={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            scrollEnabled={outerScrollEnabled}
            contentOffset={{ x: width * DEFAULT_INDEX, y: 0 }}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollEndDrag={onScrollEndDrag}
            style={{ flex: 1 }}
          >
            {/* 0: Profile */}
            <View style={{ width, flex: 1 }}>
              <ProfileSection onNavigateToContacts={() => goToSection(3)} />
            </View>

            {/* 1: Chat — Planet accessible via StoryBar PlanetTile (Fix #2) */}
            <View style={{ width, flex: 1 }}>
              <ChatScreen onOpenPlanet={handleOpenPlanet} />
            </View>

            {/* 2: Voice Room */}
            <View style={{ width, flex: 1, paddingHorizontal: 20 }}>
              <VoiceRoomHome
                onLockParentScroll={lockParentScroll}
                onUnlockParentScroll={unlockParentScroll}
              />
            </View>

            {/* 3: Contacts — last section; no Planet beyond this */}
            <View style={{ width, flex: 1 }}>
              <ContactsScreen />
            </View>
          </ScrollView>

          {/* Bottom nav — hidden on Profile screen */}
          {activeIndex !== 0 && (
            <BottomNav
              activeIndex={activeIndex}
              onPress={goToSection}
              onPlusPress={handlePlusPress}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Global in-app notification banner */}
      <InAppNotification />

      {/* Minimized voice room floating bar */}
      <MinimizedRoomBar />

      {/* Planet Modal — opened from StoryBar PlanetTile (Fix #2) */}
      <PlanetModal visible={planetOpen} onClose={() => setPlanetOpen(false)} />

      {/* New Message modal (UserSearch) */}
      <UserSearchModal
        visible={newMsgOpen}
        onClose={() => setNewMsgOpen(false)}
        onSelectUser={handleUserSelected}
      />
    </View>
  );
}
