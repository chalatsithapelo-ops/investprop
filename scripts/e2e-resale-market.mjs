// Genuine end-to-end probe for the Public Resale Marketplace.
// Exercises the full lifecycle against LIVE production (https://investprop.io) using demo accounts:
//   owner@demo.com (PROPERTY_OWNER), devmanager@demo.com (DEVELOPMENT_MANAGER),
//   investor@demo.com (INVESTOR / buyer), password123.
//
// Run: node scripts/e2e-resale-market.mjs
// Optional env: BASE, OWNER_EMAIL, MGR_EMAIL, BUYER_EMAIL, DEMO_PW
//
// Flow: owner has (or creates) a sale proposal -> manager lists it publicly ->
// buyer browses the resale market, opens the detail, and expresses interest ->
// manager delists it. Asserts PII-safety (no seller contact / financial-distress
// fields leak to buyers) and the convertedToPropertyId / guard rules throughout.

const BASE = process.env.BASE || "https://investprop.io";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@demo.com";
const MGR_EMAIL = process.env.MGR_EMAIL || "devmanager@demo.com";
const BUYER_EMAIL = process.env.BUYER_EMAIL || "investor@demo.com";
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

async function trpc(proc, payload, { method = "POST", token } = {}) {
  const url = `${BASE}/trpc/${proc}`;
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (token) init.headers["Authorization"] = `Bearer ${token}`;
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
  const errCode = errNode?.json?.data?.code ?? errNode?.data?.code;
  const data = (Array.isArray(body) ? body[0]?.result : body?.result)?.data?.json;
  return { status: res.status, data, error: errMsg, code: errCode, raw: text };
}

async function login(email) {
  const r = await trpc("login", { email, password: PW });
  const token = r.data?.accessToken;
  if (!token) throw new Error(`login ${email} failed (HTTP ${r.status}): ${r.error || r.raw?.slice(0, 200)}`);
  return token;
}

// PII fields that must NEVER appear in a public resale listing projection.
const FORBIDDEN_KEYS = [
  "ownerId",
  "contactEmail",
  "contactPhone",
  "reason",
  "bondStatus",
  "bondOutstanding",
  "bondBank",
  "ratesStatus",
  "ratesArrears",
  "coOwners",
  "documentUrls",
  "owner",
];

function assertPiiSafe(listing, label) {
  const leaked = FORBIDDEN_KEYS.filter((k) => k in (listing || {}));
  assert(leaked.length === 0, `${label} is PII-safe`, leaked.length ? `LEAKED: ${leaked.join(", ")}` : "no seller PII");
}

function finish() {
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  - " + f);
  }
  process.exit(fail ? 1 : 0);
}

