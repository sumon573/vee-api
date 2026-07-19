import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { BlockRecord } from '../types/room';
import { fmtTime } from '../utils/format';

/* ─────────────────────────── Operation History Modal ─────────────────────────── */
export function OperationHistoryModal({ visible, onClose, records, onUnblock, accent }: {
  visible: boolean; onClose: () => void;
  records: BlockRecord[]; onUnblock: (id: string) => void;
  accent: string;
}) {
  const { t } = useTranslation();
  const active   = records.filter(r => r.isActive);
  const inactive = records.filter(r => !r.isActive);

  function RecordRow({ r }: { r: BlockRecord }) {
    const actionLabel = r.action === 'room-block'
      ? t('voiceRoom.opHistory.roomBlockLabel')
      : t('voiceRoom.opHistory.commentBlockLabel');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: r.color + '33',
          alignItems: 'center', justifyContent: 'center', marginRight: 12,
          borderWidth: 2, borderColor: r.isActive ? C.red + '66' : C.borderFaint }}>
          <Text style={{ color: r.color, fontSize: 14, fontWeight: '800' }}>{r.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{r.name}</Text>
          <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            {actionLabel} · {t('voiceRoom.opHistory.byLabel', { name: r.actionBy })}
          </Text>
          <Text style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>{fmtTime(r.timestamp)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={{ backgroundColor: r.isActive ? C.red + '22' : C.mic + '22',
            borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
            borderWidth: 1, borderColor: r.isActive ? C.red + '44' : C.mic + '44' }}>
            <Text style={{ color: r.isActive ? C.red : C.mic, fontSize: 10, fontWeight: '800' }}>
              {r.isActive ? t('voiceRoom.opHistory.blocked') : t('voiceRoom.opHistory.unblocked')}
            </Text>
          </View>
          {r.isActive && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUnblock(r.id); }}
              style={{ backgroundColor: accent + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
                borderWidth: 1, borderColor: accent + '55' }}>
              <Text style={{ color: accent, fontSize: 11, fontWeight: '800' }}>
                {t('voiceRoom.opHistory.unblock')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: C.border, maxHeight: '88%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16,
          borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
          <Feather name="clock" size={18} color={accent} />
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '900', marginLeft: 10, flex: 1 }}>
            {t('voiceRoom.opHistory.title')}
          </Text>
          <Pressable onPress={onClose}><Feather name="x" size={20} color={C.sub} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {records.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Feather name="check-circle" size={40} color={C.mic} />
              <Text style={{ color: C.sub, fontSize: 14, marginTop: 12, textAlign: 'center' }}>
                {t('voiceRoom.opHistory.noHistory')}
              </Text>
            </View>
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <Text style={{ color: C.red, fontSize: 12, fontWeight: '800', letterSpacing: 1,
                    textTransform: 'uppercase', marginBottom: 8 }}>
                    {t('voiceRoom.opHistory.currentlyBlocked', { count: active.length })}
                  </Text>
                  {active.map(r => <RecordRow key={r.id + r.timestamp} r={r} />)}
                </>
              )}
              {inactive.length > 0 && (
                <>
                  <Text style={{ color: C.mic, fontSize: 12, fontWeight: '800', letterSpacing: 1,
                    textTransform: 'uppercase', marginTop: 20, marginBottom: 8 }}>
                    {t('voiceRoom.opHistory.unblockedSection', { count: inactive.length })}
                  </Text>
                  {inactive.map(r => <RecordRow key={r.id + r.timestamp} r={r} />)}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
