// Genuine end-to-end probe for the BOND-ORIGINATOR and CONVEYANCER flows.
// Runs against LIVE production (https://investprop.io). Self-contained: uses the
// devmanager@demo.com account (DEVELOPMENT_MANAGER — counts as admin for referral
// management) to provision partner infrastructure + partner logins, then walks a
// real home-loan application through the complete originator lifecycle and a
// conveyancer referral through the partner portal. No secrets required.
//
// Run: node scripts/e2e-partner-portal.mjs
// Optional env: BASE, MGR_EMAIL, APPLICANT_EMAIL, DEMO_PW
//
// Covered procedures:
//   referrals:   getReferralPartners, upsertReferralPartner, createPartnerUser,
//                getPartnerUsers, getMyPartnerLeads, getReferralLeads,
//                requestReferralIntro
//   home-loan:   submitHomeLoanApplication (consent true + false), getMyHomeLoanApplications,
//                getOriginatorApplications, originatorAcknowledgeApplication,
//                originatorSubmitOffers, acceptHomeLoanOffer, markHomeLoanCommissionReceived
//   guards:      role enforcement on every partner/admin procedure.

import { randomUUID } from "node:crypto";

const BASE = process.env.BASE || "https://investprop.io";
const MGR_EMAIL = process.env.MGR_EMAIL || "devmanager@demo.com";
const APPLICANT_EMAIL = process.env.APPLICANT_EMAIL || "investor@demo.com";
const PW = process.env.DEMO_PW || "password123";
const PARTNER_PW = `Probe-${randomUUID().slice(0, 12)}!`;

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
  pass++;
  console.log(`  [PASS] ${name}${detail ? "  — " + detail : ""}`);
}
function bad(name, detail = "") {
  fail++;
  failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`  [FAIL] ${name}${detail ? "  — " + detail : ""}`);
}
function assert(cond, name, detail = "") {
  if (cond) ok(name, detail);
  else bad(name, detail);
  return cond;
}

async function trpc(proc, payload, { method = "POST" } = {}) {
  const url = `${BASE}/trpc/${proc}`;
  const init = { method, headers: { "Content-Type": "application/json" } };
  let target = url;
  if (method === "GET") {
    target = `${url}?input=${encodeURIComponent(JSON.stringify({ json: payload }))}`;
  } else {
    init.body = JSON.stringify({ json: payload });
  }
  const res = await fetch(target, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { parseError: text.slice(0, 300) };
  }
  const errNode = Array.isArray(body) ? body[0]?.error : body?.error;
  const errMsg = errNode?.json?.message ?? errNode?.message;
  const errCode = errNode?.json?.data?.code ?? errNode?.data?.code;
  const data = (Array.isArray(body) ? body[0]?.result : body?.result)?.data?.json;
  return { status: res.status, data, error: errMsg, code: errCode, raw: text };
}

async function login(email, pw = PW) {
  const r = await trpc("login", { email, password: pw });
  const token = r.data?.accessToken;
  if (!token) throw new Error(`login ${email} failed (HTTP ${r.status}): ${r.error || r.raw?.slice(0, 160)}`);
  return token;
}

function finish() {
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
  }
  process.exit(fail ? 1 : 0);
}

/** Oldest active partner of a type (mirrors how the server auto-routes), else null. */
function oldestActive(partners, type) {
  return (
    partners
      .filter((p) => p.type === type && p.active)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] ?? null
  );
}

