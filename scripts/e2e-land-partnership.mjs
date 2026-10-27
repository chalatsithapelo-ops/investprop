// Genuine end-to-end probe for the Asset-into-SPV Property/Land Contribution Partnership.
// Exercises the full lifecycle against LIVE production (https://investprop.io) using demo accounts:
//   owner@demo.com (PROPERTY_OWNER) and devmanager@demo.com (DEVELOPMENT_MANAGER), password123.
//
// Run: node scripts/e2e-land-partnership.mjs
// Optional: BASE=https://investprop.io OWNER_EMAIL=... MGR_EMAIL=... DEMO_PW=...
//
// It submits a NEW renovate/flip property partnership, walks it through review -> approve ->
// sign -> countersign -> SPV -> activate, and asserts the contribution-model reframing
// (no "option" language, property/renovate/flip wording, 20/80 equity) end to end.

const BASE = process.env.BASE || "https://investprop.io";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@demo.com";
const MGR_EMAIL = process.env.MGR_EMAIL || "devmanager@demo.com";
const PW = process.env.DEMO_PW || "password123";

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
    const input = encodeURIComponent(JSON.stringify({ json: payload }));
    target = `${url}?input=${input}`;
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
  const data = (Array.isArray(body) ? body[0]?.result : body?.result)?.data?.json;
  return { status: res.status, data, error: errMsg, raw: text };
}

async function login(email) {
  const r = await trpc("login", { email, password: PW });
  const token = r.data?.accessToken;
  if (!token) throw new Error(`login ${email} failed (HTTP ${r.status}): ${r.error || r.raw?.slice(0, 200)}`);
  return token;
}

