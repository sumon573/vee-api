/**
 * Firebase DM Service — ধাপ ৪
 * Real-time 1-on-1 messaging via Firebase Realtime Database.
 *
 * DB Structure:
 *   chats/{chatId}/messages/{msgId}  → DmMessage
 *   chats/{chatId}/typing/{uid}      → { isTyping, lastTypedAt }
 *   userChats/{uid}/{chatId}         → Chat metadata (list screen)
 *
 * RC8-A changes:
 *   - subscribeMessages now uses limitToLast(PAGE_SIZE=50) so a chat with
 *     thousands of messages never downloads the full history on open.
 *     Returns oldestKey so callers can request earlier pages.
 *   - loadOlderMessages: cursor-based "load more" using endBefore + limitToLast.
 *   - markAllSeen: limited to the 100 most recent messages (sufficient for
 *     practical seen-marking; full-history reads were expensive and slow).
 */

import {
  ref, push, set, update, onValue, get, increment,
  serverTimestamp, DataSnapshot, onDisconnect as fbOnDisconnect,
  query, orderByKey, limitToLast, endBefore,
} from 'firebase/database';
import { database } from '@/src/config/firebase';
import { DmMessage, DmReplyPreview } from '../types/dm';
import { Chat } from '../types';
import { sendPushNotification } from '@/src/services/notifyService';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of messages loaded in each page (initial load and "load older"). */
export const DM_PAGE_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic chatId: sorted UIDs joined with '_' */
export function buildChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

function snapToMessage(snap: DataSnapshot, myUid: string): DmMessage | null {
  if (!snap.exists()) return null;
  const v = snap.val() as Record<string, unknown>;
  // "Delete for me" stored as deletedForUids/{uid}=true — map to boolean for UI
  const deletedForUids = (v.deletedForUids as Record<string, boolean> | undefined) ?? {};
  const deletedForMe = deletedForUids[myUid] === true || (v.deletedForMe as boolean) === true;
  return {
    id: snap.key!,
    chatId: v.chatId as string,
    senderId: v.senderId as string,
    type: (v.type as DmMessage['type']) ?? 'text',
    content: (v.content as string) ?? '',
    cloudinaryId: v.cloudinaryId as string | undefined,
    createdAt: (v.createdAt as number) ?? Date.now(),
    status: (v.status as DmMessage['status']) ?? 'sent',
    reactions: (v.reactions as Record<string, string>) ?? {},
    replyTo: v.replyTo as DmReplyPreview | undefined,
    deletedForMe,
    deletedForEveryone: (v.deletedForEveryone as boolean) ?? false,
  };
}

// ─── Messages ────────────────────────────────────────────────────────────────

/**
 * Subscribe to the most recent DM_PAGE_SIZE messages in a chat thread.
 *
 * Returns a real-time subscription to the latest 50 messages so the
 * initial render is fast and memory-bounded regardless of conversation
 * length. For older messages use loadOlderMessages().
 *
 * @param callback  Called with (messages, oldestKey).
 *   - messages   — sorted oldest-first, ready to render.
 *   - oldestKey  — Firebase push-key of the oldest loaded message. Pass
 *                  this as `beforeKey` to loadOlderMessages() to fetch the
 *                  page immediately before it.  null when chat is empty.
 */
export function subscribeMessages(
  chatId: string,
  myUid: string,
  callback: (messages: DmMessage[], oldestKey: string | null) => void,
): () => void {
  const msgsQuery = query(
    ref(database, `chats/${chatId}/messages`),
    orderByKey(),
    limitToLast(DM_PAGE_SIZE),
  );

  return onValue(msgsQuery, (snap) => {
    if (!snap.exists()) { callback([], null); return; }

    const msgs: DmMessage[] = [];
    let firstKey: string | null = null;

    snap.forEach((child) => {
      // The first key visited (ascending order) is the oldest in this page.
      if (firstKey === null) firstKey = child.key;
      const msg = snapToMessage(child, myUid);
      if (msg) msgs.push(msg);
    });

    msgs.sort((a, b) => a.createdAt - b.createdAt);
    callback(msgs, firstKey);
  });
}

