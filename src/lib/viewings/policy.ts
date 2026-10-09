/** Shared rules; callers must obtain these facts from trusted server records. */
export type Verification = 'pending' | 'verified' | 'needs_retry' | 'canceled';
export type Visitor = {
  id: string;
  emailVerified: boolean;
  identity: Verification;
  agentLicenseActive: boolean;
  agentContactVerified: boolean;
  agentReviewValidUntil: number | null;
};
export type Booking = {
  id: string;
  visitorId: string;
  revision: number;
  mode: 'owner_coordinated' | 'agent_private';
  status: 'requested' | 'approved' | 'canceled' | 'completed';
  start: number;
  end: number;
  agentAttending: boolean;
};
export function verifiedAgent(visitor: Visitor, now: number): boolean {
  return visitor.emailVerified && visitor.agentLicenseActive && visitor.agentContactVerified
    && visitor.agentReviewValidUntil !== null && visitor.agentReviewValidUntil > now;
}
export function requestEligibility(visitor: Visitor, mode: Booking['mode'], now: number): boolean {
  if (!visitor.emailVerified) return false;
  return mode === 'agent_private' ? verifiedAgent(visitor, now)
    : visitor.identity === 'verified' || verifiedAgent(visitor, now);
}
export function validSlot(start: number, end: number, now: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && start > now && end > start;
}
export function overlaps(a: Pick<Booking, 'start' | 'end'>, b: Pick<Booking, 'start' | 'end'>): boolean {
  return a.start < b.end && b.start < a.end;
}
export function accessReleaseAllowed(input: {
  visitor: Visitor; booking: Booking; now: number; jobRevision: number;
  codeInstalled: boolean; automationEnabled: boolean; alreadySent: boolean;
}): boolean {
  const { visitor, booking, now } = input;
  return input.automationEnabled && !input.alreadySent && input.codeInstalled
    && input.jobRevision === booking.revision && booking.visitorId === visitor.id
    && booking.status === 'approved' && booking.mode === 'agent_private'
    && booking.agentAttending && verifiedAgent(visitor, now)
    && Number.isFinite(booking.start) && booking.end > booking.start
    && Number.isFinite(now) && now < booking.start;
}
export function mayRemoveOwner(activeOwnerCount: number, targetActive: boolean): boolean {
  return !targetActive || activeOwnerCount > 1;
}
export function selfieDeleteAt(lastCompletedViewing: number): number {
  return lastCompletedViewing + 90 * 24 * 60 * 60 * 1000;
}
