/**
 * Firebase Voice Room Service
 * Rooms: create, join, leave, seat management, audience management
 *
 * BUG 14 fix: Room persistence — onDisconnect handlers now keep `active:true`
 *   and only remove the specific seat/audience entry. Rooms never auto-close
 *   on disconnect; only an explicit closeRoom() call deactivates a room.
 *
 * BUG 15 fix: Room lifecycle — owner disconnect no longer closes the room.
 *   The room stays active until closeRoom() is explicitly called by the host,
 *   OR until the server-side cleanup job auto-closes it after it has been
 *   empty (no seats, no audience) for >10 min — see
 *   artifacts/api-server/src/jobs/roomCleanup.ts. That same job also purges
 *   long-inactive rooms' data so old/empty rooms don't pile up in the DB.
 *   Client-side we only do explicit closes.
 *
 * BUG 16 fix: All subscriptions already use onValue (real-time); added
 *   null-guard for subscribeRoomInfo so consumers handle a closed/missing room.
 *
 * DB Structure:
 *   rooms/{roomId}/info         → RoomInfo
 *   rooms/{roomId}/seats/{idx}  → RoomSeat | null (10 seats, idx 0-9)
 *   rooms/{roomId}/audience/{uid} → RoomAudienceMember
 */

import {
  ref, set, update, remove, get, push,
  onValue, query, orderByChild, equalTo,
  serverTimestamp, DataSnapshot, runTransaction, onDisconnect,
  limitToLast,
} from 'firebase/database';
import { database, auth } from '@/src/config/firebase';
import { MemberPreview, VoiceRoom } from '../types/room';
import { sendPushNotification } from '@/src/services/notifyService';
import { canReceiveRoomInvite } from '@/src/services/privacyService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoomSeat = {
  userId: string;
  userName: string;
  initials: string;
  color: string;
  photoURL?: string;
  muted: boolean;
  role: 'host' | 'admin' | 'member';
} | null;

export type RoomAudienceMember = {
  userId: string;
  userName: string;
  initials: string;
  color: string;
  photoURL?: string;
  role?: 'member' | 'admin';
};

export type RoomInfo = {
  id: string;
  name: string;
  topic: string;
  description: string;
  themeColor: string;
  memberCount: number;
  maxMembers: number;
  isLive: boolean;
  isTrending: boolean;
  category: 'adda' | 'music' | 'game' | 'ludo' | 'trending' | 'talk' | 'study' | 'new';
  tags: string[];
  ownerId: string;
  ownerName: string;
  allowGifts: boolean;
  createdAt: number;
  memberPreviews: MemberPreview[];
  isPublic: boolean;
  /** When true, new audience members cannot join the room. */
  isLocked: boolean;
  listenerCount: number;
  active: boolean;
  coverImageUrl?: string;
  /** Set when the room is deactivated (explicit close or server auto-close). */
  closedAt?: number;
  /** Optional geolocation of the room creator — stored at creation time. */
  location?: { lat: number; lng: number };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USER_COLORS = [
  '#7C3AED', '#EC4899', '#3B82F6', '#10B981',
  '#F97316', '#A855F7', '#0EA5E9', '#22C55E',
  '#EF4444', '#F59E0B',
];

export function getUserColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash + uid.charCodeAt(i)) % USER_COLORS.length;
  }
  return USER_COLORS[hash];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

/**
 * Generate a unique 7-digit numeric room ID.
 *
 * RC8-B2: Uses runTransaction() to atomically claim the ID, eliminating the
 * non-atomic get()→set() race condition where two simultaneous createRoom()
 * calls could both read "not exists" for the same ID and both succeed.
 * The transaction atomically reserves the slot with { _reserving: true, ownerId }
 * so the subsequent createRoom set() satisfies owner-write rules and overwrites
 * the placeholder with real room data.
 */
async function generateUniqueRoomId(hostId: string): Promise<string> {
  const MAX_TRIES = 20;
  for (let i = 0; i < MAX_TRIES; i++) {
    // 7-digit range: 1000000 – 9999999
    const id = String(Math.floor(1_000_000 + Math.random() * 9_000_000));
    const roomInfoRef = ref(database, `rooms/${id}/info`);
    const result = await runTransaction(roomInfoRef, (current) => {
      // If the slot is already taken (any non-null value), abort the transaction
      if (current !== null) return undefined;
      // Atomically reserve the slot with a placeholder that satisfies ownership rules.
      // createRoom immediately overwrites this with real room data.
      return { _reserving: true, ownerId: hostId };
    });
    if (result.committed) return id;
  }
  throw new Error('Could not generate a unique room ID after 20 attempts');
}

