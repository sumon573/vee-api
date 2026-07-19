import { View, Text, Image, Alert, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { Participant, Role } from '../types/room';

/* ─────────────────────────── Member Manage Modal ─────────────────────────── */
export function MemberManageModal({
  member, myRole, myId, onClose, onGift, onMention, onBlock, onReport, onSetAdmin, onDismissAdmin,
  onViewProfile, onViewOtherProfile, onEditProfile,
  onDown, onDownFromSeat, isSeated,
}: {
  member: Participant | null; myRole: Role; myId: string; onClose: () => void;
  onGift: () => void; onMention: (name: string) => void;
  onBlock: (action: 'room-block' | 'comment-block') => void;
  onReport?: (memberId: string, memberName: string) => void;
  onSetAdmin: () => void; onDismissAdmin: () => void;
  onViewProfile: () => void;
  /** View another user's profile by navigating to /user-profile */
  onViewOtherProfile?: (uid: string, name: string) => void;
  onEditProfile: () => void;
  /** Leave my own seat (self view only — replaces Copy V ID) */
  onDown?: () => void;
  /** Owner/admin: move this member down from their seat */
  onDownFromSeat?: () => void;
  /** True when the member being viewed is currently on a seat */
  isSeated?: boolean;
}) {
  const { t } = useTranslation();
  if (!member) return null;
  const isOwnerMe = myRole === 'host';
  const isAdminMe = myRole === 'admin';
  const targetIsOwner = member.role === 'host';
  const targetIsAdmin = member.role === 'admin';
  const isMe = member.id === myId;

  const canManage = !isMe && !targetIsOwner && (isOwnerMe || (isAdminMe && !targetIsAdmin));
  const canSetAdmin  = isOwnerMe && !isMe && !targetIsOwner && !targetIsAdmin;
  const canDismissAdmin = isOwnerMe && targetIsAdmin;

  const roleLabel = member.role === 'host'
    ? t('voiceRoom.memberManage.roleOwner')
    : member.role === 'admin'
      ? t('voiceRoom.memberManage.roleAdmin')
      : t('voiceRoom.memberManage.roleMember');

  return (
    <Modal visible={!!member} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: C.border, padding: 24 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginBottom: 20 }} />

        {/* ── Profile header: large photo + name + role badge ── */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{
            width: 76, height: 76, borderRadius: 38,
            overflow: 'hidden',
            backgroundColor: member.color + '33',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 3, borderColor: member.speaking ? C.gold : C.border,
            marginBottom: 12,
          }}>
            {member.photoURL ? (
              <Image
                source={{ uri: member.photoURL }}
                style={{ width: 76, height: 76, borderRadius: 38 }}
              />
            ) : (
              <Text style={{ color: member.color, fontSize: 28, fontWeight: '800' }}>
                {member.initials}
              </Text>
            )}
          </View>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>{member.name}</Text>
          <View style={{ backgroundColor: C.primary + '33', borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 4, marginTop: 6 }}>
            <Text style={{ color: C.sub, fontSize: 12, fontWeight: '700' }}>{roleLabel}</Text>
          </View>
        </View>

        {isMe ? (
          // ── Self view: View Profile, Edit Profile, Down Mic / Leave Seat ──
          <>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onViewProfile(); onClose(); }}
              style={{ backgroundColor: C.primary + '22', borderRadius: 14, paddingVertical: 13, marginBottom: 8,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderWidth: 1, borderColor: C.primary + '55' }}>
              <Feather name="user" size={16} color={C.primary} />
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
                {t('voiceRoom.memberManage.viewProfile')}
              </Text>
            </Pressable>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEditProfile(); onClose(); }}
              style={{ backgroundColor: C.card, borderRadius: 14, paddingVertical: 13, marginBottom: 8,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderWidth: 1, borderColor: C.borderFaint }}>
              <Feather name="edit-2" size={15} color={C.sub} />
              <Text style={{ color: C.sub, fontWeight: '700', fontSize: 13 }}>
                {t('voiceRoom.memberManage.editProfile')}
              </Text>
            </Pressable>
            {/* Issue 2: Down Mic / Leave Seat replaces Copy V ID */}
            {isSeated && onDown && (
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDown(); onClose(); }}
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, paddingVertical: 13, marginBottom: 8,
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                <Feather name="mic-off" size={15} color={C.red} />
                <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>
                  {t('voiceRoom.memberManage.downMic', { defaultValue: 'Down Mic / Leave Seat' })}
                </Text>
              </Pressable>
            )}
          </>
        ) : (
        <>
          {/* View other user's profile */}
          {onViewOtherProfile && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onViewOtherProfile(member.id, member.name); onClose(); }}
              style={{ backgroundColor: C.primary + '22', borderRadius: 14, paddingVertical: 13, marginBottom: 8,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderWidth: 1, borderColor: C.primary + '55' }}
            >
              <Feather name="user" size={16} color={C.primary} />
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
                {t('voiceRoom.memberManage.viewProfile')}
              </Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onMention(member.name); onClose(); }}
              style={{ flex: 1, backgroundColor: C.primary + '22', borderRadius: 14, paddingVertical: 13,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                borderWidth: 1, borderColor: C.primary + '55' }}>
              <Text style={{ color: C.primary, fontSize: 18, fontWeight: '900' }}>@</Text>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
                {t('voiceRoom.memberManage.mention')}
              </Text>
            </Pressable>
            <Pressable onPress={onGift}
              style={{ flex: 1, backgroundColor: C.pink + '22', borderRadius: 14, paddingVertical: 13,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                borderWidth: 1, borderColor: C.pink + '44' }}>
              <Text style={{ fontSize: 16 }}>🎁</Text>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>
                {t('voiceRoom.memberManage.gift')}
              </Text>
            </Pressable>
          </View>
        </>
        )}

        {canSetAdmin && (
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSetAdmin(); }}
            style={{ backgroundColor: C.gold + '18', borderRadius: 14, paddingVertical: 12, marginBottom: 8,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              borderWidth: 1, borderColor: C.gold + '44' }}>
            <Feather name="shield" size={16} color={C.gold} />
            <Text style={{ color: C.gold, fontWeight: '700' }}>
              {t('voiceRoom.memberManage.setAdmin')}
            </Text>
          </Pressable>
        )}

        {canDismissAdmin && (
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDismissAdmin(); }}
            style={{ backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, marginBottom: 8,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              borderWidth: 1, borderColor: C.borderFaint }}>
            <Feather name="shield-off" size={16} color={C.sub} />
            <Text style={{ color: C.sub, fontWeight: '700' }}>
              {t('voiceRoom.memberManage.dismissAdmin')}
            </Text>
          </Pressable>
        )}

        {/* Issue 4: Owner/Admin — Down From Seat (only if member is seated) */}
        {canManage && isSeated && onDownFromSeat && (
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDownFromSeat(); }}
            style={{ backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, marginBottom: 8,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              borderWidth: 1, borderColor: C.borderFaint }}>
            <Feather name="arrow-down-circle" size={15} color={C.sub} />
            <Text style={{ color: C.sub, fontWeight: '700' }}>
              {t('voiceRoom.memberManage.downFromSeat', { defaultValue: 'Down From Seat' })}
            </Text>
          </Pressable>
        )}

        {canManage && (
          <>
            <Pressable onPress={() => onBlock('comment-block')}
              style={{ backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, marginBottom: 8,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderWidth: 1, borderColor: C.borderFaint }}>
              <Feather name="message-square" size={15} color={C.sub} />
              <Text style={{ color: C.sub, fontWeight: '700' }}>
                {t('voiceRoom.memberManage.commentBlock')}
              </Text>
            </Pressable>
            <Pressable onPress={() => onBlock('room-block')}
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, paddingVertical: 12, marginBottom: 8,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
              <Feather name="slash" size={15} color={C.red} />
              <Text style={{ color: C.red, fontWeight: '700' }}>
                {t('voiceRoom.memberManage.roomBlock')}
              </Text>
            </Pressable>
          </>
        )}

        {!isMe && !targetIsOwner && !canManage && (
          <Pressable onPress={() => {
            if (onReport) {
              onReport(member.id, member.name);
            } else {
              Alert.alert(
                t('voiceRoom.memberManage.reportedTitle'),
                t('voiceRoom.memberManage.reportedMsg', { name: member.name }),
              );
              onClose();
            }
          }}
            style={{ backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, marginBottom: 8,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
              borderWidth: 1, borderColor: C.borderFaint }}>
            <Feather name="flag" size={15} color={C.sub} />
            <Text style={{ color: C.sub, fontWeight: '700' }}>
              {t('voiceRoom.memberManage.report')}
            </Text>
          </Pressable>
        )}

        <Pressable onPress={onClose} style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: C.muted, fontSize: 14 }}>
            {t('voiceRoom.memberManage.close')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
