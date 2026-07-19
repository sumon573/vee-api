/**
 * Friend Request Service — Firebase Realtime Database
 *
 * DB Structure:
 *   friendRequests/{toUid}/{fromUid}   → { fromUid, fromName, fromVId, fromPhoto, ts, status: 'pending' }
 *   sentRequests/{fromUid}/{toUid}     → true   (mirror, for fast "already sent" lookups)
 *   friends/{uid}/{friendUid}          → true   (mutual — written on both sides on accept)
 *
 * This is intentionally separate from `followService.ts` (one-directional
 * follow/follower graph) — friendship requires mutual acceptance and powers
 * the Contacts list + direct chat entry point.
 */

import {
  ref, set, remove, get, onValue, update,
} from 'firebase/database';
import { database } from '../config/firebase';
import { VeeUser } from './userService';
import { sendPushNotification } from './notifyService';

export type FriendRequest = {
  fromUid: string;
  fromName: string;
  fromVId: string;
  fromPhoto: string;
  ts: number;
  status: 'pending';
};

export type FriendStatus = 'none' | 'self' | 'friends' | 'request-sent' | 'request-received';

// ─── Send / Cancel ────────────────────────────────────────────────────────

/** Send a friend request. Throws if already friends, already pending, or self. */
export async function sendFriendRequest(me: VeeUser, targetUid: string): Promise<void> {
  if (!me.uid || !targetUid) throw new Error('Invalid users.');
  if (me.uid === targetUid) throw new Error('You cannot send a friend request to yourself.');

  const [friendSnap, alreadySentSnap, incomingSnap] = await Promise.all([
    get(ref(database, `friends/${me.uid}/${targetUid}`)),
    get(ref(database, `sentRequests/${me.uid}/${targetUid}`)),
    get(ref(database, `friendRequests/${me.uid}/${targetUid}`)),
  ]);

  if (friendSnap.exists()) throw new Error('You are already friends.');
  if (alreadySentSnap.exists()) throw new Error('Friend request already sent.');
  if (incomingSnap.exists()) throw new Error('This user has already sent you a friend request.');

  const request: FriendRequest = {
    fromUid: me.uid,
    fromName: me.name,
    fromVId: me.vId,
    fromPhoto: me.photoURL || '',
    ts: Date.now(),
    status: 'pending',
  };

  await Promise.all([
    set(ref(database, `friendRequests/${targetUid}/${me.uid}`), request),
    set(ref(database, `sentRequests/${me.uid}/${targetUid}`), true),
  ]);

  sendPushNotification(targetUid, me.name, 'sent you a friend request', {
    type: 'friend-request',
    fromUid: me.uid,
  });
}

/** Cancel a request I previously sent. */
export async function cancelFriendRequest(myUid: string, targetUid: string): Promise<void> {
  await Promise.all([
    remove(ref(database, `friendRequests/${targetUid}/${myUid}`)),
    remove(ref(database, `sentRequests/${myUid}/${targetUid}`)),
  ]);
}

// ─── Accept / Reject ──────────────────────────────────────────────────────

/** Accept an incoming request from `fromUid`. Adds both users to each other's friends list. */
export async function acceptFriendRequest(myUid: string, fromUid: string): Promise<void> {
  await Promise.all([
    set(ref(database, `friends/${myUid}/${fromUid}`), true),
    set(ref(database, `friends/${fromUid}/${myUid}`), true),
    remove(ref(database, `friendRequests/${myUid}/${fromUid}`)),
    remove(ref(database, `sentRequests/${fromUid}/${myUid}`)),
  ]);

  // Notify the original requester that their request was accepted.
  // Fire-and-forget — failure must not block the friend accept operation.
  get(ref(database, `users/${myUid}/name`))
    .then((snap) => {
      const name = (snap.val() as string | null) ?? 'Someone';
      sendPushNotification(fromUid, name, 'accepted your friend request 🎉', {
        type: 'friend-request-accepted',
        fromUid: myUid,
      });
    })
    .catch(() => {/* non-critical — notification is best-effort */});
}