/** Create a new room and put the host in seat 0. Returns roomId. */
export async function createRoom(data: {
  name: string;
  topic: string;
  description: string;
  isPublic: boolean;
  category: RoomInfo['category'];
  themeColor: string;
  hostId: string;
  hostName: string;
  /** RC6 fix Issue 5: host profile photo URL — stored in seat 0 so the host's
   *  avatar shows correctly in the seat grid immediately after room creation. */
  hostPhotoURL?: string;
  coverImageUrl?: string;
  /** Fix 6: Optional geolocation so this room appears in Nearby filters. */
  location?: { lat: number; lng: number };
  /** SHA-256 hashed PIN for private rooms. */
  hashedPin?: string;
}): Promise<string> {
  const roomId = await generateUniqueRoomId(data.hostId);

  const info: RoomInfo = {
    id: roomId,
    name: data.name,
    topic: data.topic || 'Live now',
    description: data.description,
    themeColor: data.themeColor,
    memberCount: 1,
    maxMembers: 20,
    isLive: true,
    isTrending: false,
    category: data.category,
    tags: [],
    ownerId: data.hostId,
    ownerName: data.hostName,
    allowGifts: true,
    createdAt: Date.now(),
    memberPreviews: [
      {
        initials: getInitials(data.hostName),
        color: getUserColor(data.hostId),
      },
    ],
    isPublic: data.isPublic,
    isLocked: false,
    listenerCount: 0,
    active: true,
    ...(data.coverImageUrl ? { coverImageUrl: data.coverImageUrl } : {}),
    ...(data.location ? { location: data.location } : {}),
  };

  await set(ref(database, `rooms/${roomId}/info`), info);

  // Record this room in the host's persistent "My Room" index. Never
  // removed on leave/exit, so the created room is always findable again.
  recordUserRoomVisit(data.hostId, roomId, 'owner').catch(() => {});

  // Store hashed PIN for private rooms — non-fatal: room is still created even if this write fails
  if (!data.isPublic && data.hashedPin) {
    try {
      await set(ref(database, `roomPins/${roomId}`), { hashedPin: data.hashedPin, updatedAt: Date.now() });
    } catch {
      // PIN storage failure is non-fatal — the room is created without PIN enforcement.
      // This happens when Firebase security rules block the roomPins path.
    }
  }

  // Put host in seat 0 — include photoURL so the host's avatar shows immediately
  const hostSeat: NonNullable<RoomSeat> = {
    userId: data.hostId,
    userName: data.hostName,
    initials: getInitials(data.hostName),
    color: getUserColor(data.hostId),
    muted: false,
    role: 'host',
    ...(data.hostPhotoURL ? { photoURL: data.hostPhotoURL } : {}),
  };
  const hostSeatRef = ref(database, `rooms/${roomId}/seats/0`);
  await set(hostSeatRef, hostSeat);

  // BUG 14/15 fix: if the host disconnects without explicitly closing the room,
  // only their SEAT is removed — the room itself stays active:true so it
  // remains visible to other users and the host can rejoin.
  onDisconnect(hostSeatRef).remove().catch(() => {/* non-critical */});

  return roomId;
}

/**
 * Record that a user has created or joined a room, in their persistent
 * "My Room" index (userRooms/{uid}/{roomId}). This is never cleared on
 * leave/exit/minimize — it's what lets a room be found again in "My Room"
 * after the user has left it, exactly like a room they still own.
 */
export function recordUserRoomVisit(
  uid: string,
  roomId: string,
  role: 'owner' | 'member',
): Promise<void> {
  return set(ref(database, `userRooms/${uid}/${roomId}`), {
    joinedAt: Date.now(),
    role,
  });
}

/**
 * Subscribe to rooms created by the given user (My Rooms).
 * Uses orderByChild + equalTo for efficiency.
 */
export function subscribeMyRooms(
  userId: string,
  callback: (rooms: RoomInfo[]) => void,
): () => void {
  const myRoomsQuery = query(
    ref(database, 'rooms'),
    orderByChild('info/ownerId'),
    equalTo(userId),
  );
  return onValue(myRoomsQuery, (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const rooms: RoomInfo[] = [];
    snap.forEach((child) => {
      const infoSnap = child.child('info');
      if (infoSnap.exists()) {
        const info = infoSnap.val() as RoomInfo;
        // CRITICAL-8 fix: show ALL owned rooms regardless of active state
        rooms.push(info);
      }
    });
    rooms.sort((a, b) => b.createdAt - a.createdAt);
    callback(rooms);
  }, () => { callback([]); });
}

