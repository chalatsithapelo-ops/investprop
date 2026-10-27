// ═══════════════════════════════════════════════════════════════
//  Asset-into-SPV Partnership Agreement generator.
//
//  Produces the full, auto-filled "Property / Land Contribution &
//  Development Partnership Agreement" from a LandPartnership record. The owner
//  contributes their property or land as equity into a ring-fenced SPV in
//  exchange for a minority stake (default 20%); the platform funds and
//  executes everything (develop, renovate or flip).
//
//  The agreement is deliberately protective of the platform: it secures an
//  exclusive, irrevocable contribution undertaking + development mandate +
//  power of attorney coupled with an interest, a registered restriction
//  against title, a break fee, an enhancement/uplift claim and
//  specific-performance remedies — so the owner cannot stall, sabotage or
//  sell around the platform after work has started.
//
//  Output is plain text with light markdown-style headings; the print view
//  renders it in a legal-document layout.
// ═══════════════════════════════════════════════════════════════

export type LandPartnershipForAgreement = {
  id: number;
  referenceCode: string;
  ownerFullName: string;
  ownerIdNumber?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  ownerAddress?: string | null;
  ownerEntityName?: string | null;
  ownerEntityRegNumber?: string | null;
  landTitle: string;
  landDescription: string;
  address: string;
  city: string;
  province: string;
  erfNumber?: string | null;
  titleDeedNumber?: string | null;
  erfSize?: number | null;
  currentZoning?: string | null;
  currentUse?: string | null;
  municipalValue?: number | null;
  estimatedLandValue?: number | null;
  bondStatus?: string | null;
  bondOutstanding?: number | null;
  bondBank?: string | null;
  ratesStatus?: string | null;
  ratesArrears?: number | null;
  coOwners?: string | null;
  developmentType?: string | null;
  intendedStrategy?: string | null;
  proposedUnits?: number | null;
  estimatedGDV?: number | null;
  estimatedBuildCost?: number | null;
  ownerEquityPct: number;
  platformEquityPct: number;
  createdAt: Date;
};

export type PlatformParty = {
  legalName: string;
  registrationNumber: string;
  signatoryName: string;
  signatoryTitle: string;
  address: string;
};

/** Default platform party used on generated agreements. */
export const DEFAULT_PLATFORM_PARTY: PlatformParty = {
  legalName: "Investprop (Pty) Ltd",
  registrationNumber: "[Registration No.]",
  signatoryName: "[Authorised Signatory]",
  signatoryTitle: "Director",
  address: "[Platform registered address]",
};

