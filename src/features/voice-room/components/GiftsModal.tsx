import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Pressable, Modal, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { Participant } from '../types/room';
import { sendGift } from '@/src/features/wallet/walletService';

/* ─────────────────────────── Gifts Modal ─────────────────────────── */

type GiftNameKey =
  | 'voiceRoom.gifts.giftHeart'
  | 'voiceRoom.gifts.giftRose'
  | 'voiceRoom.gifts.giftGift'
  | 'voiceRoom.gifts.giftDiamond'
  | 'voiceRoom.gifts.giftTrophy'
  | 'voiceRoom.gifts.giftRocket'
  | 'voiceRoom.gifts.giftCrown'
  | 'voiceRoom.gifts.giftFirework';

interface GiftItem {
  id: string;
  emoji: string;
  nameKey: GiftNameKey;
  coins: number;
}

const GIFTS: readonly GiftItem[] = [
  { id: '1', emoji: '💝', nameKey: 'voiceRoom.gifts.giftHeart',    coins: 10   },
  { id: '2', emoji: '🌹', nameKey: 'voiceRoom.gifts.giftRose',     coins: 25   },
  { id: '3', emoji: '🎁', nameKey: 'voiceRoom.gifts.giftGift',     coins: 50   },
  { id: '4', emoji: '💎', nameKey: 'voiceRoom.gifts.giftDiamond',  coins: 100  },
  { id: '5', emoji: '🏆', nameKey: 'voiceRoom.gifts.giftTrophy',   coins: 200  },
  { id: '6', emoji: '🚀', nameKey: 'voiceRoom.gifts.giftRocket',   coins: 500  },
  { id: '7', emoji: '👑', nameKey: 'voiceRoom.gifts.giftCrown',    coins: 1000 },
  { id: '8', emoji: '🎆', nameKey: 'voiceRoom.gifts.giftFirework', coins: 2000 },
];