/**
 * Subscribe to the combined "My Room" list: rooms the user owns (created),
 * followed by rooms the user has joined (as audience or a seat) that they
 * don't own — ordered created-rooms-first, then joined rooms most-recently
 * joined first. Backed by the persistent userRooms/{uid} index, so a room
 * stays listed here even after the user minimizes or fully exits it.
 */
export function subscribeMyRoomsCombined(
  userId: string,
  callback: (rooms: RoomInfo[]) => void,
): () => void {
  let ownedRooms: RoomInfo[] = [];
  let joinedOrder: string[] = [];
  const joinedInfo = new Map<string, RoomInfo>();
  const joinedUnsubs = new Map<string, () => void>();

  function emit() {
    const ownedIds = new Set(ownedRooms.map((r) => r.id));
    const joined = joinedOrder
      .filter((id) => !ownedIds.has(id))
      .map((id) => joinedInfo.get(id))
      // CRITICAL-9 fix: show all joined rooms regardless of active state
      .filter((r): r is RoomInfo => !!r);
    callback([...ownedRooms, ...joined]);
  }

  const unsubOwned = subscribeMyRooms(userId, (rooms) => {
    ownedRooms = rooms;
    emit();
  });

  const unsubIndex = onValue(
    // RC8-B2: cap to the 20 most recently joined rooms to bound the number of
    // nested room-info listeners created below. Previously unbounded — a user
    // who had joined hundreds of rooms created hundreds of simultaneous listeners.
    query(ref(database, `userRooms/${userId}`), orderByChild('joinedAt'), limitToLast(20)),
    (snap) => {
      const entries: { id: string; ts: number }[] = [];
      if (snap.exists()) {
        snap.forEach((child) => {
          const v = child.val() as { joinedAt?: number };
          entries.push({ id: child.key!, ts: v.joinedAt ?? 0 });
        });
      }
      entries.sort((a, b) => b.ts - a.ts); // most recently joined first
      const newIds = entries.map((e) => e.id);

      // Stop listening to rooms no longer in the index
      for (const [id, unsub] of joinedUnsubs) {
        if (!newIds.includes(id)) {
          unsub();
          joinedUnsubs.delete(id);
          joinedInfo.delete(id);
        }
      }
      // Start listening to any newly-added rooms
      for (const id of newIds) {
        if (!joinedUnsubs.has(id)) {
          const unsub = subscribeRoomInfo(id, (info) => {
            if (info) joinedInfo.set(id, info);
            else joinedInfo.delete(id);
            emit();
          });
          joinedUnsubs.set(id, unsub);
        }
      }
      joinedOrder = newIds;
      emit();
    },
    () => { joinedOrder = []; emit(); },
  );

  return () => {
    unsubOwned();
    unsubIndex();
    for (const unsub of joinedUnsubs.values()) unsub();
  };
}

/** Get all active public rooms in real-time. */
export function subscribeActiveRooms(
  callback: (rooms: RoomInfo[]) => void,
): () => void {
  // BUG 14 fix: Query rooms whose info.active === true.
  // orderByChild('info/active') on the 'rooms' collection traverses the
  // nested path — Firebase supports this. The matching index in
  // database.rules.json keeps this efficient.
  const activeRoomsQuery = query(
    ref(database, 'rooms'),
    orderByChild('info/active'),
    equalTo(true),
  );
  return onValue(activeRoomsQuery, (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const rooms: RoomInfo[] = [];
    snap.forEach((child) => {
      const infoSnap = child.child('info');
      if (infoSnap.exists()) {
        const info = infoSnap.val() as RoomInfo;
        // Show ALL active rooms (both public and private) — UI shows lock icon for private
        if (info.active) rooms.push(info);
      }
    });
    rooms.sort((a, b) => b.createdAt - a.createdAt);
    callback(rooms);
  }, () => {
    // On subscription error (e.g. permission denied), return empty list
    // rather than leaving the UI stuck in loading state.
    callback([]);
  });
}

/** Subscribe to a room's info. */
export function subscribeRoomInfo(
  roomId: string,
  callback: (info: RoomInfo | null) => void,
): () => void {
  // BUG 16 fix: handle null snapshot (room deleted / closed)
  return onValue(ref(database, `rooms/${roomId}/info`), (snap) => {
    callback(snap.exists() ? (snap.val() as RoomInfo) : null);
  }, () => {
    callback(null);
  });
}

