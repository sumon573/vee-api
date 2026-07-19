/**
 * Block Service — Firebase Realtime Database
 *
 * DB Structure:
 *   userBlocks/{myUid}/{targetUid} → BlockRecord
 *
 * This is a user-level block (different from room-level roomBlocks).
 * Blocked users cannot send messages or view profile.
 */

import { ref, set, remove, get, onValue } from 'firebase/database';
import { database } from '../config/firebase';

export type BlockRecord = {
  targetUid: string;
  targetName: string;
  targetAvatar?: string;
  blockedAt: number;
};

/** Block a user globally. */
export async function blockUser(
  myUid: string,
  targetUid: string,
  targetName: string,
  targetAvatar?: string,
): Promise<void> {
  const record: BlockRecord = {
    targetUid,
    targetName,
    ...(targetAvatar ? { targetAvatar } : {}),
    blockedAt: Date.now(),
  };
  await set(ref(database, `userBlocks/${myUid}/${targetUid}`), record);
}

/** Unblock a user. */
export async function unblockUser(myUid: string, targetUid: string): Promise<void> {
  await remove(ref(database, `userBlocks/${myUid}/${targetUid}`));
}

/** One-time check: have I blocked this user? */
export async function isBlockedByMe(myUid: string, targetUid: string): Promise<boolean> {
  const snap = await get(ref(database, `userBlocks/${myUid}/${targetUid}`));
  return snap.exists();
}

/** Subscribe to my blocked users list in real-time. */
export function subscribeBlockedUsers(
  myUid: string,
  callback: (blocks: BlockRecord[]) => void,
): () => void {
  return onValue(
    ref(database, `userBlocks/${myUid}`),
    (snap) => {
      if (!snap.exists()) { callback([]); return; }
      const records: BlockRecord[] = [];
      snap.forEach((child) => {
        records.push(child.val() as BlockRecord);
      });
      records.sort((a, b) => b.blockedAt - a.blockedAt);
      callback(records);
    },
    () => { callback([]); },
  );
}
