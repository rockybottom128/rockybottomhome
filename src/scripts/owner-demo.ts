import { mayRemoveOwner, requestEligibility, type Booking, type Visitor } from '../lib/viewings/policy';
const root = document.querySelector('#owner-demo');
if (root) {
  const now = Date.UTC(2026, 9, 8);
  const people: Record<string, Visitor> = {
    agent: { id: 'agent', emailVerified: true, identity: 'pending', agentLicenseActive: true, agentContactVerified: true, agentReviewValidUntil: Date.UTC(2026, 11, 1) },
    buyer: { id: 'buyer', emailVerified: true, identity: 'verified', agentLicenseActive: false, agentContactVerified: false, agentReviewValidUntil: null },
    unresolved: { id: 'unresolved', emailVerified: true, identity: 'pending', agentLicenseActive: true, agentContactVerified: false, agentReviewValidUntil: null },
  };
  const bookings: (Booking & { name: string; source: string; detail: string })[] = [
    { id: 'sample-1', visitorId: 'agent', revision: 1, mode: 'agent_private', status: 'requested', start: Date.UTC(2026,10,2,15), end: Date.UTC(2026,10,2,16), agentAttending: true, name: 'Sample Agent', source: 'MLS route · referral not authenticated', detail: 'Active license + independent business contact verified. Stripe waived. Agent must attend.' },
    { id: 'sample-2', visitorId: 'buyer', revision: 1, mode: 'owner_coordinated', status: 'requested', start: Date.UTC(2026,10,2,19), end: Date.UTC(2026,10,2,20), agentAttending: false, name: 'Sample Buyer', source: 'Public website', detail: 'Stripe ID + selfie verified (sample). Owner-coordinated only; no keybox email.' },
    { id: 'sample-3', visitorId: 'unresolved', revision: 1, mode: 'agent_private', status: 'requested', start: Date.UTC(2026,10,3,16), end: Date.UTC(2026,10,3,17), agentAttending: true, name: 'Agent awaiting contact check', source: 'MLS route · referral not authenticated', detail: 'License found, but business-contact ownership unresolved. Private access blocked.' },
  ];
  function log(message: string) { const li = document.createElement('li'); li.textContent = message; const logList = document.querySelector('#activity-log')!; logList.insertBefore(li, logList.firstChild); }
  function button(label: string, action: () => void, disabled = false) {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'button secondary'; el.textContent = label; el.disabled = disabled; el.addEventListener('click', action); return el;
  }
  function render() {
    const list = document.querySelector('#booking-list')!; list.replaceChildren();
    for (const booking of bookings) {
      const row = document.createElement('article'); row.className = 'booking-row';
      const h = document.createElement('h3'); h.textContent = booking.name;
      const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = booking.status;
      const when = document.createElement('p'); when.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(booking.start);
      const origin = document.createElement('p'); origin.className = 'hint'; origin.textContent = booking.source;
      const detail = document.createElement('p'); detail.textContent = booking.detail;
      const actions = document.createElement('div'); actions.className = 'actions';
      const eligible = requestEligibility(people[booking.visitorId], booking.mode, now);
      actions.appendChild(button('Approve sample', () => {
        if (!requestEligibility(people[booking.visitorId], booking.mode, now) || booking.status !== 'requested') return;
        booking.status = 'approved'; log(`${booking.name}: sample approved by owner.`);
        document.querySelector('#owner-result')!.textContent = 'Sample approved. No access code was created or emailed.'; render();
      }, !eligible || booking.status !== 'requested'));
      actions.appendChild(button('Cancel sample', () => {
        booking.status = 'canceled'; booking.revision++; log(`${booking.name}: canceled; previous job revision invalidated.`);
        document.querySelector('#owner-result')!.textContent = 'Sample canceled. Live cancellation will also stop pending emails and confirm code revocation.'; render();
      }, booking.status === 'canceled'));
      for (const child of [h, badge, when, origin, detail, actions]) row.appendChild(child); list.appendChild(row);
    }
    document.querySelector('#pending-count')!.textContent = String(bookings.filter(b => b.status === 'requested').length);
    document.querySelector('#approved-count')!.textContent = String(bookings.filter(b => b.status === 'approved').length);
  }
  let automation = false;
  document.querySelector('#toggle-automation')!.addEventListener('click', event => {
    automation = !automation; (event.currentTarget as HTMLButtonElement).textContent = automation ? 'Pause sample automation' : 'Enable sample automation';
    document.querySelector('#automation-state')!.textContent = automation ? 'Sample automation enabled. Live integrations remain disconnected.' : 'Sample automation is paused.';
    log(`Sample automation ${automation ? 'enabled' : 'paused'}.`);
  });
  let owners = ['Sample Owner A', 'Sample Owner B']; let nextOwner = 3;
  function renderOwners() {
    const list = document.querySelector('#owner-list')!; list.replaceChildren();
    for (const owner of owners) {
      const li = document.createElement('li'); li.appendChild(document.createTextNode(`${owner} · equal permissions `));
      li.appendChild(button(`Remove ${owner}`, () => {
        if (!mayRemoveOwner(owners.length, true)) return;
        owners = owners.filter(item => item !== owner); log(`${owner}: sample access removed.`); renderOwners();
      }, !mayRemoveOwner(owners.length, true))); list.appendChild(li);
    }
    document.querySelector('#owner-account-result')!.textContent = owners.length === 1 ? 'The last active owner cannot be removed.' : '';
  }
  document.querySelector('#add-owner')!.addEventListener('click', () => { owners.push(`Sample Owner ${nextOwner++}`); log('Fictional owner added; no invitation sent.'); renderOwners(); });
  document.querySelector('#sample-reply')!.addEventListener('click', () => {
    document.querySelector('#reply-result')!.textContent = 'Sample owner reply: “Yes, use your private booking page to send questions and feedback.”'; log('Sample reply added to the conversation.');
  });
  render(); renderOwners();
}