function money(v?: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "R________________";
  return "R" + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function orBlank(v?: string | null, width = 24): string {
  if (v && String(v).trim().length > 0) return String(v);
  return "_".repeat(width);
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Build the full agreement text for a land partnership.
 * @param lp the land partnership record (with owner + land details)
 * @param platform the platform counter-party details
 */
export function generateLandPartnershipAgreement(
  lp: LandPartnershipForAgreement,
  platform: PlatformParty = DEFAULT_PLATFORM_PARTY,
): string {
  const ownerPct = lp.ownerEquityPct ?? 20;
  const platformPct = lp.platformEquityPct ?? 100 - ownerPct;
  const today = longDate(new Date());
  const ownerIsEntity = !!(lp.ownerEntityName && lp.ownerEntityName.trim());

  const ownerDescriptor = ownerIsEntity
    ? `${lp.ownerEntityName} (Registration No. ${orBlank(lp.ownerEntityRegNumber)}), herein represented by ${lp.ownerFullName}`
    : `${lp.ownerFullName}${lp.ownerIdNumber ? ` (Identity No. ${lp.ownerIdNumber})` : ""}`;

  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p("PROPERTY / LAND CONTRIBUTION & DEVELOPMENT PARTNERSHIP AGREEMENT");
  p("(Asset-into-SPV Development, Renovation or Flip Partnership)");
  p("");
  p(`Agreement Reference: ${lp.referenceCode}`);
  p(`Date of preparation: ${today}`);
  p("");
  p("────────────────────────────────────────────────────────");
  p("PARTIES");
  p("────────────────────────────────────────────────────────");
  p("");
  p("1. THE LANDOWNER");
  p(`   ${ownerDescriptor}`);
  p(`   Identity / Registration No.: ${orBlank(lp.ownerEntityRegNumber ?? lp.ownerIdNumber)}`);
  p(`   Physical address: ${orBlank(lp.ownerAddress, 40)}`);
  p(`   Email: ${orBlank(lp.ownerEmail)}    Telephone: ${orBlank(lp.ownerPhone)}`);
  p('   (hereinafter "the Landowner")');
  p("");
  p("   and");
  p("");
  p("2. THE DEVELOPER / PLATFORM");
  p(`   ${platform.legalName} (Registration No. ${platform.registrationNumber})`);
  p(`   Registered address: ${platform.address}`);
  p('   (hereinafter "the Developer" or "the Platform")');
  p("");
  p("   and");
  p("");
  p("3. THE SPV (to be incorporated)");
  p("   A private company (ring-fenced special purpose vehicle) to be");
  p("   incorporated for the Project, into which the Property will be");
  p('   contributed (hereinafter "the SPV").');
  p("");
  p("   The Landowner and the Developer are referred to jointly as");
  p('   "the Parties" and individually as "a Party".');
  p("");
  p("────────────────────────────────────────────────────────");
  p("RECITALS (BACKGROUND)");
  p("────────────────────────────────────────────────────────");
  p("");
  p("A. The Landowner is the registered owner of (or is entitled to become");
  p("   the registered owner of) the immovable property described in");
  p("   Clause 2 and Annexure A (the \"Property\").");
  p("B. The Landowner wishes to realise the development, renovation or flip");
  p("   value of the Property but lacks the capital, expertise, professional");
  p("   team and funding relationships required to do so, and wishes to avoid");
  p("   the risk and cost of doing it alone.");
  p("C. The Developer operates a property development and co-investment");
  p("   platform that aggregates investor capital, appoints the professional");
  p("   team, secures funding and manages development and disposal end-to-end.");
  p("D. The Parties wish to combine the Property (contributed by the");
  p("   Landowner) with the capital, skill and funding arranged by the");
  p("   Developer, by contributing the Property into the SPV in exchange for");
  p("   shares, and to regulate their relationship on the terms set out below.");
  p("E. The Landowner acknowledges that the Developer will incur substantial");
  p("   time, cost and risk (feasibility, rezoning, design, funding and");
  p("   marketing) in reliance on this Agreement, and that the protections in");
  p("   favour of the Developer recorded herein are a material inducement");
  p("   without which the Developer would not proceed.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("THE PROPERTY");
  p("────────────────────────────────────────────────────────");
  p("");
  p('   (The "Property" means the immovable property described below,');
  p("   including the land and all buildings and improvements on it, whether");
  p("   vacant land for development or an existing building for renovation or");
  p("   flip.)");
  p("");
  p(`   Description: ${lp.landTitle}`);
  p(`   Physical address: ${lp.address}, ${lp.city}, ${lp.province}`);
  p(`   Erf / Portion No.: ${orBlank(lp.erfNumber)}`);
  p(`   Title Deed No.: ${orBlank(lp.titleDeedNumber)}`);
  p(`   Extent: ${lp.erfSize ? lp.erfSize.toLocaleString("en-ZA") + " m²" : "____________ m²"}`);
  p(`   Current zoning: ${orBlank(lp.currentZoning)}`);
  p(`   Current use: ${orBlank(lp.currentUse)}`);
  p(`   Municipal value: ${money(lp.municipalValue)}`);
  p(`   Estimated land value: ${money(lp.estimatedLandValue)}`);
  p(`   Bond status: ${orBlank(lp.bondStatus, 12)}   Outstanding: ${money(lp.bondOutstanding)}   Bank: ${orBlank(lp.bondBank)}`);
  p(`   Rates status: ${orBlank(lp.ratesStatus, 12)}   Arrears: ${money(lp.ratesArrears)}`);
  p(`   Co-owners / other registered holders: ${orBlank(lp.coOwners, 40)}`);
  p("");
  p("   Further particulars of the Property appear in Annexure A.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("THE PROJECT");
  p("────────────────────────────────────────────────────────");
  p("");
  p(`   Intended strategy: ${orBlank(lp.intendedStrategy ?? lp.developmentType, 20)}`);
  p(`   Development type: ${orBlank(lp.developmentType, 20)}`);
  p(`   Proposed units / scope: ${lp.proposedUnits ?? "____"}`);
  p(`   Estimated gross development value (GDV): ${money(lp.estimatedGDV)}`);
  p(`   Estimated development / build cost: ${money(lp.estimatedBuildCost)}`);
  p('   (collectively, "the Project")');
  p("");
  p("────────────────────────────────────────────────────────");
  p("1.  DEFINITIONS");
  p("────────────────────────────────────────────────────────");
  p("");
  p('   1.1  "Development Costs" means all costs incurred in relation to the');
  p("        Project, including feasibility, town-planning, rezoning, surveying,");
  p("        professional fees, holding costs, funding costs, construction,");
  p("        marketing and disposal.");
  p('   1.2  "Development Spend" means all amounts expended and time/effort');
  p("        reasonably valued that the Developer commits to the Project from");
  p("        the Effective Date.");
  p('   1.3  "Effective Date" means the date of last signature of this Agreement.');
  p('   1.4  "Enhancement" means any increase in the value of the Property');
  p("        arising from the Developer's efforts, including rezoning, consent");
  p("        use, subdivision, services, approvals, design or marketing.");
  p('   1.5  "Exclusivity Period" means the period defined in Clause 3.');
  p('   1.6  "Shares" means the ordinary shares in the SPV.');
  p("");
  p("────────────────────────────────────────────────────────");
  p("2.  EXCLUSIVE, IRREVOCABLE UNDERTAKING TO CONTRIBUTE & DEVELOPMENT MANDATE");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   2.1  The Landowner irrevocably undertakes to contribute the Property");
  p("        into the SPV in accordance with this Agreement, and grants the");
  p("        Developer the exclusive, irrevocable mandate to develop, renovate,");
  p("        flip and/or dispose of the Property through the SPV on these terms.");
  p("   2.2  This undertaking and mandate are coupled with an interest (the");
  p("        Developer's Development Spend and the rights granted herein) and are");
  p("        accordingly IRREVOCABLE and may not be withdrawn, cancelled or");
  p("        frustrated by the Landowner for the duration of the Exclusivity");
  p("        Period.");
  p("   2.3  Upon the Developer's written notice to proceed, the Landowner shall");
  p("        do all things necessary to give effect to the contribution of the");
  p("        Property into the SPV without further consideration.");
  p("   2.4  The Developer is under NO obligation to proceed and may elect not to");
  p("        do so, in which event the Developer's liability is limited to amounts");
  p("        (if any) expressly agreed in writing.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("3.  EXCLUSIVITY PERIOD & LOCK-OUT");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   3.1  The Exclusivity Period commences on the Effective Date and endures for");
  p("        ____________ months, renewable at the Developer's election for a");
  p("        further ____________ months while the Project is being progressed.");
  p("   3.2  During the Exclusivity Period the Landowner shall NOT, whether directly");
  p("        or indirectly: (a) sell, donate, exchange, option, lease, encumber,");
  p("        subdivide, rezone or otherwise deal with the Property; (b) negotiate");
  p("        with, solicit or entertain any offer from any third party in");
  p("        respect of the Property or any similar transaction; or (c) grant");
  p("        any right that competes with or derogates from the rights granted");
  p("        to the Developer.");
  p("   3.3  This lock-out is a material term. Any dealing in breach of it is");
  p("        void as against the Developer and entitles the Developer to the");
  p("        remedies in Clauses 10, 11 and 12.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("4.  REGISTRATION OF THE DEVELOPER'S INTEREST AGAINST TITLE");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   4.1  The Landowner irrevocably consents to the Developer registering,");
  p("        noting or endorsing its interest under this Agreement against the");
  p("        title of the Property at the Deeds Office, including by way of a");
  p("        registered lease, notarial deed, caveat-style restriction or");
  p("        restrictive condition against transfer, encumbrance or further");
  p("        dealing without the Developer's written consent.");
  p("   4.2  The Landowner shall sign all documents and give all powers required");
  p("        to effect such registration, failing which the power of attorney in");
  p("        Clause 6 shall apply.");
  p("   4.3  The Landowner warrants that it will not procure the removal of any");
  p("        such endorsement during the currency of this Agreement.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("5.  DEVELOPMENT RIGHTS & DECISION AUTHORITY");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   5.1  The Landowner appoints the Developer as the SOLE and EXCLUSIVE");
  p("        developer, project manager and disposal agent for the Property and");
  p("        the Project.");
  p("   5.2  The Developer has full authority to conduct feasibility studies,");
  p("        appoint the professional team, apply for rezoning / consent use /");
  p("        subdivision / township establishment, procure funding, undertake");
  p("        and manage construction, and market and dispose of the completed");
  p("        development, all in its discretion and in the best interests of the");
  p("        Project.");
  p("   5.3  The Landowner shall not interfere with, obstruct or second-guess");
  p("        the Developer's conduct of the Project and shall provide all");
  p("        cooperation, information and signatures reasonably required.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("6.  IRREVOCABLE POWER OF ATTORNEY (COUPLED WITH AN INTEREST)");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   6.1  The Landowner irrevocably nominates, constitutes and appoints the");
  p("        Developer (and its nominee) as its lawful attorney and agent, in");
  p("        rem suam, to do everything necessary to give effect to this");
  p("        Agreement, including to: sign and submit rezoning, subdivision,");
  p("        township, building-plan and municipal applications; deal with the");
  p("        local authority and service providers; sign the documents to");
  p("        register the Developer's interest against title; and sign the");
  p("        documents to transfer / contribute the Property into the SPV.");
  p("   6.2  This power of attorney is coupled with an interest, is IRREVOCABLE,");
  p("        and shall not lapse on the insolvency, death, incapacity or change");
  p("        of control of the Landowner.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("7.  CONTRIBUTION OF THE PROPERTY INTO THE SPV & EQUITY SPLIT");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   7.1  Upon the Developer proceeding, the Property shall be contributed /");
  p("        transferred into the SPV as the Landowner's equity contribution.");
  p(`   7.2  In consideration for contributing the Property, the Landowner shall`);
  p(`        receive and hold ${ownerPct}% (________________ percent) of the`);
  p("        issued Shares in the SPV.");
  p(`   7.3  The Developer (and/or the investor pool and co-investors it`);
  p(`        introduces) shall hold the remaining ${platformPct}% of the Shares,`);
  p("        representing the capital, funding, skill and execution contributed");
  p("        to the Project.");
  p("   7.4  The Landowner's Shares may be subject to dilution only on the same");
  p("        basis as all other shareholders and strictly in accordance with the");
  p("        SPV's Memorandum of Incorporation and Shareholders' Agreement.");
  p("   7.5  The Landowner contributes ONLY the Property. The Landowner is NOT");
  p("        required to contribute cash, nor to fund Development Costs, and");
  p("        shall not be called upon for further capital.");
  p("   7.6  The Property shall be held within the ring-fenced SPV, legally");
  p("        separate from the assets and liabilities of any other project.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("8.  THE DEVELOPER'S OBLIGATIONS  (WE DO EVERYTHING)");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   8.1  The Developer shall, at the risk of the Project and (save as");
  p("        provided herein) at no cost to the Landowner: arrange and manage");
  p("        all feasibility, town-planning and rezoning; appoint and manage the");
  p("        professional team and contractors; raise the development funding and");
  p("        investor capital; manage construction and delivery; and market and");
  p("        dispose of the completed units / development.");
  p("   8.2  The Developer shall account to the SPV and the Landowner for the");
  p("        Project through the Platform, including transparent reporting of");
  p("        the cap table, capital movements and distributions.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("9.  LANDOWNER WARRANTIES & OBLIGATIONS");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   9.1  The Landowner warrants that: (a) it is the sole registered owner");
  p("        of the Property (or will be, and has disclosed all co-owners); (b)");
  p("        it has full authority to conclude this Agreement; (c) the Property");
  p("        is not subject to any undisclosed lease, claim, servitude, dispute,");
  p("        land claim, expropriation or encumbrance; (d) all rates, taxes and");
  p("        levies are as disclosed; and (e) all information supplied is true");
  p("        and complete.");
  p("   9.2  The Landowner shall: keep the Property's rates and charges current");
  p("        (save where the SPV assumes them); not encumber or further burden");
  p("        the Property; promptly sign all documents requested; and cooperate");
  p("        fully and in good faith to advance the Project.");
  p("   9.3  The Landowner indemnifies the Developer and the SPV against any");
  p("        loss arising from a breach of these warranties.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("10.  PROTECTION OF THE DEVELOPER'S SPEND — BREAK FEE & REIMBURSEMENT");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   10.1 If the Landowner (a) withdraws, repudiates, cancels or purports to");
  p("        cancel this Agreement; (b) breaches the lock-out in Clause 3; (c)");
  p("        sells, encumbers or deals with the Property in breach hereof; (d)");
  p("        fails or refuses to sign documents or contribute the Property when");
  p("        required; or (e) otherwise frustrates or prevents the Project, then");
  p("        the Landowner shall immediately pay to the Developer:");
  p("          (i)  the full amount of the Developer's Development Spend (all");
  p("               costs, fees, disbursements and the reasonable value of time");
  p("               and effort incurred to date); PLUS");
  p("          (ii) a break fee / penalty equal to ____________ (being");
  p("               ____% of the Development Spend or the enhanced value, as");
  p("               elected by the Developer); PLUS");
  p("          (iii) any Enhancement value realised under Clause 11.");
  p("   10.2 These amounts constitute a liquidated, pre-agreed debt owing by the");
  p("        Landowner to the Developer, recoverable on demand, and are secured");
  p("        as set out in Clause 12.");
  p("   10.3 The Parties agree these amounts are a genuine pre-estimate of the");
  p("        Developer's loss and are fair and reasonable in the circumstances.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("11.  ENHANCEMENT / UPLIFT CAPTURE");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   11.1 Any Enhancement in the value of the Property resulting from the");
  p("        Developer's efforts (including rezoning, consent use, subdivision,");
  p("        services, approvals or design) belongs to the Project and shall not");
  p("        accrue to the Landowner outside this Agreement.");
  p("   11.2 If the partnership terminates through the Landowner's default or");
  p("        withdrawal after any Enhancement has been created, the Developer is");
  p("        entitled to be paid the full value of that Enhancement, in addition");
  p("        to the amounts in Clause 10, as a debt secured against the Property.");
  p("   11.3 The value of the Enhancement shall be determined by an independent");
  p("        valuer appointed by the Developer, acting as expert and not");
  p("        arbitrator.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("12.  SECURITY FOR THE DEVELOPER'S CLAIMS");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   12.1 As continuing security for all amounts that may become owing to the");
  p("        Developer under Clauses 10 and 11, the Landowner hereby:");
  p("          (a) cedes and pledges its rights, title and interest in and to");
  p("              the Property (and its Shares in the SPV) to the Developer; and");
  p("          (b) consents to the registration of a mortgage bond / notarial");
  p("              bond over the Property in favour of the Developer to secure");
  p("              such amounts, and undertakes to sign all documents required.");
  p("   12.2 The Developer may exercise its rights under this security on demand");
  p("        following an unremedied default, including by perfecting the bond");
  p("        and recovering the secured amounts from the Property.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("13.  RESTRICTION ON DISPOSAL & NON-CIRCUMVENTION");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   13.1 The Landowner shall not sell, transfer or dispose of the Property,");
  p("        its Shares, or any interest therein, otherwise than in accordance");
  p("        with this Agreement and the SPV's Shareholders' Agreement.");
  p("   13.2 The Landowner shall not circumvent the Developer by dealing");
  p("        directly with any investor, funder, professional, contractor or");
  p("        purchaser introduced by the Developer, nor use the Developer's");
  p("        feasibility, designs, approvals or relationships outside the");
  p("        Project. This restriction endures for ____ months after termination.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("14.  DISTRIBUTIONS & PROCEEDS");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   14.1 Net proceeds and distributions of the SPV shall be applied in the");
  p("        order set out in the Shareholders' Agreement, broadly: first to");
  p("        repay funding and Development Costs; then to return capital to the");
  p("        capital-contributing shareholders; and thereafter to shareholders");
  p(`        pro rata to their shareholding (Landowner ${ownerPct}% /`);
  p(`        Developer and co-investors ${platformPct}%).`);
  p("   14.2 The Landowner's return is derived from its shareholding in the SPV");
  p("        and is not a guaranteed amount; it depends on the Project outcome.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("15.  CONDITIONS PRECEDENT");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   15.1 The contribution of the Property into the SPV is subject to: (a)");
  p("        satisfactory due diligence and title verification; (b) the Developer");
  p("        securing the required funding and/or investor commitments; and (c)");
  p("        any municipal / regulatory consents the Developer considers");
  p("        necessary. The Developer may waive any condition in its favour.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("16.  DEFAULT & REMEDIES (SPECIFIC PERFORMANCE)");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   16.1 On any breach by the Landowner, the Developer may, without");
  p("        prejudice to its other rights: (a) claim specific performance,");
  p("        including compelling signature and contribution of the Property;");
  p("        (b) enforce the lock-out and registered restriction; (c) recover the");
  p("        amounts in Clauses 10 and 11; and/or (d) perfect its security under");
  p("        Clause 12. The Landowner acknowledges that damages alone are an");
  p("        inadequate remedy for the Developer and consents to interdictory");
  p("        and specific-performance relief.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("17.  DRAG-ALONG, TAG-ALONG & DEADLOCK");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   17.1 The Landowner shall be bound by customary drag-along provisions in");
  p("        the Shareholders' Agreement, such that on a sale of the Project");
  p("        approved by the majority, the Landowner shall sell its Shares on the");
  p("        same terms, and tag-along protection shall apply in its favour.");
  p("   17.2 Deadlock shall be resolved in accordance with the Shareholders'");
  p("        Agreement, failing which by the dispute mechanism in Clause 19.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("18.  CONFIDENTIALITY & POPIA");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   18.1 Each Party shall keep confidential the terms of this Agreement and");
  p("        all information disclosed, and shall use it only for the Project.");
  p("   18.2 The Landowner consents, in terms of the Protection of Personal");
  p("        Information Act 4 of 2013, to the processing of its personal");
  p("        information by the Developer and the SPV for the purposes of the");
  p("        Project, including due diligence, funding, registration and");
  p("        regulatory compliance.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("19.  DISPUTE RESOLUTION");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   19.1 Any dispute shall be referred to confidential arbitration under the");
  p("        rules of the Arbitration Foundation of Southern Africa (AFSA) by a");
  p("        single arbitrator, save that either Party may approach a court of");
  p("        competent jurisdiction for urgent or interdictory relief.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("20.  GENERAL");
  p("────────────────────────────────────────────────────────");
  p("");
  p("   20.1 Governing law: the laws of the Republic of South Africa.");
  p("   20.2 Whole agreement: this Agreement (with its annexures) constitutes the");
  p("        entire agreement; no variation is valid unless in writing and signed");
  p("        by both Parties. No indulgence constitutes a waiver.");
  p("   20.3 Severability: if any provision is unenforceable, the remainder shall");
  p("        continue in force.");
  p("   20.4 Electronic signature: the Parties agree, in terms of the Electronic");
  p("        Communications and Transactions Act 25 of 2002, that this Agreement");
  p("        may be concluded and signed electronically, and that an electronic");
  p("        signature (including acceptance recorded on the Platform with name,");
  p("        date, time and IP address) shall be valid and binding. Where");
  p("        registration in the Deeds Office requires an original wet-ink");
  p("        signature or notarial execution, the Landowner shall provide it on");
  p("        request.");
  p("   20.5 Costs of this Agreement and of giving effect to it (including");
  p("        conveyancing and registration) shall be borne by the Project / SPV");
  p("        unless otherwise agreed.");
  p("   20.6 This Agreement is subject to, and shall be supplemented and");
  p("        implemented through, the SPV's Memorandum of Incorporation and a");
  p("        Shareholders' Agreement, which the Landowner agrees to sign.");
  p("   20.7 IMPORTANT: This document is a binding commercial agreement. The");
  p("        Landowner confirms that it has had the opportunity to obtain");
  p("        independent legal advice before signing.");
  p("");
  p("────────────────────────────────────────────────────────");
  p("SIGNATURES");
  p("────────────────────────────────────────────────────────");
  p("");
  p("Signed by the LANDOWNER:");
  p("");
  p(`   Name:        ${lp.ownerFullName}`);
  p(`   ID / Reg No: ${orBlank(lp.ownerIdNumber ?? lp.ownerEntityRegNumber)}`);
  p("   Signature:   ______________________________");
  p("   Date:        ______________________________");
  p("   Place:       ______________________________");
  p("");
  p("   Witness 1:   ______________________________");
  p("   Witness 2:   ______________________________");
  p("");
  p("Signed by the DEVELOPER / PLATFORM:");
  p("");
  p(`   For and on behalf of ${platform.legalName}`);
  p(`   Name:        ${platform.signatoryName}`);
  p(`   Capacity:    ${platform.signatoryTitle} (duly authorised)`);
  p("   Signature:   ______________________________");
  p("   Date:        ______________________________");
  p("");
  p("────────────────────────────────────────────────────────");
  p("ANNEXURE A — PROPERTY PARTICULARS & TITLE");
  p("ANNEXURE B — PROJECT FEASIBILITY / CONCEPT (if available)");
  p("ANNEXURE C — SPV MEMORANDUM OF INCORPORATION (on incorporation)");
  p("ANNEXURE D — SHAREHOLDERS' AGREEMENT (on incorporation)");
  p("────────────────────────────────────────────────────────");

  return L.join("\n");
}