export function GiftsModal({
  visible, onClose, onGiftSent, members, initialRecipient,
  walletBalance, myUid, myName, roomId,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful gift send — for the room chat message */
  onGiftSent: (coins: number, emoji: string, toNames: string[]) => void;
  members: Participant[];
  initialRecipient?: Participant | null;
  /** Real-time wallet balance from Firebase subscription */
  walletBalance: number;
  myUid: string;
  myName: string;
  roomId?: string;
}) {
  const { t } = useTranslation();

  const [sent,     setSent]     = useState<string | null>(null);
  const [sending,  setSending]  = useState(false);
  const [step,     setStep]     = useState<'pick-person' | 'pick-gift'>('pick-person');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setSent(null);
      setSending(false);
      if (initialRecipient) { setSelected([initialRecipient.id]); setStep('pick-gift'); }
      else { setSelected([]); setStep('pick-person'); }
    }
  }, [visible, initialRecipient?.id]);

  const toggleSelect = (id: string) => {
    setSelected((prev: string[]) => {
      if (prev.includes(id)) return prev.filter((x: string) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const selectedMembers = members.filter(m => selected.includes(m.id));

  const handleSend = async (g: GiftItem) => {
    if (selectedMembers.length === 0 || sending) return;

    const totalCost = g.coins * selectedMembers.length;

    if (walletBalance < totalCost) {
      Alert.alert(
        t('voiceRoom.gifts.notEnoughCoins'),
        t('voiceRoom.gifts.notEnoughCoinsMsg', { total: totalCost }),
      );
      return;
    }

    // Filter out sending to yourself
    const recipients = selectedMembers
      .filter(m => m.id !== myUid)
      .map(m => ({ uid: m.id, name: m.name }));

    if (recipients.length === 0) {
      Alert.alert('', 'You cannot send a gift to yourself.');
      return;
    }

    setSending(true);

    const result = await sendGift({
      senderId: myUid,
      senderName: myName,
      recipients,
      giftEmoji: g.emoji,
      giftName: t(g.nameKey),
      diamondsEach: g.coins,
      roomId,
    });

    setSending(false);

    if (!result.success) {
      Alert.alert(
        t('voiceRoom.gifts.notEnoughCoins'),
        result.error ?? t('voiceRoom.gifts.notEnoughCoinsMsg', { total: totalCost }),
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(g.emoji);
    onGiftSent(totalCost, g.emoji, selectedMembers.map(m => m.name));
    setTimeout(() => { setSent(null); onClose(); }, 1600);
  };

  const roleLabelFor = (m: Participant) => {
    if (m.role === 'host') return t('voiceRoom.gifts.roleOwner');
    if (m.role === 'admin') return t('voiceRoom.gifts.roleAdmin');
    return t('voiceRoom.gifts.roleMember');
  };

  const headerTitle = step === 'pick-person'
    ? t('voiceRoom.gifts.storeTitle')
    : selectedMembers.length > 0
      ? t('voiceRoom.gifts.sendTo', { names: selectedMembers.map(m => m.name).join(', ') })
      : t('voiceRoom.gifts.storeTitle');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        padding: 20, borderWidth: 1, borderColor: C.border }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginBottom: 16 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          {step === 'pick-gift' && !initialRecipient && (
            <Pressable onPress={() => setStep('pick-person')} style={{ marginRight: 10 }}>
              <Feather name="arrow-left" size={20} color={C.sub} />
            </Pressable>
          )}
          <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
            {headerTitle}
          </Text>
          {/* Real wallet balance display */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: C.gold + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 10 }}>
            <Text style={{ fontSize: 13 }}>💎</Text>
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '800' }}>
              {walletBalance.toLocaleString()}
            </Text>
          </View>
          <Pressable onPress={onClose}><Feather name="x" size={22} color={C.sub} /></Pressable>
        </View>

        {step === 'pick-person' && (
          <>
            <Text style={{ color: C.sub, fontSize: 12, marginBottom: 12 }}>
              {t('voiceRoom.gifts.selectUp', { selected: selected.length })}
            </Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {members.filter(m => m.id !== myUid).map(m => {
                const isSel = selected.includes(m.id);
                return (
                  <Pressable key={m.id} onPress={() => toggleSelect(m.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                      borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: m.color + '33',
                      alignItems: 'center', justifyContent: 'center', borderWidth: 2,
                      borderColor: isSel ? m.color : m.color + '55', marginRight: 12 }}>
                      <Text style={{ color: m.color, fontSize: 15, fontWeight: '800' }}>{m.initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                      <Text style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>
                        {roleLabelFor(m)}
                      </Text>
                    </View>
                    <View style={{ width: 24, height: 24, borderRadius: 12,
                      backgroundColor: isSel ? C.primary : 'transparent',
                      borderWidth: 2, borderColor: isSel ? C.primary : C.muted,
                      alignItems: 'center', justifyContent: 'center' }}>
                      {isSel && <Feather name="check" size={13} color={C.text} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => { if (selected.length > 0) setStep('pick-gift'); }}
              style={{ marginTop: 16, backgroundColor: selected.length > 0 ? C.pink : C.muted,
                borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>
                {selected.length > 0
                  ? t('voiceRoom.gifts.next', { count: selected.length })
                  : t('voiceRoom.gifts.selectFirst')}
              </Text>
            </Pressable>
          </>
        )}

        {step === 'pick-gift' && (
          <>
            {sent && (
              <View style={{ position: 'absolute', top: 60, left: 0, right: 0,
                alignItems: 'center', zIndex: 10 }}>
                <Text style={{ fontSize: 72 }}>{sent}</Text>
              </View>
            )}
            {sending && (
              <View style={{ position: 'absolute', top: 60, left: 0, right: 0,
                alignItems: 'center', zIndex: 10 }}>
                <ActivityIndicator size="large" color={C.gold} />
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between',
              opacity: sending ? 0.4 : 1 }}>
              {GIFTS.map(g => (
                <Pressable key={g.id} onPress={() => handleSend(g)} disabled={sending}
                  style={{ width: '22%', backgroundColor: C.card, borderRadius: 14, padding: 10,
                    alignItems: 'center', borderWidth: 1, borderColor: C.borderFaint }}>
                  <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                  <Text style={{ color: C.text, fontSize: 10, fontWeight: '700', marginTop: 4 }}>
                    {t(g.nameKey)}
                  </Text>
                  <Text style={{ color: C.gold, fontSize: 10, marginTop: 2 }}>
                    💎 {selectedMembers.length > 1 ? `${g.coins}×${selectedMembers.length}` : g.coins}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Pressable onPress={onClose} style={{ marginTop: 14, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: C.muted }}>{t('voiceRoom.gifts.close')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
