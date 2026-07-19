/**
 * App Settings Screen — real Firebase-backed functionality
 *
 * Change Password   → sendPasswordResetEmail to current user's email
 * Download My Data  → fetch profile + wallet summary, share as text
 * Delete Account    → reauthenticate with password, deleteUser, remove DB node
 * Toggle settings   → persisted to users/{uid}/appSettings in Firebase
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  Switch, Alert, Platform, Modal, TextInput,
  ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import ScalePress from '@/components/ScalePress';
import { useTranslation } from 'react-i18next';
import { ref, get, update, remove } from 'firebase/database';
import {
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { auth, database } from '@/src/config/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/context/ThemeContext';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  mutedDim: '#4A3D6E',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.055)',
  red: '#EF4444',
} as const;

type AppSettings = {
  darkMode: boolean;
  autoPlayMedia: boolean;
  dataSaver: boolean;
};

const DEFAULTS: AppSettings = {
  darkMode: false, // Issue 7: default to Light Mode; users opt in to Dark Mode
  autoPlayMedia: true,
  dataSaver: false,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SettingToggle({
  icon, label, subtitle, value, onChange,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface, borderRadius: 16,
      padding: 16, marginBottom: 10,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(139,92,246,0.14)',
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
      }}>
        <Feather name={icon} size={18} color={C.glow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        {subtitle ? (
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.mutedDim, true: C.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

function SettingButton({
  icon, label, onPress, danger,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <ScalePress onPress={onPress}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.surface, borderRadius: 16,
        padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
      }}>
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: danger ? 'rgba(239,68,68,0.12)' : 'rgba(139,92,246,0.14)',
          alignItems: 'center', justifyContent: 'center', marginRight: 14,
        }}>
          <Feather name={icon} size={18} color={danger ? C.red : C.glow} />
        </View>
        <Text style={{ flex: 1, color: danger ? C.red : C.text, fontSize: 15, fontWeight: '700' }}>
          {label}
        </Text>
        <Feather name="chevron-right" size={18} color={C.mutedDim} />
      </View>
    </ScalePress>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Issue 7: dark mode is managed by ThemeContext (persists to Firebase + app-wide)
  const { darkMode, setDarkMode } = useTheme();
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULTS);

  // Delete account modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Load toggle settings from Firebase ────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    get(ref(database, `users/${user.uid}/appSettings`))
      .then((snap) => {
        if (snap.exists()) {
          setAppSettings((prev) => ({ ...prev, ...(snap.val() as Partial<AppSettings>) }));
        }
      })
      .catch(() => {});
  }, [user?.uid]);

  // ── Toggle + persist ─────────────────────────────────────────────────
  const toggleSetting = useCallback(
    (key: keyof AppSettings) => {
      setAppSettings((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        if (user?.uid) {
          update(ref(database, `users/${user.uid}/appSettings`), { [key]: next[key] })
            .catch(() => {});
        }
        return next;
      });
    },
    [user?.uid],
  );

  // ── Change Password ───────────────────────────────────────────────────
  const handleChangePassword = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      Alert.alert('Error', 'No email address found for your account.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      Alert.alert(
        '✅ Reset Email Sent',
        `A password reset link has been sent to:\n${currentUser.email}\n\nCheck your inbox and spam folder.`,
      );
    } catch {
      Alert.alert('Error', 'Could not send password reset email. Please try again.');
    }
  }, []);

  // ── Download My Data ──────────────────────────────────────────────────
  const handleDownloadData = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const [profileSnap, walletSnap] = await Promise.all([
        get(ref(database, `users/${user.uid}`)),
        get(ref(database, `wallets/${user.uid}/balance`)),
      ]);

      const profile = profileSnap.exists() ? profileSnap.val() : {};
      const balance = walletSnap.exists() ? walletSnap.val() : 0;

      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: {
          name: profile.name ?? '',
          email: profile.email ?? '',
          vId: profile.vId ?? '',
          bio: profile.bio ?? '',
          createdAt: profile.createdAt
            ? new Date(profile.createdAt).toISOString()
            : '',
        },
        wallet: {
          diamondBalance: balance,
        },
      };

      await Share.share({
        title: 'My Vee Account Data',
        message: JSON.stringify(exportData, null, 2),
      });
    } catch {
      Alert.alert('Error', 'Could not fetch your data. Please try again.');
    }
  }, [user?.uid]);

  // ── Delete Account ────────────────────────────────────────────────────
  const handleDeleteAccount = useCallback(async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      Alert.alert('Error', 'No user session found. Please sign in again.');
      return;
    }

    setDeleteLoading(true);
    try {
      // Reauthenticate first (required for sensitive operations)
      const credential = EmailAuthProvider.credential(currentUser.email, deletePassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Remove user data from Firebase RTDB
      await remove(ref(database, `users/${user?.uid}`)).catch(() => {});

      // Delete the Firebase Auth user
      await deleteUser(currentUser);

      // Auth state change in AuthContext will redirect to login
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      let msg = 'Could not delete account. Please try again.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        msg = 'Incorrect password. Please try again.';
      } else if (code === 'auth/requires-recent-login') {
        msg = 'Session expired. Please sign out and sign in again before deleting.';
      }
      Alert.alert('Error', msg);
    } finally {
      setDeleteLoading(false);
    }
  }, [deletePassword, user?.uid]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {/* Back header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: topPad + 10, paddingBottom: 20,
          }}>
            <Pressable onPress={() => router.back()} hitSlop={14} style={{ marginRight: 12 }}>
              <Feather name="arrow-left" size={24} color={C.text} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '900' }}>
              {t('settings.title')}
            </Text>
          </View>

          {/* Appearance */}
          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginBottom: 10,
          }}>
            {t('settings.sectionAppearance')}
          </Text>
          {/* Issue 7: dark mode toggle now wired to ThemeContext (app-wide + persisted) */}
          <SettingToggle
            icon="moon"
            label={t('settings.darkMode')}
            subtitle={t('settings.darkModeSub')}
            value={darkMode}
            onChange={(v) => setDarkMode(v)}
          />

          {/* Media */}
          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginTop: 16, marginBottom: 10,
          }}>
            {t('settings.sectionMedia')}
          </Text>
          <SettingToggle
            icon="play-circle"
            label={t('settings.autoPlayMedia')}
            subtitle={t('settings.autoPlayMediaSub')}
            value={appSettings.autoPlayMedia}
            onChange={() => toggleSetting('autoPlayMedia')}
          />
          <SettingToggle
            icon="wifi-off"
            label={t('settings.dataSaver')}
            subtitle={t('settings.dataSaverSub')}
            value={appSettings.dataSaver}
            onChange={() => toggleSetting('dataSaver')}
          />

          {/* Account */}
          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginTop: 16, marginBottom: 10,
          }}>
            {t('settings.sectionAccount')}
          </Text>
          <SettingButton
            icon="lock"
            label={t('settings.changePassword')}
            onPress={handleChangePassword}
          />
          <SettingButton
            icon="download"
            label={t('settings.downloadData')}
            onPress={handleDownloadData}
          />
          <SettingButton
            icon="trash-2"
            label={t('settings.deleteAccount')}
            danger
            onPress={() => {
              setDeletePassword('');
              Alert.alert(
                t('settings.deleteAccountTitle'),
                t('settings.deleteAccountMsg'),
                [
                  { text: t('settings.cancel'), style: 'cancel' },
                  {
                    text: t('settings.deleteAccountConfirm'),
                    style: 'destructive',
                    onPress: () => setDeleteModalVisible(true),
                  },
                ],
              );
            }}
          />

          <Text style={{
            color: C.mutedDim, fontSize: 11,
            textAlign: 'center', marginTop: 24,
          }}>
            {t('settings.version')}
          </Text>
        </ScrollView>
      </SafeAreaView>

      {/* ── Delete Account Password Modal ─────────────────────────────────── */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
          alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <View style={{
            width: '100%', backgroundColor: '#12091F',
            borderRadius: 20, padding: 24,
            borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
          }}>
            <Text style={{ color: C.red, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>
              ⚠️ Delete Account
            </Text>
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 20, marginBottom: 20 }}>
              This action is permanent and cannot be undone. All your data will be deleted.{'\n\n'}
              Enter your current password to confirm.
            </Text>

            <TextInput
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Enter your password"
              placeholderTextColor={C.mutedDim}
              secureTextEntry
              autoCapitalize="none"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                color: C.text, fontSize: 15,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                marginBottom: 20,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => { setDeleteModalVisible(false); setDeletePassword(''); }}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  alignItems: 'center',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                }}
              >
                <Text style={{ color: C.muted, fontWeight: '700' }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleteLoading}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 12,
                  backgroundColor: 'rgba(239,68,68,0.18)',
                  alignItems: 'center',
                  borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
                }}
              >
                {deleteLoading
                  ? <ActivityIndicator color={C.red} size="small" />
                  : <Text style={{ color: C.red, fontWeight: '900' }}>Delete Forever</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