async function main() {
  console.log(`\n=== Property/Land Partnership E2E — ${BASE} — ${new Date().toISOString()} ===\n`);

  // ── Logins ──────────────────────────────────────────────────────
  console.log("Logins");
  let ownerToken, mgrToken;
  try {
    ownerToken = await login(OWNER_EMAIL);
    ok("owner login", OWNER_EMAIL);
  } catch (e) {
    bad("owner login", e.message);
    return finish();
  }
  try {
    mgrToken = await login(MGR_EMAIL);
    ok("manager login", MGR_EMAIL);
  } catch (e) {
    bad("manager login", e.message);
    return finish();
  }

  // ── 1. Owner submits a renovate/flip property ───────────────────
  console.log("\n1. Owner submits a property partnership (renovate/flip)");
  const stamp = Date.now().toString().slice(-6);
  const submit = await trpc("submitLandPartnership", {
    authToken: ownerToken,
    ownerFullName: "Olivia Owner",
    ownerPhone: "0821234567",
    ownerEmail: OWNER_EMAIL,
    landTitle: `E2E flip house #${stamp}`,
    landDescription:
      "Existing 4-bedroom house requiring a full renovation and flip. Good suburb, structurally sound, cosmetic upgrade needed.",
    address: `${stamp} Test Street`,
    city: "Midrand",
    province: "Gauteng",
    currentUse: "Existing house",
    estimatedLandValue: 1800000,
    intendedStrategy: "FLIP",
    developmentType: "Full renovation",
    estimatedGDV: 2600000,
    estimatedBuildCost: 450000,
    popiaConsent: true,
  });
  const lp = submit.data?.landPartnership;
  if (!assert(submit.status === 200 && lp?.id, "submit returns a record", submit.error || `HTTP ${submit.status}`)) {
    return finish();
  }
  const id = lp.id;
  const ref = lp.referenceCode;
  assert(/^LP-\d{4}-\d{4}$/.test(ref || ""), "reference code format", ref);
  assert(lp.status === "SUBMITTED", "initial status SUBMITTED", lp.status);
  assert(lp.ownerEquityPct === 20 && lp.platformEquityPct === 80, "equity forced 20/80", `${lp.ownerEquityPct}/${lp.platformEquityPct}`);
  assert(lp.intendedStrategy === "FLIP", "flip strategy persisted", lp.intendedStrategy);

  // ── 2. Owner lists own partnerships ─────────────────────────────
  console.log("\n2. Owner lists own partnerships");
  const myList = await trpc("getMyLandPartnerships", { authToken: ownerToken }, { method: "GET" });
  assert(Array.isArray(myList.data) && myList.data.some((x) => x.id === id), "new submission appears in owner list", myList.error || `n=${myList.data?.length}`);

  // ── 3. Manager sees it in the SUBMITTED queue ───────────────────
  console.log("\n3. Manager queue shows the submission");
  const queue = await trpc("getAllLandPartnerships", { authToken: mgrToken, status: "SUBMITTED" }, { method: "GET" });
  assert(Array.isArray(queue.data) && queue.data.some((x) => x.id === id), "submission in manager SUBMITTED queue", queue.error || `n=${queue.data?.length}`);

  // ── 4. Manager marks UNDER_REVIEW ───────────────────────────────
  console.log("\n4. Manager marks under review");
  const ur = await trpc("reviewLandPartnership", { authToken: mgrToken, id, action: "UNDER_REVIEW", reviewNotes: "E2E review" });
  assert(ur.status === 200 && ur.data?.status === "UNDER_REVIEW", "status UNDER_REVIEW", ur.error || ur.data?.status);

  // ── 5. Manager APPROVES → agreement generated ───────────────────
  console.log("\n5. Manager approves — agreement generated");
  const appr = await trpc("reviewLandPartnership", { authToken: mgrToken, id, action: "APPROVE", reviewNotes: "Approved by E2E" });
  assert(appr.status === 200 && appr.data?.status === "AGREEMENT_READY", "status AGREEMENT_READY", appr.error || appr.data?.status);
  const agreement = appr.data?.agreementContent || "";
  assert(agreement.length > 500, "agreement content generated", `${agreement.length} chars`);
  // Contribution-model reframing assertions:
  assert(/CONTRIBUTION .* DEVELOPMENT PARTNERSHIP AGREEMENT/i.test(agreement), "title = contribution & development partnership");
  assert(/Development, Renovation or Flip/i.test(agreement), "subtitle mentions renovation or flip");
  assert(/Undertaking to Contribute|undertakes to contribute/i.test(agreement), "clause: undertaking to contribute");
  assert(/Exclusivity Period/i.test(agreement), "uses Exclusivity Period");
  assert(!/Option Period/i.test(agreement), "no legacy 'Option Period' wording");
  assert(/20%|20 %/.test(agreement) && /80%|80 %/.test(agreement), "20/80 equity in agreement");

  // ── 6. Owner reads the full record (agreement visible) ──────────
  console.log("\n6. Owner reads full record");
  const byId = await trpc("getLandPartnershipById", { authToken: ownerToken, id }, { method: "GET" });
  assert(byId.status === 200 && byId.data?.agreementContent?.length > 500, "owner can read generated agreement", byId.error || `HTTP ${byId.status}`);

  // ── 7. Owner e-signs ────────────────────────────────────────────
  console.log("\n7. Owner e-signs");
  const sign = await trpc("signLandPartnership", { authToken: ownerToken, id, signatureName: "Olivia Owner", acceptTerms: true });
  assert(sign.status === 200 && sign.data?.status === "SIGNED", "status SIGNED", sign.error || sign.data?.status);
  assert(sign.data?.ownerSignedAt, "owner signature timestamp recorded");

  // ── 8. Manager countersigns ─────────────────────────────────────
  console.log("\n8. Manager countersigns");
  const counter = await trpc("countersignLandPartnership", { authToken: mgrToken, id, signatoryName: "Dev Manager" });
  assert(counter.status === 200 && counter.data?.status === "COUNTERSIGNED", "status COUNTERSIGNED", counter.error || counter.data?.status);

  // ── 9. Manager forms the SPV ────────────────────────────────────
  console.log("\n9. Manager forms the SPV");
  const spv = await trpc("formSpvForLandPartnership", { authToken: mgrToken, id, spvName: `E2E Midrand SPV #${stamp}`, registrationNumber: `2026/${stamp}/07` });
  assert(spv.status === 200 && spv.data?.landPartnership?.status === "SPV_FORMED", "status SPV_FORMED", spv.error || spv.data?.landPartnership?.status);
  assert(spv.data?.spv?.id, "SPV record created", spv.data?.spv?.name);

  // ── 10. Manager activates ───────────────────────────────────────
  console.log("\n10. Manager activates the partnership");
  const act = await trpc("activateLandPartnership", { authToken: mgrToken, id });
  assert(act.status === 200 && act.data?.status === "ACTIVE", "status ACTIVE", act.error || act.data?.status);

  // ── 11. Negative: investor-less owner cannot see manager queue ──
  console.log("\n11. RBAC — owner blocked from manager queue");
  const forbid = await trpc("getAllLandPartnerships", { authToken: ownerToken }, { method: "GET" });
  assert(forbid.status >= 400 && /manager/i.test(forbid.error || ""), "owner forbidden from manager queue", forbid.error || `HTTP ${forbid.status}`);

  finish(id, ref);
}

function finish(id, ref) {
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ${id ? `(record #${id} ${ref})` : ""} ===`);
  if (fail > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("ALL GREEN — full lifecycle verified live.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
