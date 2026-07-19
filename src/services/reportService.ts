/**
 * Report Service — Firebase Realtime Database
 *
 * Path: reports/{reportId}
 *
 * Fields stored:
 *   reporterUid      — uid of user submitting the report
 *   reporterName     — display name of reporter
 *   reportedUid      — uid of the reported user
 *   reportedName     — display name of reported user
 *   roomId           — voice room id (if applicable)
 *   messageId        — specific message id (if applicable)
 *   messageContent   — excerpt of the offending message (if applicable)
 *   reason           — category string
 *   additionalNotes  — free-text from the reporter
 *   timestamp        — server timestamp (ms)
 *   status           — 'pending' | 'reviewed' | 'resolved' | 'dismissed'
 *   moderatorNotes   — empty string on creation, filled by moderators
 */

import { ref, push, set } from 'firebase/database';
import { database } from '../config/firebase';

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate'
  | 'hate_speech'
  | 'violence'
  | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export type ReportInput = {
  reporterUid: string;
  reporterName: string;
  reportedUid: string;
  reportedName: string;
  reason: ReportReason;
  roomId?: string;
  messageId?: string;
  messageContent?: string;
  additionalNotes?: string;
};

export type Report = ReportInput & {
  id: string;
  ts: number;
  status: ReportStatus;
  moderatorNotes: string;
};

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Submit a new user report to Firebase.
 * Returns the generated report ID.
 */
export async function submitReport(input: ReportInput): Promise<string> {
  const newRef = push(ref(database, 'reports'));
  const reportId = newRef.key!;

  const payload: Omit<Report, 'id'> = {
    ...input,
    roomId: input.roomId ?? '',
    messageId: input.messageId ?? '',
    messageContent: input.messageContent ?? '',
    additionalNotes: input.additionalNotes ?? '',
    ts: Date.now(),
    status: 'pending',
    moderatorNotes: '',
  };

  await set(newRef, payload);
  return reportId;
}