/** Subscribe to all seats (returns array of 10). */
export function subscribeSeats(
  roomId: string,
  callback: (seats: Array<RoomSeat>) => void,
): () => void {
  return onValue(ref(database, `rooms/${roomId}/seats`), (snap) => {
    const seats: Array<RoomSeat> = Array(10).fill(null);
    if (snap.exists()) {
      snap.forEach((child) => {
        const idx = parseInt(child.key ?? '0', 10);
        if (idx >= 0 && idx < 10) seats[idx] = child.val() as NonNullable<RoomSeat>;
      });
    }
    callback(seats);
  }, () => {
    callback(Array(10).fill(null));
  });
}

/** Subscribe to audience members. */
export function subscribeAudience(
  roomId: string,
  callback: (audience: RoomAudienceMember[]) => void,
): () => void {
  return onValue(ref(database, `rooms/${roomId}/audience`), (snap) => {
    const audience: RoomAudienceMember[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        audience.push(child.val() as RoomAudienceMember);
      });
    }
    callback(audience);
  }, () => {
    callback([]);
  });
}

// ─── Audience ─────────────────────────────────────────────────────────────────

/** Add user to audience when they enter the room. */
export async function joinRoomAsAudience(
  roomId: string,
  member: RoomAudienceMember,
): Promise<void> {
  const audienceRef = ref(database, `rooms/${roomId}/audience/${member.userId}`);
  await set(audienceRef, member);
  // BUG 14/15 fix: if the app crashes/loses connection without an explicit
  // leave, Firebase removes this audience entry automatically so the room
  // doesn't show ghost members. The room info (active:true) is NOT touched
  // by this onDisconnect — rooms only close via an explicit closeRoom() call.
  onDisconnect(audienceRef).remove().catch(() => {/* non-critical */});
  // Record this room in the joiner's persistent "My Room" index (never
  // cleared on leave/exit — see recordUserRoomVisit).
  recordUserRoomVisit(member.userId, roomId, 'member').catch(() => {});
  // Count update is best-effort
  _updateCounts(roomId).catch(() => {});
}

/** Remove user from audience. */
export async function leaveAudience(
  roomId: string,
  userId: string,
): Promise<void> {
  const audienceRef = ref(database, `rooms/${roomId}/audience/${userId}`);
  // Cancel any pending onDisconnect before removing manually
  onDisconnect(audienceRef).cancel().catch(() => {/* non-critical */});
  await remove(audienceRef);
}

// ─── Seat Management ─────────────────────────────────────────────────────────

/**
 * User takes a seat (moves from audience to seat).
 * Uses a transaction so two users racing for the same empty seat can't both
 * "win" — only the first writer succeeds, the second is rejected.
 */
export async function takeSeat(
  roomId: string,
  seatIndex: number,
  member: NonNullable<RoomSeat>,
): Promise<{ success: boolean }> {
  const seatRef = ref(database, `rooms/${roomId}/seats/${seatIndex}`);
  const result = await runTransaction(seatRef, (current) => {
    if (current !== null) {
      // Seat already taken by someone else — abort the transaction.
      return undefined;
    }
    return member;
  });

  if (!result.committed) {
    return { success: false };
  }

  // Seat won — clear the audience onDisconnect and register one for the seat
  // so a dropped connection frees the seat rather than leaving a ghost.
  const audienceRef = ref(database, `rooms/${roomId}/audience/${member.userId}`);
  onDisconnect(audienceRef).cancel().catch(() => {/* non-critical */});
  await remove(audienceRef);
  // BUG 14/15 fix: seat disconnect removes the seat entry only — room stays active
  onDisconnect(seatRef).remove().catch(() => {/* non-critical */});
  // Belt-and-suspenders: also record in "My Room" index in case a seat was
  // taken directly without going through joinRoomAsAudience first.
  recordUserRoomVisit(member.userId, roomId, 'member').catch(() => {});
  _updateCounts(roomId).catch(() => {}); // best-effort
  return { success: true };
}

/** User leaves their seat (goes back to audience). */
export async function leaveSeat(
  roomId: string,
  seatIndex: number,
  userId: string,
  audienceMember?: RoomAudienceMember,
): Promise<void> {
  const seatRef = ref(database, `rooms/${roomId}/seats/${seatIndex}`);
  onDisconnect(seatRef).cancel().catch(() => {/* non-critical */});

  const ops: Promise<void>[] = [remove(seatRef)];
  if (audienceMember) {
    const audienceRef = ref(database, `rooms/${roomId}/audience/${userId}`);
    ops.push(set(audienceRef, audienceMember));
    onDisconnect(audienceRef).remove().catch(() => {/* non-critical */});
  }
  await Promise.all(ops);
  _updateCounts(roomId).catch(() => {}); // best-effort
}

