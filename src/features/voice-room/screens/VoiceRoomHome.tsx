/**
 * VoiceRoomHome — My Rooms + Recommended Rooms
 *
 * Issue 9:  "Voice Rooms" renamed to "My Rooms"; shows only rooms the
 *           current user owns. Firebase-queried via subscribeMyRooms.
 * Issue 10: "Recommended Rooms" section added below, with category tabs:
 *           Trending | Nearby | Game | Music | Talk | Study | New
 *           All rooms come from Firebase (subscribeActiveRooms) — no mock data.
 */
import type { ComponentProps } from 'react';
import { useState, useEffect, useRef } from 'react';
import { View, Text, Alert, ActivityIndicator, Modal, TextInput, Pressable } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import ScalePress from '@/components/ScalePress';
import RoomCard from '../components/RoomCard';
import RoomListItem from '../components/RoomListItem';
import RoomCreationModal from './RoomCreationModal';
import { LeaderboardModal } from './LeaderboardModal';
import {
  subscribeActiveRooms,
  subscribeMyRoomsCombined,
  verifyRoomPin,
  type RoomInfo,
} from '../services/firebaseRoomService';
import { VoiceRoom } from '../types/room';
import { useAuth } from '@/src/context/AuthContext';
import * as Crypto from 'expo-crypto';

/** Fix 6: Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (v: number) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NEARBY_MAX_KM = 50;

const C = {
  text: '#FFFFFF',
  muted: '#B8A6D9',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  border: '#2A2542',
  chipBg: 'rgba(139,92,246,0.14)',
  chipBgActive: '#7C3AED',
  surface: 'rgba(255,255,255,0.045)',
} as const;

// "Recommended" tabs — match the new RoomCategory type
type RecommendedTab = 'trending' | 'nearby' | 'game' | 'music' | 'talk' | 'study' | 'new';

const RECOMMENDED_TABS: {
  key: RecommendedTab;
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
}[] = [
  { key: 'trending', label: 'Trending', icon: 'trending-up' },
  { key: 'nearby',   label: 'Nearby',   icon: 'map-pin' },
  { key: 'game',     label: 'Game',     icon: 'zap' },
  { key: 'music',    label: 'Music',    icon: 'music' },
  { key: 'talk',     label: 'Talk',     icon: 'message-circle' },
  { key: 'study',    label: 'Study',    icon: 'book-open' },
  { key: 'new',      label: 'New',      icon: 'star' },
];

/** Convert Firebase RoomInfo → VoiceRoom type expected by RoomCard/RoomListItem */
function toVoiceRoom(r: RoomInfo): VoiceRoom {
  return {
    id: r.id,
    name: r.name,
    topic: r.topic,
    themeColor: r.themeColor,
    memberCount: r.memberCount,
    maxMembers: r.maxMembers,
    isLive: r.isLive,
    isTrending: r.isTrending,
    category: r.category as VoiceRoom['category'],
    tags: r.tags,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    allowGifts: r.allowGifts,
    createdAt: r.createdAt,
    memberPreviews: r.memberPreviews,
    coverImageUrl: r.coverImageUrl,
    isPublic: r.isPublic,
  };
}

function goToRoom(id: string) {
  router.push({ pathname: '/voice-room', params: { roomId: id } });
}

// handled by handleRoomPress in component body
// ─── Shared sub-components ──────────────────────────────────────────────────

function SectionTitle({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 14 }}>
      <Text style={{ flex: 1, color: C.text, fontSize: 20, fontWeight: '900' }}>{title}</Text>
      {onSeeAll && (
        <ScalePress onPress={onSeeAll}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(139,92,246,0.12)',
            borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
            borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
            gap: 4,
          }}>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>
              {t('voiceRoom.home.seeAll')}
            </Text>
            <Feather name="chevron-right" size={14} color={C.muted} />
          </View>
        </ScalePress>
      )}
    </View>
  );
}

