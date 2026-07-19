/**
 * Auth Service — Firebase Auth (Production)
 * Supports: Email/Password, Password Reset
 * Google Sign-In removed.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User,
  AuthError,
} from 'firebase/auth';
import { auth } from '../config/firebase';

export type { User as AuthUser };

// ─── Error Messages ───────────────────────────────────────────────────────────

export function getAuthErrorMessage(error: unknown): string {
  const code = (error as AuthError)?.code ?? '';
  const messages: Record<string, string> = {
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/invalid-credential':     'Incorrect email or password.',
    'auth/email-already-in-use':   'An account with this email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/too-many-requests':      'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'No internet connection. Please check your network.',
    'auth/user-disabled':          'This account has been disabled.',
    'auth/operation-not-allowed':  'This sign-in method is not enabled.',
    'auth/requires-recent-login':  'Please sign in again to complete this action.',
  };
  return messages[code] ?? 'Something went wrong. Please try again.';
}

// ─── Core Auth Functions ─────────────────────────────────────────────────────

/** Sign in with email and password */
export async function login(email: string, password: string): Promise<User> {
  const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
  return user;
}

/** Create new account with email, password, and display name */
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(user, { displayName: name.trim() });
  return user;
}

/** Sign out the current user */
export async function logout(): Promise<void> {
  await signOut(auth);
}

/** Send password reset email */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/** Get currently authenticated user (may be null) */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onUserStateChanged(
  callback: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, callback);
}

/** Update display name and/or photo URL */
export async function updateUserProfile(
  name?: string,
  photoURL?: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user.');
  await updateProfile(user, {
    ...(name && { displayName: name }),
    ...(photoURL && { photoURL }),
  });
}
