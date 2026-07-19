/**
 * LeaderboardModal
 *
 * Two tabs:
 *   • Top Rooms   — active rooms sorted by live member count
 *   • Top Earners — weekly diamond earners from leaderboard/ Firebase node
 *                   (written by the api-server after each gift)
 */
import { useState, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, FlatList,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { get, ref, query, orderByChild, limitToLast } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { subscribeActiveRooms, type RoomInfo } from '../services/firebaseRoomService';

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  bg:      '#0F0A1E',
  text:    '#FFFFFF',
  muted:   '#B8A6D9',
  primary: '#7C3AED',
  glow:    '#8B5CF6',
  border:  '#2A2542',
  surface: 'rgba(255,255,255,0.045)',
  gold:    '#F59E0B',
  silver:  '#94A3B8',
  bronze:  '#B45309',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaderboardEntry = {
  uid: string;
  name: string;
  weeklyEarned: number;
};

type Tab = 'rooms' | 'earners';

// ─── Sub-components ───────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const color = rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : C.muted;
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: medal ? color + '1A' : 'transparent',
      borderWidth: medal ? 1 : 0, borderColor: color,
    }}>
      {medal
        ? <Text style={{ fontSize: 16 }}>{medal}</Text>
        : <Text style={{ color: C.muted, fontSize: 13, fontWeight: '800' }}>{rank}</Text>
      }
    </View>
  );
}

function EmptyState({ icon, message }: { icon: React.ComponentProps<typeof Feather>['name']; message: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <Feather name={icon} size={36} color={C.muted} />
      <Text style={{ color: C.muted, fontSize: 14, marginTop: 12, textAlign: 'center' }}>
        {message}
      </Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LeaderboardModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('rooms');

  // ── Top Rooms ──────────────────────────────────────────────────────────────
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setRoomsLoading(true);
    const unsub = subscribeActiveRooms((allRooms) => {
      const sorted = [...allRooms]
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 20);
      setRooms(sorted);
      setRoomsLoading(false);
    });
    return unsub;
  }, [visible]);

  // ── Top Earners ────────────────────────────────────────────────────────────
  const [earners, setEarners] = useState<LeaderboardEntry[]>([]);
  const [earnersLoading, setEarnersLoading] = useState(false);
  const [earnersError, setEarnersError] = useState(false);

  useEffect(() => {
    if (!visible || tab !== 'earners') return;
    setEarnersLoading(true);
    setEarnersError(false);

    (async () => {
      try {
        const snap = await get(
          query(
            ref(database, 'leaderboard'),
            orderByChild('weeklyEarned'),
            limitToLast(20),
          ),
        );
        if (!snap.exists()) {
          setEarners([]);
          setEarnersLoading(false);
          return;
        }
        const list: LeaderboardEntry[] = [];
        snap.forEach((child) => {
          const v = child.val() as { name?: string; weeklyEarned?: number };
          list.push({
            uid: child.key!,
            name: v.name ?? 'Vee User',
            weeklyEarned: typeof v.weeklyEarned === 'number' ? v.weeklyEarned : 0,
          });
        });
        // limitToLast returns ascending — reverse for descending
        list.sort((a, b) => b.weeklyEarned - a.weeklyEarned);
        setEarners(list);
      } catch {
        setEarnersError(true);
      }
      setEarnersLoading(false);
    })();
  }, [visible, tab]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
      />

      {/* Sheet */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: C.bg,
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: C.border,
        maxHeight: '90%',
      }}>
        {/* Handle */}
        <View style={{
          width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12,
        }} />

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
        }}>
          <Text style={{ flex: 1, color: C.text, fontSize: 20, fontWeight: '900' }}>
            {t('leaderboard.title')}
          </Text>
          <Pressable onPress={onClose} hitSlop={14}>
            <Feather name="x" size={22} color={C.muted} />
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={{
          flexDirection: 'row', paddingHorizontal: 20,
          marginBottom: 16, gap: 10,
        }}>
          {(['rooms', 'earners'] as Tab[]).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 12,
                backgroundColor: tab === key ? C.primary : C.surface,
                borderWidth: 1, borderColor: tab === key ? C.glow : C.border,
                alignItems: 'center',
              }}
            >
              <Text style={{
                color: tab === key ? '#fff' : C.muted,
                fontSize: 13, fontWeight: '800',
              }}>
                {key === 'rooms' ? t('leaderboard.topRooms') : t('leaderboard.topEarners')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Top Rooms ── */}
        {tab === 'rooms' && (
          roomsLoading
            ? <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                <ActivityIndicator color={C.glow} />
              </View>
            : rooms.length === 0
              ? <EmptyState icon="mic-off" message={t('leaderboard.noData')} />
              : <FlatList
                  data={rooms}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
                  renderItem={({ item, index }) => (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 13,
                      borderBottomWidth: 1, borderBottomColor: C.border,
                      gap: 12,
                    }}>
                      <RankBadge rank={index + 1} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ color: C.text, fontSize: 14, fontWeight: '800' }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                          {item.ownerName}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: C.glow, fontSize: 18, fontWeight: '900' }}>
                          {item.memberCount}
                        </Text>
                        <Text style={{ color: C.muted, fontSize: 10 }}>
                          {t('leaderboard.members')}
                        </Text>
                      </View>
                    </View>
                  )}
                />
        )}

        {/* ── Top Earners ── */}
        {tab === 'earners' && (
          earnersLoading
            ? <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                <ActivityIndicator color={C.glow} />
              </View>
            : earnersError
              ? <EmptyState icon="alert-circle" message={t('leaderboard.errorLoad')} />
              : earners.length === 0
                ? <EmptyState icon="award" message={t('leaderboard.noData')} />
                : <FlatList
                    data={earners}
                    keyExtractor={(item) => item.uid}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
                    renderItem={({ item, index }) => (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingVertical: 13,
                        borderBottomWidth: 1, borderBottomColor: C.border,
                        gap: 12,
                      }}>
                        <RankBadge rank={index + 1} />
                        <Text
                          style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: '800' }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: C.gold, fontSize: 16, fontWeight: '900' }}>
                            💎 {item.weeklyEarned.toLocaleString()}
                          </Text>
                          <Text style={{ color: C.muted, fontSize: 10 }}>
                            {t('leaderboard.weekly')}
                          </Text>
                        </View>
                      </View>
                    )}
                  />
        )}
      </View>
    </Modal>
  );
}
