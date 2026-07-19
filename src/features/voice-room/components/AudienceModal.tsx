import { View, Text, Image, ScrollView, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { Participant, Role } from '../types/room';

/* ─────────────────────────── Audience Modal ─────────────────────────── */
export function AudienceModal({ visible, onClose, audience, myRole, onManageMember }: {
  visible: boolean; onClose: () => void;
  audience: Participant[]; myRole: Role;
  onManageMember: (m: Participant) => void;
}) {
  const { t } = useTranslation();
  const isOwnerOrAdmin = myRole === 'host' || myRole === 'admin';
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: C.border, maxHeight: '80%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16,
          borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
          <Feather name="users" size={16} color={C.primary} />
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '900', marginLeft: 8, flex: 1 }}>
            {t('voiceRoom.audience.title')}
          </Text>
          <View style={{ backgroundColor: C.primary + '33', borderRadius: 20,
            paddingHorizontal: 10, paddingVertical: 4, marginRight: 10 }}>
            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '800' }}>{audience.length}</Text>
          </View>
          <Pressable onPress={onClose}><Feather name="x" size={20} color={C.sub} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {audience.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Feather name="users" size={36} color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 14, marginTop: 12 }}>
                {t('voiceRoom.audience.noAudience')}
              </Text>
            </View>
          ) : (
            audience.map(m => (
              <Pressable key={m.id}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onManageMember(m); onClose(); }}
                style={{ flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderFaint }}>
                {/* Issue 5: Show profile photo; fallback to initials avatar */}
                <View style={{ width: 44, height: 44, borderRadius: 22,
                  overflow: 'hidden',
                  backgroundColor: m.color + '33',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: m.color + '55', marginRight: 12 }}>
                  {m.photoURL ? (
                    <Image
                      source={{ uri: m.photoURL }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                    />
                  ) : (
                    <Text style={{ color: m.color, fontSize: 15, fontWeight: '800' }}>{m.initials}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{m.name}</Text>
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>
                    {t('voiceRoom.audience.audienceLabel')}
                  </Text>
                </View>
                {m.role === 'admin' && (
                  <View style={{ backgroundColor: C.gold + '33', borderRadius: 10,
                    paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
                    <Text style={{ color: C.gold, fontSize: 10, fontWeight: '800' }}>
                      {t('voiceRoom.audience.adminBadge')}
                    </Text>
                  </View>
                )}
                {isOwnerOrAdmin && <Feather name="more-horizontal" size={18} color={C.muted} />}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
