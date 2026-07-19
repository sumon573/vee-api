/**
 * In-App Notification Service
 * Shows a slide-down banner at the top of the screen for new incoming messages.
 *
 * Triggered by real Firebase message subscriptions (see InboxScreen's
 * subscribeMessages listener) — not simulated. This only covers foreground,
 * in-app banners; background/killed-state push delivery is handled by
 * OneSignal separately (see pushNotificationService.ts) and is not
 * available inside Expo Go.
 */

type Notification = {
  id: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  chatId: string;
  timestamp: number;
};

type Listener = (notification: Notification | null) => void;

let currentNotification: Notification | null = null;
const listeners: Set<Listener> = new Set();
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast() {
  listeners.forEach((fn) => fn(currentNotification));
}

export function subscribeNotifications(cb: Listener): () => void {
  listeners.add(cb);
  cb(currentNotification); // emit current state immediately
  return () => listeners.delete(cb);
}

export function showNotification(
  chatId: string,
  senderName: string,
  message: string,
  senderAvatar?: string,
) {
  if (dismissTimer) clearTimeout(dismissTimer);

  currentNotification = {
    id: `notif_${Date.now()}`,
    chatId,
    senderName,
    message,
    senderAvatar,
    timestamp: Date.now(),
  };
  broadcast();

  // Auto-dismiss after 4 seconds
  dismissTimer = setTimeout(() => {
    currentNotification = null;
    broadcast();
  }, 4000);
}

export function dismissNotification() {
  if (dismissTimer) clearTimeout(dismissTimer);
  currentNotification = null;
  broadcast();
}
