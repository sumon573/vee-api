import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, FlatList, Alert, Pressable,
  Animated, Platform, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ref, get, onValue } from 'firebase/database';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import ScalePress from '@/components/ScalePress';
import { database } from '@/src/config/firebase';
import { setMinimizedRoom } from '@/src/store/minimizedRoom';
import { useZegoVoiceRoom, setZegoMinimized } from '@/src/hooks/useZegoVoiceRoom';
import { useAuth } from '@/src/context/AuthContext';
import { getUser } from '@/src/services/userService';
import { subscribeWalletBalance } from '@/src/features/wallet/walletService';
import { submitReport } from '@/src/services/reportService';

import { C, ROOM_META, ROOM_THEMES } from '../constants/theme';
import { Role, Participant, BlockRecord, ChatMsg, SeatReaction } from '../types/room';
import { fmtDiamonds, getWeekStart } from '../utils/format';
import { SeatCard } from '../components/SeatCard';
import RoomChatMessage from '../components/RoomChatMessage';
import { RoomInfoModal } from '../components/RoomInfoModal';
import { OperationHistoryModal } from '../components/OperationHistoryModal';
import { SettingsModal } from '../components/SettingsModal';
import { SeatActionSheet } from '../components/SeatActionSheet';
import { InviteToSeatModal } from '../components/InviteToSeatModal';
import { InviteModal } from '../components/InviteModal';
import { AudienceModal } from '../components/AudienceModal';
import { GiftsModal } from '../components/GiftsModal';
import { MemberManageModal } from '../components/MemberManageModal';
import { EmojiPanel } from '../components/EmojiPanel';
import { ExitModal } from '../components/ExitModal';

// ── Firebase Room Services ─────────────────────────────────────────────────
import {
  subscribeSeats, subscribeAudience, subscribeRoomInfo,
  subscribeLockedSeats,
  joinRoomAsAudience, leaveAudience, takeSeat, leaveSeat as fbLeaveSeat,
  setSeatMute, setSeatRole, removeSeat, removeAudienceMember,
  lockSeat as fbLockSeat, unlockSeat as fbUnlockSeat, setAudienceRole,
  closeRoom, updateRoomSettings, getUserColor, getInitials,
  disbandRoom,
  // Seat Request System (Firebase-persisted)
  sendSeatRequest, subscribeSeatRequests, approveSeatRequest, rejectSeatRequest,
  type SeatRequest,
  // Block System (Firebase-persisted)
  blockUserInRoom, unblockUserInRoom, subscribeRoomBlocks, isUserBlockedInRoom,
  type RoomBlockRecord,
  type RoomSeat, type RoomAudienceMember,
  // Fix 1: Seat invite system
  sendSeatInvite, subscribeSeatInvites, removeSeatInvite, type SeatInvite,
  // Fix 5: Emoji reaction broadcast
  sendRoomEmojiReaction, subscribeRoomEmojiReactions,
} from '../services/firebaseRoomService';
import {
  subscribeRoomChat, sendRoomChatMsg, loadOlderMessages,
  type RoomChatMsg,
} from '../services/firebaseRoomChatService';

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */

function fbSeatToParticipant(
  seat: NonNullable<RoomSeat>,
  speakingUsers: Record<string, boolean>,
): Participant {
  return {
    id: seat.userId,
    name: seat.userName,
    initials: seat.initials,
    color: seat.color,
    photoURL: seat.photoURL,
    speaking: speakingUsers[seat.userId] === true,
    muted: seat.muted,
    role: seat.role,
  };
}

function fbAudToParticipant(m: RoomAudienceMember): Participant {
  return {
    id: m.userId,
    name: m.userName,
    initials: m.initials,
    color: m.color,
    photoURL: m.photoURL,
    speaking: false,
    muted: true,
    // Preserve Firebase-synced role (admin / member); default to 'member'
    role: (m.role as Role | undefined) ?? 'member',
  };
}

function fbChatToMsg(m: RoomChatMsg): ChatMsg {
  return {
    id: m.id,
    sender: m.senderName,
    color: m.senderColor,
    text: m.text,
    isMe: m.isMe ?? false,
    ts: m.ts,
    replyTo: m.replyTo,
  };
}

