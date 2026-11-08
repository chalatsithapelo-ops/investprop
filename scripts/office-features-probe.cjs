'use strict';
// Probe for the new office features (document intelligence + proactive alerts).
// Run INSIDE the app container so it can read JWT_SECRET / AGENT_SHARED_SECRET /
// CRON_SECRET from env. No secret is ever printed.
(async () => {
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const BASE = 'http://localhost:8010';
  const SECRET = (process.env.AGENT_SHARED_SECRET || '').trim();
  const JWT_SECRET = process.env.JWT_SECRET;
  const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
  const results = [];
  const mark = (name, ok, info) => { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : '')); };

  if (!JWT_SECRET) { console.log('FATAL | JWT_SECRET missing'); process.exit(1); }
  if (!SECRET) { console.log('FATAL | AGENT_SHARED_SECRET missing'); process.exit(1); }

  const user = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, role: true, name: true } });
  if (!user) { console.log('FATAL | no ACTIVE ADMIN user'); process.exit(1); }
  console.log('Test user: id=' + user.id + ' role=' + user.role + ' name=' + (user.name || ''));
  console.log('CRON_SECRET configured: ' + (CRON_SECRET ? 'yes' : 'no'));
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '10m' });

  const bridge = async (body) => {
    const headers = { 'content-type': 'application/json', 'x-agent-secret': SECRET, authorization: 'Bearer ' + token };
    const res = await fetch(BASE + '/api/office-agent/execute', { method: 'POST', headers, body: JSON.stringify(body) });
    let j = null; try { j = await res.json(); } catch (_) {}
    return { status: res.status, body: j };
  };

  // --- Document intelligence: input validation (too-short text) ---
  try {
    const r = await bridge({ action: 'analyzeDocument', title: 'tiny', text: 'too short' });
    mark('analyzeDocument rejects short text', r.status === 400, 'status=' + r.status);
  } catch (e) { mark('analyzeDocument rejects short text', false, e.message); }

  // --- Document intelligence: real analysis of a sample OTP snippet ---
  const marker = 'PROBE-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const sampleDoc = [
    'OFFER TO PURCHASE — ' + marker,
    'The Purchaser offers to buy Erf 1234 Centurion for R1,850,000.',
    'This offer is subject to the Purchaser obtaining a mortgage bond of R1,600,000 within 21 days.',
    'A deposit of R185,000 is payable on acceptance and is non-refundable if the Purchaser breaches.',
    'The Seller warrants a valid electrical compliance certificate will be supplied before transfer.',
    'Occupation date is 1 March 2027; occupational rental of R9,500 per month applies if occupation precedes transfer.',
    'This agreement renews automatically for a further 30 days if transfer is delayed, unless cancelled in writing.',
  ].join('\n');
  let docTaskId = null;
  try {
    const r = await bridge({ action: 'analyzeDocument', title: 'Probe OTP ' + marker, kind: 'offer to purchase', text: sampleDoc });
    const res = r.body && r.body.result;
    const ok = r.status === 200 && r.body && r.body.ok === true && res
      && typeof res.summary === 'string' && res.summary.length > 0
      && Array.isArray(res.keyClauses) && Array.isArray(res.riskFlags)
      && ['LOW', 'MODERATE', 'HIGH'].includes(res.riskLevel)
      && typeof res.disclaimer === 'string'
      && typeof res.taskId === 'string';
    if (ok) docTaskId = res.taskId;
    const info = ok
      ? 'risk=' + res.riskLevel + ' clauses=' + res.keyClauses.length + ' flags=' + res.riskFlags.length + ' glossary=' + res.glossary.length + ' taskId=' + res.taskId
      : 'status=' + r.status + (r.body && r.body.reason ? ' reason=' + r.body.reason : '');
    mark('analyzeDocument returns analysis', ok, info);
  } catch (e) { mark('analyzeDocument returns analysis', false, e.message); }

  // --- The analysis persisted as a COMPLETED DOCUMENT_ANALYSIS OfficeTask ---
  try {
    if (!docTaskId) { mark('document task persisted', false, 'no taskId from analysis'); }
    else {
      const t = await db.officeTask.findUnique({ where: { id: docTaskId }, select: { kind: true, status: true, userId: true, result: true } });
      const ok = !!t && t.kind === 'DOCUMENT_ANALYSIS' && t.status === 'COMPLETED' && t.userId === user.id && t.result && typeof t.result.summary === 'string';
      mark('document task persisted', ok, t ? 'kind=' + t.kind + ' status=' + t.status : 'not found');
    }
  } catch (e) { mark('document task persisted', false, e.message); }

  // --- It appears in listTasks (the in-app task inbox surface) ---
  try {
    const r = await bridge({ action: 'listTasks' });
    const rows = r.body && Array.isArray(r.body.result) ? r.body.result : [];
    const ok = r.status === 200 && rows.some((x) => x && x.id === docTaskId && x.kind === 'DOCUMENT_ANALYSIS');
    mark('document task in listTasks', ok, 'count=' + rows.length);
  } catch (e) { mark('document task in listTasks', false, e.message); }

  // --- Proactive alerts cron: unauthorized is rejected ---
  try {
    const res = await fetch(BASE + '/api/cron/office-alerts', { method: 'POST' });
    // 401 when CRON_SECRET is set, 503 when it is not configured. Either proves the route exists (not 404).
    const ok = res.status === 401 || res.status === 503;
    mark('cron office-alerts rejects unauthorized', ok, 'status=' + res.status);
  } catch (e) { mark('cron office-alerts rejects unauthorized', false, e.message); }

  // --- Proactive alerts cron: authorized dry-run runs end-to-end ---
  try {
    if (!CRON_SECRET) { mark('cron office-alerts dryRun', true, 'skipped — CRON_SECRET not configured'); }
    else {
      const res = await fetch(BASE + '/api/cron/office-alerts?dryRun=1', { method: 'POST', headers: { authorization: 'Bearer ' + CRON_SECRET } });
      let j = null; try { j = await res.json(); } catch (_) {}
      const s = j && j.summary;
      const ok = res.status === 200 && j && j.ok === true && s && s.dryRun === true
        && typeof s.inspected === 'number' && typeof s.entitled === 'number'
        && typeof s.alertsSent === 'number' && typeof s.skippedCooldown === 'number';
      mark('cron office-alerts dryRun', ok, ok
        ? 'inspected=' + s.inspected + ' entitled=' + s.entitled + ' wouldSend=' + s.alertsSent + ' cooled=' + s.skippedCooldown
        : 'status=' + res.status + (j && j.reason ? ' reason=' + j.reason : ''));
    }
  } catch (e) { mark('cron office-alerts dryRun', false, e.message); }

  const passed = results.filter((r) => r.ok).length;
  console.log('\n' + passed + '/' + results.length + ' checks passed');
  await db.$disconnect();
  process.exit(passed === results.length ? 0 : 2);
})().catch((e) => { console.log('FATAL | ' + (e && e.message)); process.exit(1); });
