import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { Participant } from '../types/room';

/* ─────────────────────────── Invite to Seat Modal ─────────────────────────── */
export function InviteToSeatModal({ visible, audience, seatIdx, onClose, onInvite, accent }: {
  visible: boolean; audience: Participant[]; seatIdx: number;
  onClose: () => void; onInvite: (memberId: string) => void;
  accent: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: accent + '44', maxHeight: '75%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16,
          borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
          <Feather name="user-plus" size={17} color={accent} />
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '900', marginLeft: 10, flex: 1 }}>
            {t('voiceRoom.inviteToSeat.title', { number: seatIdx + 1 })}
          </Text>
          <Pressable onPress={onClose}><Feather name="x" size={20} color={C.sub} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {audience.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Feather name="users" size={36} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 14, marginTop: 12 }}>
                {t('voiceRoom.inviteToSeat.noAudience')}
              </Text>
            </View>
          ) : (
            audience.map(m => (
              <Pressable key={m.id}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onInvite(m.id); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                  borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: m.color + '33',
                  alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  borderWidth: 2, borderColor: m.color + '55' }}>
                  <Text style={{ color: m.color, fontSize: 15, fontWeight: '800' }}>{m.initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                    {t('voiceRoom.inviteToSeat.inAudience')}
                  </Text>
                </View>
                <View style={{ backgroundColor: accent + '22', borderRadius: 16,
                  paddingHorizontal: 14, paddingVertical: 7,
                  borderWidth: 1, borderColor: accent + '55' }}>
                  <Text style={{ color: accent, fontSize: 13, fontWeight: '800' }}>
                    {t('voiceRoom.inviteToSeat.invite')}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
