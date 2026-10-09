import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { accessReleaseAllowed, mayRemoveOwner, requestEligibility, selfieDeleteAt, validSlot, overlaps } from '../src/lib/viewings/policy.ts';

const now = Date.UTC(2026, 10, 2, 14);
const visitor = { id: 'v1', emailVerified: true, identity: 'pending', agentLicenseActive: true, agentContactVerified: true, agentReviewValidUntil: now + 86400000 };
const booking = { id: 'b1', visitorId: 'v1', revision: 2, mode: 'agent_private', status: 'approved', start: now + 3600000, end: now + 7200000, agentAttending: true };
const release = { visitor, booking, now, jobRevision: 2, codeInstalled: true, automationEnabled: true, alreadySent: false };

test('private showing requires both active license and independently verified contact', () => {
  assert.equal(requestEligibility(visitor, 'agent_private', now), true);
  for (const change of [{ emailVerified: false }, { agentLicenseActive: false }, { agentContactVerified: false }, { agentReviewValidUntil: now }, { agentReviewValidUntil: null }]) {
    assert.equal(requestEligibility({ ...visitor, ...change }, 'agent_private', now), false);
  }
  // MLS route/claims and Stripe identity must never substitute for agent verification.
  assert.equal(requestEligibility({ ...visitor, identity: 'verified', agentContactVerified: false, source: 'mls' }, 'agent_private', now), false);
  assert.equal(requestEligibility({ ...visitor, identity: 'verified', agentContactVerified: false }, 'owner_coordinated', now), true);
  assert.equal(requestEligibility({ ...visitor, agentContactVerified: false }, 'owner_coordinated', now), false);
});
test('release is confined to approved matching revision, verified agent, and confirmed timed code before the visit', () => {
  assert.equal(accessReleaseAllowed(release), true);
  assert.equal(accessReleaseAllowed({ ...release, now: now - 86400000 }), true);
  for (const change of [{ now: booking.start }, { jobRevision: 1 }, { alreadySent: true }, { codeInstalled: false }, { automationEnabled: false }]) {
    assert.equal(accessReleaseAllowed({ ...release, ...change }), false);
  }
  for (const change of [{ visitorId: 'another-visitor' }, { status: 'canceled' }, { status: 'requested' }, { status: 'completed' }, { mode: 'owner_coordinated' }, { agentAttending: false }, { end: booking.start }]) {
    assert.equal(accessReleaseAllowed({ ...release, booking: { ...booking, ...change } }), false);
  }
  assert.equal(accessReleaseAllowed({ ...release, visitor: { ...visitor, agentReviewValidUntil: now } }), false);
});
test('slots reject invalid/past times and use half-open overlap boundaries', () => {
  assert.equal(validSlot(now + 1, now + 2, now), true);
  assert.equal(validSlot(now, now + 1, now), false);
  assert.equal(validSlot(NaN, Infinity, now), false);
  assert.equal(validSlot(now + 2, now + 1, now), false);
  assert.equal(overlaps({ start: 1, end: 3 }, { start: 3, end: 5 }), false);
  assert.equal(overlaps({ start: 1, end: 4 }, { start: 3, end: 5 }), true);
});
test('owner protection and selfie retention', () => {
  assert.equal(mayRemoveOwner(1, true), false);
  assert.equal(mayRemoveOwner(2, true), true);
  assert.equal(selfieDeleteAt(now), now + 90 * 86400000);
});
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_viewings.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_booking_flow.sql', import.meta.url), 'utf8'));
  return db;
}
test('D1 schema prevents duplicate visitors and overlapping reservations including updates', () => {
  const db = database();
  try {
    db.exec("INSERT INTO visitors (id,email_normalized,created_at) VALUES ('v1','sample@example.com',1)");
    assert.throws(() => db.exec("INSERT INTO visitors (id,email_normalized,created_at) VALUES ('v2','sample@example.com',1)"));
    db.exec("INSERT INTO availability_slots VALUES ('s1',100,200,'agent_private',1)");
    const insert = db.prepare("INSERT INTO bookings (id,visitor_id,slot_id,starts_at,ends_at,mode,source,status,created_at) VALUES (?,'v1','s1',?,?,'agent_private','mls','requested',1)");
    insert.run('b1',100,200);
    assert.throws(() => insert.run('b2',150,250), /overlaps/);
    insert.run('b2',200,300);
    assert.throws(() => db.exec("UPDATE bookings SET starts_at=150 WHERE id='b2'"), /overlaps/);
    db.exec("UPDATE bookings SET status='canceled' WHERE id='b1'");
    db.exec("UPDATE bookings SET starts_at=150 WHERE id='b2'");
    assert.throws(() => db.exec("UPDATE bookings SET status='approved' WHERE id='b1'"), /overlaps/);
  } finally { db.close(); }
});
test('D1 schema prevents removing the last owner and duplicate paid verification attempts', () => {
  const db = database();
  try {
    db.exec("INSERT INTO owner_accounts VALUES ('o1','owner@example.com','auth1','active',1)");
    assert.throws(() => db.exec("DELETE FROM owner_accounts WHERE id='o1'"), /last active owner/);
    assert.throws(() => db.exec("UPDATE owner_accounts SET status='removed' WHERE id='o1'"), /last active owner/);
    db.exec("INSERT INTO owner_accounts VALUES ('o2','owner2@example.com','auth2','active',1)");
    db.exec("UPDATE owner_accounts SET status='removed' WHERE id='o1'");
    db.exec("INSERT INTO visitors (id,email_normalized,created_at) VALUES ('v1','sample@example.com',1)");
    const insert = db.prepare("INSERT INTO identity_attempts VALUES (?,'v1',NULL,?,'pending',1,1)");
    insert.run('a1','k1');
    assert.throws(() => insert.run('a2','k2'));
    db.exec("UPDATE identity_attempts SET status='needs_retry' WHERE id='a1'");
    insert.run('a2','k2');
  } finally { db.close(); }
});