function CreateRoomTile({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <ScalePress onPress={onPress}>
      <View style={{ width: 124, marginRight: 14 }}>
        <View style={{
          width: 108, height: 108, borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.55)',
          borderStyle: 'dashed',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#A855F7', shadowOpacity: 0.3,
          shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
        }}>
          <Feather name="plus" size={30} color={C.glow} />
        </View>
        <Text style={{
          color: C.text, fontSize: 13, fontWeight: '800',
          marginTop: 8, textAlign: 'center',
        }}>
          {t('voiceRoom.home.createRoom')}
        </Text>
      </View>
    </ScalePress>
  );
}

function CategoryChip({
  label, icon, active, onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <ScalePress onPress={onPress}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 4,
        borderRadius: 999,
        backgroundColor: active ? C.chipBgActive : C.chipBg,
        borderWidth: 1,
        borderColor: active ? C.glow : 'rgba(139,92,246,0.25)',
      }}>
        <Feather name={icon} size={13} color={active ? '#fff' : C.muted} />
        <Text style={{ color: active ? '#fff' : C.muted, fontSize: 13, fontWeight: '700' }}>
          {label}
        </Text>
      </View>
    </ScalePress>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Feather name="mic-off" size={30} color={C.muted} />
      <Text style={{ color: C.muted, fontSize: 14, marginTop: 10 }}>{message}</Text>
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

type VoiceRoomHomeProps = {
  /** Disables the parent horizontal pager while the user drags a nested horizontal list. */
  onLockParentScroll?: () => void;
  onUnlockParentScroll?: () => void;
};

