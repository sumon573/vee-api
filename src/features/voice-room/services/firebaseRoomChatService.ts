/**
 * Firebase Voice Room Chat Service
 * Real-time room chat messages stored in Firebase Realtime DB.
 *
 * Fix: Comment-block enforcement — sendRoomChatMsg now checks Firebase
 * roomBlocks before writing. If the sender is comment-blocked or room-blocked,
 * the write is rejected with a thrown Error so the caller can show feedback.
 * System messages (senderId === 'system') bypass this check.
 *
 * DB Structure:
 *   rooms/{roomId}/chat/{msgId} → RoomChatMsg
 *   roomBlocks/{roomId}/{userId} → RoomBlockRecord
 */

import { ref, push, set, get, onValue, query, limitToLast, orderByKey, endBefore } from 'firebase/database';
import { database } from '@/src/config/firebase';

export type RoomChatMsg = {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  isMe?: boolean; // resolved client-side
  ts: number;
  replyTo?: {
    sender: string;
    text: string;
    color: string;
  };
};

/**
 * Fix 11: Load a batch of messages older than the given message key.
 * Used for "Load earlier" pagination in the chat panel.
 */
export async function loadOlderMessages(
  roomId: string,
  myUid: string,
  beforeKey: string,
  limit = 30,
): Promise<RoomChatMsg[]> {
  const q = query(
    ref(database, `rooms/${roomId}/chat`),
    orderByKey(),
    endBefore(beforeKey),
    limitToLast(limit),
  );
  const snap = await get(q);
  if (!snap.exists()) return [];
  const msgs: RoomChatMsg[] = [];
  snap.forEach((child) => {
    const v = child.val() as Omit<RoomChatMsg, 'id' | 'isMe'>;
    msgs.push({ ...v, id: child.key!, isMe: v.senderId === myUid });
  });
  msgs.sort((a, b) => a.ts - b.ts);
  return msgs;
}

/** Subscribe to room chat (last 50 messages). */
export function subscribeRoomChat(
  roomId: string,
  myUid: string,
  callback: (msgs: RoomChatMsg[]) => void,
): () => void {
  const chatRef = query(
    ref(database, `rooms/${roomId}/chat`),
    limitToLast(15),
  );
  return onValue(chatRef, (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const msgs: RoomChatMsg[] = [];
    snap.forEach((child) => {
      const v = child.val() as Omit<RoomChatMsg, 'id' | 'isMe'>;
      msgs.push({
        ...v,
        id: child.key!,
        isMe: v.senderId === myUid,
      });
    });
    msgs.sort((a, b) => a.ts - b.ts);
    callback(msgs);
  });
}

/**
 * Send a chat message to the room.
 *
 * Comment-block enforcement: non-system senders are checked against
 * roomBlocks/{roomId}/{senderId} before the write. A 'comment-block' or
 * 'room-block' record causes this function to throw so the UI can notify
 * the user. System messages (join/leave/gift) always go through.
 *
 * @throws {Error} if the sender is blocked from sending messages.
 */
export async function sendRoomChatMsg(
  roomId: string,
  msg: Omit<RoomChatMsg, 'id' | 'isMe'>,
): Promise<void> {
  // System messages (join/leave/gift notifications) always go through
  if (msg.senderId !== 'system') {
    const blockSnap = await get(ref(database, `roomBlocks/${roomId}/${msg.senderId}`));
    if (blockSnap.exists()) {
      const block = blockSnap.val() as { action: string };
      // Both room-block and comment-block prevent chat messages
      if (block.action === 'comment-block' || block.action === 'room-block') {
        throw new Error('blocked');
      }
    }
  }
  const msgRef = push(ref(database, `rooms/${roomId}/chat`));
  await set(msgRef, msg);
}
