/**
 * Wallet Screen — Diamond balance + transaction history
 * Real-time data from Firebase via walletService
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Platform,
  ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import {
  subscribeWalletBalance,
  subscribeTransactionHistory,
  WalletTransaction,
} from '@/src/features/wallet/walletService';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  mutedDim: '#4A3D6E',
  border: '#1E1830',
  surface: 'rgba(255,255,255,0.055)',
  green: '#22C55E',
  red: '#EF4444',
} as const;

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function TransactionItem({ tx }: { tx: WalletTransaction }) {
  const isReceived = tx.type === 'gift_received';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface, borderRadius: 16,
      padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    }}>
      {/* Emoji */}
      <View style={{
        width: 46, height: 46, borderRadius: 14,
        backgroundColor: isReceived ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.12)',
        borderWidth: 1,
        borderColor: isReceived ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.25)',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14,
      }}>
        <Text style={{ fontSize: 22 }}>{tx.emoji || '🎁'}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>
          {tx.giftName}
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
          {isReceived ? '⬇ From' : '⬆ To'} {tx.counterpartName}
        </Text>
        <Text style={{ color: C.mutedDim, fontSize: 11, marginTop: 2 }}>
          {formatDate(tx.ts)}
        </Text>
      </View>

      {/* Amount */}
      <Text style={{
        fontSize: 16, fontWeight: '900',
        color: isReceived ? C.green : C.muted,
      }}>
        {isReceived ? '+' : '-'}{Math.abs(tx.diamonds)} 💎
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingTxs, setLoadingTxs] = useState(true);

  // Subscribe to real-time balance
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeWalletBalance(user.uid, (bal) => {
      setBalance(bal);
      setLoadingBalance(false);
    });
    return unsub;
  }, [user?.uid]);

  // Subscribe to transaction history
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeTransactionHistory(user.uid, (txs) => {
      setTransactions(txs);
      setLoadingTxs(false);
    });
    return unsub;
  }, [user?.uid]);

  const totalReceived = transactions
    .filter((tx) => tx.type === 'gift_received')
    .reduce((sum, tx) => sum + Math.abs(tx.diamonds), 0);

  const totalSent = transactions
    .filter((tx) => tx.type === 'gift_sent')
    .reduce((sum, tx) => sum + Math.abs(tx.diamonds), 0);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}
        >
          {/* Back header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: topPad + 10, paddingBottom: 20,
          }}>
            <Pressable onPress={() => router.back()} hitSlop={14} style={{ marginRight: 12 }}>
              <Feather name="arrow-left" size={24} color={C.text} />
            </Pressable>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
              {t('wallet.title')}
            </Text>
          </View>

          {/* Balance card */}
          <View style={{
            backgroundColor: 'rgba(124,58,237,0.18)',
            borderRadius: 24, padding: 24, marginBottom: 16,
            borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
            alignItems: 'center',
          }}>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>
              {t('wallet.balance')}
            </Text>
            {loadingBalance ? (
              <ActivityIndicator color={C.glow} size="large" style={{ marginTop: 12 }} />
            ) : (
              <Text style={{
                color: C.text, fontSize: 56, fontWeight: '900',
                marginTop: 6, letterSpacing: -1,
              }}>
                {balance ?? 0}
              </Text>
            )}
            <Text style={{ color: C.glow, fontSize: 18, fontWeight: '800', marginTop: 2 }}>
              💎 {t('wallet.diamondsLabel')}
            </Text>
          </View>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
            <View style={{
              flex: 1, backgroundColor: 'rgba(34,197,94,0.08)',
              borderRadius: 16, padding: 16, alignItems: 'center',
              borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
            }}>
              <Text style={{ color: C.green, fontSize: 22, fontWeight: '900' }}>
                +{totalReceived}
              </Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                💎 {t('wallet.totalReceived')}
              </Text>
            </View>
            <View style={{
              flex: 1, backgroundColor: C.surface,
              borderRadius: 16, padding: 16, alignItems: 'center',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
            }}>
              <Text style={{ color: C.muted, fontSize: 22, fontWeight: '900' }}>
                -{totalSent}
              </Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                💎 {t('wallet.totalSent')}
              </Text>
            </View>
          </View>

          {/* Transaction history */}
          <Text style={{
            color: C.mutedDim, fontSize: 11, fontWeight: '700',
            letterSpacing: 0.8, marginBottom: 12,
          }}>
            {t('wallet.historyTitle')}
          </Text>

          {loadingTxs ? (
            <View style={{ alignItems: 'center', paddingTop: 30 }}>
              <ActivityIndicator color={C.glow} />
            </View>
          ) : transactions.length === 0 ? (
            <View style={{
              alignItems: 'center', paddingVertical: 50,
              backgroundColor: C.surface, borderRadius: 20,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
            }}>
              <Text style={{ fontSize: 40 }}>💎</Text>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginTop: 14 }}>
                {t('wallet.noTransactions')}
              </Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 30 }}>
                {t('wallet.noTransactionsSub')}
              </Text>
            </View>
          ) : (
            <>
              {transactions.map((tx) => (
                <TransactionItem key={tx.id} tx={tx} />
              ))}
              <Text style={{
                color: C.mutedDim, fontSize: 11,
                textAlign: 'center', marginTop: 8,
              }}>
                {t('wallet.showing', { count: transactions.length })}
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