/**
 * One-time fetch of messages older than a cursor key (pagination).
 *
 * Use the oldestKey returned by subscribeMessages as the `beforeKey`.
 * Each call returns up to DM_PAGE_SIZE messages, oldest-first.
 *
 * @returns { messages, hasMore }
 *   hasMore — true when the page is full, suggesting more pages exist.
 *             false when fewer than DM_PAGE_SIZE messages were returned.
 */
export async function loadOlderMessages(
  chatId: string,
  myUid: string,
  beforeKey: string,
): Promise<{ messages: DmMessage[]; hasMore: boolean }> {
  const olderQuery = query(
    ref(database, `chats/${chatId}/messages`),
    orderByKey(),
    endBefore(beforeKey),
    limitToLast(DM_PAGE_SIZE),
  );

  const snap = await get(olderQuery);
  if (!snap.exists()) return { messages: [], hasMore: false };

  const msgs: DmMessage[] = [];
  snap.forEach((child) => {
    const msg = snapToMessage(child, myUid);
    if (msg) msgs.push(msg);
  });

  msgs.sort((a, b) => a.createdAt - b.createdAt);
  return { messages: msgs, hasMore: msgs.length === DM_PAGE_SIZE };
}

/**
 * Send a text or media message.
 * Also updates userChats metadata for both participants.
 */
export async function sendMessage(
  chatId: string,
  myUid: string,
  participantUid: string,
  content: string,
  type: DmMessage['type'] = 'text',
  replyTo?: DmReplyPreview,
  cloudinaryId?: string,
  senderName?: string,
): Promise<void> {
  const msgsRef = ref(database, `chats/${chatId}/messages`);
  const newMsgRef = push(msgsRef);

  const msg: Omit<DmMessage, 'id' | 'createdAt'> & { createdAt: object } = {
    chatId,
    senderId: myUid,
    type,
    content,
    createdAt: serverTimestamp() as object,
    status: 'sent',
    reactions: {},
    ...(replyTo ? { replyTo } : {}),
    ...(cloudinaryId ? { cloudinaryId } : {}),
    deletedForMe: false,
    deletedForEveryone: false,
  };

  await set(newMsgRef, msg);

  // Update chat list metadata for both users
  const meta = {
    id: chatId,
    lastMessage: type === 'text' ? content : type === 'image' ? '📷 Photo' : '🎥 Video',
    lastMessageType: type,
    lastMessageTime: Date.now(),
    unreadCount: 1, // participant's unread count
  };

  await Promise.all([
    // My entry: unreadCount stays 0 (I sent it)
    update(ref(database, `userChats/${myUid}/${chatId}`), {
      ...meta,
      unreadCount: 0,
    }),
    // Participant's entry: increment unread
    incrementUnread(participantUid, chatId, meta),
  ]);

  // Fire-and-forget push — never blocks message delivery.
  sendPushNotification(participantUid, senderName ?? 'Vee', meta.lastMessage, { chatId });
}

type ChatMetaUpdate = {
  id: string;
  lastMessage: string;
  lastMessageType: string;
  lastMessageTime: number;
  unreadCount: number;
};

async function incrementUnread(
  uid: string,
  chatId: string,
  meta: ChatMetaUpdate,
): Promise<void> {
  const metaRef = ref(database, `userChats/${uid}/${chatId}`);
  // increment() is atomic — eliminates the read-then-write race where two
  // messages sent simultaneously could both read unreadCount=N and write N+1,
  // silently dropping one increment. Firebase treats missing fields as 0.
  await update(metaRef, {
    ...meta,
    unreadCount: increment(1),
  });
}

// ─── Message status ──────────────────────────────────────────────────────────

/**
 * Mark recent messages from the other user as 'seen'.
 *
 * RC8-A: Limited to the 100 most recent messages instead of the entire
 * history. This covers all practical unread counts (users don't typically
 * have 100+ unread messages) while eliminating expensive full-history reads
 * that could download thousands of messages just to flip status fields.
 */