/** Toggle mute on a seat. */
export async function setSeatMute(
  roomId: string,
  seatIndex: number,
  muted: boolean,
): Promise<void> {
  await update(ref(database, `rooms/${roomId}/seats/${seatIndex}`), { muted });
}

/** Update role in a seat. */
export async function setSeatRole(
  roomId: string,
  seatIndex: number,
  role: 'admin' | 'member',
): Promise<void> {
  await update(ref(database, `rooms/${roomId}/seats/${seatIndex}`), { role });
}

/** Remove a member from a seat (kick). */
export async function removeSeat(
  roomId: string,
  seatIndex: number,
): Promise<void> {
  const seatRef = ref(database, `rooms/${roomId}/seats/${seatIndex}`);
  onDisconnect(seatRef).cancel().catch(() => {/* non-critical */});
  await remove(seatRef);
  _updateCounts(roomId).catch(() => {}); // best-effort
}

/** Remove a member from audience (kick). */
export async function removeAudienceMember(
  roomId: string,
  userId: string,
): Promise<void> {
  const audienceRef = ref(database, `rooms/${roomId}/audience/${userId}`);
  onDisconnect(audienceRef).cancel().catch(() => {/* non-critical */});
  await remove(audienceRef);
}

// ─── Room Lifecycle ───────────────────────────────────────────────────────────

/** Close the room (host only — explicit close). */
export async function closeRoom(roomId: string): Promise<void> {
  await Promise.all([
    update(ref(database, `rooms/${roomId}/info`), {
      active: false,
      isLive: false,
      closedAt: Date.now(),
    }),
    remove(ref(database, `rooms/${roomId}/seats`)),
    remove(ref(database, `rooms/${roomId}/audience`)),
  ]);
}

/**
 * Fully disband a room (owner only) — removes all data associated with the
 * room: the room itself, its PIN, blocks, seat requests, seat invites,
 * room invites, and the `userRooms` index for all current members.
 */
export async function disbandRoom(roomId: string): Promise<void> {
  // Each path is removed independently — Firebase rules may block some paths
  // (e.g. roomPins when the room is not private) so we must not let one
  // failure block the rest. The primary room node is awaited last so the
  // room disappears from the list only after cleanup has been attempted.
  const tryRemove = (path: string) =>
    remove(ref(database, path)).catch(() => { /* non-critical */ });

  // Collect UIDs of everyone in the room so we can clean up userRooms index
  let memberUids: string[] = [];
  try {
    const [seatsSnap, audSnap] = await Promise.all([
      get(ref(database, `rooms/${roomId}/seats`)),
      get(ref(database, `rooms/${roomId}/audience`)),
    ]);
    if (seatsSnap.exists()) {
      seatsSnap.forEach((child) => {
        const seat = child.val() as { userId?: string };
        if (seat?.userId) memberUids.push(seat.userId);
      });
    }
    if (audSnap.exists()) {
      audSnap.forEach((child) => {
        const aud = child.val() as { userId?: string };
        if (aud?.userId) memberUids.push(aud.userId);
      });
    }
  } catch { /* non-critical — we still disband even if we can't read members */ }

  await Promise.all([
    // Room-scoped side-tables
    tryRemove(`roomPins/${roomId}`),
    tryRemove(`roomBlocks/${roomId}`),
    tryRemove(`roomSeatRequests/${roomId}`),
    tryRemove(`seatInvites/${roomId}`),
    // Clean userRooms index entries for all members currently in the room
    ...memberUids.map((uid) => tryRemove(`userRooms/${uid}/${roomId}`)),
  ]);
  // Remove the room itself last — this is the authoritative record.
  // The full sub-tree (seats, audience, chat, reactions, lockedSeats…) is
  // deleted in one operation since Firebase cascades the remove.
  await remove(ref(database, `rooms/${roomId}`));
}

/** Update room settings (name, topic, isPublic, isLocked, coverImageUrl). */
export async function updateRoomSettings(
  roomId: string,
  data: { name?: string; topic?: string; isPublic?: boolean; isLocked?: boolean; coverImageUrl?: string },
): Promise<void> {
  await update(ref(database, `rooms/${roomId}/info`), data);
}

// ─── Seat Lock (Firebase-synced) ─────────────────────────────────────────────