async function main() {
  console.log(`\n=== Public Resale Marketplace E2E — ${BASE} — ${new Date().toISOString()} ===\n`);

  // ── Logins ──────────────────────────────────────────────────────
  console.log("Logins");
  let ownerToken, mgrToken, buyerToken;
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
  try {
    buyerToken = await login(BUYER_EMAIL);
    ok("buyer login", BUYER_EMAIL);
  } catch (e) {
    bad("buyer login", e.message);
    return finish();
  }

  // ── 1. Ensure the owner has a non-converted sale proposal ───────
  console.log("\n1. Owner provides a sale proposal to list");
  const stamp = Date.now().toString().slice(-6);
  let proposalId = null;
  const submit = await trpc("submitSaleProposal", {
    authToken: ownerToken,
    title: `E2E Resale Cottage #${stamp}`,
    description:
      "Neat 3-bedroom cottage in a quiet street. Tidy garden, secure parking. Ideal first home for a public buyer.",
    address: `${stamp} Resale Avenue`,
    city: "Midrand",
    province: "Gauteng",
    propertyType: "HOUSE",
    askingPrice: 1250000,
    marketValue: 1350000,
    saleType: "BOND",
    bedrooms: 3,
    bathrooms: 2,
    squareMeters: 120,
    erfSize: 480,
    conditionRating: "GOOD",
    engagementType: "OUTRIGHT_SALE",
    reason: "Relocating overseas",
    contactPhone: "0820000000",
    contactEmail: OWNER_EMAIL,
    popiaConsent: true,
  });
  if (submit.status === 200 && submit.data?.proposal?.id) {
    proposalId = submit.data.proposal.id;
    ok("owner submitted a new sale proposal", `#${proposalId}`);
  } else if (submit.code === "FORBIDDEN") {
    // Listing cap hit — reuse an existing non-converted proposal.
    ok("submit hit listing cap (expected for non-Seller-Pro)", submit.error);
    const mine = await trpc("getMySaleProposals", { authToken: ownerToken }, { method: "GET" });
    const list = Array.isArray(mine.data) ? mine.data : [];
    const reusable = list.find((p) => !p.convertedToPropertyId && p.status !== "WITHDRAWN");
    if (reusable) {
      proposalId = reusable.id;
      ok("reusing existing non-converted proposal", `#${proposalId} (${reusable.status})`);
    }
  } else {
    bad("owner submit sale proposal", submit.error || `HTTP ${submit.status}`);
  }
  if (!proposalId) {
    bad("no proposal available to list", "cannot continue");
    return finish();
  }

  // ── 2. Buyer should NOT see it before it is published ───────────
  console.log("\n2. Listing is private until a manager publishes it");
  const beforePub = await trpc("getPublicResaleListings", { authToken: buyerToken }, { method: "GET" });
  const beforeList = beforePub.data?.listings ?? [];
  assert(
    !beforeList.some((l) => l.id === proposalId),
    "unpublished proposal is NOT in the public market",
    `market has ${beforeList.length} listing(s)`
  );
  const detailBefore = await trpc("getPublicResaleListing", { authToken: buyerToken, id: proposalId }, { method: "GET" });
  assert(detailBefore.code === "NOT_FOUND", "detail of unpublished listing returns NOT_FOUND", detailBefore.code || detailBefore.error);
  const interestBefore = await trpc("expressResaleInterest", { authToken: buyerToken, id: proposalId, offerAmount: 1000000 });
  assert(interestBefore.code === "NOT_FOUND", "cannot express interest on unpublished listing", interestBefore.code || interestBefore.error);

  // ── 3. A buyer must NOT be able to publish (role guard) ─────────
  console.log("\n3. Only managers can publish");
  const buyerPublish = await trpc("setSaleProposalPublic", { authToken: buyerToken, proposalId, publiclyListed: true });
  assert(
    buyerPublish.code === "FORBIDDEN" || buyerPublish.status === 403 || !!buyerPublish.error,
    "buyer cannot publish a listing",
    buyerPublish.code || buyerPublish.error
  );

  // ── 4. Manager publishes the listing ────────────────────────────
  console.log("\n4. Manager lists it on the public resale market");
  const publish = await trpc("setSaleProposalPublic", { authToken: mgrToken, proposalId, publiclyListed: true });
  assert(publish.status === 200 && publish.data?.publiclyListed === true, "manager published the listing", publish.error || `HTTP ${publish.status}`);

  // ── 5. Buyer now sees it + PII-safety ───────────────────────────
  console.log("\n5. Buyer browses the published listing");
  const afterPub = await trpc(
    "getPublicResaleListings",
    { authToken: buyerToken, province: "Gauteng" },
    { method: "GET" }
  );
  const afterList = afterPub.data?.listings ?? [];
  const found = afterList.find((l) => l.id === proposalId);
  assert(!!found, "published listing appears in the public market", `market has ${afterList.length} listing(s)`);
  if (found) {
    assertPiiSafe(found, "list card");
    assert(typeof found.askingPrice === "number" && found.askingPrice > 0, "list card has an asking price", String(found.askingPrice));
    assert(Array.isArray(found.imageUrls), "imageUrls is an array", `type=${typeof found.imageUrls}`);
  }

  const detail = await trpc("getPublicResaleListing", { authToken: buyerToken, id: proposalId }, { method: "GET" });
  const listing = detail.data?.listing;
  assert(detail.status === 200 && listing?.id === proposalId, "buyer can open the listing detail", detail.error || `HTTP ${detail.status}`);
  if (listing) assertPiiSafe(listing, "detail");

  // Filters: an impossibly-low max price should exclude it.
  const filtered = await trpc(
    "getPublicResaleListings",
    { authToken: buyerToken, maxPrice: 1 },
    { method: "GET" }
  );
  const filteredList = filtered.data?.listings ?? [];
  assert(!filteredList.some((l) => l.id === proposalId), "maxPrice filter excludes dearer listings", `returned ${filteredList.length}`);

  // ── 6. Buyer expresses interest / makes an offer ────────────────
  console.log("\n6. Buyer expresses interest");
  const interest = await trpc("expressResaleInterest", {
    authToken: buyerToken,
    id: proposalId,
    offerAmount: 1180000,
    message: "E2E probe — keen to view this weekend.",
    contactPhone: "0829999999",
  });
  assert(interest.status === 200 && interest.data?.success === true, "buyer expressed interest", interest.error || `HTTP ${interest.status}`);

  // ── 7. Manager delists it ───────────────────────────────────────
  console.log("\n7. Manager removes it from the public market");
  const delist = await trpc("setSaleProposalPublic", { authToken: mgrToken, proposalId, publiclyListed: false });
  assert(delist.status === 200 && delist.data?.publiclyListed === false, "manager delisted the listing", delist.error || `HTTP ${delist.status}`);

  const afterDelist = await trpc("getPublicResaleListings", { authToken: buyerToken }, { method: "GET" });
  const afterDelistList = afterDelist.data?.listings ?? [];
  assert(!afterDelistList.some((l) => l.id === proposalId), "delisted proposal leaves the public market", `market has ${afterDelistList.length} listing(s)`);

  // ── 8. Partner-portal access guards (no originator account needed) ─
  console.log("\n8. Partner-portal access guards");
  const leadsGuard = await trpc("getMyPartnerLeads", { authToken: buyerToken }, { method: "GET" });
  assert(
    leadsGuard.code === "FORBIDDEN" || !!leadsGuard.error,
    "non-partner cannot read partner leads",
    leadsGuard.code || leadsGuard.error
  );
  const origGuard = await trpc("getOriginatorApplications", { authToken: buyerToken }, { method: "GET" });
  assert(
    origGuard.code === "FORBIDDEN" || !!origGuard.error,
    "non-originator cannot read originator applications",
    origGuard.code || origGuard.error
  );

  return finish();
}

main().catch((e) => {
  bad("uncaught", e?.message || String(e));
  finish();
});