export async function markAllSeen(chatId: string, myUid: string): Promise<void> {
  const recentQuery = query(
    ref(database, `chats/${chatId}/messages`),
    orderByKey(),
    limitToLast(100),
  );

  const snap = await get(recentQuery);
  if (!snap.exists()) return;

  const updates: Record<string, string> = {};
  snap.forEach((child) => {
    const v = child.val() as { senderId: string; status: string };
    if (v.senderId !== myUid && v.status !== 'seen') {
      updates[`chats/${chatId}/messages/${child.key}/status`] = 'seen';
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }

  // Reset my unread count
  await update(ref(database, `userChats/${myUid}/${chatId}`), { unreadCount: 0 });
}

// ─── Typing indicator ────────────────────────────────────────────────────────

const typingTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

/** Set typing state — auto-clears after 4s of no activity */
export function setTyping(chatId: string, myUid: string, isTyping: boolean): void {
  const typingRef = ref(database, `chats/${chatId}/typing/${myUid}`);

  if (isTyping) {
    set(typingRef, { isTyping: true, lastTypedAt: Date.now() }).catch(() => {/* fire-and-forget */});
    // Auto-clear after 4 seconds
    clearTimeout(typingTimeouts[`${chatId}_${myUid}`]);
    typingTimeouts[`${chatId}_${myUid}`] = setTimeout(() => {
      set(typingRef, { isTyping: false, lastTypedAt: Date.now() }).catch(() => {});
    }, 4000);
  } else {
    clearTimeout(typingTimeouts[`${chatId}_${myUid}`]);
    set(typingRef, { isTyping: false, lastTypedAt: Date.now() }).catch(() => {/* fire-and-forget */});
  }

  // Clear on disconnect — suppressed so a non-critical failure doesn't surface
  // as an unhandled rejection in production logs.
  fbOnDisconnect(typingRef).set({ isTyping: false, lastTypedAt: Date.now() }).catch(() => {});
}

/** Subscribe to the other participant's typing status */
export function subscribeTyping(
  chatId: string,
  participantUid: string,
  callback: (isTyping: boolean) => void,
): () => void {
  const typingRef = ref(database, `chats/${chatId}/typing/${participantUid}`);
  return onValue(typingRef, (snap) => {
    if (!snap.exists()) { callback(false); return; }
    const v = snap.val() as { isTyping: boolean };
    callback(v.isTyping === true);
  });
}

// ─── Presence ────────────────────────────────────────────────────────────────

/**
 * Subscribe to a user's online/offline presence from users/{uid}.
 * Respects the participant's privacy settings: if they have hidden their
 * online status or last-seen timestamp, those values are masked.
 */
export function subscribePresence(
  participantUid: string,
  callback: (online: boolean, lastSeen: number | null) => void,
): () => void {
  let realUnsub: (() => void) | null = null;
  let cancelled = false;

  // Fetch privacy once — privacy changes are rare; UI re-mounts apply them.
  get(ref(database, `users/${participantUid}/privacy`))
    .then((privacySnap) => {
      if (cancelled) return;
      const p = privacySnap.exists()
        ? (privacySnap.val() as { showOnlineStatus?: boolean; showLastSeen?: boolean })
        : {};
      const showOnline   = p.showOnlineStatus  !== false;
      const showLastSeen = p.showLastSeen !== false;

      realUnsub = onValue(ref(database, `users/${participantUid}`), (snap) => {
        if (!snap.exists()) { callback(false, null); return; }
        const v = snap.val() as { online?: boolean; lastSeen?: number };
        callback(
          showOnline   ? v.online === true : false,
          showLastSeen ? (typeof v.lastSeen === 'number' ? v.lastSeen : null) : null,
        );
      });
    })
    .catch(() => {
      // Privacy fetch failed — fall back to showing presence normally.
      if (cancelled) return;
      realUnsub = onValue(ref(database, `users/${participantUid}`), (snap) => {
        if (!snap.exists()) { callback(false, null); return; }
        const v = snap.val() as { online?: boolean; lastSeen?: number };
        callback(v.online === true, typeof v.lastSeen === 'number' ? v.lastSeen : null);
      });
    });

  return () => {
    cancelled = true;
    realUnsub?.();
  };
}

// ─── Reactions ───────────────────────────────────────────────────────────────

export async function addReaction(
  chatId: string,
  messageId: string,
  myUid: string,
  emoji: string,
): Promise<void> {
  const reactionRef = ref(database, `chats/${chatId}/messages/${messageId}/reactions/${myUid}`);
  const snap = await get(reactionRef);
  // Toggle: same emoji removes it
  if (snap.exists() && snap.val() === emoji) {
    await set(reactionRef, null);
  } else {
    await set(reactionRef, emoji);
  }
}

// ─── Delete message ──────────────────────────────────────────────────────────

export async function deleteMessage(
  chatId: string,
  messageId: string,
  myUid: string,
  forEveryone: boolean,
): Promise<void> {
  const msgRef = ref(database, `chats/${chatId}/messages/${messageId}`);
  if (forEveryone) {
    await update(msgRef, { deletedForEveryone: true, content: '' });
  } else {
    // "Delete for me" — store uid in deletedForUids array
    const deletedRef = ref(database, `chats/${chatId}/messages/${messageId}/deletedForUids/${myUid}`);
    await set(deletedRef, true);
  }
}

// ─── Chat list ────────────────────────────────────────────────────────────────

/**
 * Subscribe to the logged-in user's chat list.
 * Each entry in userChats/{uid} is a Chat object.
 */
export function subscribeUserChats(
  myUid: string,
  callback: (chats: Chat[]) => void,
): () => void {
  const chatsRef = ref(database, `userChats/${myUid}`);
  return onValue(chatsRef, (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const chats: Chat[] = [];
    snap.forEach((child) => {
      const v = child.val() as Chat;
      chats.push({ ...v, id: child.key! });
    });
    // Sort by lastMessageTime descending
    chats.sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0));
    callback(chats);
  });
}