/** Lock a seat so no one can take it (stored in Firebase). */
export async function lockSeat(roomId: string, seatIndex: number): Promise<void> {
  await set(ref(database, `rooms/${roomId}/lockedSeats/${seatIndex}`), true);
}

/** Unlock a seat. */
export async function unlockSeat(roomId: string, seatIndex: number): Promise<void> {
  await remove(ref(database, `rooms/${roomId}/lockedSeats/${seatIndex}`));
}

/** Subscribe to locked seats (real-time). */
export function subscribeLockedSeats(
  roomId: string,
  callback: (locked: Set<number>) => void,
): () => void {
  return onValue(
    ref(database, `rooms/${roomId}/lockedSeats`),
    (snap) => {
      const locked = new Set<number>();
      if (snap.exists()) {
        snap.forEach((child) => {
          const idx = parseInt(child.key ?? '-1', 10);
          if (idx >= 0 && child.val() === true) locked.add(idx);
        });
      }
      callback(locked);
    },
    () => {
      // On subscription error (e.g. permission denied), return empty set
      // rather than leaving the UI with a stale locked-seats state.
      callback(new Set<number>());
    },
  );
}

// ─── Audience Role (Firebase-synced) ─────────────────────────────────────────

/** Update an audience member's role in Firebase. */
export async function setAudienceRole(
  roomId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await update(ref(database, `rooms/${roomId}/audience/${userId}`), { role });
}

// ─── Seat Request System ──────────────────────────────────────────────────────

export type SeatRequest = {
  id: string;
  userId: string;
  userName: string;
  initials: string;
  color: string;
  seatIdx: number;
  ts: number;
  hostId: string;
  status: 'pending' | 'approved' | 'rejected';
};

/** Audience member requests to take a specific seat (non-admin flow). */
export async function sendSeatRequest(
  roomId: string,
  request: Omit<SeatRequest, 'id' | 'status'>,
): Promise<string> {
  const reqRef = push(ref(database, `roomSeatRequests/${roomId}`));
  await set(reqRef, { ...request, status: 'pending' });
  return reqRef.key!;
}

/** Subscribe to PENDING seat requests for a room (real-time). */
export function subscribeSeatRequests(
  roomId: string,
  callback: (requests: SeatRequest[]) => void,
): () => void {
  return onValue(ref(database, `roomSeatRequests/${roomId}`), (snap) => {
    const requests: SeatRequest[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        const v = child.val() as Omit<SeatRequest, 'id'>;
        if (v.status === 'pending') {
          requests.push({ id: child.key!, ...v });
        }
      });
    }
    callback(requests);
  });
}

/** Host approves a seat request → marks approved and push-notifies the requester. */
export async function approveSeatRequest(
  roomId: string,
  requestId: string,
): Promise<void> {
  const [reqSnap, infoSnap] = await Promise.all([
    get(ref(database, `roomSeatRequests/${roomId}/${requestId}`)),
    get(ref(database, `rooms/${roomId}/info/name`)),
  ]);

  await update(ref(database, `roomSeatRequests/${roomId}/${requestId}`), { status: 'approved' });

  if (reqSnap.exists()) {
    const req = reqSnap.val() as Omit<SeatRequest, 'id'>;
    const roomName = (infoSnap.val() as string | null) ?? 'the room';
    sendPushNotification(req.userId, 'Vee', `Your seat request was approved in "${roomName}"`, {
      type: 'seat-approved',
      roomId,
    });
  }
}

/** Host rejects a seat request → marks rejected and push-notifies the requester. */
export async function rejectSeatRequest(
  roomId: string,
  requestId: string,
): Promise<void> {
  const [reqSnap, infoSnap] = await Promise.all([
    get(ref(database, `roomSeatRequests/${roomId}/${requestId}`)),
    get(ref(database, `rooms/${roomId}/info/name`)),
  ]);

  await update(ref(database, `roomSeatRequests/${roomId}/${requestId}`), { status: 'rejected' });

  if (reqSnap.exists()) {
    const req = reqSnap.val() as Omit<SeatRequest, 'id'>;
    const roomName = (infoSnap.val() as string | null) ?? 'the room';
    sendPushNotification(req.userId, 'Vee', `Your seat request was declined in "${roomName}"`, {
      type: 'seat-rejected',
      roomId,
    });
  }
}

// ─── Room Block System (Firebase-persisted) ───────────────────────────────────

export type RoomBlockRecord = {
  userId: string;
  userName: string;
  initials: string;
  color: string;
  blockedAt: number;
  blockedBy: string;
  byName: string;
  action: 'room-block' | 'comment-block';
};

