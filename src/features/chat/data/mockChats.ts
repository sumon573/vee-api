/**
 * Utility helpers used by the chat list.
 */

/**
 * Format a message timestamp into a human-readable "time ago" or clock string.
 * Accepts a Firebase Timestamp-like object ({seconds, nanoseconds}),
 * a Date, or a millisecond number.
 */
export function formatTime(ts: any): string {
  if (!ts) return '';

  let date: Date;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === 'number') {
    date = new Date(ts);
  } else if (ts?.toDate) {
    // Firebase Timestamp
    date = ts.toDate();
  } else if (ts?.seconds) {
    date = new Date(ts.seconds * 1000);
  } else {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHrs < 24) return `${diffHrs}h`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