/* ═══════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════ */
export default function VoiceRoomScreen() {
  const { roomId: paramRoomId } = useLocalSearchParams<{ roomId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useTranslation();

  // Fix 4: Remove hardcoded ROOM_META.id fallback — roomId must come from route param
  const roomId = paramRoomId ?? '';
  const myUid  = user?.uid ?? 'anonymous';

  // CRITICAL-6/7 fix: Firebase Auth user.displayName / photoURL are NOT updated
  // when the user edits their profile inside Vee (those writes go to RTDB only).
  // Fetch the canonical profile from RTDB once at mount so seat cards show the
  // real name and photo.  The one-time fetch avoids triggering a ZEGO engine
  // re-init (which would happen if we subscribed and the value changed).
  const [myProfile, setMyProfile] = useState<{ name: string; photoURL?: string } | null>(null);
  useEffect(() => {
    if (!myUid || myUid === 'anonymous') return;
    getUser(myUid).then((p) => {
      if (p) setMyProfile({ name: p.name, photoURL: p.photoURL || undefined });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myName = myProfile?.name ?? user?.displayName ?? t('voiceRoom.screen.defaultUserName');
  const myPhotoURL = myProfile?.photoURL || user?.photoURL || undefined;
  const myColor = getUserColor(myUid);
  const myInitials = getInitials(myName);

  // Stable ZEGO username — computed once so profile load doesn't cause ZEGO re-init.
  // ZEGO's userName is used for its own presence layer; Vee's UI shows myName from Firebase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zegoUserName = useMemo(() => user?.displayName ?? myUid, []);

  /* ── ZEGOCLOUD real audio ── */
  const {
    joined: zegoJoined,
    muted,
    speakerOn,
    speakingUsers,
    localSpeaking,
    isPublishing,
    error: zegoError,
    startPublishing,
    stopPublishing,
    toggleMic: zegoToggleMic,
    toggleSpeaker: zegoToggleSpeaker,
    setMicMuted,
    muteRemoteUser,
    playUserStream,
    stopUserStream,
    wasRestored,
  } = useZegoVoiceRoom({
    roomID: roomId,
    userID: myUid,
    // Use the stable zegoUserName (never changes after mount) so a profile
    // load doesn't trigger a full ZEGO engine re-init mid-session.
    userName: zegoUserName,
  });

  /* ── Core state ── */
  const [seats,         setSeats]        = useState<Array<Participant | null>>(Array(10).fill(null));
  const [lockedSeats,   setLockedSeats]  = useState<Set<number>>(new Set<number>());
  const [audience,      setAudience]     = useState<Participant[]>([]);
  const [blockedRecs,   setBlockedRecs]  = useState<BlockRecord[]>([]);
  const [pendingRequests, setPendingRequests] = useState<SeatRequest[]>([]);
  const [ownerId,       setOwnerId]      = useState<string>('');
  const [walletBalance, setWalletBalance] = useState(0);
  // Fix 9: Weekly diamonds earned (separate from total balance)
  const [weeklyEarned,  setWeeklyEarned] = useState(0);
  // Fix 1: Incoming seat invites for this user in this room
  const [pendingSeatInvites, setPendingSeatInvites] = useState<SeatInvite[]>([]);
  // Fix 11: Chat pagination state
  const [chatOldestKey,    setChatOldestKey]    = useState<string | null>(null);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [hasOlderMsgs,     setHasOlderMsgs]     = useState(true);

  // Ref to keep speakingUsers accessible in callbacks without re-creating them
  const speakingRef = useRef<Record<string, boolean>>({});
  useEffect(() => { speakingRef.current = speakingUsers; }, [speakingUsers]);

  // Fix 5: Ref for seats used inside emoji reaction subscription callback
  const seatsRef = useRef<Array<Participant | null>>(Array(10).fill(null));
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  /**
   * CRITICAL-1 fix (minimize/restore): After returning from the minimized bar,
   * the persisted ZEGO engine is reused — but roomStreamUpdate ADD will NOT
   * re-fire for streams that were already active before minimize.  We must
   * manually re-play each speaker's stream so audio resumes for all participants.
   * `wasRestored` is set once by the hook on detect of a persisted engine;
   * `hasRestoredRef` ensures the sweep runs at most once per session.
   */
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!wasRestored || hasRestoredRef.current) return;
    if (seats.every((s) => s === null)) return; // wait for seat data to arrive
    hasRestoredRef.current = true;
    seats.forEach((seat) => {
      if (seat && seat.id !== myUid) {
        playUserStream(seat.id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasRestored, seats]);

  // Fix 5: Track last processed reaction timestamp to skip old/replayed events
  const lastReactionTsRef = useRef(0);

  // Fix 1: Track which invite IDs have already shown an Alert (so we don't re-alert)
  const handledInviteIds = useRef<Set<string>>(new Set());

  // Fix 4: Navigate back if no roomId is provided (removes ROOM_META.id fallback)
  useEffect(() => {
    if (!roomId) {
      Alert.alert('Error', 'Room not found.');
      router.back();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Real-time wallet balance subscription ── */
  useEffect(() => {
    if (!myUid || myUid === 'anonymous') return;
    return subscribeWalletBalance(myUid, setWalletBalance);
  }, [myUid]);

  /* ── Fix 9: Weekly diamonds earned subscription ── */
  useEffect(() => {
    if (!myUid || myUid === 'anonymous') return;
    return onValue(
      ref(database, `wallets/${myUid}/weeklyEarned`),
      (snap) => { setWeeklyEarned(snap.exists() ? (snap.val() as number) : 0); },
      () => { setWeeklyEarned(0); },
    );
  }, [myUid]);

  /* ── Fix 1: Subscribe to incoming seat invites for this room ── */
  useEffect(() => {
    if (!myUid || myUid === 'anonymous' || !roomId) return;
    return subscribeSeatInvites(myUid, roomId, setPendingSeatInvites);
  }, [myUid, roomId]);

  /* ── Fix 1: Show Alert when a seat invite arrives ── */
  useEffect(() => {
    pendingSeatInvites.forEach((invite) => {
      if (handledInviteIds.current.has(invite.id)) return;
      handledInviteIds.current.add(invite.id);
      Alert.alert(
        'Seat Invitation',
        `${invite.inviterName} has invited you to seat ${invite.seatIdx + 1} in "${invite.roomName}". Accept?`,
        [
          {
            text: 'Accept',
            onPress: async () => {
              await removeSeatInvite(myUid, invite.id).catch(() => {});
              const result = await takeSeat(roomId, invite.seatIdx, {
                userId: myUid, userName: myName,
                initials: myInitials, color: myColor,
                muted: true, role: 'member',
                ...(myPhotoURL ? { photoURL: myPhotoURL } : {}),
              });
              if (result.success) {
                startPublishing();
                sendRoomChatMsg(roomId, {
                  senderId: 'system', senderName: 'System', senderColor: C.gold,
                  text: `${myName} joined seat ${invite.seatIdx + 1}`,
                  ts: Date.now(),
                }).catch(() => {});
              } else {
                Alert.alert('Sorry', 'That seat is no longer available.');
              }
            },
          },
          {
            text: 'Decline',
            style: 'cancel',
            onPress: () => { removeSeatInvite(myUid, invite.id).catch(() => {}); },
          },
        ],
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSeatInvites]);

  /* ── Fix 5: Subscribe to emoji reactions broadcast by any participant ── */
  useEffect(() => {
    if (!roomId) return;
    return subscribeRoomEmojiReactions(roomId, (reaction) => {
      if (!reaction) return;
      // Ignore stale reactions older than 5 seconds
      if (reaction.ts <= lastReactionTsRef.current) return;
      if (Date.now() - reaction.ts > 5000) return;
      lastReactionTsRef.current = reaction.ts;
      // Animate the emoji over every occupied seat
      const newReactions: Record<string, SeatReaction> = {};
      seatsRef.current.forEach((member) => {
        if (!member) return;
        const translateY = new Animated.Value(0);
        const opacity    = new Animated.Value(1);
        newReactions[member.id] = { emoji: reaction.emoji, translateY, opacity };
        Animated.parallel([
          Animated.timing(translateY, { toValue: -55, duration: 1600, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(800),
            Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
        ]).start(() => {
          setSeatReactions((prev: Record<string, SeatReaction>) => {
            const n = { ...prev }; delete n[member.id]; return n;
          });
        });
      });
      if (Object.keys(newReactions).length > 0) {
        setSeatReactions((prev: Record<string, SeatReaction>) => ({ ...prev, ...newReactions }));
      }
    });
  }, [roomId]);

  /* ── Room settings ── */
  const [roomTopic,     setRoomTopic]    = useState<string>(t('voiceRoom.creation.defaultTopic'));
  const [roomName,      setRoomName]     = useState(ROOM_META.name);
  const [roomImageUri, setRoomImageUri] = useState<string | null>(null);
  const [activeThemeId, setActiveThemeId] = useState('cosmic');
  /** Persisted room visibility — synced from Firebase via subscribeRoomInfo. */
  const [roomIsPublic,  setRoomIsPublic]  = useState(true);
  /** Persisted room lock state — synced from Firebase via subscribeRoomInfo. */
  const [roomIsLocked,  setRoomIsLocked]  = useState(false);
  /** Room description — synced from Firebase via subscribeRoomInfo. */
  const [roomDescription, setRoomDescription] = useState('');
  const accentColor = useMemo(
    () => ROOM_THEMES.find((th: { id: string; accent: string }) => th.id === activeThemeId)?.accent ?? C.primary,
    [activeThemeId],
  );
  /** Deep background color for the current theme. */
  const themeBg = useMemo(
    () => ROOM_THEMES.find((th) => th.id === activeThemeId)?.bg ?? C.bg,
    [activeThemeId],
  );
  /** Surface/card color for the current theme. */
  const themeSurface = useMemo(
    () => ROOM_THEMES.find((th) => th.id === activeThemeId)?.surface ?? 'rgba(255,255,255,0.055)',
    [activeThemeId],
  );

  /* ── Join state ── */
  const [hasJoined, setHasJoined] = useState(false);

  /* ── Chat ── */
  const [messages,   setMessages]   = useState<ChatMsg[]>([]);
  const chatRef = useRef<FlatList<ChatMsg>>(null);
  /** Holds the id of the last auto-scroll setTimeout so it can be cancelled on unmount. */
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatInput,    setChatInput]    = useState('');
  const [replyingTo,   setReplyingTo]   = useState<ChatMsg | null>(null);
  /** Active @-mention query: non-null while the user is typing an @-prefixed word. */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  /* ── Seat reaction overlays ── */
  const [seatReactions,  setSeatReactions]  = useState<Record<string, SeatReaction>>({});

  /* ── Modal states ── */
  const [roomInfoOpen,    setRoomInfoOpen]    = useState(false);
  const [opHistOpen,      setOpHistOpen]      = useState(false);
  const [settingsOpen,    setSettingsOpen]    = useState(false);
  const [seatActionOpen,  setSeatActionOpen]  = useState(false);
  const [seatActionIdx,   setSeatActionIdx]   = useState(-1);
  const [invToSeatOpen,   setInvToSeatOpen]   = useState(false);
  const [invToSeatIdx,    setInvToSeatIdx]    = useState(-1);
  const [inviteOpen,      setInviteOpen]      = useState(false);
  const [audienceOpen,    setAudienceOpen]    = useState(false);
  const [giftsOpen,       setGiftsOpen]       = useState(false);
  const [giftsRecipient,  setGiftsRecipient]  = useState<Participant | null>(null);
  const [activeMember,    setActiveMember]    = useState<Participant | null>(null);
  const [exitModalOpen,   setExitModalOpen]   = useState(false);
  const [emojiPanelOpen,  setEmojiPanelOpen]  = useState(false);

  /* ── My Vee ID (for the "Copy V ID" self-profile action) ── */
  const [myVId, setMyVId] = useState<string>('');
  useEffect(() => {
    if (!user?.uid) return;
    getUser(user.uid).then((profile) => { if (profile?.vId) setMyVId(profile.vId); }).catch(() => {});
  }, [user?.uid]);

  const handleViewOwnProfile = useCallback(() => {
    router.push('/profile');
  }, []);

  const handleEditOwnProfile = useCallback(() => {
    router.push('/profile/edit');
  }, []);

  const handleCopyVId = useCallback(() => {
    if (!myVId) return;
    Clipboard.setStringAsync(myVId).then(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('voiceRoom.memberManage.vIdCopiedTitle'), myVId);
    }).catch(() => {});
  }, [myVId, t]);

  /* ── Weekly diamond reset ── */
  const [weekStart, setWeekStart] = useState<number>(() => getWeekStart());
  useEffect(() => {
    const ws = getWeekStart();
    if (ws > weekStart) { setWeekStart(ws); }
  }, [weekStart]);

  /* ═══════════════════════════════════════════
     FIREBASE SUBSCRIPTIONS
  ═══════════════════════════════════════════ */

  // Subscribe to room info — BUG 16 fix: navigate away when room is closed
  useEffect(() => {
    return subscribeRoomInfo(roomId, (info) => {
      // info is null (deleted) or active:false (host closed it)
      if (!info || info.active === false) {
        // Only navigate if we haven't already started leaving ourselves.
        // This prevents a double router.back() when the host closes their own room
        // and the subscription fires AFTER handleLeave already called router.back().
        if (!hasLeftRef.current) {
          hasLeftRef.current = true;
          // Navigate first, THEN show the informational alert.
          // Showing the alert before navigating on Android can block the navigation
          // and calling router.back() again inside the alert button causes a double-pop.
          router.back();
          Alert.alert(
            t('voiceRoom.screen.roomClosed'),
            t('voiceRoom.screen.roomClosedMsg'),
          );
        }
        return;
      }
      setRoomName(info.name);
      setRoomTopic(info.topic);
      setOwnerId(info.ownerId);
      setRoomImageUri(info.coverImageUrl ?? null);
      setRoomIsPublic(info.isPublic);
      setRoomIsLocked(info.isLocked ?? false);
      setRoomDescription(info.description ?? '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Subscribe to Firebase-persisted room blocks
  useEffect(() => {
    return subscribeRoomBlocks(roomId, (blocksMap) => {
      const records: BlockRecord[] = Array.from(blocksMap.values()).map((b: RoomBlockRecord) => ({
        id: b.userId,
        name: b.userName,
        initials: b.initials,
        color: b.color,
        action: b.action,
        actionBy: b.byName,
        timestamp: b.blockedAt,
        isActive: true,
      }));
      setBlockedRecs(records);
    });
  }, [roomId]);

  // Subscribe to pending seat requests (shown to host/admin)
  useEffect(() => {
    return subscribeSeatRequests(roomId, setPendingRequests);
  }, [roomId]);

  // Subscribe to seats
  useEffect(() => {
    return subscribeSeats(roomId, (fbSeats) => {
      setSeats(fbSeats.map(seat =>
        seat ? fbSeatToParticipant(seat, speakingRef.current) : null,
      ));
    });
  }, [roomId]);

  // Subscribe to audience
  useEffect(() => {
    return subscribeAudience(roomId, (fbAudience) => {
      setAudience(fbAudience.map(fbAudToParticipant));
    });
  }, [roomId]);

  // Subscribe to room chat — Fix 11: track oldest key for pagination
  useEffect(() => {
    return subscribeRoomChat(roomId, myUid, (fbMsgs) => {
      setMessages(fbMsgs.map(fbChatToMsg));
      if (fbMsgs.length > 0) {
        setChatOldestKey(fbMsgs[0].id);
        // If we got a full page (50), there might be older messages
        setHasOlderMsgs(fbMsgs.length >= 50);
      }
      // Clear any pending scroll timer before scheduling a new one
      if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null;
        chatRef.current?.scrollToEnd({ animated: false });
      }, 80);
    });
  }, [roomId, myUid]);

  /* ── mySeatIdx: declared early so all effects below can reference it safely ── */
  const mySeatIdx = useMemo(
    () => seats.findIndex((s: Participant | null) => s?.id === myUid),
    [seats, myUid],
  );

  /**
   * Ref that always holds the latest mySeatIdx.
   */
  const mySeatIdxRef = useRef(mySeatIdx);
  useEffect(() => {
    mySeatIdxRef.current = mySeatIdx;
  }, [mySeatIdx]);

  /**
   * Auto-publish guard: fires at most once per room session.
   * Handles two cases where startPublishing() would otherwise be skipped:
   *   1. Owner: createRoom() places them in seat 0, so they arrive in the
   *      room already seated — they never call joinSeat() and thus never
   *      reach the startPublishing() call inside it.
   *   2. Invited to seat: host calls takeSeat() on behalf of an audience
   *      member. That member's client sees the seat appear via subscribeSeats,
   *      but joinSeat() is never called on their device.
   * Guard fires only once (hasAutoPublishedRef) so it doesn't re-publish on
   * subsequent mySeatIdx changes (e.g. moving between seats).
   */
  const hasAutoPublishedRef = useRef(false);
  useEffect(() => {
    if (hasAutoPublishedRef.current) return;
    if (!zegoJoined || mySeatIdx < 0) return;
    hasAutoPublishedRef.current = true;
    // Mark as joined so leave/unmount cleanup runs correctly for owner
    if (!hasJoined) setHasJoined(true);
    startPublishing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zegoJoined, mySeatIdx]);

  /**
   * Issue 1 fix: Auto-mark owner as joined when they arrive with their seat
   * already in Firebase (createRoom pre-places them in seat 0). Without this,
   * hasJoined stays false in Expo Go because ZEGO never fires zegoJoined,
   * so the leave-cleanup guard never arms and counts never update.
   */
  useEffect(() => {
    if (!hasJoined && ownerId && ownerId === myUid && mySeatIdx >= 0) {
      setHasJoined(true);
    }
  }, [hasJoined, ownerId, myUid, mySeatIdx]);

  /**
   * Issue 2 fix: Sync host-driven Firebase seat.muted changes → local ZEGO mic.
   * When a host/admin toggles someone's mute in SeatActionSheet → setSeatMute(),
   * the target user's Firebase seat entry updates. This effect detects the change
   * and mutes/unmutes the local microphone to match.
   */
  const prevFbMutedRef = useRef<boolean | null>(null);
  // CRITICAL-4 fix: track seat index to reset mute-sync on seat changes
  const prevMySeatIdxRef = useRef<number>(-1);
  useEffect(() => {
    if (mySeatIdx < 0) {
      prevFbMutedRef.current = null;
      prevMySeatIdxRef.current = -1;
      return;
    }
    // Seat changed — always apply new seat's muted value regardless of prev
    if (prevMySeatIdxRef.current !== mySeatIdx) {
      prevFbMutedRef.current = null;
      prevMySeatIdxRef.current = mySeatIdx;
    }
    const mySeat = seats[mySeatIdx];
    if (!mySeat) return;
    const fbMuted = mySeat.muted;
    if (prevFbMutedRef.current === fbMuted) return; // no change
    prevFbMutedRef.current = fbMuted;
    if (isPublishing) {
      setMicMuted(fbMuted);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats, mySeatIdx, isPublishing]);

  /* ── ZEGOCLOUD speaking detection → seats speaking state ── */
  useEffect(() => {
    if (!speakingUsers || Object.keys(speakingUsers).length === 0) return;
    setSeats((prev: Array<Participant | null>) => prev.map((s: Participant | null) => {
      if (!s || s.id === myUid) return s;
      const isSpeaking = speakingUsers[s.id] === true;
      return isSpeaking !== s.speaking ? { ...s, speaking: isSpeaking } : s;
    }));
  }, [speakingUsers, myUid]);

  // Local user
  useEffect(() => {
    if (mySeatIdx < 0) return;
    setSeats((prev: Array<Participant | null>) => prev.map((s: Participant | null, i: number) => {
      if (i !== mySeatIdx || !s) return s;
      return s.speaking !== localSpeaking ? { ...s, speaking: localSpeaking } : s;
    }));
  }, [localSpeaking, mySeatIdx]);

  /* ── Join room: check if blocked before joining ── */
  useEffect(() => {
    if (!hasJoined) return;
    isUserBlockedInRoom(roomId, myUid).then((blocked) => {
      if (blocked) {
        Alert.alert(t('voiceRoom.screen.accessDenied'), t('voiceRoom.screen.accessDeniedMsg'));
        router.back();
      }
    }).catch(() => {});
  }, [hasJoined, roomId, myUid]);

  /* ── BUG 11 fix: track whether the leave cleanup has already been run
     (either explicitly via handleLeave/handleMinimize, or by the effect
     cleanup on unmount). Prevents the double-remove that occurred when
     router.back() unmounted the screen right after handleLeave ran. ── */
  const hasLeftRef = useRef(false);

  /* ── Join room: add to Firebase audience ── */
  useEffect(() => {
    if (!hasJoined) return;
    hasLeftRef.current = false;

    joinRoomAsAudience(roomId, {
      userId: myUid,
      userName: myName,
      initials: myInitials,
      color: myColor,
      ...(myPhotoURL ? { photoURL: myPhotoURL } : {}),
    }).catch(() => {});

    // Send join message to room chat
    sendRoomChatMsg(roomId, {
      senderId: 'system',
      senderName: 'System',
      senderColor: C.gold,
      text: t('voiceRoom.screen.joinedRoom', { name: myName }),
      ts: Date.now(),
    }).catch(() => {});

    return () => {
      // BUG 11 fix: only run cleanup once — handleLeave marks hasLeftRef first
      if (hasLeftRef.current) return;
      hasLeftRef.current = true;
      if (mySeatIdxRef.current >= 0) {
        removeSeat(roomId, mySeatIdxRef.current).catch(() => {});
      } else {
        leaveAudience(roomId, myUid).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJoined]);

  /* ── Cleanup scroll timer on unmount ── */
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, []);

  /* ═══════════════════════════════════════════
     DERIVED STATE
  ═══════════════════════════════════════════ */

  const seatMembers = useMemo(() => seats.filter((s: Participant | null): s is Participant => s !== null), [seats]);
  const allMembers  = useMemo(() => [...seatMembers, ...audience], [seatMembers, audience]);

  const myRole: Role = useMemo(() => {
    const mySeat = seats.find((s: Participant | null) => s?.id === myUid);
    // Fall back to ownerId when the user currently has no seat (e.g. the
    // host stepped down from their seat) so the owner never gets
    // misdetected as a plain member and loses host-only capabilities.
    return mySeat?.role ?? (ownerId && ownerId === myUid ? 'host' : 'member');
  }, [seats, myUid, ownerId]);

  const isOwnerOrAdmin = myRole === 'host' || myRole === 'admin';

  // "Tap to join" must only ever be shown to audience who have not joined
  // yet — never to the owner/admin/member who are already inside the room.
  const showJoinBanner = !hasJoined && !isOwnerOrAdmin && mySeatIdx < 0;

  const seatActionMember = seatActionIdx >= 0 ? seats[seatActionIdx] ?? null : null;

  /** Live members whose names start with the current @-query (max 6, excludes self). */
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allMembers
      .filter((m: Participant) => m.id !== myUid)
      .filter((m: Participant) => !q || m.name.toLowerCase().startsWith(q));
  }, [mentionQuery, allMembers, myUid]);

  /** Handles chat TextInput changes and detects @-mention triggers. */
  const handleChatInput = useCallback((text: string) => {
    setChatInput(text);
    const match = text.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1] ?? '');
    } else {
      setMentionQuery(null);
    }
  }, []);

  /** Replaces the trailing @query with the selected member name and closes the picker. */
  const handleSelectMention = useCallback((memberName: string) => {
    setChatInput((prev: string) => prev.replace(/@\w*$/, `@${memberName} `));
    setMentionQuery(null);
  }, []);

  /* ═══════════════════════════════════════════
     ACTIONS
  ═══════════════════════════════════════════ */

  const toggleMic = useCallback(() => {
    if (!isPublishing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newMuted = !muted;
    zegoToggleMic();
    if (mySeatIdx >= 0) {
      // Optimistically update seat mute indicator immediately so the dot
      // reflects the new state without waiting for the Firebase round-trip.
      setSeats(prev => prev.map((s, i) =>
        i === mySeatIdx && s ? { ...s, muted: newMuted } : s,
      ));
      setSeatMute(roomId, mySeatIdx, newMuted).catch(() => {});
    }
  }, [zegoToggleMic, isPublishing, mySeatIdx, muted, roomId]);

  const toggleSpeaker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    zegoToggleSpeaker();
  }, [zegoToggleSpeaker]);

  const handleSeatPress = useCallback((seatIdx: number) => {
    const member = seats[seatIdx];
    // Tapping your OWN seat always opens your own profile view (View/Edit
    // Profile, Copy V ID) — regardless of role. Previously audience members
    // got no reaction at all, and hosts/admins got the moderation sheet
    // meant for other people.
    if (member && member.id === myUid) { setActiveMember(member); return; }
    if (!isOwnerOrAdmin) {
      if (member && member.id !== myUid) { setActiveMember(member); return; }
      if (!member) {
        if (lockedSeats.has(seatIdx)) {
          // CRITICAL-5 fix: Locked seat → prompt to send a request
          Alert.alert(
            t('voiceRoom.screen.lockedSeat'),
            t('voiceRoom.screen.lockedSeatMsg'),
            [
              {
                text: t('voiceRoom.screen.requestSeat'),
                onPress: async () => {
                  try {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await sendSeatRequest(roomId, {
                      userId: myUid,
                      userName: myName,
                      initials: myInitials,
                      color: myColor,
                      seatIdx,
                      ts: Date.now(),
                      hostId: ownerId || myUid,
                    });
                    Alert.alert(
                      t('voiceRoom.screen.requestSentTitle'),
                      t('voiceRoom.screen.requestSentMsg'),
                    );
                  } catch {
                    Alert.alert(t('voiceRoom.screen.error'), t('voiceRoom.screen.requestError'));
                  }
                },
              },
              { text: t('voiceRoom.screen.cancel'), style: 'cancel' },
            ],
          );
          return;
        }
        // CRITICAL-5 fix: Unlocked empty seat → join immediately, no request needed
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        joinSeat(seatIdx);
      }
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSeatActionIdx(seatIdx);
    setSeatActionOpen(true);
  }, [isOwnerOrAdmin, seats, myUid, lockedSeats, roomId, myName, myInitials, myColor, ownerId, t]);

  const muteToggleMember = useCallback((memberId: string) => {
    const seatIdx = seats.findIndex((s: Participant | null) => s?.id === memberId);
    setSeats((prev: Array<Participant | null>) => prev.map((s: Participant | null) => {
      if (s?.id !== memberId) return s;
      const newMuted = !s.muted;
      if (newMuted) muteRemoteUser(memberId);
      else playUserStream(memberId);
      if (seatIdx >= 0) {
        setSeatMute(roomId, seatIdx, newMuted).catch(() => {});
      }
      return { ...s, muted: newMuted };
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [muteRemoteUser, playUserStream, seats, roomId]);

  const downFromSeat = useCallback((seatIdx: number) => {
    const member = seats[seatIdx];
    if (!member) return;
    if (member.id === myUid) {
      stopPublishing();
    } else {
      stopUserStream(member.id);
    }
    // Issue 6: pass full member data (including photoURL + role) so the user
    // is properly restored to the Live Audience list with their profile photo.
    fbLeaveSeat(roomId, seatIdx, member.id, {
      userId: member.id,
      userName: member.name,
      initials: member.initials,
      color: member.color,
      ...(member.photoURL ? { photoURL: member.photoURL } : {}),
      ...(member.role && member.role !== 'host' ? { role: member.role } : {}),
    }).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [seats, myUid, roomId, stopPublishing, stopUserStream]);

  const joinSeat = useCallback((seatIdx: number) => {
    const target = seats[seatIdx];
    if (target && target.id !== myUid) {
      Alert.alert(t('voiceRoom.screen.seatOccupied'), t('voiceRoom.screen.seatOccupiedFirst'));
      return;
    }

    // role: always use myRole — it already computes 'host' for the owner even
    // when they have no seat (the ownerId fallback in the myRole useMemo).
    // The previous `mySeatIdx >= 0 ? myRole : 'member'` was wrong: an owner
    // joining from the audience was seated as 'member'.
    const seatData: NonNullable<RoomSeat> = {
      userId: myUid,
      userName: myName,
      initials: myInitials,
      color: myColor,
      ...(myPhotoURL ? { photoURL: myPhotoURL } : {}),
      // CRITICAL-4 fix: preserve current mute state when moving between seats;
      // start muted only on first join from audience (mySeatIdx < 0).
      muted: mySeatIdx >= 0 ? muted : true,
      role: myRole,
    };

    takeSeat(roomId, seatIdx, seatData).catch(() => {});

    if (mySeatIdx >= 0 && mySeatIdx !== seatIdx) {
      removeSeat(roomId, mySeatIdx).catch(() => {});
    } else if (mySeatIdx < 0) {
      startPublishing();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [seats, myUid, myName, myInitials, myColor, myRole, mySeatIdx, roomId, startPublishing, muted, t]);

  /**
   * CRITICAL-3 fix: Mic bar button behaves differently by role.
   * Placed after joinSeat declaration to avoid "used before assigned" TS error.
   * • Audience (not in a seat): tapping joins the first available unlocked seat.
   * • Speaker (in a seat): tapping toggles Mute / Unmute.
   */
  const handleMicBarPress = useCallback(() => {
    if (mySeatIdx >= 0) {
      toggleMic();
      return;
    }
    const firstAvail = seats.findIndex(
      (s: Participant | null, idx: number) => !s && !lockedSeats.has(idx),
    );
    if (firstAvail >= 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      joinSeat(firstAvail);
    } else {
      Alert.alert(
        t('voiceRoom.screen.noSeatsTitle', { defaultValue: 'No Seats Available' }),
        t('voiceRoom.screen.noSeatsMsg', { defaultValue: 'All seats are occupied or locked.' }),
      );
    }
  }, [mySeatIdx, toggleMic, seats, lockedSeats, joinSeat, t]);

  // ── Subscribe to Firebase-synced locked seats ──────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeLockedSeats(roomId, setLockedSeats);
    return unsub;
  }, [roomId]);

  const lockSeat = useCallback((seatIdx: number) => {
    fbLockSeat(roomId, seatIdx).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [roomId]);

  const unlockSeat = useCallback((seatIdx: number) => {
    fbUnlockSeat(roomId, seatIdx).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [roomId]);

  const setAdminRole = useCallback((memberId: string) => {
    const seatIdx = seats.findIndex((s: Participant | null) => s?.id === memberId);
    if (seatIdx >= 0) {
      setSeatRole(roomId, seatIdx, 'admin').catch(() => {});
    }
    const inAudience = audience.find((m: Participant) => m.id === memberId);
    if (inAudience) {
      setAudienceRole(roomId, memberId, 'admin').catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [seats, audience, roomId]);

  const dismissAdmin = useCallback((memberId: string) => {
    const seatIdx = seats.findIndex((s: Participant | null) => s?.id === memberId);
    if (seatIdx >= 0) {
      setSeatRole(roomId, seatIdx, 'member').catch(() => {});
    }
    const inAudience = audience.find((m: Participant) => m.id === memberId);
    if (inAudience) {
      setAudienceRole(roomId, memberId, 'member').catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [seats, audience, roomId]);

  const blockUser = useCallback((memberId: string, action: 'room-block' | 'comment-block') => {
    const inSeat = seats.find((s: Participant | null) => s?.id === memberId);
    const inAud  = audience.find((m: Participant) => m.id === memberId);
    const member = inSeat ?? inAud;
    if (!member) return;

    if (inSeat) {
      const seatIdx = seats.findIndex((s: Participant | null) => s?.id === memberId);
      removeSeat(roomId, seatIdx).catch(() => {});
    } else {
      removeAudienceMember(roomId, memberId).catch(() => {});
    }

    const blockRecord: RoomBlockRecord = {
      userId: member.id,
      userName: member.name,
      initials: member.initials,
      color: member.color,
      blockedAt: Date.now(),
      blockedBy: myUid,
      byName: myName,
      action,
    };
    blockUserInRoom(roomId, blockRecord).catch(() => {});

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      t('voiceRoom.screen.userBlockedDone'),
      action === 'room-block'
        ? t('voiceRoom.screen.userRoomBlocked', { name: member.name })
        : t('voiceRoom.screen.userCommentBlocked', { name: member.name }),
    );
  }, [seats, audience, roomId, myUid, myName, t]);

  const unblockUser = useCallback((userId: string) => {
    const record = blockedRecs.find((r: BlockRecord) => r.id === userId && r.isActive);
    if (!record) return;
    unblockUserInRoom(roomId, userId).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [blockedRecs, roomId]);

  // Fix 1: Send seat invite via Firebase instead of directly placing the user
  const inviteToSeat = useCallback((memberId: string, seatIdx: number) => {
    const member = audience.find((m: Participant) => m.id === memberId);
    if (!member) return;
    if (seats[seatIdx]) {
      Alert.alert(t('voiceRoom.screen.seatOccupied'), t('voiceRoom.screen.seatAlreadyTaken'));
      return;
    }
    Alert.alert(
      t('voiceRoom.screen.inviteMember', { name: member.name }),
      t('voiceRoom.screen.sendInviteToSeat', { number: seatIdx + 1 }),
      [
        {
          text: t('voiceRoom.screen.sendInvite'),
          onPress: () => {
            // Fix 1: Write invite to Firebase — invited user decides to accept/decline
            sendSeatInvite(member.id, {
              roomId, roomName, seatIdx,
              inviterUid: myUid, inviterName: myName,
              ts: Date.now(),
            }).catch(() => {});
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
        { text: t('voiceRoom.screen.cancel'), style: 'cancel' },
      ],
    );
  }, [audience, seats, roomId, roomName, myUid, myName, t]);

  const handleLeave = useCallback(() => {
    // BUG 11 fix: mark as already cleaned up so the effect cleanup
    // (triggered by router.back() → unmount) doesn't run it a second time.
    hasLeftRef.current = true;

    if (mySeatIdx >= 0) {
      stopPublishing();
      removeSeat(roomId, mySeatIdx).catch(() => {});
    } else if (hasJoined) {
      leaveAudience(roomId, myUid).catch(() => {});
    }
    // Issue 8 fix: Rooms persist until the owner explicitly deletes them from
    // Settings. Do NOT auto-close when the host leaves — other users can still
    // rejoin and the room remains discoverable in the room list.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setExitModalOpen(false);
    router.back();
  }, [mySeatIdx, hasJoined, myUid, myRole, seats, audience, roomId, stopPublishing]);

  const handleMinimize = useCallback(() => {
    // BUG 11 fix: mark as already cleaned up so the effect cleanup
    // does not incorrectly remove the user from the room on minimize.
    // The user is still "in" the minimized room — do NOT remove them.
    hasLeftRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Minimize fix: signal the ZEGO hook to persist the engine instead of
    // destroying it when the screen unmounts.
    setZegoMinimized(true);
    setMinimizedRoom({
      id:       roomId,
      name:     roomName,
      topic:    roomTopic,
      myUid,
      mySeatIdx,
      muted,
    });
    setExitModalOpen(false);
    router.back();
  }, [roomId, roomName, roomTopic, myUid, mySeatIdx, muted]);

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sendRoomChatMsg(roomId, {
        senderId: myUid,
        senderName: myName,
        senderColor: myColor,
        text,
        ts: Date.now(),
        ...(replyingTo ? { replyTo: { sender: replyingTo.sender, text: replyingTo.text, color: replyingTo.color } } : {}),
      });
      // Only clear input + scroll on success
      setChatInput('');
      setReplyingTo(null);
      setMentionQuery(null);
      if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null;
        chatRef.current?.scrollToEnd({ animated: true });
      }, 80);
    } catch (err) {
      // Comment-block / room-block enforcement: show feedback to the user
      if (err instanceof Error && err.message === 'blocked') {
        Alert.alert(
          t('voiceRoom.screen.blockedTitle', { defaultValue: 'Blocked' }),
          t('voiceRoom.screen.commentBlockedMsg', { defaultValue: 'You have been blocked from sending messages in this room.' }),
        );
      }
    }
  }, [chatInput, replyingTo, roomId, myUid, myName, myColor, t]);

  const handleMention  = useCallback((name: string) => { setChatInput((prev: string) => `@${name} ${prev}`); }, []);

  const handleJoinRoom = useCallback(() => {
    setHasJoined(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  /** Disband the room entirely (owner only) — removes all Firebase data then navigates away. */
  const handleDisband = useCallback(async () => {
    hasLeftRef.current = true;
    stopPublishing();
    try {
      await disbandRoom(roomId);
    } catch { /* non-critical */ }
    router.back();
  }, [roomId, stopPublishing]);

  const handleGiftSent = useCallback((coins: number, emoji: string, toNames: string[]) => {
    // Wallet balance updates automatically via Firebase subscription
    sendRoomChatMsg(roomId, {
      senderId: myUid,
      senderName: myName,
      senderColor: myColor,
      text: t('voiceRoom.screen.sentGift', { emoji, names: toNames.join(', '), coins }),
      ts: Date.now(),
    }).catch(() => {});
  }, [roomId, myUid, myName, myColor]);

  // Fix 5: Broadcast emoji via Firebase so all clients animate simultaneously
  const sendEmojiReaction = useCallback((emoji: string) => {
    setEmojiPanelOpen(false);
    // Write to Firebase — subscribeRoomEmojiReactions handles animation on ALL clients
    sendRoomEmojiReaction(roomId, { emoji, byUid: myUid, byName: myName }).catch(() => {});
    sendRoomChatMsg(roomId, {
      senderId: myUid,
      senderName: myName,
      senderColor: myColor,
      text: emoji,
      ts: Date.now(),
    }).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [roomId, myUid, myName, myColor]);

  // Fix 11: Load older messages (chat pagination)
  const handleLoadOlderMessages = useCallback(async () => {
    if (!chatOldestKey || loadingOlderMsgs || !hasOlderMsgs) return;
    setLoadingOlderMsgs(true);
    try {
      const older = await loadOlderMessages(roomId, myUid, chatOldestKey, 30);
      if (older.length === 0) {
        setHasOlderMsgs(false);
      } else {
        setMessages((prev: ChatMsg[]) => [...older.map(fbChatToMsg), ...prev]);
        setChatOldestKey(older[0].id);
      }
    } catch { /* non-critical */ }
    setLoadingOlderMsgs(false);
  }, [chatOldestKey, loadingOlderMsgs, hasOlderMsgs, roomId, myUid]);

  // Fix 13: Navigate to another user's profile screen
  const handleViewOtherProfile = useCallback((uid: string, name: string) => {
    router.push({ pathname: '/user-profile', params: { uid, name } } as Parameters<typeof router.push>[0]);
  }, []);

  const renderChatMessage = useCallback(
    ({ item }: { item: ChatMsg }) => (
      <RoomChatMessage item={item} accentColor={accentColor} onReply={setReplyingTo} />
    ),
    [accentColor],
  );

  /* ── Layout ── */
  const bottomPad  = Math.max(insets.bottom, Platform.OS === 'web' ? 20 : 8) + 14;
  const BOTTOM_BAR_H = bottomPad + 14 + 58;

  /* ═══ RENDER ═══ */
  return (
    <View style={{ flex: 1, backgroundColor: themeBg }}>
      {/* Theme accent gradient — subtle glow from the top matching the active theme */}
      <LinearGradient
        colors={[accentColor + '28', accentColor + '00']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, zIndex: 0 }}
        pointerEvents="none"
      />
      <SafeAreaView edges={['top']}>
        {/* ═══ HEADER ═══ */}
        <View style={{ paddingHorizontal: 14, paddingTop: Platform.OS === 'web' ? 68 : 10, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Room avatar — cover image or first-letter initials */}
            <Pressable onPress={() => setRoomInfoOpen(true)}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                overflow: 'hidden',
                borderWidth: 1.5, borderColor: accentColor + '66',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: accentColor + '22',
              }}>
                {roomImageUri ? (
                  <Image source={{ uri: roomImageUri }} style={{ width: 36, height: 36 }} />
                ) : (
                  <Text style={{ color: accentColor, fontSize: 14, fontWeight: '900' }}>
                    {roomName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
            </Pressable>

            {/* Room name — taps open room info panel */}
            <Pressable onPress={() => setRoomInfoOpen(true)} style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>
                {roomName}
              </Text>
            </Pressable>

            {/* Join button — shown to passive viewers who haven't tapped Join yet */}
            {showJoinBanner && (
              <ScalePress onPress={handleJoinRoom}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: accentColor, borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 7,
                  shadowColor: accentColor, shadowOpacity: 0.5, shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                }}>
                  <Feather name="user-plus" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>
                    {t('voiceRoom.screen.joinRoom', { defaultValue: 'Join' })}
                  </Text>
                </View>
              </ScalePress>
            )}

            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {/* Diamond counter */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: 'rgba(245,158,11,0.14)', borderRadius: 999,
                paddingHorizontal: 10, paddingVertical: 5,
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
              }}>
                <Text style={{ color: C.gold, fontSize: 13 }}>💎</Text>
                <Text style={{ color: C.gold, fontSize: 13, fontWeight: '800' }}>
                  {fmtDiamonds(walletBalance)}
                </Text>
              </View>

              {/* Pending seat requests badge — host/admin only */}
              {isOwnerOrAdmin && pendingRequests.length > 0 && (
                <ScalePress
                  onPress={() => {
                    const req = pendingRequests[0];
                    if (!req) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(
                      t('voiceRoom.screen.seatRequestTitle', { count: pendingRequests.length }),
                      t('voiceRoom.screen.seatRequestMsg', { name: req.userName, number: req.seatIdx + 1 }),
                      [
                        {
                          text: t('voiceRoom.screen.approve'),
                          onPress: async () => {
                            try {
                              const [seatsSnap, lockedSnap] = await Promise.all([
                                get(ref(database, `rooms/${roomId}/seats/${req.seatIdx}`)),
                                get(ref(database, `rooms/${roomId}/lockedSeats/${req.seatIdx}`)),
                              ]);
                              if (seatsSnap.exists()) {
                                Alert.alert(t('voiceRoom.screen.seatNoLongerEmpty'), t('voiceRoom.screen.seatNoLongerEmptyMsg'));
                                rejectSeatRequest(roomId, req.id).catch(() => {});
                                return;
                              }
                              if (lockedSnap.exists() && lockedSnap.val() === true) {
                                Alert.alert(t('voiceRoom.screen.seatLocked'), t('voiceRoom.screen.seatLockedMsg'));
                                rejectSeatRequest(roomId, req.id).catch(() => {});
                                return;
                              }
                              await takeSeat(roomId, req.seatIdx, {
                                userId: req.userId,
                                userName: req.userName,
                                initials: req.initials,
                                color: req.color,
                                muted: true,
                                role: 'member',
                              });
                              await approveSeatRequest(roomId, req.id);
                              sendRoomChatMsg(roomId, {
                                senderId: 'system',
                                senderName: 'System',
                                senderColor: C.gold,
                                text: t('voiceRoom.screen.memberJoinedSeatApproved', { name: req.userName, number: req.seatIdx + 1 }),
                                ts: Date.now(),
                              }).catch(() => {});
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            } catch {
                              Alert.alert(t('voiceRoom.screen.error'), t('voiceRoom.screen.approveError'));
                            }
                          },
                        },
                        {
                          text: t('voiceRoom.screen.reject'),
                          style: 'destructive',
                          onPress: () => {
                            rejectSeatRequest(roomId, req.id).catch(() => {});
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                          },
                        },
                        { text: t('voiceRoom.screen.later'), style: 'cancel' },
                      ],
                    );
                  }}
                >
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: accentColor + '22', borderRadius: 999,
                    paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderColor: accentColor + '55',
                  }}>
                    <Feather name="mic" size={13} color={accentColor} />
                    <Text style={{ color: accentColor, fontSize: 12, fontWeight: '800' }}>
                      {pendingRequests.length}
                    </Text>
                  </View>
                </ScalePress>
              )}
              {isOwnerOrAdmin && (
                <ScalePress onPress={() => setSettingsOpen(true)}>
                  <Feather name="settings" size={26} color={C.sub} />
                </ScalePress>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* ═══ BODY ═══ */}
      <View style={{ flex: 1, paddingHorizontal: 14, paddingBottom: BOTTOM_BAR_H }}>

        {/* ── Join banner: audience only, never owner/admin/already-joined ── */}
        {showJoinBanner && (
          <ScalePress onPress={handleJoinRoom}>
            <View style={{
              marginVertical: 10, borderRadius: 16, padding: 14,
              backgroundColor: accentColor,
              flexDirection: 'row', alignItems: 'center', gap: 10,
              shadowColor: accentColor, shadowOpacity: 0.5,
              shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
            }}>
              <Feather name="log-in" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', flex: 1 }}>
                {t('voiceRoom.screen.joinBanner')}
              </Text>
            </View>
          </ScalePress>
        )}

        {/* ── My role badge — shown once actually inside the room ── */}
        {(hasJoined || mySeatIdx >= 0) && (
          <View style={{
            alignSelf: 'flex-start', marginBottom: 8, flexDirection: 'row', alignItems: 'center',
            backgroundColor: myRole === 'host'  ? C.gold + '22'
                           : myRole === 'admin' ? accentColor + '22'
                           : 'rgba(255,255,255,0.07)',
            borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
            borderWidth: 1,
            borderColor: myRole === 'host'  ? C.gold + '66'
                       : myRole === 'admin' ? accentColor + '66'
                       : C.borderFaint,
          }}>
            <Text style={{
              color: myRole === 'host'  ? C.gold
                   : myRole === 'admin' ? accentColor
                   : C.sub,
              fontSize: 12, fontWeight: '800',
            }}>
              {myRole === 'host'
                ? t('voiceRoom.screen.roleOwner')
                : myRole === 'admin'
                  ? t('voiceRoom.screen.roleAdmin')
                  : t('voiceRoom.screen.roleMember')}
            </Text>
          </View>
        )}

        {/* ── Seat grid ── */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          {seats.map((member: Participant | null, idx: number) => (
            <SeatCard
              key={idx}
              seatIndex={idx}
              member={member}
              isLocked={lockedSeats.has(idx)}
              accentColor={accentColor}
              myId={myUid}
              onPress={() => handleSeatPress(idx)}
              reaction={member ? seatReactions[member.id] : undefined}
            />
          ))}
        </View>

        {/* ── Audience count ── */}
        {audience.length > 0 && (
          <ScalePress onPress={() => setAudienceOpen(true)}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: C.card, borderRadius: 12, padding: 10,
              borderWidth: 1, borderColor: C.borderFaint, marginBottom: 10,
            }}>
              <Feather name="users" size={15} color={C.sub} />
              <Text style={{ color: C.sub, fontSize: 13, fontWeight: '700' }}>
                {t('voiceRoom.screen.listeners', { count: audience.length })}
              </Text>
              <Feather name="chevron-right" size={14} color={C.muted} style={{ marginLeft: 'auto' }} />
            </View>
          </ScalePress>
        )}

        {/* ── Room Chat ── */}
        <View style={{
          flex: 1, borderRadius: 16,
          backgroundColor: themeSurface + '55',
          borderWidth: 1, borderColor: accentColor + '22',
          overflow: 'hidden',
        }}>
          {/* Fix 11: Chat pagination — "Load earlier" button at the top */}
          <FlatList<ChatMsg>
            ref={chatRef}
            data={messages}
            keyExtractor={(item: ChatMsg) => item.id}
            renderItem={renderChatMessage}
            contentContainerStyle={{ padding: 8 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={hasOlderMsgs ? (
              <Pressable
                onPress={handleLoadOlderMessages}
                disabled={loadingOlderMsgs}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                {loadingOlderMsgs
                  ? <ActivityIndicator size="small" color={accentColor} />
                  : <Text style={{ color: accentColor, fontSize: 12, fontWeight: '700' }}>
                      {t('voiceRoom.screen.loadEarlier', { defaultValue: '↑ Load earlier messages' })}
                    </Text>
                }
              </Pressable>
            ) : null}
            onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
          />
        </View>

        {/* ── @ Mention picker ── */}
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <View style={{
            maxHeight: 180,
            backgroundColor: '#0F0A1E',
            borderRadius: 14,
            borderWidth: 1, borderColor: accentColor + '55',
            marginTop: 6, overflow: 'hidden',
            shadowColor: accentColor, shadowOpacity: 0.25,
            shadowRadius: 12, shadowOffset: { width: 0, height: -2 },
            elevation: 8,
          }}>
            {mentionCandidates.slice(0, 6).map((m: Participant) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleSelectMention(m.name);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: accentColor + '1A',
                }}
              >
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: m.color + '33',
                  borderWidth: 1.5, borderColor: m.color + '66',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: m.color, fontSize: 11, fontWeight: '800' }}>{m.initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>
                    <Text style={{ color: accentColor, fontWeight: '900' }}>@</Text>{m.name}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>
                    {m.role === 'host' ? '👑 Owner' : m.role === 'admin' ? '🛡️ Admin' : 'Member'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Reply preview ── */}
        {replyingTo && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.07)',
            borderRadius: 10, padding: 8, marginTop: 6,
            borderLeftWidth: 3, borderLeftColor: accentColor,
          }}>
            <Text numberOfLines={1} style={{ flex: 1, color: C.sub, fontSize: 12 }}>
              ↩ {replyingTo.sender}: {replyingTo.text}
            </Text>
            <Pressable onPress={() => setReplyingTo(null)}>
              <Feather name="x" size={14} color={C.muted} />
            </Pressable>
          </View>
        )}

        {/* ── Chat input ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginTop: 8, marginBottom: 6,
        }}>
          <ScalePress onPress={() => setEmojiPanelOpen(true)}>
            <Feather name="smile" size={22} color={C.sub} />
          </ScalePress>

          {/* @ Mention shortcut — opens picker for all live members */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setChatInput((prev: string) => prev + '@');
              setMentionQuery('');
            }}
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: accentColor + '22',
              borderWidth: 1, borderColor: accentColor + '44',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: accentColor, fontSize: 14, fontWeight: '900' }}>@</Text>
          </Pressable>

          <TextInput
            style={{
              flex: 1, color: C.text, fontSize: 14,
              backgroundColor: C.card, borderRadius: 20,
              paddingHorizontal: 14, paddingVertical: 8,
              borderWidth: 1, borderColor: C.borderFaint,
            }}
            value={chatInput}
            onChangeText={handleChatInput}
            placeholder={t('voiceRoom.screen.messagePlaceholder')}
            placeholderTextColor={C.muted}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
            returnKeyType="send"
          />

          <Pressable
            onPress={sendMessage}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: chatInput.trim() ? accentColor : C.muted,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Feather name="send" size={15} color={C.text} />
          </Pressable>
        </View>
      </View>

      {/* ═══ EMOJI PANEL ═══ */}
      <EmojiPanel
        visible={emojiPanelOpen}
        onSelect={sendEmojiReaction}
        onClose={() => setEmojiPanelOpen(false)}
        bottomOffset={BOTTOM_BAR_H + 8}
      />

      {/* ═══ BOTTOM BAR ═══ */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
        paddingBottom: bottomPad, paddingTop: 14, paddingHorizontal: 10,
        backgroundColor: themeBg, borderTopWidth: 1, borderTopColor: accentColor + '33',
      }}>
        {/* CRITICAL-3: Mic bar — "Join Seat" for audience, Mute/Unmute for speakers */}
        <ScalePress onPress={handleMicBarPress}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: mySeatIdx < 0 ? accentColor + '22'
                : muted ? 'rgba(239,68,68,0.16)' : 'rgba(34,197,94,0.16)',
              borderWidth: 1.5,
              borderColor: mySeatIdx < 0 ? accentColor + '66'
                : muted ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather
                name={mySeatIdx < 0 ? 'user-plus' : muted ? 'mic-off' : 'mic'}
                size={20}
                color={mySeatIdx < 0 ? accentColor : muted ? C.red : C.mic}
              />
            </View>
            <Text style={{
              color: mySeatIdx < 0 ? accentColor : muted ? C.red : C.mic,
              fontSize: 10, fontWeight: '700',
            }}>
              {mySeatIdx < 0
                ? t('voiceRoom.screen.joinSeat', { defaultValue: 'Join Seat' })
                : t('voiceRoom.screen.mic')}
            </Text>
          </View>
        </ScalePress>

        {/* Speaker */}
        <ScalePress onPress={toggleSpeaker}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Feather name={speakerOn ? 'volume-2' : 'volume-x'} size={24} color={speakerOn ? C.text : C.sub} />
            <Text style={{ color: speakerOn ? C.text : C.sub, fontSize: 10, fontWeight: '700' }}>
              {t('voiceRoom.screen.speaker')}
            </Text>
          </View>
        </ScalePress>

        {/* Gifts */}
        <ScalePress onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setGiftsOpen(true); }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.pink,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.pink, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
            }}>
              <Text style={{ fontSize: 22 }}>🎁</Text>
            </View>
            <Text style={{ color: C.text, fontSize: 10, fontWeight: '700' }}>
              {t('voiceRoom.screen.gift')}
            </Text>
          </View>
        </ScalePress>

        {/* Invite */}
        <ScalePress onPress={() => setInviteOpen(true)}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Feather name="user-plus" size={24} color={C.text} />
            <Text style={{ color: C.text, fontSize: 10, fontWeight: '700' }}>
              {t('voiceRoom.screen.invite')}
            </Text>
          </View>
        </ScalePress>

        {/* Exit Room */}
        <ScalePress onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setExitModalOpen(true); }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: 'rgba(239,68,68,0.15)',
              borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.4)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Feather name="log-out" size={18} color="#EF4444" />
            </View>
            <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '700' }}>
              {t('voiceRoom.screen.exit', { defaultValue: 'Exit' })}
            </Text>
          </View>
        </ScalePress>
      </View>

      {/* ═══ MODALS ═══ */}
      {/* Fix 3/8/9: Cloudinary upload happens inside RoomInfoModal; we persist the URL here */}
      <RoomInfoModal
        visible={roomInfoOpen}
        onClose={() => setRoomInfoOpen(false)}
        allMembers={allMembers}
        weeklyEarned={weeklyEarned}
        description={roomDescription}
        roomTopic={roomTopic}
        accent={accentColor}
        roomName={roomName}
        onChangeRoomName={(newName) => {
          setRoomName(newName);
          updateRoomSettings(roomId, { name: newName }).catch(() => {});
        }}
        roomImageUri={roomImageUri}
        onChangeRoomImage={(cloudUrl) => {
          setRoomImageUri(cloudUrl);
          updateRoomSettings(roomId, { coverImageUrl: cloudUrl }).catch(() => {});
        }}
        roomId={roomId}
        isOwner={myRole === 'host'}
        onDisband={handleDisband}
        onLeave={() => { setRoomInfoOpen(false); setExitModalOpen(true); }}
      />
      <OperationHistoryModal
        visible={opHistOpen}
        onClose={() => setOpHistOpen(false)}
        records={blockedRecs}
        onUnblock={unblockUser}
        accent={accentColor}
      />
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isOwnerOrAdmin={isOwnerOrAdmin}
        topic={roomTopic}
        setTopic={(newTopic) => {
          setRoomTopic(newTopic);
          updateRoomSettings(roomId, { topic: newTopic }).catch(() => {});
        }}
        activeThemeId={activeThemeId}
        onThemeChange={setActiveThemeId}
        onOpenHistory={() => { setSettingsOpen(false); setOpHistOpen(true); }}
        accent={accentColor}
        roomIsPublic={roomIsPublic}
        roomIsLocked={roomIsLocked}
        onSaveSettings={(newIsPublic, newIsLocked) => {
          setRoomIsPublic(newIsPublic);
          setRoomIsLocked(newIsLocked);
          updateRoomSettings(roomId, { isPublic: newIsPublic, isLocked: newIsLocked }).catch(() => {});
        }}
      />
      <SeatActionSheet
        visible={seatActionOpen}
        seatIdx={seatActionIdx}
        member={seatActionMember ?? undefined}
        myRole={myRole}
        myId={myUid}
        locked={seatActionIdx >= 0 && lockedSeats.has(seatActionIdx)}
        audience={audience}
        onClose={() => setSeatActionOpen(false)}
        onDown={() => { downFromSeat(seatActionIdx); setSeatActionOpen(false); }}
        onJoin={() => { joinSeat(seatActionIdx); setSeatActionOpen(false); }}
        onMute={() => { if (seatActionMember) muteToggleMember(seatActionMember.id); setSeatActionOpen(false); }}
        onSetAdmin={() => { if (seatActionMember) setAdminRole(seatActionMember.id); setSeatActionOpen(false); }}
        onDismissAdmin={() => { if (seatActionMember) dismissAdmin(seatActionMember.id); setSeatActionOpen(false); }}
        onMention={() => { if (seatActionMember) { handleMention(seatActionMember.name); setSeatActionOpen(false); } }}
        onBlock={() => { if (seatActionMember) { blockUser(seatActionMember.id, 'room-block'); setSeatActionOpen(false); } }}
        onLock={() => { lockSeat(seatActionIdx); setSeatActionOpen(false); }}
        onUnlock={() => { unlockSeat(seatActionIdx); setSeatActionOpen(false); }}
        onInvite={() => { setInvToSeatIdx(seatActionIdx); setSeatActionOpen(false); setInvToSeatOpen(true); }}
        accent={accentColor}
      />
      <InviteToSeatModal
        visible={invToSeatOpen}
        audience={audience}
        seatIdx={invToSeatIdx}
        onClose={() => setInvToSeatOpen(false)}
        onInvite={(memberId) => { inviteToSeat(memberId, invToSeatIdx); setInvToSeatOpen(false); }}
        accent={accentColor}
      />
      <InviteModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roomId={roomId}
        roomName={roomName}
      />
      <GiftsModal
        visible={giftsOpen}
        onClose={() => { setGiftsOpen(false); setGiftsRecipient(null); }}
        onGiftSent={handleGiftSent}
        members={allMembers}
        initialRecipient={giftsRecipient}
        walletBalance={walletBalance}
        myUid={myUid}
        myName={myName}
        roomId={roomId}
      />
      <AudienceModal
        visible={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        audience={audience}
        myRole={myRole}
        onManageMember={(m) => { setAudienceOpen(false); setActiveMember(m); }}
      />
      <MemberManageModal
        member={activeMember}
        myRole={myRole}
        myId={myUid}
        onClose={() => setActiveMember(null)}
        onGift={() => { setGiftsRecipient(activeMember); setActiveMember(null); setGiftsOpen(true); }}
        onMention={handleMention}
        onBlock={(action) => { if (activeMember) blockUser(activeMember.id, action); setActiveMember(null); }}
        onReport={(memberId, memberName) => {
          submitReport({
            reporterUid: myUid,
            reporterName: myName,
            reportedUid: memberId,
            reportedName: memberName,
            reason: 'inappropriate',
            roomId,
          }).catch(() => {});
          setActiveMember(null);
        }}
        onSetAdmin={() => { if (activeMember) setAdminRole(activeMember.id); setActiveMember(null); }}
        onDismissAdmin={() => { if (activeMember) dismissAdmin(activeMember.id); setActiveMember(null); }}
        onViewProfile={handleViewOwnProfile}
        onViewOtherProfile={handleViewOtherProfile}
        onEditProfile={handleEditOwnProfile}
        // Issue 2: Down Mic / Leave Seat (self view — replaces Copy V ID)
        isSeated={activeMember ? seats.some((s) => s?.id === activeMember.id) : false}
        onDown={() => { if (mySeatIdx >= 0) downFromSeat(mySeatIdx); setActiveMember(null); }}
        // Issue 4: Owner/Admin — move another member down from their seat
        onDownFromSeat={() => {
          if (activeMember) {
            const targetIdx = seats.findIndex((s) => s?.id === activeMember.id);
            if (targetIdx >= 0) downFromSeat(targetIdx);
          }
          setActiveMember(null);
        }}
      />
      <ExitModal
        visible={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        onLeave={handleLeave}
        onMinimize={handleMinimize}
        roomName={roomName}
      />
    </View>
  );
}
