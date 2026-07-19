/**
 * minimizedRoom.ts
 * Simple in-memory store for the currently minimized voice room.
 * Components subscribe to changes via subscribeMinimizedRoom().
 */

export type MinimizedRoom = {
  id: string;
  name: string;
  topic: string;
  /** UID of the minimizing user — needed for Firebase cleanup on close. */
  myUid: string;
  /** Seat index of the minimizing user (-1 if they are in the audience). */
  mySeatIdx: number;
  /** Whether the user's mic was muted at the time of minimize. */
  muted: boolean;
} | null;

let _minimizedRoom: MinimizedRoom = null;
let _listeners: Array<(room: MinimizedRoom) => void> = [];

export function setMinimizedRoom(room: MinimizedRoom) {
  _minimizedRoom = room;
  _listeners.forEach((l) => l(room));
}

export function getMinimizedRoom(): MinimizedRoom {
  return _minimizedRoom;
}

export function subscribeMinimizedRoom(
  listener: (room: MinimizedRoom) => void,
): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}
