import type { Booking, Visitor, Verification } from './policy';

/** Server-only adapters to implement before enabling live intake. No credentials in client code. */
export interface VisitorRepository {
  findByVerifiedAccount(accountId: string): Promise<Visitor | null>;
  createDraft(email: string): Promise<{ visitorId: string }>;
  // Must validate the webhook signature and deduplicate provider event IDs first.
  recordIdentityResult(visitorId: string, sessionId: string, eventId: string, status: Verification): Promise<void>;
}
export interface VisitorEmailAuth {
  // Same response for new/existing emails. Upsert a draft before any paid ID check.
  // Rate-limit email/IP; resend replaces the previous challenge, with a cooldown.
  sendCode(email: string): Promise<{ retryAfterSeconds: number }>;
  // Atomic attempts + consume; keyed code digest; secure HttpOnly session cookie.
  // Never return visitor data before ownership is proven. A code is single-use.
  verifyCode(email: string, code: string): Promise<{ authenticated: boolean }>;
}
export interface AvailabilityRepository {
  // Server checks all requested/approved overlaps, not just currently rendered slots.
  // Require reason + notification consent when any reservation is affected.
  // Commit block, cancellations, revision bumps and outbox records atomically.
  block(input: { ownerId: string; startsAt: number; endsAt: number;
    reason?: string; notifyVisitors: boolean }): Promise<{ canceledBookingIds: string[] }>;
}
export interface IdentityProvider {
  createSession(visitorId: string, idempotencyKey: string): Promise<{ sessionId: string; redirectUrl: string }>;
  // Require document + matching selfie. Copy only the successfully verified selfie.
  retainVerifiedSelfie(sessionId: string): Promise<{ privateObjectKey: string }>;
}
export interface LockProvider {
  createTimedCode(booking: Booking, idempotencyKey: string): Promise<{ jobId: string }>;
  confirmInstalled(jobId: string): Promise<boolean>;
  revoke(bookingId: string, revision: number): Promise<{ confirmed: boolean }>;
}
export interface BookingRepository {
  // Reserve atomically; reject concurrent overlaps. Revision invalidates old jobs on reschedule.
  reserve(booking: Booking): Promise<void>;
  appendMessage(bookingId: string, actorId: string, body: string): Promise<void>;
}
export interface OwnerAccounts {
  // All owners share permissions. Use a maintained password-auth implementation.
  invite(email: string, actorId: string): Promise<void>;
  removeAndRevokeSessions(ownerId: string, actorId: string): Promise<void>;
}
export const integrationState = {
  liveIntake: false,
  passwordLogin: false,
  stripe: false,
  gmail: false,
  igloohome: false,
  agentLicenseLookup: false,
} as const;