/** Reject (decline) an incoming request from `fromUid`. */
export async function rejectFriendRequest(myUid: string, fromUid: string): Promise<void> {
  await Promise.all([
    remove(ref(database, `friendRequests/${myUid}/${fromUid}`)),
    remove(ref(database, `sentRequests/${fromUid}/${myUid}`)),
  ]);
}

/** Remove an existing friendship (unfriend). */
export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  await Promise.all([
    remove(ref(database, `friends/${myUid}/${friendUid}`)),
    remove(ref(database, `friends/${friendUid}/${myUid}`)),
  ]);
}

// ─── Queries ──────────────────────────────────────────────────────────────

/** One-time check of the relationship between `myUid` and `targetUid`. */
export async function getFriendStatus(myUid: string, targetUid: string): Promise<FriendStatus> {
  if (!myUid || !targetUid) return 'none';
  if (myUid === targetUid) return 'self';

  const [friendSnap, sentSnap, receivedSnap] = await Promise.all([
    get(ref(database, `friends/${myUid}/${targetUid}`)),
    get(ref(database, `sentRequests/${myUid}/${targetUid}`)),
    get(ref(database, `friendRequests/${myUid}/${targetUid}`)),
  ]);

  if (friendSnap.exists()) return 'friends';
  if (sentSnap.exists()) return 'request-sent';
  if (receivedSnap.exists()) return 'request-received';
  return 'none';
}

/** Subscribe to the live relationship status between `myUid` and `targetUid`. */
export function subscribeFriendStatus(
  myUid: string,
  targetUid: string,
  callback: (status: FriendStatus) => void,
): () => void {
  if (!myUid || !targetUid) { callback('none'); return () => {}; }
  if (myUid === targetUid) { callback('self'); return () => {}; }

  let isFriend = false;
  let sent = false;
  let received = false;

  const emit = () => {
    if (isFriend) callback('friends');
    else if (sent) callback('request-sent');
    else if (received) callback('request-received');
    else callback('none');
  };

  const unsubFriend = onValue(ref(database, `friends/${myUid}/${targetUid}`), (snap) => {
    isFriend = snap.exists();
    emit();
  });
  const unsubSent = onValue(ref(database, `sentRequests/${myUid}/${targetUid}`), (snap) => {
    sent = snap.exists();
    emit();
  });
  const unsubReceived = onValue(ref(database, `friendRequests/${myUid}/${targetUid}`), (snap) => {
    received = snap.exists();
    emit();
  });

  return () => {
    unsubFriend();
    unsubSent();
    unsubReceived();
  };
}

/** Subscribe to incoming (received) pending friend requests. */
export function subscribeIncomingRequests(
  myUid: string,
  callback: (requests: FriendRequest[]) => void,
): () => void {
  return onValue(ref(database, `friendRequests/${myUid}`), (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const requests: FriendRequest[] = [];
    snap.forEach((child) => {
      requests.push(child.val() as FriendRequest);
    });
    requests.sort((a, b) => b.ts - a.ts);
    callback(requests);
  });
}

/** Subscribe to my full friends list (uids only). */
export function subscribeFriendUids(
  myUid: string,
  callback: (uids: string[]) => void,
): () => void {
  return onValue(ref(database, `friends/${myUid}`), (snap) => {
    if (!snap.exists()) { callback([]); return; }
    callback(Object.keys(snap.val() as Record<string, boolean>));
  });
}

/** Subscribe to the uids of users I sent friend requests to (sentRequests/{myUid}). */
export function subscribeSentRequestUids(
  myUid: string,
  callback: (uids: string[]) => void,
): () => void {
  return onValue(ref(database, `sentRequests/${myUid}`), (snap) => {
    if (!snap.exists()) { callback([]); return; }
    callback(Object.keys(snap.val() as Record<string, boolean>));
  });
}