export default function VoiceRoomHome({
  onLockParentScroll,
  onUnlockParentScroll,
}: VoiceRoomHomeProps = {}) {
  const { user } = useAuth();
  const { t } = useTranslation();

  // My Rooms — owned by me
  const [myRooms,   setMyRooms]   = useState<RoomInfo[]>([]);
  const [myLoading, setMyLoading] = useState(true);

  // All public rooms — for Recommended section
  const [allRooms,  setAllRooms]  = useState<RoomInfo[]>([]);
  const [recLoading, setRecLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<RecommendedTab>('trending');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  // Private room PIN dialog
  const [pinDialogRoom, setPinDialogRoom] = useState<RoomInfo | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  // Handle room card press — show PIN dialog for private rooms
  const handleRoomPress = async (room: RoomInfo) => {
    if (room.isPublic === false) {
      // Owner bypasses PIN — they created the room and already know it
      if (user?.uid === room.ownerId) {
        goToRoom(room.id);
        return;
      }
      setPinDialogRoom(room);
      setPinInput('');
      setPinError('');
    } else {
      goToRoom(room.id);
    }
  };

  const handlePinSubmit = async () => {
    if (!pinDialogRoom) return;
    if (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput)) {
      setPinError('Please enter a 4-digit numeric PIN.');
      return;
    }
    setPinVerifying(true);
    try {
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pinInput);
      const ok = await verifyRoomPin(pinDialogRoom.id, hashed);
      if (ok) {
        const roomId = pinDialogRoom.id;
        setPinDialogRoom(null);
        setPinInput('');
        setPinError('');
        goToRoom(roomId);
      } else {
        setPinError('Incorrect PIN. Please try again.');
      }
    } catch {
      setPinError('Verification failed. Please try again.');
    } finally {
      setPinVerifying(false);
    }
  };


  // Fix 6: Geolocation for "Nearby" tab
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const locationRequestedRef = useRef(false);

  // Subscribe to my rooms: created rooms first, then rooms I've joined
  // (most-recently-joined first) — persists even after minimizing or
  // fully exiting a room, so it's always findable again here.
  useEffect(() => {
    if (!user?.uid) { setMyLoading(false); return; }
    const unsub = subscribeMyRoomsCombined(user.uid, (rooms) => {
      setMyRooms(rooms);
      setMyLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // Subscribe to all active public rooms
  useEffect(() => {
    const unsub = subscribeActiveRooms((rooms) => {
      setAllRooms(rooms);
      setRecLoading(false);
    });
    return unsub;
  }, []);

  // Fix 6: Request location permission when "Nearby" tab is selected
  useEffect(() => {
    if (activeTab !== 'nearby') return;
    if (userLocation || locationDenied || locationRequestedRef.current) return;
    locationRequestedRef.current = true;
    setLocationLoading(true);
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationDenied(true);
          setLocationLoading(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        setLocationDenied(true);
      }
      setLocationLoading(false);
    })();
  }, [activeTab, userLocation, locationDenied]);

  // Filter recommended rooms by active tab
  const recommended = (() => {
    if (activeTab === 'new') {
      // "New" = rooms created in the last 2 hours, sorted newest first
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      return allRooms.filter(r => r.createdAt >= twoHoursAgo);
    }
    if (activeTab === 'trending') {
      return allRooms.filter(r => r.isTrending || r.memberCount >= 3);
    }
    // Fix 6: Nearby — filter by geolocation proximity
    if (activeTab === 'nearby') {
      if (!userLocation) return []; // awaiting location permission
      return allRooms.filter(r => {
        if (!r.location) return false;
        return haversineKm(
          userLocation.lat, userLocation.lng,
          r.location.lat,  r.location.lng,
        ) <= NEARBY_MAX_KM;
      });
    }
    // For all other tabs, match by category
    return allRooms.filter(r => r.category === activeTab);
  })();

  const isLoading = myLoading || recLoading;

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      >
        {isLoading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={C.glow} size="large" />
          </View>
        ) : (
          <>
            {/* ═══ MY ROOMS ═══ */}
            <SectionTitle title={t('voiceRoom.home.myRooms')} />

            <GHScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              scrollEventThrottle={16}
              bounces={false}
              onScrollBeginDrag={onLockParentScroll}
              onScrollEndDrag={onUnlockParentScroll}
              onMomentumScrollEnd={onUnlockParentScroll}
            >
              {/* Create room tile always first */}
              <CreateRoomTile onPress={() => setCreateModalOpen(true)} />

              {myRooms.map((r) => (
                <View key={r.id} style={{ marginRight: 14 }}>
                  <RoomCard room={toVoiceRoom(r)} onPress={() => handleRoomPress(r)} />
                </View>
              ))}
            </GHScrollView>

            {myRooms.length === 0 && (
              <View style={{
                backgroundColor: C.surface, borderRadius: 14,
                padding: 18, marginBottom: 8, alignItems: 'center',
              }}>
                <Feather name="mic" size={24} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                  {t('voiceRoom.home.noMyRooms')}
                </Text>
              </View>
            )}

            {/* ═══ LEADERBOARD ENTRY POINT ═══ */}
            <ScalePress onPress={() => setLeaderboardOpen(true)}>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: 'rgba(245,158,11,0.07)',
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
                marginBottom: 4,
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.22)',
                gap: 12,
              }}>
                <Text style={{ fontSize: 22 }}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#F59E0B', fontSize: 14, fontWeight: '900' }}>
                    {t('leaderboard.title')}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                    {t('leaderboard.topRooms')} · {t('leaderboard.topEarners')}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#F59E0B" />
              </View>
            </ScalePress>

            {/* ═══ RECOMMENDED ROOMS ═══ */}
            <SectionTitle title={t('voiceRoom.home.recommended')} />

            {/* Category tabs */}
            <GHScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 14 }}
              scrollEventThrottle={16}
              bounces={false}
              style={{ marginHorizontal: -4 }}
              onScrollBeginDrag={onLockParentScroll}
              onScrollEndDrag={onUnlockParentScroll}
              onMomentumScrollEnd={onUnlockParentScroll}
            >
              {RECOMMENDED_TABS.map((tab) => (
                <CategoryChip
                  key={tab.key}
                  label={tab.label}
                  icon={tab.icon}
                  active={activeTab === tab.key}
                  onPress={() => setActiveTab(tab.key)}
                />
              ))}
            </GHScrollView>

            {/* Room list for active tab */}
            {/* Fix 6: Show location states for nearby tab */}
            {activeTab === 'nearby' && locationLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <ActivityIndicator color={C.glow} />
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>
                  {t('voiceRoom.home.gettingLocation')}
                </Text>
              </View>
            )}
            {activeTab === 'nearby' && !locationLoading && locationDenied && (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <Feather name="map-pin" size={30} color={C.muted} />
                <Text style={{ color: C.muted, fontSize: 14, marginTop: 10, textAlign: 'center' }}>
                  {t('voiceRoom.home.locationDenied')}
                </Text>
              </View>
            )}
            {!(activeTab === 'nearby' && (locationLoading || locationDenied)) && (
              recommended.length > 0
                ? recommended.map((r) => (
                    <RoomListItem
                      key={r.id}
                      room={toVoiceRoom(r)}
                      onPress={() => handleRoomPress(r)}
                    />
                  ))
                : <EmptySection message={t('voiceRoom.home.noCategoryRooms')} />
            )}
          </>
        )}
      </ScrollView>

      {/* Leaderboard Modal */}
      <LeaderboardModal
        visible={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
      />

      {/* PIN Dialog for Private Rooms */}
      <Modal
        visible={!!pinDialogRoom}
        animationType="fade"
        transparent
        onRequestClose={() => { setPinDialogRoom(null); setPinInput(''); setPinError(''); }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => { setPinDialogRoom(null); setPinInput(''); setPinError(''); }}
        >
          <Pressable style={{ width: '100%', maxWidth: 360 }} onPress={() => {}}>
            <View style={{
              backgroundColor: '#0F0A1E', borderRadius: 24, padding: 28,
              borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.35)',
              shadowColor: '#8B5CF6', shadowOpacity: 0.3, shadowRadius: 20,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
                <Feather name="lock" size={20} color="#F59E0B" />
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                  {pinDialogRoom?.name}
                </Text>
              </View>
              <Text style={{ color: '#B8A6D9', fontSize: 14, marginBottom: 20 }}>
                Enter the 4-digit PIN to join this private room.
              </Text>
              <TextInput
                style={{
                  backgroundColor: 'rgba(139,92,246,0.1)',
                  borderRadius: 14, borderWidth: 1.5,
                  borderColor: pinError ? '#FF4B4B' : 'rgba(139,92,246,0.35)',
                  color: '#fff', fontSize: 26, fontWeight: '800',
                  textAlign: 'center', letterSpacing: 14,
                  paddingVertical: 14, marginBottom: 8,
                }}
                placeholder="••••"
                placeholderTextColor="#4A3D6E"
                value={pinInput}
                onChangeText={(txt) => {
                  const digits = txt.replace(/[^0-9]/g, '').slice(0, 4);
                  setPinInput(digits);
                  if (pinError) setPinError('');
                }}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoFocus
              />
              {pinError ? (
                <Text style={{ color: '#FF4B4B', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>{pinError}</Text>
              ) : (
                <Text style={{ color: '#4A3D6E', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>Numbers only</Text>
              )}
              <Pressable
                onPress={handlePinSubmit}
                disabled={pinVerifying}
                style={{
                  backgroundColor: pinVerifying ? '#4A3D6E' : '#7C3AED',
                  borderRadius: 14, paddingVertical: 14,
                  alignItems: 'center',
                  opacity: pinVerifying ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>
                  {pinVerifying ? 'Verifying…' : 'Join Room'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Room Creation Modal */}
      <RoomCreationModal
        visible={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onRoomCreated={(roomId) => {
          setCreateModalOpen(false);
          goToRoom(roomId);
        }}
      />
    </>
  );
}
