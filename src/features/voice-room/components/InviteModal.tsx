import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Alert, Pressable, Modal, Share, ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/theme';
import { useAuth } from '@/src/context/AuthContext';
import { get, ref, set, type DataSnapshot } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { sendRoomInvite } from '../services/firebaseRoomService';

type Contact = {
  uid: string;
  name: string;
  initials: string;
  color: string;
  online: boolean;
};

const USER_COLORS = [
  '#7C3AED', '#EC4899', '#3B82F6', '#10B981',
  '#F97316', '#A855F7', '#0EA5E9', '#22C55E',
];

function getColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash + uid.charCodeAt(i)) % USER_COLORS.length;
  return USER_COLORS[hash];
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?';
}

/* ─────────────────────────── Invite Modal ─────────────────────────── */
export function InviteModal({
  visible, onClose, roomId, roomName,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const link = `vee://voice-room?roomId=${roomId}`;
  const [copied, setCopied] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  // Load real contacts (following list) from Firebase
  useEffect(() => {
    if (!visible || !user?.uid) return;
    setLoading(true);
    setContacts([]);

    get(ref(database, `following/${user.uid}`))
      .then(async (snap: DataSnapshot) => {
        if (!snap.exists()) { setLoading(false); return; }

        const uids = Object.keys(snap.val() as Record<string, boolean>);
        const loaded: Contact[] = [];

        await Promise.all(uids.map(async (uid) => {
          try {
            const userSnap = await get(ref(database, `users/${uid}`));
            if (userSnap.exists()) {
              const v = userSnap.val() as { name?: string; online?: boolean };
              loaded.push({
                uid,
                name: v.name ?? t('voiceRoom.screen.defaultUserName'),
                initials: getInitials(v.name ?? 'V'),
                color: getColor(uid),
                online: v.online === true,
              });
            }
          } catch { /* skip */ }
        }));

        // Online first, then alphabetical
        loaded.sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setContacts(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [visible, user?.uid]);

  const copyLink = () => {
    // Fix 12: Actually copy to clipboard before showing the alert
    Clipboard.setStringAsync(link).catch(() => {});
    setCopied(true);
    Alert.alert(t('voiceRoom.inviteModal.linkCopiedTitle'), link);
    setTimeout(() => setCopied(false), 2000);
  };

  const inviteContact = async (contact: Contact) => {
    try {
      // Write room invite to Firebase → Cloud Function sends push notification
      if (user?.uid && user?.displayName) {
        await sendRoomInvite(
          roomId, roomName, user.uid, user.displayName, contact.uid,
        );
      }
      // Also open native share sheet
      await Share.share({
        message: t('voiceRoom.inviteModal.shareContactMsg', { name: contact.name, roomName, link }),
      });
      setInvited((prev: string[]) => [...prev, contact.uid]);
    } catch { /* ignore */ }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0F0A1E', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        borderWidth: 1, borderColor: C.border, maxHeight: '88%',
      }}>
        <View style={{
          width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted,
          alignSelf: 'center', marginTop: 12, marginBottom: 4,
        }} />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
            {t('voiceRoom.inviteModal.title')}
          </Text>
          <Text style={{ color: C.sub, fontSize: 13, marginBottom: 18 }}>
            {t('voiceRoom.inviteModal.subtitle')}
          </Text>

          {/* Link copy */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
            borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.borderFaint, marginBottom: 18,
          }}>
            <Text style={{ flex: 1, color: C.sub, fontSize: 12 }} numberOfLines={1}>{link}</Text>
            <Pressable
              onPress={copyLink}
              style={{
                marginLeft: 10, backgroundColor: copied ? C.mic + '33' : C.primary + '22',
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6,
                borderWidth: 1, borderColor: copied ? C.mic : C.primary,
              }}
            >
              <Text style={{ color: copied ? C.mic : C.primary, fontSize: 12, fontWeight: '800' }}>
                {copied ? t('voiceRoom.inviteModal.copied') : t('voiceRoom.inviteModal.copy')}
              </Text>
            </Pressable>
          </View>

          {/* Contacts list */}
          <Text style={{
            color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2,
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            {t('voiceRoom.inviteModal.contactsLabel')}
          </Text>

          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator color={C.primary} />
              <Text style={{ color: C.sub, fontSize: 13, marginTop: 8 }}>
                {t('voiceRoom.inviteModal.loadingContacts')}
              </Text>
            </View>
          )}

          {!loading && contacts.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Feather name="users" size={32} color={C.muted} />
              <Text style={{ color: C.sub, fontSize: 14, marginTop: 10, textAlign: 'center' }}>
                {t('voiceRoom.inviteModal.noContacts')}
              </Text>
            </View>
          )}

          {contacts.map((c: Contact) => (
            <View key={c.uid} style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderFaint,
            }}>
              <View style={{
                width: 42, height: 42, borderRadius: 21, backgroundColor: c.color + '33',
                alignItems: 'center', justifyContent: 'center', borderWidth: 2,
                borderColor: c.color + '55', marginRight: 12,
              }}>
                <Text style={{ color: c.color, fontSize: 14, fontWeight: '800' }}>{c.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{c.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.online ? C.mic : C.muted }} />
                  <Text style={{ color: c.online ? C.mic : C.muted, fontSize: 11 }}>
                    {c.online ? t('voiceRoom.inviteModal.online') : t('voiceRoom.inviteModal.offline')}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => inviteContact(c)}
                style={{
                  backgroundColor: invited.includes(c.uid) ? C.mic + '22' : C.primary + '22',
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                  borderWidth: 1, borderColor: invited.includes(c.uid) ? C.mic : C.primary,
                }}
              >
                <Text style={{ color: invited.includes(c.uid) ? C.mic : C.primary, fontSize: 12, fontWeight: '800' }}>
                  {invited.includes(c.uid) ? t('voiceRoom.inviteModal.sent') : t('voiceRoom.inviteModal.invite')}
                </Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={async () => {
              try {
                await Share.share({ message: t('voiceRoom.inviteModal.shareLinkMsg', { roomName, link }) });
              } catch { /* ignore */ }
            }}
            style={{
              marginTop: 20, backgroundColor: C.primary, borderRadius: 16, paddingVertical: 15,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}
          >
            <Feather name="share-2" size={18} color={C.text} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>
              {t('voiceRoom.inviteModal.shareLink')}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
