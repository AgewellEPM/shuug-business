import { HttpError, STATES, STAGES, digest, secret, text, email, state, https, seal, unseal, visible, metadata, officeInput, officeIdentity, independenceVerified, termsValid, outreach } from './model.mjs';
import { agreement } from './terms.mjs';
import { payments } from './payments.mjs';
import { listingInput, supportInput } from './directory.mjs';
import { PROSPECT_ACTIONS, prospectTools, verificationUpdate } from './prospect-tools.mjs';
import { enrollmentEligibility, initialBilling, reconcileEnrollment } from './billing.mjs';
import { patchReviewed } from './atomic.mjs';

export function service(env, db, payment = payments(env), tools = {}) {
  const key = env.GIGTAX_SALES_SESSION_KEY;
  const ownerHash = env.GIGTAX_SALES_OWNER_HASH;
  const owner = { id: 'owner', name: 'Workspace owner', role: 'owner', states: [] };
  const prospects = prospectTools(env, db, tools);
  const reconcile = tools.billingReconciler || reconcileEnrollment;
  const publicUser = u => ({ id: u.id, name: u.name, email: u.email || '', role: u.role, states: u.states });
  const rosterUser = r => ({ id: String(r.id), name: r.contact_name, email: r.contact_email, role: 'agent', states: metadata(r).states || [] });
  async function identity(token) {
    const session = unseal(token || '', key);
    if (!session) throw new HttpError(401, 'Sign in with your sales access code.');
    if (session.ownerHash && session.ownerHash === ownerHash) return owner;
    const row = await db.get('agents', session.id);
    if (!row || row.status !== 'active' || metadata(row).codeHash !== session.codeHash) throw new HttpError(401, 'This access code has expired or was revoked.');
    return rosterUser(row);
  }
  async function leadFor(user, id) {
    const lead = await db.get('offices', id);
    if (!lead || !visible(user, lead)) throw new HttpError(404, 'Office not found in your assignments.');
    return lead;
  }
  const audit = (user, leadId, action, detail) => db.create('events', { town: `${action} ${secret().slice(0, 12)}`, contact_name: user.name, assigned_to: String(leadId), status: 'recorded', notes: JSON.stringify({ actorId: user.id, action, detail, at: new Date().toISOString() }) });
  async function login(body) {
    const code = text(body.code, 200, true), codeHash = digest(code);
    let user, session;
    if (codeHash === ownerHash) { user = owner; session = { ownerHash }; }
    else {
      const address = email(body.email);
      const row = (await db.list('agents')).find(r => r.status === 'active' && r.contact_email === address && metadata(r).codeHash === codeHash);
      if (!row) throw new HttpError(401, 'Check your email and access code.');
      user = rosterUser(row); session = { id: String(row.id), codeHash };
    }
    return { user: publicUser(user), token: seal({ ...session, exp: Date.now() + 8 * 3600000 }, key) };
  }
  async function dispatch(user, action, b = {}) {
    if (action === 'bootstrap') {
      const [all, agents, terms, enrollments] = await Promise.all([db.list('offices'), db.list('agents'), db.terms(), db.list('enrollments')]);
      const offices = all.filter(r => visible(user, r)).map(row => {
        const memberships = enrollments.filter(e => String(metadata(e).leadId) === String(row.id));
        const current = memberships.filter(e => metadata(e).payment?.live === true).sort((a,b) => Number(b.id) - Number(a.id))[0];
        return current ? { ...row, membership: enrollmentEligibility(current) } : row;
      });
      return { user: publicUser(user), offices, agents: agents.filter(r => r.status === 'active').map(r => ({ id: String(r.id), name: r.contact_name, states: metadata(r).states || [] })), terms: termsValid(terms) ? { version: terms.version, hash: terms.hash, title: terms.title } : null, paymentsConfigured:payment.configured(), states: STATES, stages: STAGES };
    }
    if (action === 'search') {
      const region = state(b.state), city = text(b.city, 100, true);
      if (user.states.length && !user.states.includes(region)) throw new HttpError(403, 'This state is outside your territory.');
      const offset = b.offset === undefined ? 0 : Number(b.offset);
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new HttpError(400, 'Choose a valid search page.');
      return db.discover(region, city, { offset, limit: 50 });
    }
    if (PROSPECT_ACTIONS.has(action)) return prospects(user, await leadFor(user, b.id), action, b);
    if (action === 'create-office') {
      const input = officeInput(b);
      if (user.states.length && !user.states.includes(input.state)) throw new HttpError(403, 'This state is outside your territory.');
      const identity = officeIdentity(input.name, input.address, input.city, input.state);
      const duplicate = (await db.list('offices')).find(r => officeIdentity(r.town, metadata(r).address, r.locality, r.state) === identity);
      if (duplicate) { if (!visible(user, duplicate)) throw new HttpError(409, 'This office is already in the team pipeline. Ask the owner about its assignment.'); return { office: duplicate, duplicate: true }; }
      let assigned = user.id;
      if (user.role === 'owner' && b.assignedTo && b.assignedTo !== 'owner') {
        const agent = await db.get('agents', b.assignedTo);
        if (!agent || agent.status !== 'active' || (metadata(agent).states.length && !metadata(agent).states.includes(input.state))) throw new HttpError(400, 'Choose an active agent covering this state.');
        assigned = String(agent.id);
      }
      const row = await db.create('offices', { town: input.name, state: input.state, contact_name: input.contact, contact_email: input.email, contact_phone: input.phone, locality: input.city, assigned_to: assigned, category: 'local_business', status: 'new', notes: JSON.stringify({ address: input.address, postalCode: input.postalCode, website: input.website, source: input.source, independence: 'unverified', contactRole: 'unverified', contactVerified: false, emailVerified: false, sourceCheckedAt: new Date().toISOString() }) });
      await audit(user, row.id, 'office_created', input.name);
      return { office: row };
    }
    if (action === 'office') {
      const office = await leadFor(user, b.id), events = (await db.list('events')).filter(r => String(r.assigned_to) === String(office.id));
      const enrollments = (await db.list('enrollments')).filter(r => String(metadata(r).leadId) === String(office.id)).map(r => {
        const saved = metadata(r), expired = !saved.payment?.live && saved.expiresAt < Date.now();
        return { id: r.id, status: saved.payment?.live ? enrollmentEligibility(r).status : expired ? 'invitation_expired' : r.status, contact_name: r.contact_name, contact_email: r.contact_email, created_at: r.created_at, acceptedAt: saved.acceptedAt || null, hasLivePayment: saved.payment?.live === true, expired: expired || r.status === 'checkout_expired' };
      });
      return { office, events, enrollments, drafts: outreach(office) };
    }
    if (action === 'update-office') {
      const before = await leadFor(user, b.id);
      const patch = {};
      if (b.stage !== undefined) {
        if (!STAGES.includes(b.stage) || ['active', 'invited'].includes(b.stage)) throw new HttpError(400, 'Activation is recorded through owner acceptance of an invitation.');
        if (before.status === 'active') throw new HttpError(409, 'An active enrollment cannot be changed from the prospect stage control.');
        patch.status = b.stage;
      }
      if (b.contact !== undefined) patch.contact_name = text(b.contact, 140);
      if (b.email !== undefined) patch.contact_email = b.email ? email(b.email) : '';
      if (b.phone !== undefined) patch.contact_phone = text(b.phone, 60);
      if (b.nextFollowup !== undefined) {
        if (typeof b.nextFollowup !== 'string' || (b.nextFollowup && (!/^\d{4}-\d{2}-\d{2}$/.test(b.nextFollowup) || !Number.isFinite(Date.parse(b.nextFollowup + 'T12:00:00Z')) || new Date(b.nextFollowup + 'T12:00:00Z').toISOString().slice(0,10) !== b.nextFollowup))) throw new HttpError(400, 'Choose a valid follow-up date.');
        patch.meeting_date = b.nextFollowup || null;
      }
      let info = verificationUpdate(b, before, user);
      if (b.independence !== undefined) {
        if (!['unverified', 'independent', 'chain'].includes(b.independence)) throw new HttpError(400, 'Choose an ownership finding.');
        if (b.independence === 'independent' && !independenceVerified(metadata(before))) throw new HttpError(400, 'Use the ownership verification tool to record source evidence first.');
        info = { ...(info || metadata(before)), independence: b.independence };
      }
      if (info) patch.notes = JSON.stringify(info);
      if (b.assignedTo !== undefined) {
        if (user.role !== 'owner') throw new HttpError(403, 'Only the owner can reassign offices.');
        if (b.assignedTo !== 'owner') { const a = await db.get('agents', b.assignedTo); if (!a || a.status !== 'active' || (metadata(a).states.length && !metadata(a).states.includes(before.state))) throw new HttpError(400, 'Choose an active agent covering this state.'); }
        patch.assigned_to = b.assignedTo;
      }
      const office = await patchReviewed(db, 'offices', before, patch);
      await audit(user, before.id, 'office_updated', patch);
      return { office };
    }
    if (action === 'activity') {
      const lead = await leadFor(user, b.id);
      const kind = text(b.kind, 30, true), note = text(b.note, 3000, true);
      if (!['note', 'call', 'email', 'meeting'].includes(kind)) throw new HttpError(400, 'Choose an activity type.');
      const event = await audit(user, lead.id, kind, note);
      return { event };
    }
    if (action === 'invite') {
      const lead = await leadFor(user, b.id), info = metadata(lead), terms = await db.terms();
      if (!termsValid(terms)) throw new HttpError(409, 'The workspace owner must approve and publish the enrollment terms first.');
      if (!independenceVerified(info) || ['do_not_contact', 'not_interested', 'active'].includes(lead.status)) throw new HttpError(409, 'Confirm independent ownership with source evidence and the office’s interest before inviting.');
      const ownerEmail = email(b.email), ownerName = text(b.ownerName, 140, true), token = secret();
      const current=(await db.list('enrollments')).find(r=>String(metadata(r).leadId)===String(lead.id)&&['invited','payment_pending','active'].includes(r.status));
      if(current){const m=metadata(current),saved=unseal(m.sealedToken||'',key);if(saved?.token&&current.contact_email===ownerEmail&&m.expiresAt>Date.now())return {enrollmentId:current.id,link:`${env.GIGTAX_SALES_ORIGIN}/office-signup#${new URLSearchParams({id:current.id,token:saved.token})}`,expiresInDays:Math.max(0,Math.floor((m.expiresAt-Date.now())/86400000))};throw new HttpError(409,'This office already has an enrollment. Review its payment and invitation status before creating another.');}
      const expiresAt=Date.now()+14*86400000;
      if (info.invitationPendingUntil > Date.now()) throw new HttpError(409, 'An invitation is being prepared. Refresh before trying again.');
      await patchReviewed(db, 'offices', lead, { status: 'invited', notes: JSON.stringify({ ...info, invitationPendingUntil: Date.now() + 120000 }) });
      const enrollment = await db.create('enrollments', { town: `Invitation ${secret().slice(0, 12)}`, state: lead.state, contact_name: ownerName, contact_email: ownerEmail, assigned_to: user.id, status: 'invited', notes: JSON.stringify({ leadId: String(lead.id), officeName: lead.town, address: info.address, state: lead.state, agentId: user.id, tokenHash: digest(token), sealedToken:seal({token,exp:expiresAt},key), terms, expiresAt }) });
      await audit(user, lead.id, 'invitation_created', { enrollmentId: enrollment.id, ownerEmail });
      return { enrollmentId: enrollment.id, link: `${env.GIGTAX_SALES_ORIGIN}/office-signup#${new URLSearchParams({ id: enrollment.id, token })}`, expiresInDays: 14 };
    }
    if (user.role !== 'owner') throw new HttpError(403, 'Only the workspace owner can manage sales-agent access.');
    if (action === 'refresh-billing') return reconcile(env, db, b.enrollmentId || b.id);
    if (action === 'renew-invitation') {
      if (b.reviewed !== true) throw new HttpError(400, 'Review the expired invitation before preparing another one.');
      const reason = text(b.reason || '', 900, true), lead = await leadFor(user, b.id);
      if (['do_not_contact', 'not_interested', 'active'].includes(lead.status) || !independenceVerified(metadata(lead))) throw new HttpError(409, 'Confirm independent ownership and the office’s interest before renewing an invitation.');
      const existing = (await db.list('enrollments')).filter(r => String(metadata(r).leadId) === String(lead.id));
      if (!existing.length) throw new HttpError(409, 'Create the first owner invitation from this office record.');
      if (existing.some(r => metadata(r).payment?.live)) throw new HttpError(409, 'This office has a paid membership. Review its billing and agreement before considering any new enrollment.');
      const prior = existing.slice().sort((a,b) => Number(b.id) - Number(a.id))[0];
      const ownerEmail = email(b.email || lead.contact_email || prior.contact_email), ownerName = text(b.ownerName || lead.contact_name || prior.contact_name, 140, true);
      const pending = existing.filter(r => ['invited', 'payment_pending', 'checkout_expired'].includes(r.status));
      for (const row of pending) {
        const saved = metadata(row);
        if (saved.checkoutId) {
          if (typeof payment.checkoutState !== 'function') throw new HttpError(503, 'The payment connection must verify the old checkout before a new invitation can be issued.');
          const checkout = await payment.checkoutState(row, saved);
          if (checkout.paymentStatus === 'paid' || checkout.status !== 'expired') throw new HttpError(409, 'The old checkout is paid or still open. Review it before making another invitation.');
        } else if (!(saved.expiresAt < Date.now())) throw new HttpError(409, 'The current invitation is still available. Reuse its existing private link.');
        await patchReviewed(db, 'enrollments', row, { status: 'expired', notes: JSON.stringify({ ...saved, renewalReview: { reason, at: new Date().toISOString(), by: user.id } }) });
      }
      const latest = await leadFor(user, b.id);
      if (['do_not_contact', 'not_interested', 'active'].includes(latest.status) || !independenceVerified(metadata(latest))) throw new HttpError(409, 'The office changed during invitation review. Refresh before trying again.');
      await patchReviewed(db, 'offices', latest, { status: 'interested', notes: JSON.stringify({ ...metadata(latest), invitationPendingUntil: 0 }) });
      await audit(user, lead.id, 'expired_invitation_reviewed', reason);
      return dispatch(user, 'invite', { id: lead.id, email: ownerEmail, ownerName });
    }
    if (action === 'directory-settings') return { support: await db.support() };
    if (action === 'save-directory-support') {
      const support = supportInput(b);
      await db.setSupport(support);
      await audit(user, 'directory', 'public_support_updated', support);
      return { support };
    }
    if (action === 'save-office-listing') {
      const before = await leadFor(user, b.id), clean = listingInput(b);
      const listing = clean.enabled ? clean : { ...metadata(before).publicListing, enabled: false };
      const office = await patchReviewed(db, 'offices', before, { notes: JSON.stringify({ ...metadata(before), publicListing: listing }) });
      await audit(user, before.id, 'public_listing_updated', listing);
      return { office };
    }
    if (action === 'publish-terms') {
      const terms = agreement(b);
      await db.setTerms(terms);
      return { terms };
    }
    if (action === 'preview-terms') return {terms:agreement({...b,approved:true})};
    if (action === 'create-agent') {
      const address = email(b.email), name = text(b.name, 140, true), states = b.states;
      if (!Array.isArray(states) || states.length > 51 || states.some(v => !STATES.includes(v))) throw new HttpError(400, 'Choose valid territories.');
      if ((await db.list('agents')).some(r => r.status === 'active' && r.contact_email === address)) throw new HttpError(409, 'An active agent already uses that email.');
      const code = secret();
      const row = await db.create('agents', { town: `Sales agent ${secret().slice(0, 12)}`, contact_name: name, contact_email: address, status: 'active', notes: JSON.stringify({ codeHash: digest(code), states: [...new Set(states)] }) });
      return { agent: publicUser(rosterUser(row)), code };
    }
    if (action === 'revoke-agent') {
      const row = await db.get('agents', b.id);
      if (!row) throw new HttpError(404, 'Agent not found.');
      await db.patch('agents', row.id, { status: 'revoked' });
      return { revoked: true };
    }
    throw new HttpError(404, 'Unknown sales action.');
  }
  async function invitation(id, token) {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token || '')) throw new HttpError(404, 'Invitation not found.');
    const row = await db.get('enrollments', id), info = row && metadata(row);
    if (!row || info.tokenHash !== digest(token) || !['invited', 'payment_pending', 'active'].includes(row.status)) throw new HttpError(404, 'Invitation not found.');
    if (row.status !== 'active' && info.expiresAt < Date.now()) throw new HttpError(410, 'This invitation expired. Ask your agent for a new one.');
    const lead = await db.get('offices', info.leadId);
    if (!lead || !independenceVerified(metadata(lead)) || ['do_not_contact', 'not_interested'].includes(lead.status)) throw new HttpError(410, 'This invitation is no longer available.');
    return { row, info, lead };
  }
  async function signup(action, b) {
    const { row, info, lead } = await invitation(b.id, b.token);
    if (action === 'view') return { id: row.id, office: info.officeName, address: info.address, ownerName: row.contact_name, email: row.contact_email, terms: info.terms, status: row.status, acceptedAt: info.acceptedAt || null, paymentsConfigured:payment.configured() };
    if (action === 'confirm') return fulfill(row.id);
    if (action !== 'accept') throw new HttpError(404, 'Unknown signup action.');
    if (row.status === 'active') {
      return fulfill(row.id);
    }
    if (!payment.configured()) throw new HttpError(503,'Payment connection is not ready. No payment was taken and this office has not been activated.');
    if (b.accepted !== true || b.authorized !== true || b.independent !== true || b.termsHash !== info.terms.hash) throw new HttpError(400, 'Review and accept these terms and confirm your authority and independent ownership.');
    if (email(b.email) !== row.contact_email) throw new HttpError(400, 'Use the business email named on this invitation.');
    const signature = text(b.signature, 140, true), acceptedAt = info.acceptedAt || new Date().toISOString();
    const signed={...info,signature:info.signature||signature,acceptedAt,acceptedEmail:row.contact_email,receiptVersion:2};
    await patchReviewed(db,'enrollments',row,{status:'payment_pending',notes:JSON.stringify(signed)});
    const checkout=await payment.create(row,signed,b.token);
    if(checkout.status==='complete'&&checkout.payment_status==='paid')return fulfill(row.id,checkout.id);
    // Payment verification can recover a completed session even if a webhook won
    // the race before this response. Never write an old pending body over it.
    const latest=await db.get('enrollments',row.id),latestInfo=metadata(latest);
    if(latest.status==='payment_pending' && !latestInfo.payment?.live) await patchReviewed(db,'enrollments',latest,{notes:JSON.stringify({...latestInfo,checkoutId:checkout.id})});
    return {pending:true,checkoutUrl:checkout.url,checkoutId:checkout.id};
  }
  function receipt(row,info){return {active:true,receipt:row.id,acceptedAt:info.acceptedAt,office:info.officeName,signature:info.signature,termsHash:info.terms.hash,payment:info.payment};}
  async function fulfill(id,sessionId){
    const row=await db.get('enrollments',id);if(!row)throw new HttpError(404,'Enrollment not found.');const info=metadata(row);
    if(!info.signature||!info.acceptedAt||!['payment_pending','active'].includes(row.status))throw new HttpError(409,'Terms acceptance has not been recorded.');
    if(row.status==='active'&&info.payment?.live) {
      if(sessionId&&sessionId!==info.payment.checkoutId)throw new HttpError(409,'Payment does not match.');
      await reconcile(env,db,row.id);
      const latest = await db.get('enrollments',row.id), saved = metadata(latest), eligible = enrollmentEligibility(latest);
      if (!eligible.eligible) throw new HttpError(409,eligible.reason);
      const office = await db.get('offices',info.leadId); if (office.status !== 'active') await patchReviewed(db,'offices',office,{status:'active'});return receipt(latest,saved);
    }
    const verified=await payment.verify(row,info,sessionId||info.checkoutId);
    if(!verified.live)throw new HttpError(409,'Test payment verified. A test payment does not activate a live office.');
    const active={...info,payment:verified,billing:initialBilling(verified),initialPaymentVerifiedAt:new Date().toISOString()};
    await patchReviewed(db,'enrollments',row,{status:'payment_pending',notes:JSON.stringify(active)});
    await reconcile(env,db,row.id);
    const latest = await db.get('enrollments',row.id), saved = metadata(latest), eligible = enrollmentEligibility(latest);
    if (!eligible.eligible) throw new HttpError(409,eligible.reason);
    const office = await db.get('offices',info.leadId); if (office.status !== 'active') await patchReviewed(db,'offices',office,{status:'active'});
    return receipt(latest,saved);
  }
  return { identity, login, dispatch, signup, fulfill };
}
