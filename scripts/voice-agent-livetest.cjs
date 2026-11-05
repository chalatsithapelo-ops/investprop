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

  // --- Cross-session memory round-trip ---
  try {
    const marker = 'livetest-note-' + Date.now();
    const w = await bridge({ action: 'saveMemory', text: marker });
    const r = await bridge({ action: 'getMemory' });
    const notes = readOk(r) && r.body.result && Array.isArray(r.body.result.notes) ? r.body.result.notes : [];
    const found = notes.some((n) => n && typeof n.text === 'string' && n.text.indexOf(marker) !== -1);
    mark('memory save+recall round-trip', readOk(w) && readOk(r) && found, 'notes=' + notes.length);
  } catch (e) { mark('memory save+recall round-trip', false, e.message); }

  // --- AI chat (exercises the model end-to-end) ---
  try {
    const r = await bridge({ action: 'chat', persona: 'ACCOUNTANT', message: 'In one short sentence, what is my current portfolio status?' });
    const ok = r.status === 200 && r.body && r.body.ok === true;
    mark('chat(ACCOUNTANT) AI reply', ok, 'status=' + r.status + (ok && r.body.result && r.body.result.reply ? ' reply="' + String(r.body.result.reply).slice(0, 80).replace(/\s+/g, ' ') + '..."' : (r.body && r.body.reason ? ' reason=' + r.body.reason : '')));
  } catch (e) { mark('chat(ACCOUNTANT) AI reply', false, e.message); }

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
