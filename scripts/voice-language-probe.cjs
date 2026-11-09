'use strict';
// Probe for the multilingual voice agent (isiZulu + Sesotho) language feature.
// Run INSIDE the app container so it can read JWT_SECRET / AGENT_SHARED_SECRET
// from env. No secret is ever printed. Exercises the setVoiceLanguage bridge
// action, DB persistence, alias normalisation, and the session-mint read-back.
(async () => {
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const BASE = 'http://localhost:8010';
  const SECRET = (process.env.AGENT_SHARED_SECRET || '').trim();
  const JWT_SECRET = process.env.JWT_SECRET;
  const results = [];
  const mark = (name, ok, info) => { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : '')); };

  if (!JWT_SECRET) { console.log('FATAL | JWT_SECRET missing'); process.exit(1); }
  if (!SECRET) { console.log('FATAL | AGENT_SHARED_SECRET missing'); process.exit(1); }

  const user = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, role: true, name: true, voiceLanguage: true } });
  if (!user) { console.log('FATAL | no ACTIVE ADMIN user'); process.exit(1); }
  console.log('Test user: id=' + user.id + ' role=' + user.role + ' startLanguage=' + (user.voiceLanguage || 'null'));
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '10m' });

  const bridge = async (body) => {
    const headers = { 'content-type': 'application/json', 'x-agent-secret': SECRET, authorization: 'Bearer ' + token };
    const res = await fetch(BASE + '/api/office-agent/execute', { method: 'POST', headers, body: JSON.stringify(body) });
    let j = null; try { j = await res.json(); } catch (_) {}
    return { status: res.status, body: j };
  };
  const dbLang = async () => (await db.user.findUnique({ where: { id: user.id }, select: { voiceLanguage: true } })).voiceLanguage;

  // 1. Set isiZulu.
  try {
    const r = await bridge({ action: 'setVoiceLanguage', language: 'isizulu' });
    const ok = r.status === 200 && r.body && r.body.ok === true && r.body.result && r.body.result.language === 'zu';
    mark('setVoiceLanguage isiZulu', ok, 'status=' + r.status + ' language=' + (r.body && r.body.result && r.body.result.language));
  } catch (e) { mark('setVoiceLanguage isiZulu', false, e.message); }

  // 2. Persisted in DB.
  try { const l = await dbLang(); mark('isiZulu persisted in DB', l === 'zu', 'voiceLanguage=' + l); }
  catch (e) { mark('isiZulu persisted in DB', false, e.message); }

  // 3. Set Sesotho.
  try {
    const r = await bridge({ action: 'setVoiceLanguage', language: 'sesotho' });
    const ok = r.status === 200 && r.body && r.body.result && r.body.result.language === 'st';
    mark('setVoiceLanguage Sesotho', ok, 'language=' + (r.body && r.body.result && r.body.result.language));
  } catch (e) { mark('setVoiceLanguage Sesotho', false, e.message); }

  // 4. Unknown language falls back to English (graceful normalise).
  try {
    const r = await bridge({ action: 'setVoiceLanguage', language: 'klingon' });
    const ok = r.status === 200 && r.body && r.body.result && r.body.result.language === 'en';
    mark('unknown language -> English', ok, 'language=' + (r.body && r.body.result && r.body.result.language));
  } catch (e) { mark('unknown language -> English', false, e.message); }

  // 5. Switch back to English explicitly.
  try {
    const r = await bridge({ action: 'setVoiceLanguage', language: 'english' });
    const l = await dbLang();
    mark('switch back to English', r.status === 200 && l === 'en', 'db=' + l);
  } catch (e) { mark('switch back to English', false, e.message); }

  // 6. Confirm the mint reads the saved language: set zu, then verify the
  //    column the session mint reads (createVoiceAgentSession -> metadata) holds
  //    it. The actual LiveKit dispatch is validated by voice-agent-livetest.cjs.
  try {
    await bridge({ action: 'setVoiceLanguage', language: 'zu' });
    const l = await dbLang();
    mark('mint reads saved language', l === 'zu', 'voiceLanguage=' + l + ' (dispatch covered by livetest)');
  } catch (e) { mark('mint reads saved language', false, e.message); }

  // Reset to a clean default so the admin account is unchanged.
  try { await bridge({ action: 'setVoiceLanguage', language: 'english' }); } catch (_) {}

  const passed = results.filter((r) => r.ok).length;
  console.log('\n' + passed + '/' + results.length + ' checks passed');
  await db.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
})();