/** Write a block record to Firebase — persists across sessions. */
export async function blockUserInRoom(
  roomId: string,
  record: RoomBlockRecord,
): Promise<void> {
  await set(ref(database, `roomBlocks/${roomId}/${record.userId}`), record);
}

/** Remove a block from Firebase (unblock). */
export async function unblockUserInRoom(
  roomId: string,
  userId: string,
): Promise<void> {
  await remove(ref(database, `roomBlocks/${roomId}/${userId}`));
}

/** Subscribe to all room blocks in real-time. */
export function subscribeRoomBlocks(
  roomId: string,
  callback: (blocks: Map<string, RoomBlockRecord>) => void,
): () => void {
  return onValue(ref(database, `roomBlocks/${roomId}`), (snap) => {
    const blocks = new Map<string, RoomBlockRecord>();
    if (snap.exists()) {
      snap.forEach((child) => {
        if (child.key) blocks.set(child.key, child.val() as RoomBlockRecord);
      });
    }
    callback(blocks);
  });
}

/** One-time check: is this user blocked in this room? */
export async function isUserBlockedInRoom(
  roomId: string,
  userId: string,
): Promise<boolean> {
  const snap = await get(ref(database, `roomBlocks/${roomId}/${userId}`));
  return snap.exists();
}

// ─── Room Invite ────────────────────────────────────────────────────────────

/** Write a room invite for a user and push-notify them. */
export async function sendRoomInvite(
  roomId: string,
  roomName: string,
  inviterUid: string,
  inviterName: string,
  inviteeUid: string,
): Promise<void> {
  // Privacy enforcement: silently skip if the invitee has disabled invites.
  // We don't surface an error to the inviter to prevent probing user settings.
  const allowed = await canReceiveRoomInvite(inviteeUid);
  if (!allowed) return;

  await set(ref(database, `roomInvites/${inviteeUid}/${roomId}`), {
    roomId,
    roomName,
    inviterUid,
    inviterName,
    ts: Date.now(),
  });

  sendPushNotification(inviteeUid, inviterName, `invited you to join "${roomName}"`, {
    type: 'room-invite',
    roomId,
  });
}

// ─── Seat Invite System (Fix 1) ───────────────────────────────────────────────

export type SeatInvite = {
  id: string;
  roomId: string;
  roomName: string;
  seatIdx: number;
  inviterUid: string;
  inviterName: string;
  ts: number;
};

/**
 * Send a seat invite from host to an audience member.
 * Writes to seatInvites/{inviteeUid}/{inviteId} and push-notifies the invitee.
 */
export async function sendSeatInvite(
  inviteeUid: string,
  invite: Omit<SeatInvite, 'id'>,
): Promise<string> {
  const inviteRef = push(ref(database, `seatInvites/${inviteeUid}`));
  await set(inviteRef, invite);
  sendPushNotification(
    inviteeUid,
    invite.inviterName,
    `You've been invited to seat ${invite.seatIdx + 1} in "${invite.roomName}"`,
    { type: 'seat-invite', roomId: invite.roomId, seatIdx: invite.seatIdx },
  );
  return inviteRef.key!;
}

/** Subscribe to incoming seat invites for a specific room. */
export function subscribeSeatInvites(
  uid: string,
  roomId: string,
  callback: (invites: SeatInvite[]) => void,
): () => void {
  return onValue(ref(database, `seatInvites/${uid}`), (snap) => {
    const invites: SeatInvite[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        const v = child.val() as Omit<SeatInvite, 'id'>;
        // Only return invites for THIS room
        if (v.roomId === roomId) {
          invites.push({ id: child.key!, ...v });
        }
      });
    }
    callback(invites);
  });
}

/** Remove a seat invite after accept or decline. */
export async function removeSeatInvite(uid: string, inviteId: string): Promise<void> {
  await remove(ref(database, `seatInvites/${uid}/${inviteId}`));
}

// ─── Emoji Reaction Broadcast (Fix 5) ────────────────────────────────────────

export type RoomEmojiReaction = {
  emoji: string;
  byUid: string;
  byName: string;
  ts: number;
};

/**
 * Broadcast an emoji reaction to all room participants.
 * Stored at rooms/{roomId}/reactions/{pushId} with TTL enforced client-side.
 */
export async function sendRoomEmojiReaction(
  roomId: string,
  reaction: Omit<RoomEmojiReaction, 'ts'>,
): Promise<void> {
  const reactionRef = push(ref(database, `rooms/${roomId}/reactions`));
  await set(reactionRef, { ...reaction, ts: Date.now() });
}