async function main() {
  console.log(`\n=== Bond-Originator & Conveyancer E2E — ${BASE} — ${new Date().toISOString()} ===\n`);
  const stamp = Date.now().toString().slice(-8);

  // ── Logins ──────────────────────────────────────────────────────
  console.log("Logins");
  let mgrToken, applicantToken;
  try {
    mgrToken = await login(MGR_EMAIL);
    ok("manager login (acts as admin for referrals)", MGR_EMAIL);
  } catch (e) {
    bad("manager login", e.message);
    return finish();
  }
  try {
    applicantToken = await login(APPLICANT_EMAIL);
    ok("applicant login", APPLICANT_EMAIL);
  } catch (e) {
    bad("applicant login", e.message);
    return finish();
  }

  // ── 1. Provision referral-partner infrastructure ────────────────
  console.log("\n1. Partner infrastructure (manager/admin)");
  let partners = await trpc("getReferralPartners", { authToken: mgrToken }, { method: "GET" });
  assert(partners.status === 200 && Array.isArray(partners.data), "getReferralPartners", partners.error || `HTTP ${partners.status}`);
  let list = Array.isArray(partners.data) ? partners.data : [];

  let originatorPartner = oldestActive(list, "BOND_ORIGINATOR");
  if (!originatorPartner) {
    const up = await trpc("upsertReferralPartner", {
      authToken: mgrToken,
      name: "E2E Probe Originator",
      type: "BOND_ORIGINATOR",
      contactEmail: "probe-originator@investprop.io",
      commissionBps: 100,
      commissionFlat: 5000,
      active: true,
    });
    assert(up.status === 200 && up.data?.id, "upsertReferralPartner (originator)", up.error || `HTTP ${up.status}`);
    list = (await trpc("getReferralPartners", { authToken: mgrToken }, { method: "GET" })).data ?? [];
    originatorPartner = oldestActive(list, "BOND_ORIGINATOR");
  } else {
    ok("reusing existing active bond-originator partner", `#${originatorPartner.id} ${originatorPartner.name}`);
  }

  let conveyancerPartner = oldestActive(list, "CONVEYANCER");
  if (!conveyancerPartner) {
    const up = await trpc("upsertReferralPartner", {
      authToken: mgrToken,
      name: "E2E Probe Conveyancer",
      type: "CONVEYANCER",
      contactEmail: "probe-conveyancer@investprop.io",
      commissionBps: 50,
      commissionFlat: 2500,
      active: true,
    });
    assert(up.status === 200 && up.data?.id, "upsertReferralPartner (conveyancer)", up.error || `HTTP ${up.status}`);
    list = (await trpc("getReferralPartners", { authToken: mgrToken }, { method: "GET" })).data ?? [];
    conveyancerPartner = oldestActive(list, "CONVEYANCER");
  } else {
    ok("reusing existing active conveyancer partner", `#${conveyancerPartner.id} ${conveyancerPartner.name}`);
  }

  if (!originatorPartner || !conveyancerPartner) {
    bad("partner infrastructure available", "missing originator or conveyancer partner");
    return finish();
  }

  // ── 2. Create partner login accounts ────────────────────────────
  console.log("\n2. Partner login accounts (manager/admin)");
  const origEmail = `e2e-originator-${stamp}@probe.investprop.io`;
  const convEmail = `e2e-conveyancer-${stamp}@probe.investprop.io`;

  const makeOrig = await trpc("createPartnerUser", {
    authToken: mgrToken,
    partnerId: originatorPartner.id,
    name: "E2E Originator Agent",
    email: origEmail,
    password: PARTNER_PW,
    role: "BOND_ORIGINATOR",
  });
  assert(makeOrig.status === 200 && makeOrig.data?.id, "createPartnerUser (BOND_ORIGINATOR)", makeOrig.error || `HTTP ${makeOrig.status}`);

  const makeConv = await trpc("createPartnerUser", {
    authToken: mgrToken,
    partnerId: conveyancerPartner.id,
    name: "E2E Conveyancer Agent",
    email: convEmail,
    password: PARTNER_PW,
    role: "CONVEYANCER",
  });
  assert(makeConv.status === 200 && makeConv.data?.id, "createPartnerUser (CONVEYANCER)", makeConv.error || `HTTP ${makeConv.status}`);

  const dupe = await trpc("createPartnerUser", {
    authToken: mgrToken,
    partnerId: originatorPartner.id,
    name: "Dup",
    email: origEmail,
    password: PARTNER_PW,
    role: "BOND_ORIGINATOR",
  });
  assert(dupe.code === "BAD_REQUEST" || !!dupe.error, "duplicate partner email rejected", dupe.code || dupe.error);

  const partnerUsers = await trpc("getPartnerUsers", { authToken: mgrToken, partnerId: originatorPartner.id }, { method: "GET" });
  assert(
    partnerUsers.status === 200 && (partnerUsers.data?.users ?? []).some((u) => u.email === origEmail),
    "getPartnerUsers lists the new originator login",
    partnerUsers.error || `HTTP ${partnerUsers.status}`
  );

  let originatorToken, conveyancerToken;
  try {
    originatorToken = await login(origEmail, PARTNER_PW);
    ok("bond-originator login", origEmail);
  } catch (e) {
    bad("bond-originator login", e.message);
    return finish();
  }
  try {
    conveyancerToken = await login(convEmail, PARTNER_PW);
    ok("conveyancer login", convEmail);
  } catch (e) {
    bad("conveyancer login", e.message);
    return finish();
  }

  // ── 3. Applicant submits a home-loan application ────────────────
  console.log("\n3. Applicant submits a one-button multi-bank application");
  const noConsent = await trpc("submitHomeLoanApplication", {
    authToken: applicantToken,
    requestedBondAmount: 1200000,
    consentShareData: false,
  });
  assert(
    noConsent.data?.success === false && /consent/i.test(noConsent.data?.error ?? ""),
    "POPIA: submission without consent is blocked",
    noConsent.data?.error ?? noConsent.error
  );

  const submit = await trpc("submitHomeLoanApplication", {
    authToken: applicantToken,
    requestedBondAmount: 1200000,
    propertyPrice: 1500000,
    depositAmount: 300000,
    grossMonthlyIncome: 65000,
    estimatedInstalment: 13500,
    annualInterestRate: 11.75,
    loanTermYears: 20,
    applicantPhone: "0825550000",
    notes: "E2E probe application.",
    consentShareData: true,
    documents: [
      { docType: "PAYSLIP", fileName: "payslip.pdf", fileUrl: "https://example.com/payslip.pdf" },
      { docType: "ID_DOCUMENT", fileName: "id.pdf", fileUrl: "https://example.com/id.pdf" },
    ],
  });
  assert(submit.data?.success === true && submit.data?.id, "application submitted", submit.error || submit.data?.error || `HTTP ${submit.status}`);
  const appId = submit.data?.id;
  const reference = submit.data?.reference;
  assert(/^BR-\d+-[A-Z0-9]{6}$/.test(reference || ""), "referral reference generated", reference);
  assert(
    submit.data?.originatorName === originatorPartner.name,
    "application routed to the oldest active originator partner",
    `${submit.data?.originatorName} vs ${originatorPartner.name}`
  );
  if (!appId) return finish();

  // ── 4. Originator works the application queue ───────────────────
  console.log("\n4. Bond-originator portal lifecycle");
  const queue1 = await trpc("getOriginatorApplications", { authToken: originatorToken }, { method: "GET" });
  const inQueue = (queue1.data?.applications ?? []).find((a) => a.id === appId);
  assert(!!inQueue, "application appears in the originator queue", `queue size ${(queue1.data?.applications ?? []).length}`);
  assert(inQueue?.status === "SUBMITTED", "initial status SUBMITTED", inQueue?.status);
  assert(inQueue?.applicantName && inQueue?.applicantEmail, "originator sees applicant name/email", `${inQueue?.applicantName}`);
  assert((inQueue?.documents ?? []).length === 2, "submitted documents visible to originator", `docs ${(inQueue?.documents ?? []).length}`);

  const ack = await trpc("originatorAcknowledgeApplication", { authToken: originatorToken, id: appId });
  assert(ack.status === 200 && ack.data?.success, "originator acknowledges application", ack.error || `HTTP ${ack.status}`);
  const queue2 = await trpc("getOriginatorApplications", { authToken: originatorToken }, { method: "GET" });
  const afterAck = (queue2.data?.applications ?? []).find((a) => a.id === appId);
  assert(afterAck?.status === "BANKS_REVIEWING", "status advanced to BANKS_REVIEWING", afterAck?.status);
  assert(!!afterAck?.originatorConfirmedAt, "originatorConfirmedAt set", String(afterAck?.originatorConfirmedAt));

  const offers = await trpc("originatorSubmitOffers", {
    authToken: originatorToken,
    id: appId,
    statusNote: "Two banks approved.",
    offers: [
      { bankName: "ABSA", approvedAmount: 1200000, annualInterestRate: 11.25, monthlyInstalment: 13100, loanTermYears: 20 },
      { bankName: "FNB", approvedAmount: 1150000, annualInterestRate: 11.5, monthlyInstalment: 12800, loanTermYears: 20, notes: "Slightly lower amount." },
    ],
  });
  assert(offers.status === 200 && offers.data?.status === "OFFERS_IN", "originator submits bank offers", offers.error || `HTTP ${offers.status}`);

  // ── 5. Applicant reviews + accepts an offer ─────────────────────
  console.log("\n5. Applicant reviews and accepts an offer");
  const myApps = await trpc("getMyHomeLoanApplications", { authToken: applicantToken }, { method: "GET" });
  const myApp = (myApps.data?.applications ?? []).find((a) => a.id === appId);
  assert(!!myApp, "applicant sees their application", `apps ${(myApps.data?.applications ?? []).length}`);
  assert((myApp?.offers ?? []).length === 2, "applicant sees both bank offers", `offers ${(myApp?.offers ?? []).length}`);
  const bestOffer = (myApp?.offers ?? []).slice().sort((a, b) => a.annualInterestRate - b.annualInterestRate)[0];
  assert(!!bestOffer?.id, "best offer resolved", bestOffer?.bankName);

  const accept = await trpc("acceptHomeLoanOffer", { authToken: applicantToken, offerId: bestOffer.id });
  assert(accept.status === 200 && accept.data?.success, "applicant accepts the offer", accept.error || `HTTP ${accept.status}`);
  const myApps2 = await trpc("getMyHomeLoanApplications", { authToken: applicantToken }, { method: "GET" });
  const acceptedApp = (myApps2.data?.applications ?? []).find((a) => a.id === appId);
  assert(acceptedApp?.status === "ACCEPTED", "application status ACCEPTED", acceptedApp?.status);
  const acceptedOffer = (acceptedApp?.offers ?? []).find((o) => o.id === bestOffer.id);
  assert(acceptedOffer?.status === "ACCEPTED", "chosen offer marked ACCEPTED", acceptedOffer?.status);

  // ── 6. Commission pipeline (originator leads + admin reconcile) ──
  console.log("\n6. Commission pipeline");
  const origLeads = await trpc("getMyPartnerLeads", { authToken: originatorToken }, { method: "GET" });
  const origLead = (origLeads.data?.leads ?? []).find((l) => l.reference === reference);
  assert(!!origLead, "originator sees the routed lead by reference", reference);
  assert(origLead?.status === "CONVERTED", "lead converted after offer acceptance", origLead?.status);

  const adminLeads = await trpc("getReferralLeads", { authToken: mgrToken }, { method: "GET" });
  const adminLead = (Array.isArray(adminLeads.data) ? adminLeads.data : []).find((l) => l.reference === reference);
  assert(!!adminLead, "admin ledger shows the converted lead", reference);
  assert(typeof adminLead?.commissionAmount === "number", "commission amount booked", String(adminLead?.commissionAmount));

  const markPaid = await trpc("markHomeLoanCommissionReceived", {
    authToken: mgrToken,
    referralLeadId: adminLead.id,
    amount: adminLead.commissionAmount || 5000,
  });
  assert(markPaid.status === 200 && markPaid.data?.success, "admin marks commission received", markPaid.error || `HTTP ${markPaid.status}`);
  const adminLeads2 = await trpc("getReferralLeads", { authToken: mgrToken }, { method: "GET" });
  const reconciled = (Array.isArray(adminLeads2.data) ? adminLeads2.data : []).find((l) => l.reference === reference);
  assert(!!reconciled?.commissionReceivedAt, "commission receipt recorded", String(reconciled?.commissionReceivedAt));

  // ── 7. Conveyancer referral + portal ────────────────────────────
  console.log("\n7. Conveyancer referral + portal");
  const intro = await trpc("requestReferralIntro", {
    authToken: applicantToken,
    partnerType: "CONVEYANCER",
    note: "E2E probe — please assist with transfer.",
  });
  assert(intro.status === 200 && intro.data?.success, "applicant requests a conveyancer intro", intro.error || `HTTP ${intro.status}`);
  assert(
    intro.data?.partnerName === conveyancerPartner.name,
    "intro routed to the oldest active conveyancer partner",
    `${intro.data?.partnerName} vs ${conveyancerPartner.name}`
  );

  const convLeads = await trpc("getMyPartnerLeads", { authToken: conveyancerToken }, { method: "GET" });
  assert(convLeads.status === 200 && Array.isArray(convLeads.data?.leads), "conveyancer reads their portal leads", convLeads.error || `HTTP ${convLeads.status}`);
  assert(
    (convLeads.data?.leads ?? []).some((l) => l.contactEmail === APPLICANT_EMAIL),
    "conveyancer sees the new referral lead",
    `leads ${(convLeads.data?.leads ?? []).length}`
  );

  // ── 7b. Remaining page procedures (prequalify, withdraw, ledger) ─
  console.log("\n7b. Remaining page procedures");
  const preq = await trpc("submitPrequalification", {
    authToken: applicantToken,
    consent: true,
    grossMonthlyIncome: 65000,
    monthlyExpenses: 15000,
    existingDebtRepayments: 4000,
    depositAmount: 300000,
    propertyPrice: 1500000,
    annualInterestRate: 11.75,
    loanTermYears: 20,
  });
  assert(preq.status === 200 && preq.data?.success && preq.data?.id, "submitPrequalification", preq.error || preq.data?.error || `HTTP ${preq.status}`);
  const preqHist = await trpc("getMyPrequalifications", { authToken: applicantToken }, { method: "GET" });
  const preqList = preqHist.data?.prequalifications ?? preqHist.data ?? [];
  assert(
    Array.isArray(preqList) && preqList.some((p) => p.id === preq.data?.id),
    "getMyPrequalifications returns the saved record",
    `history ${Array.isArray(preqList) ? preqList.length : "?"}`
  );

  const submit2 = await trpc("submitHomeLoanApplication", {
    authToken: applicantToken,
    prequalificationId: preq.data?.id,
    requestedBondAmount: 900000,
    consentShareData: true,
  });
  const app2Id = submit2.data?.id;
  assert(submit2.data?.success && app2Id, "second application submitted (for withdrawal)", submit2.error || `HTTP ${submit2.status}`);
  const withdraw = await trpc("withdrawHomeLoanApplication", { authToken: applicantToken, id: app2Id });
  assert(withdraw.status === 200 && withdraw.data?.success, "applicant withdraws an application", withdraw.error || `HTTP ${withdraw.status}`);
  const myApps3 = await trpc("getMyHomeLoanApplications", { authToken: applicantToken }, { method: "GET" });
  const withdrawn = (myApps3.data?.applications ?? []).find((a) => a.id === app2Id);
  assert(withdrawn?.status === "WITHDRAWN", "withdrawn application status WITHDRAWN", withdrawn?.status);

  const summary = await trpc("getReferralSummary", { authToken: mgrToken }, { method: "GET" });
  assert(
    summary.status === 200 && typeof summary.data?.totalLeads === "number",
    "getReferralSummary ledger totals",
    summary.error || `leads ${summary.data?.totalLeads}, commission ${summary.data?.totalCommissionEarned}`
  );

  const convLeadsForUpdate = await trpc("getReferralLeads", { authToken: mgrToken, partnerId: conveyancerPartner.id }, { method: "GET" });
  const convLead = (Array.isArray(convLeadsForUpdate.data) ? convLeadsForUpdate.data : []).find((l) => l.contactEmail === APPLICANT_EMAIL);
  if (convLead) {
    const upd = await trpc("updateReferralLead", { authToken: mgrToken, id: convLead.id, status: "CONTACTED" });
    assert(upd.status === 200 && upd.data?.status === "CONTACTED", "updateReferralLead advances a lead", upd.error || `HTTP ${upd.status}`);
  } else {
    bad("updateReferralLead advances a lead", "no conveyancer lead found to update");
  }

  // ── 8. Role guards across every surface ─────────────────────────
  console.log("\n8. Role-enforcement guards");
  const g1 = await trpc("getOriginatorApplications", { authToken: conveyancerToken }, { method: "GET" });
  assert(g1.code === "FORBIDDEN" || !!g1.error, "conveyancer cannot read originator applications", g1.code || g1.error);
  const g2 = await trpc("originatorSubmitOffers", { authToken: conveyancerToken, id: appId, offers: [] });
  assert(g2.code === "FORBIDDEN" || !!g2.error, "conveyancer cannot submit originator offers", g2.code || g2.error);
  const g3 = await trpc("getReferralLeads", { authToken: originatorToken }, { method: "GET" });
  assert(g3.code === "FORBIDDEN" || !!g3.error, "originator cannot read the admin ledger", g3.code || g3.error);
  const g4 = await trpc("createPartnerUser", { authToken: originatorToken, partnerId: originatorPartner.id, name: "x", email: `x-${stamp}@probe.io`, password: PARTNER_PW, role: "BOND_ORIGINATOR" });
  assert(g4.code === "FORBIDDEN" || !!g4.error, "originator cannot create partner users", g4.code || g4.error);
  const g5 = await trpc("getOriginatorApplications", { authToken: applicantToken }, { method: "GET" });
  assert(g5.code === "FORBIDDEN" || !!g5.error, "applicant cannot read originator applications", g5.code || g5.error);
  const g6 = await trpc("getMyPartnerLeads", { authToken: applicantToken }, { method: "GET" });
  assert(g6.code === "FORBIDDEN" || !!g6.error, "applicant cannot read partner leads", g6.code || g6.error);
  const g7 = await trpc("markHomeLoanCommissionReceived", { authToken: originatorToken, referralLeadId: adminLead.id, amount: 1 });
  assert(g7.code === "FORBIDDEN" || !!g7.error, "originator cannot reconcile commission", g7.code || g7.error);

  return finish();
}

main().catch((e) => {
  bad("uncaught", e?.message || String(e));
  finish();
});