import { visitorDays, monthDays, weekday, easternTime, ruleBlocks, feedbackAllowed, cancellationAllowed, challengeValid } from '../src/lib/viewings/calendar.ts';
test('visitor calendar has Sunday–Saturday rows and four/five weeks at the weekday boundary', () => {
  for (const [day, count] of [['2026-10-07',28],['2026-10-08',35],['2026-10-09',35],['2026-10-10',35],['2026-10-11',28],['2026-12-31',35]]) {
    const days=visitorDays(day);
    assert.equal(days.length,count); assert.equal(weekday(days[0]),0); assert.equal(weekday(days.at(-1)),6);
    assert.ok(days.slice(0,7).includes(day));
  }
  assert.equal(monthDays('2026-02').length,28);
  assert.ok(monthDays('2028-02').includes('2028-02-29'));
  assert.equal(easternTime('2026-03-07','10:00'),Date.UTC(2026,2,7,15));
  assert.equal(easternTime('2026-03-08','10:00'),Date.UTC(2026,2,8,14));
  assert.equal(easternTime('2026-11-01','10:00'),Date.UTC(2026,10,1,15));
});
test('email challenge rejects replaced, expired, consumed and exhausted codes', () => {
  assert.equal(challengeValid('00123456','00123456',now+1,0,false,now),true);
  assert.equal(challengeValid('00123456','99123456',now+1,0,false,now),false);
  assert.equal(challengeValid('00123456','00123456',now,0,false,now),false);
  assert.equal(challengeValid('00123456','00123456',now+1,5,false,now),false);
  assert.equal(challengeValid('00123456','00123456',now+1,0,true,now),false);
  assert.equal(challengeValid('1234','1234',now+1,0,false,now),false);
});
test('default ranges use overlap, cancellation requires a reason and notice, feedback waits for start', () => {
  const rules=[{id:'r1',weekday:4,start:'10:30',end:'12:00'},{id:'r2',weekday:-1,start:'15:00',end:'16:00'}];
  assert.equal(ruleBlocks('2026-10-08','10:00','11:00',rules),true);
  assert.equal(ruleBlocks('2026-10-08','12:00','13:00',rules),false);
  assert.equal(ruleBlocks('2026-10-09','10:00','11:00',rules),false);
  assert.equal(ruleBlocks('2026-10-09','15:00','16:00',rules),true);
  assert.equal(cancellationAllowed(1,'Owner unavailable',false),false);
  assert.equal(cancellationAllowed(1,'   ',true),false);
  assert.equal(cancellationAllowed(1,'Owner unavailable',true),true);
  assert.equal(feedbackAllowed(now,'approved',now-1),false);
  assert.equal(feedbackAllowed(now,'approved',now),true);
  assert.equal(feedbackAllowed(now,'requested',now+1),false);
  assert.equal(feedbackAllowed(now,'canceled',now+1),false);
});
test('challenge replacement is unique and cancellation records require notification consent', () => {
  const db=database();
  try {
    db.exec("INSERT INTO visitors(id,email_normalized,created_at) VALUES ('v1','sample@example.com',1)");
    db.exec("INSERT INTO email_challenges VALUES ('v1','g1','digest1',100,0,NULL,1)");
    assert.throws(()=>db.exec("INSERT INTO email_challenges VALUES ('v1','g2','digest2',200,0,NULL,2)"));
    db.exec("UPDATE email_challenges SET generation='g2',code_digest='digest2',attempts=0,expires_at=200 WHERE visitor_id='v1'");
    assert.equal(db.prepare('SELECT code_digest FROM email_challenges').get().code_digest,'digest2');
    db.exec("INSERT INTO availability_slots VALUES ('s1',100,200,'agent_private',1)");
    db.exec("INSERT INTO bookings(id,visitor_id,slot_id,starts_at,ends_at,mode,source,status,created_at) VALUES ('b1','v1','s1',100,200,'agent_private','mls','canceled',1)");
    assert.throws(()=>db.exec("INSERT INTO booking_cancellations VALUES ('b1',2,'o1','Owner unavailable',0,1)"));
    db.exec("INSERT INTO booking_cancellations VALUES ('b1',2,'o1','Owner unavailable',1,1)");
  } finally {db.close();}
});