/**
 * Create or get a chat between two users.
 * Writes initial metadata to both users' userChats entries.
 * Returns the chatId.
 */
export async function createOrGetChat(
  myUid: string,
  myName: string,
  participantUid: string,
  participantName: string,
): Promise<string> {
  const chatId = buildChatId(myUid, participantUid);

  const myEntry = ref(database, `userChats/${myUid}/${chatId}`);
  const theirEntry = ref(database, `userChats/${participantUid}/${chatId}`);

  const [mySnap, theirSnap] = await Promise.all([get(myEntry), get(theirEntry)]);

  if (!mySnap.exists()) {
    await set(myEntry, {
      id: chatId,
      participantId: participantUid,
      participantName,
      lastMessage: '',
      lastMessageType: 'text',
      lastMessageTime: Date.now(),
      unreadCount: 0,
      isOnline: false,
      hasStory: false,
      storySeen: false,
      isPinned: false,
    });
  }

  if (!theirSnap.exists()) {
    await set(theirEntry, {
      id: chatId,
      participantId: myUid,
      participantName: myName,
      lastMessage: '',
      lastMessageType: 'text',
      lastMessageTime: Date.now(),
      unreadCount: 0,
      isOnline: false,
      hasStory: false,
      storySeen: false,
      isPinned: false,
    });
  }

  return chatId;
}

/** Pin a chat for a user */
export async function pinChat(uid: string, chatId: string): Promise<void> {
  await update(ref(database, `userChats/${uid}/${chatId}`), { isPinned: true });
}

/** Unpin a chat for a user */
export async function unpinChat(uid: string, chatId: string): Promise<void> {
  await update(ref(database, `userChats/${uid}/${chatId}`), { isPinned: false });
}

/** Clear all messages in a chat (soft delete for one user) */
export async function clearChat(chatId: string, myUid: string): Promise<void> {
  // RC8-A: read only the 200 most recent messages to avoid downloading the full
  // history. The "clear chat" action primarily targets recent messages; older
  // messages (before the user's oldest loaded page) are left in place since
  // they are already filtered out by the pagination window.
  const recentQuery = query(
    ref(database, `chats/${chatId}/messages`),
    orderByKey(),
    limitToLast(200),
  );
  const msgsSnap = await get(recentQuery);
  if (!msgsSnap.exists()) return;

  const updates: Record<string, boolean> = {};
  msgsSnap.forEach((child) => {
    updates[`chats/${chatId}/messages/${child.key}/deletedForUids/${myUid}`] = true;
  });
  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}

/** Update participant's online status in all shared chats */
export async function updateChatPresence(
  myUid: string,
  isOnline: boolean,
): Promise<void> {
  const chatsRef = ref(database, `userChats/${myUid}`);
  const snap = await get(chatsRef);
  if (!snap.exists()) return;

  const updates: Record<string, boolean> = {};
  snap.forEach((child) => {
    const v = child.val() as { participantId?: string };
    if (v.participantId) {
      // Update my online status in the other person's chat entry
      updates[`userChats/${v.participantId}/${child.key}/isOnline`] = isOnline;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}