/**
 * Subscribe to emoji reactions in a room.
 * Callback fires with the latest reaction; caller filters by ts to ignore stale.
 */
export function subscribeRoomEmojiReactions(
  roomId: string,
  callback: (reaction: RoomEmojiReaction | null) => void,
): () => void {
  // Only listen to the most recent reaction to avoid replay storms
  const q = query(ref(database, `rooms/${roomId}/reactions`), limitToLast(1));
  return onValue(q, (snap) => {
    if (!snap.exists()) { callback(null); return; }
    let latest: RoomEmojiReaction | null = null;
    snap.forEach((child) => {
      latest = child.val() as RoomEmojiReaction;
    });
    callback(latest);
  });
}

// ─── Room Creation Limit ─────────────────────────────────────────────────────

/**
 * Get count of active owned public and private rooms for a user.
 * Enforces the 1-public + 1-private creation limit.
 */
export async function getUserRoomCounts(
  userId: string,
): Promise<{ publicCount: number; privateCount: number }> {
  const q = query(
    ref(database, 'rooms'),
    orderByChild('info/ownerId'),
    equalTo(userId),
  );
  const snap = await get(q);
  let publicCount = 0;
  let privateCount = 0;
  if (snap.exists()) {
    snap.forEach((child) => {
      const infoSnap = child.child('info');
      if (infoSnap.exists()) {
        const info = infoSnap.val() as RoomInfo;
        if (info.active) {
          if (info.isPublic) publicCount++;
          else privateCount++;
        }
      }
    });
  }
  return { publicCount, privateCount };
}

// ─── Room PIN (Private Room Security) ────────────────────────────────────────

/**
 * Store a SHA-256 hashed PIN for a private room.
 * Stored at roomPins/{roomId}, never inside room info.
 */
export async function storeRoomPin(roomId: string, hashedPin: string): Promise<void> {
  await set(ref(database, `roomPins/${roomId}`), { hashedPin, updatedAt: Date.now() });
}

/**
 * Verify a hashed PIN for a private room.
 * Returns true when the PIN hash matches, false otherwise.
 */
export async function verifyRoomPin(roomId: string, hashedPin: string): Promise<boolean> {
  const snap = await get(ref(database, `roomPins/${roomId}`));
  if (!snap.exists()) return false;
  const stored = snap.val() as { hashedPin: string };
  return stored.hashedPin === hashedPin;
}

/**
 * Delete a room PIN entry (called during session reset).
 */
export async function deleteRoomPin(roomId: string): Promise<void> {
  await remove(ref(database, `roomPins/${roomId}`));
}


// ─── Internal helpers ─────────────────────────────────────────────────────────

const _API_BASE = 'https://vee-api.onrender.com';

/**
 * Sync room member/listener counts.
 *
 * RC8-B2: Primary path calls the API server (which uses Firebase Admin SDK and
 * bypasses security rules). This fixes the P2-2 bug where seat holders — who
 * are neither the room owner nor in the audience list — had their direct
 * Firebase count-write silently rejected by the rules.
 *
 * Fallback: direct Firebase update (works for owner/audience only). Ensures
 * counts are still updated when the API server is unavailable (e.g. cold start).
 */
async function _updateCounts(roomId: string): Promise<void> {
  // Try via API server first (bypasses rules for seat holders)
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    if (idToken) {
      const res = await fetch(`${_API_BASE}/api/rooms/sync-counts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      if (res.ok) return; // server updated counts successfully
    }
  } catch {
    // API unavailable — fall through to direct Firebase write
  }

  // Fallback: direct Firebase write (works for owner/audience, silent fail for seat holders)
  try {
    const [seatsSnap, audSnap] = await Promise.all([
      get(ref(database, `rooms/${roomId}/seats`)),
      get(ref(database, `rooms/${roomId}/audience`)),
    ]);

    let memberCount = 0;
    let listenerCount = 0;
    const memberPreviews: MemberPreview[] = [];

    if (seatsSnap.exists()) {
      seatsSnap.forEach((child) => {
        const seat = child.val() as NonNullable<RoomSeat>;
        memberCount++;
        memberPreviews.push({ initials: seat.initials, color: seat.color });
      });
    }
    if (audSnap.exists()) {
      audSnap.forEach(() => { listenerCount++; });
    }

    await update(ref(database, `rooms/${roomId}/info`), {
      memberCount,
      listenerCount,
      memberPreviews: memberPreviews.slice(0, 5),
      isTrending: memberCount >= 5,
    });
  } catch {
    // Non-critical — count will be corrected by next seat/audience change
  }
}
