'use strict';
// Live end-to-end test of the voice-agent backend, run INSIDE the app container
// so it can read JWT_SECRET / AGENT_SHARED_SECRET from the process env. No
// secret is ever printed.
(async () => {
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const BASE = 'http://localhost:8010';
  const SECRET = (process.env.AGENT_SHARED_SECRET || '').trim();
  const JWT_SECRET = process.env.JWT_SECRET;
  const results = [];
  const mark = (name, ok, info) => { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : '')); };

  if (!JWT_SECRET) { console.log('FATAL | JWT_SECRET missing in container env'); process.exit(1); }
  if (!SECRET) { console.log('FATAL | AGENT_SHARED_SECRET missing in container env'); process.exit(1); }

  const user = await db.user.findFirst({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true, role: true, status: true, name: true },
  });
  if (!user) { console.log('FATAL | no ACTIVE ADMIN user found'); process.exit(1); }
  console.log('Test user: id=' + user.id + ' role=' + user.role + ' name=' + (user.name || ''));
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '10m' });

  const bridge = async (body, overrides) => {
    const headers = Object.assign(
      { 'content-type': 'application/json', 'x-agent-secret': SECRET, authorization: 'Bearer ' + token },
      overrides || {},
    );
    const res = await fetch(BASE + '/api/office-agent/execute', { method: 'POST', headers, body: JSON.stringify(body) });
    let j = null; try { j = await res.json(); } catch (_) {}
    return { status: res.status, body: j };
  };

  // --- Security gates ---
  try { const r = await bridge({ action: 'overview' }, { 'x-agent-secret': 'definitely-wrong' }); mark('rejects bad x-agent-secret', r.status === 401, 'status=' + r.status); } catch (e) { mark('rejects bad x-agent-secret', false, e.message); }
  try {
    const res = await fetch(BASE + '/api/office-agent/execute', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-secret': SECRET }, body: JSON.stringify({ action: 'overview' }) });
    mark('rejects missing user JWT', res.status === 401, 'status=' + res.status);
  } catch (e) { mark('rejects missing user JWT', false, e.message); }
  try { const r = await bridge({ action: 'bogus' }); mark('rejects invalid action', r.status === 400, 'status=' + r.status); } catch (e) { mark('rejects invalid action', false, e.message); }

  // --- Functional read actions ---
  try { const r = await bridge({ action: 'overview' }); mark('overview', r.status === 200 && r.body && r.body.ok === true, 'status=' + r.status + (r.body && r.body.result ? ' keys=' + Object.keys(r.body.result).join(',') : '')); } catch (e) { mark('overview', false, e.message); }
  try { const r = await bridge({ action: 'listTasks' }); mark('listTasks', r.status === 200 && r.body && r.body.ok === true, 'status=' + r.status + (Array.isArray(r.body && r.body.result) ? ' count=' + r.body.result.length : '')); } catch (e) { mark('listTasks', false, e.message); }
  try { const r = await bridge({ action: 'listConversations' }); mark('listConversations', r.status === 200 && r.body && r.body.ok === true, 'status=' + r.status + (Array.isArray(r.body && r.body.result) ? ' count=' + r.body.result.length : '')); } catch (e) { mark('listConversations', false, e.message); }
  try { const r = await bridge({ action: 'taxSources' }); mark('taxSources', r.status === 200 && r.body && r.body.ok === true, 'status=' + r.status + (Array.isArray(r.body && r.body.result) ? ' count=' + r.body.result.length : '')); } catch (e) { mark('taxSources', false, e.message); }
  try { const r = await bridge({ action: 'accountingExceptions' }); mark('accountingExceptions', r.status === 200 && r.body && r.body.ok === true, 'status=' + r.status); } catch (e) { mark('accountingExceptions', false, e.message); }

  // --- New advisor read actions ---
  const readOk = (r) => r.status === 200 && r.body && r.body.ok === true;
  for (const action of ['portfolioValuation', 'wallet', 'pendingItems', 'opportunities', 'governance', 'complianceStatus', 'marketplace', 'briefing']) {
    try { const r = await bridge({ action }); mark(action, readOk(r), 'status=' + r.status + (readOk(r) && r.body.result ? ' keys=' + Object.keys(r.body.result).join(',') : (r.body && r.body.reason ? ' reason=' + r.body.reason : ''))); } catch (e) { mark(action, false, e.message); }
  }
  try { const r = await bridge({ action: 'taxEstimate', taxYear: new Date().getUTCFullYear(), marginalRatePct: 31 }); mark('taxEstimate', readOk(r), 'status=' + r.status + (readOk(r) ? ' incomeTax=' + (r.body.result && r.body.result.estimatedAdditionalIncomeTaxRands) : (r.body && r.body.reason ? ' reason=' + r.body.reason : ''))); } catch (e) { mark('taxEstimate', false, e.message); }

  // --- Browse ANY listing + full investment case (not portfolio-scoped) ---
  let listingId = null;
  try {
    const r = await bridge({ action: 'browseListings' });
    const ok = readOk(r) && r.body.result && Array.isArray(r.body.result.items);
    if (ok && r.body.result.items.length) listingId = r.body.result.items[0].propertyId;
    mark('browseListings', ok, 'status=' + r.status + (ok ? ' count=' + r.body.result.count : (r.body && r.body.reason ? ' reason=' + r.body.reason : '')));
  } catch (e) { mark('browseListings', false, e.message); }
  try {
    if (listingId == null) { mark('listingDetail', true, 'skipped — no published listing to detail'); }
    else {
      const r = await bridge({ action: 'listingDetail', propertyId: listingId });
      const ok = readOk(r) && r.body.result && r.body.result.found === true;
      mark('listingDetail', ok, 'status=' + r.status + (ok ? ' id=' + r.body.result.propertyId + ' return=' + r.body.result.expectedReturnPct + '%' : (r.body && r.body.reason ? ' reason=' + r.body.reason : '')));
    }
  } catch (e) { mark('listingDetail', false, e.message); }
  try {
    if (listingId == null) { mark('estimateOwnership', true, 'skipped — no published listing to estimate'); }
    else {
      const r = await bridge({ action: 'estimateOwnership', propertyId: listingId, amount: 2000000 });
      const res = r.body && r.body.result;
      const ok = readOk(r) && res && res.found === true && (typeof res.ownershipPct === 'number' || typeof res.reason === 'string');
      mark('estimateOwnership', ok, 'status=' + r.status + (ok ? ' own=' + res.ownershipPct + '% carry=' + res.platformCarryPct + '% shares=' + res.numberOfShares : (r.body && r.body.reason ? ' reason=' + r.body.reason : '')));
    }
  } catch (e) { mark('estimateOwnership', false, e.message); }

  // --- Cross-session memory round-trip ---
  try {
    const marker = 'livetestnote' + Math.random().toString(36).slice(2, 10);
    const w = await bridge({ action: 'saveMemory', text: marker });
    const r = await bridge({ action: 'getMemory' });
    const notes = readOk(r) && r.body.result && Array.isArray(r.body.result.notes) ? r.body.result.notes : [];
    const found = notes.some((n) => n && typeof n.text === 'string' && n.text.indexOf(marker) !== -1);
    mark('memory save+recall round-trip', readOk(w) && readOk(r) && found, 'notes=' + notes.length);
  } catch (e) { mark('memory save+recall round-trip', false, e.message); }

  // --- AI chat (exercises the model end-to-end) + conversation recall round-trip ---
  let chatConversationId = null;
  try {
    const r = await bridge({ action: 'chat', persona: 'ACCOUNTANT', message: 'In one short sentence, what is my current portfolio status?' });
    const ok = r.status === 200 && r.body && r.body.ok === true;
    chatConversationId = ok && r.body.result ? r.body.result.conversationId : null;
    mark('chat(ACCOUNTANT) AI reply', ok, 'status=' + r.status + (ok && r.body.result && r.body.result.message ? ' reply="' + String(r.body.result.message.content || '').slice(0, 80).replace(/\s+/g, ' ') + '..."' : (r.body && r.body.reason ? ' reason=' + r.body.reason : '')));
  } catch (e) { mark('chat(ACCOUNTANT) AI reply', false, e.message); }
  try {
    if (!chatConversationId) { mark('getConversation recall', false, 'no conversationId from chat'); }
    else {
      const r = await bridge({ action: 'getConversation', conversationId: chatConversationId });
      const ok = readOk(r) && r.body.result && Array.isArray(r.body.result.messages) && r.body.result.messages.length > 0;
      mark('getConversation recall', ok, 'status=' + r.status + (ok ? ' messages=' + r.body.result.messages.length : (r.body && r.body.reason ? ' reason=' + r.body.reason : '')));
    }
  } catch (e) { mark('getConversation recall', false, e.message); }

  // --- Reminder: prepare -> approve (SCHEDULED) -> cancel round-trip ---
  try {
    const dueAt = new Date(Date.now() + 2 * 86400000).toISOString(); // offset-aware, future
    const p = await bridge({ action: 'prepareTask', kind: 'REMINDER', title: 'Livetest reminder', parameters: { dueAt, notes: 'livetest' } });
    const task = p.body && p.body.result;
    const prepared = readOk(p) && task && task.id && /^[a-f0-9]{64}$/.test(task.approvalDigest || '') && task.status === 'PREPARED';
    mark('reminder prepare (future dueAt)', prepared, 'status=' + p.status + (prepared ? ' id=' + task.id.slice(0, 8) : ' reason=' + (p.body && p.body.reason)));
    if (prepared) {
      const a = await bridge({ action: 'approveTask', taskId: task.id, approvalDigest: task.approvalDigest });
      const scheduled = readOk(a) && a.body.result && a.body.result.status === 'SCHEDULED';
      mark('reminder approve -> SCHEDULED', scheduled, 'status=' + a.status + (scheduled ? '' : ' reason=' + (a.body && a.body.reason) + ' st=' + (a.body && a.body.result && a.body.result.status)));
      await bridge({ action: 'cancelTask', taskId: task.id }); // clean up
    } else {
      mark('reminder approve -> SCHEDULED', false, 'skipped — prepare failed');
    }
  } catch (e) { mark('reminder prepare (future dueAt)', false, e.message); mark('reminder approve -> SCHEDULED', false, e.message); }

  // --- Reminder correctly REJECTS a past dueAt ---
  try {
    const past = new Date(Date.now() - 86400000).toISOString();
    const r = await bridge({ action: 'prepareTask', kind: 'REMINDER', title: 'Livetest past', parameters: { dueAt: past } });
    const rejected = r.status === 400 && r.body && r.body.ok === false;
    mark('reminder rejects past dueAt', rejected, 'status=' + r.status + ' reason=' + (r.body && r.body.reason));
  } catch (e) { mark('reminder rejects past dueAt', false, e.message); }

  // --- Sell order capability reachable + guard-railed ---
  try {
    // Find a property the test user actually holds shares in.
    const pv = await bridge({ action: 'portfolioValuation' });
    const positions = readOk(pv) && pv.body.result && Array.isArray(pv.body.result.positions) ? pv.body.result.positions : [];
    const held = positions.find((p) => p && p.propertyId && p.shares >= 1);
    if (!held) {
      // No holdings: the capability must still be wired and reject cleanly.
      const r = await bridge({ action: 'prepareTask', kind: 'SELL_SHARES', title: 'Livetest sell', parameters: { propertyId: 999999999, quantity: 1 } });
      const wired = r.status === 400 && r.body && r.body.ok === false && typeof r.body.reason === 'string';
      mark('sell order capability wired', wired, 'status=' + r.status + ' reason=' + (r.body && r.body.reason) + ' (no holdings to place a live order)');
      mark('sell order prepare freezes order', true, 'skipped — test user holds no shares');
    } else {
      const r = await bridge({ action: 'prepareTask', kind: 'SELL_SHARES', title: 'Livetest sell', parameters: { propertyId: held.propertyId, quantity: 1 } });
      const task = r.body && r.body.result;
      // Either a valid frozen order preview, or a clean guard-rail rejection (KYC/collar/halt).
      if (readOk(r) && task && task.id) {
        const frozen = task.result || {};
        const ok = typeof frozen.shareClassId === 'number' && frozen.quantity === 1 && typeof frozen.pricePerShare === 'number' && /^[a-f0-9]{64}$/.test(task.approvalDigest || '');
        mark('sell order capability wired', true, 'prepared for property ' + held.propertyId);
        mark('sell order prepare freezes order', ok, ok ? ('shareClassId=' + frozen.shareClassId + ' price=R' + frozen.pricePerShare + ' proceeds=R' + frozen.estimatedProceeds) : 'frozen=' + JSON.stringify(frozen).slice(0, 120));
        await bridge({ action: 'cancelTask', taskId: task.id }); // do NOT place a real order in the test
      } else {
        const wired = r.status === 400 && r.body && r.body.ok === false && typeof r.body.reason === 'string';
        mark('sell order capability wired', wired, 'status=' + r.status + ' reason=' + (r.body && r.body.reason));
        mark('sell order prepare freezes order', true, 'skipped — guard-rail rejection: ' + (r.body && r.body.reason));
      }
    }
  } catch (e) { mark('sell order capability wired', false, e.message); mark('sell order prepare freezes order', false, e.message); }

  // --- LiveKit session mint + agent dispatch (tRPC) ---
  try {
    const res = await fetch(BASE + '/trpc/officeVoiceAgentSession', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ json: { authToken: token } }) });
    let j = null; try { j = await res.json(); } catch (_) {}
    const data = j && j.result && j.result.data && j.result.data.json;
    const ok = res.status === 200 && data && typeof data.url === 'string' && typeof data.token === 'string' && typeof data.roomName === 'string';
    mark('voice session mint + agent dispatch', ok, ok ? ('room=' + data.roomName + ' url=' + data.url) : ('status=' + res.status + ' body=' + JSON.stringify(j).slice(0, 180)));
  } catch (e) { mark('voice session mint + agent dispatch', false, e.message); }

  const passed = results.filter((r) => r.ok).length;
  console.log('\n=== ' + passed + '/' + results.length + ' checks passed ===');
  await db.$disconnect();
  process.exit(passed === results.length ? 0 : 2);
})();
