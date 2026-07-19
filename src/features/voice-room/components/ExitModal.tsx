import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';

/* ─────────────────────────── Exit Modal ─────────────────────────── */
export function ExitModal({ visible, onClose, onLeave, onMinimize, roomName }: {
  visible: boolean; onClose: () => void; onLeave: () => void;
  onMinimize: () => void; roomName: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        borderWidth: 1, borderColor: C.border,
        paddingBottom: Platform.OS === 'web' ? 34 : 24, paddingTop: 8 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginBottom: 18 }} />
        <Text style={{ color: C.sub, fontSize: 12, fontWeight: '700', textAlign: 'center',
          letterSpacing: 1, marginBottom: 20, textTransform: 'uppercase' }}>{roomName}</Text>
        <Pressable onPress={onMinimize}
          style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10,
            backgroundColor: 'rgba(139,92,246,0.12)', borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: C.border }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary + '22',
            borderWidth: 1.5, borderColor: C.primary + '55', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
            <Feather name="minimize-2" size={20} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>
              {t('voiceRoom.exit.minimize')}
            </Text>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 3 }}>
              {t('voiceRoom.exit.minimizeSub')}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.muted} />
        </Pressable>
        <Pressable onPress={onLeave}
          style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16,
            backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.15)',
            borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.4)', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
            <Feather name="log-out" size={20} color={C.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.red, fontSize: 16, fontWeight: '800' }}>
              {t('voiceRoom.exit.leaveRoom')}
            </Text>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 3 }}>
              {t('voiceRoom.exit.leaveRoomSub')}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.muted} />
        </Pressable>
        <Pressable onPress={onClose}
          style={{ marginHorizontal: 16, paddingVertical: 14, alignItems: 'center',
            backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.borderFaint }}>
          <Text style={{ color: C.sub, fontWeight: '700', fontSize: 15 }}>
            {t('voiceRoom.exit.cancel')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
