import { jsPDF } from "jspdf";

const fmtZar = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ───────────────────── Letter of Intent / Offer to Purchase ───────────────── */

export type LOIData = {
  proposalId: number;
  propertyAddress: string;
  sellerName: string;
  sellerEmail: string;
  offerAmount: number;
  engagementType: "OUTRIGHT_PURCHASE" | "JOINT_VENTURE" | "SECTIONAL_SALE";
  counterOfferAmount?: number | null;
  counterOfferTerms?: string | null;
  managerName?: string;
  signedDate?: Date;
};

export function generateLOI(data: LOIData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const m = 56;
  let y = m;

  // header
  doc.setFontSize(18).setFont("helvetica", "bold");
  doc.text("LETTER OF INTENT / OFFER TO PURCHASE", m, y);
  y += 22;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(110);
  doc.text(`Reference: LOI-${data.proposalId.toString().padStart(6, "0")}`, m, y);
  doc.text(
    `Issued: ${(data.signedDate ?? new Date()).toLocaleDateString("en-ZA")}`,
    400,
    y
  );
  y += 30;
  doc.setTextColor(0);

  // parties
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("PARTIES", m, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(`Seller:    ${data.sellerName}  <${data.sellerEmail}>`, m, y);
  y += 14;
  doc.text(`Purchaser: InvestProp (Pty) Ltd  — represented by ${data.managerName ?? "Development Manager"}`, m, y);
  y += 22;

  // property
  doc.setFont("helvetica", "bold");
  doc.text("PROPERTY", m, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const addrLines = doc.splitTextToSize(data.propertyAddress, 480);
  doc.text(addrLines, m, y);
  y += addrLines.length * 14 + 10;

  // engagement
  doc.setFont("helvetica", "bold");
  doc.text("ENGAGEMENT TYPE", m, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(data.engagementType.replace(/_/g, " "), m, y);
  y += 22;

  // offer
  doc.setFont("helvetica", "bold");
  doc.text("OFFER", m, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(`Initial offer: ${fmtZar(data.offerAmount)}`, m, y);
  y += 14;
  if (data.counterOfferAmount) {
    doc.text(`Counter offer: ${fmtZar(data.counterOfferAmount)}`, m, y);
    y += 14;
    if (data.counterOfferTerms) {
      const t = doc.splitTextToSize(`Counter terms: ${data.counterOfferTerms}`, 480);
      doc.text(t, m, y);
      y += t.length * 12 + 6;
    }
  }
  y += 14;

  // conditions
  doc.setFont("helvetica", "bold");
  doc.text("SUSPENSIVE CONDITIONS", m, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const conds = [
    "1. Title-deed verification within 14 days.",
    "2. Conveyancer due-diligence (rates, levies, encumbrances) within 21 days.",
    "3. Bond approval (if applicable) within 30 days.",
    "4. Compliance with FICA, POPIA, and JSE listing requirements.",
    "5. Statutory 5-day cooling-off period applies in terms of the Alienation of Land Act.",
  ];
  conds.forEach((c) => {
    const lines = doc.splitTextToSize(c, 480);
    doc.text(lines, m, y);
    y += lines.length * 12 + 4;
  });
  y += 20;

  // signature block
  doc.setFontSize(10).setFont("helvetica", "bold");
  doc.text("SIGNATURES", m, y);
  y += 18;
  doc.setFont("helvetica", "normal").setTextColor(110);
  doc.text("Seller signature:", m, y);
  doc.line(m + 100, y + 2, m + 320, y + 2);
  doc.text("Date:", m + 340, y);
  doc.line(m + 380, y + 2, m + 500, y + 2);
  y += 36;
  doc.text("InvestProp:", m, y);
  doc.line(m + 100, y + 2, m + 320, y + 2);
  doc.text("Date:", m + 340, y);
  doc.line(m + 380, y + 2, m + 500, y + 2);

  // footer
  doc.setFontSize(8).setTextColor(150);
  doc.text(
    "This document is a non-binding expression of intent until both parties have signed and all suspensive conditions are met.",
    m,
    800,
    { maxWidth: 480 }
  );
  return doc;
}

export function downloadLOI(data: LOIData) {
  const doc = generateLOI(data);
  doc.save(`LOI-${data.proposalId}.pdf`);
}

/* ───────────────────── Offer to Purchase (binding once accepted) ───────────── */

export type OTPData = {
  proposalId: number;
  propertyAddress: string;
  propertyTitle: string;
  sellerName: string;
  sellerEmail: string;
  sellerIdNumber?: string;
  purchasePrice: number;
  depositAmount?: number;
  occupationDate?: Date;
  transferDate?: Date;
  conveyancerName?: string;
  managerName?: string;
  signedDate?: Date;
  specialConditions?: string[];
};

export function generateOTP(data: OTPData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const m = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - m * 2;
  const bottom = pageH - 72;
  const ref = `OTP-${data.proposalId.toString().padStart(6, "0")}`;
  const today = (data.signedDate ?? new Date()).toLocaleDateString("en-ZA");
  let y = m;
  let clause = 0;
  let sub = 0;

  const ensure = (space: number) => {
    if (y + space > bottom) {
      doc.addPage();
      y = m;
    }
  };

  const heading = (title: string) => {
    ensure(48);
    clause += 1;
    sub = 0;
    doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(20);
    doc.text(`${clause}. ${title}`, m, y);
    y += 17;
  };

  const item = (text: string) => {
    sub += 1;
    const label = `${clause}.${sub}`;
    const labelW = 34;
    doc.setFontSize(9.5).setFont("helvetica", "normal").setTextColor(40);
    const lines: string[] = doc.splitTextToSize(text, contentW - labelW);
    lines.forEach((ln: string, i: number) => {
      ensure(13.5);
      if (i === 0) doc.text(label, m, y);
      doc.text(ln, m + labelW, y);
      y += 13.5;
    });
    y += 4;
  };

  const para = (text: string, gap = 7) => {
    doc.setFontSize(9.5).setFont("helvetica", "normal").setTextColor(40);
    const lines: string[] = doc.splitTextToSize(text, contentW);
    lines.forEach((ln: string) => {
      ensure(13.5);
      doc.text(ln, m, y);
      y += 13.5;
    });
    y += gap;
  };

  const kv = (key: string, value: string) => {
    doc.setFontSize(9.5).setFont("helvetica", "bold").setTextColor(40);
    ensure(14);
    doc.text(key, m, y);
    doc.setFont("helvetica", "normal");
    const keyW = 150;
    const lines: string[] = doc.splitTextToSize(value, contentW - keyW);
    lines.forEach((ln: string, i: number) => {
      if (i > 0) ensure(13.5);
      doc.text(ln, m + keyW, y);
      y += 13.5;
    });
    y += 2;
  };

  // ── Title block ──
  doc.setFontSize(17).setFont("helvetica", "bold").setTextColor(0);
  doc.text("OFFER TO PURCHASE", pageW / 2, y, { align: "center" });
  y += 20;
  doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(60);
  doc.text("AND DEED OF SALE OF IMMOVABLE PROPERTY", pageW / 2, y, { align: "center" });
  y += 22;
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(110);
  doc.text(`Reference: ${ref}`, m, y);
  doc.text(`Date: ${today}`, pageW - m, y, { align: "right" });
  y += 14;
  doc.setDrawColor(180);
  doc.line(m, y, pageW - m, y);
  y += 20;

  doc.setTextColor(0);
  para(
    "This Offer to Purchase, upon acceptance and signature by both the Seller and the Purchaser, constitutes a binding agreement of sale of immovable property in terms of section 2(1) of the Alienation of Land Act 68 of 1981, read with the Consumer Protection Act 68 of 2008 where applicable. The parties acknowledge that they have read and understood each clause and have had the opportunity to obtain independent legal advice prior to signature.",
    12,
  );

  // 1. Parties
  heading("PARTIES");
  item(`The Seller: ${data.sellerName}${data.sellerIdNumber ? ` (Identity / Registration Number: ${data.sellerIdNumber})` : ""}, contactable at ${data.sellerEmail} (hereinafter referred to as "the Seller").`);
  item(`The Purchaser: InvestProp (Pty) Ltd, Registration Number 2024/123456/07, a private company duly incorporated in the Republic of South Africa, herein represented by ${data.managerName ?? "its duly authorised Development Manager"} (hereinafter referred to as "the Purchaser").`);
  item("The Seller and the Purchaser are collectively referred to as \"the Parties\" and each individually as \"a Party\". Words importing the singular shall include the plural and vice versa, and any one gender shall include the other genders.");

  // 2. Property
  heading("THE PROPERTY");
  item(`The Seller sells to the Purchaser, who purchases, the immovable property described as: ${data.propertyTitle}.`);
  item(`Physical address: ${data.propertyAddress}.`);
  item("The property is sold together with all permanent fixtures and fittings of a permanent nature attached to the property and forming part thereof, including (where present and unless specifically excluded in writing): fitted carpets, blinds and curtain rails, light fittings, fitted stove and oven, built-in cupboards, fitted heaters, awnings, swimming-pool equipment and cleaning apparatus, garden borehole and irrigation systems, television aerials and satellite dishes, gate motors and remote controls, alarm systems and electric fencing.");
  item("The property is sold subject to all conditions, servitudes and restrictions of title applicable thereto and contained in or referred to in the relevant title deed, and to all such conditions as may appear from the Deeds Office records.");

  // 3. Purchase price
  heading("PURCHASE PRICE");
  item(`The total purchase price payable by the Purchaser to the Seller for the property is ${fmtZar(data.purchasePrice)} (the "Purchase Price"), inclusive of Value-Added Tax where the sale is a taxable supply, alternatively subject to transfer duty as provided for in law.`);
  if (data.depositAmount) {
    item(`A deposit of ${fmtZar(data.depositAmount)} is payable by the Purchaser upon signature of this agreement and the fulfilment of the suspensive conditions, to be held in trust by the appointed conveyancer pending registration of transfer.`);
    item(`The balance of the Purchase Price, being ${fmtZar(data.purchasePrice - data.depositAmount)}, shall be paid or secured as set out in the clause headed "Payment and Guarantees" below.`);
  } else {
    item("The full Purchase Price shall be paid or secured as set out in the clause headed \"Payment and Guarantees\" below.");
  }

  // 4. Payment and guarantees
  heading("PAYMENT AND GUARANTEES");
  item("The Purchaser shall, within 21 (twenty-one) days of the date upon which all suspensive conditions have been fulfilled, deliver to the appointed conveyancer one or more acceptable bank or financial-institution guarantees for payment of the balance of the Purchase Price, payable against registration of transfer of the property into the name of the Purchaser.");
  item("All amounts held by the conveyancer in trust shall, pending registration of transfer, be invested in an interest-bearing trust account in terms of section 86(4) of the Legal Practice Act 28 of 2014 for the benefit of the Purchaser, unless the Parties agree otherwise in writing.");
  item("Payment shall be made free of bank charges, deduction or set-off at the offices of the conveyancer.");

  // 5. Suspensive conditions
  heading("SUSPENSIVE CONDITIONS");
  item("This agreement is subject to a Deeds Office and title-deed verification search being completed by the conveyancer within 14 (fourteen) days of signature, confirming the Seller's unencumbered right to sell and transfer the property.");
  item("This agreement is subject to the conveyancer completing a due-diligence investigation (including municipal rates and services, sectional-title or home-owners' association levies where applicable, encumbrances, mortgage bonds, servitudes and restrictive conditions) to the reasonable satisfaction of the Purchaser within 21 (twenty-one) days of signature.");
  item("Where the Purchaser requires mortgage finance, this agreement is subject to the Purchaser obtaining a loan secured by a first mortgage bond over the property for the amount required, from a recognised financial institution, within 30 (thirty) days of signature, on terms ordinarily imposed by such institution.");
  item("Should any suspensive condition not be fulfilled (or waived in writing by the Party for whose benefit it is stipulated) by the relevant date, this agreement shall lapse and be of no further force or effect, whereupon any deposit and amounts paid by the Purchaser shall be refunded in full, without interest or deduction, and neither Party shall have any claim against the other.");

  // 6. Voetstoots / condition of the property
  heading("CONDITION OF THE PROPERTY (VOETSTOOTS)");
  item("The property is sold voetstoots (as it stands) and the Purchaser acknowledges that it has inspected the property, or had the opportunity to do so, and accepts the property in its existing condition, subject to clause 6.2 below.");
  item("The voetstoots clause shall not apply to any latent defect of which the Seller was actually aware at the date of signature and which the Seller deliberately concealed from the Purchaser with the intention to defraud, nor shall it limit any right the Purchaser may have in terms of the Consumer Protection Act 68 of 2008 where that Act applies to the transaction.");
  item("The Seller warrants that it is not aware of any latent defect, structural defect, or unauthorised building work that has not been disclosed in writing to the Purchaser.");

  // 7. Statutory compliance certificates
  heading("STATUTORY COMPLIANCE CERTIFICATES");
  item("The Seller shall, at the Seller's cost and prior to registration of transfer, obtain and deliver to the conveyancer a valid electrical Certificate of Compliance in respect of the electrical installation, as required by the Electrical Installation Regulations promulgated under the Occupational Health and Safety Act 85 of 1993.");
  item("Where the property contains a fixed gas installation, the Seller shall, at the Seller's cost, obtain and deliver a valid Gas Certificate of Conformity in terms of the Pressure Equipment Regulations.");
  item("Where the property is fitted with an electric fence, the Seller shall, at the Seller's cost, obtain and deliver a valid Electric Fence System Certificate of Compliance in terms of the Electrical Machinery Regulations.");
  item("In coastal and other designated areas, the Seller shall, at the Seller's cost, obtain and deliver an Entomologist's (beetle / wood-borer) certificate confirming the absence of infestation in accessible timber.");
  item("Where required by the relevant local authority, the Seller shall obtain and deliver a plumbing / water-installation certificate confirming compliance with applicable municipal by-laws.");

  // 8. Occupation and occupational rent
  heading("OCCUPATION AND OCCUPATIONAL RENT");
  if (data.occupationDate) {
    item(`Occupation of the property shall be given and taken on ${data.occupationDate.toLocaleDateString("en-ZA")}, or on the date of registration of transfer, whichever the Parties agree applies.`);
  } else {
    item("Occupation of the property shall be given and taken on the date of registration of transfer, unless otherwise agreed in writing.");
  }
  item("Should occupation be given to the Purchaser prior to registration of transfer, the Purchaser shall pay occupational rental at a market-related amount agreed between the Parties, monthly in advance, from the date of occupation until the date of registration of transfer.");
  item("Should the Seller remain in occupation after registration of transfer, the Seller shall pay occupational rental to the Purchaser at the same rate, monthly in advance, until the Seller vacates the property.");

  // 9. Possession, risk and insurance
  heading("POSSESSION, RISK AND BENEFIT");
  item("Possession of the property shall pass to the Purchaser on the date of occupation, from which date the property shall be at the sole risk, benefit and responsibility of the Purchaser.");
  item("From the date of possession, the Purchaser shall be liable for all risk in and to the property, and is advised to procure adequate insurance cover. The Seller shall maintain its existing insurance until registration of transfer where the Seller remains the registered owner.");
  item("The Seller shall, until the date of possession, maintain the property and its improvements in their present condition, fair wear and tear excepted, and shall not remove any fixture or fitting forming part of the sale.");

  // 10. Transfer and conveyancing
  heading("TRANSFER AND CONVEYANCING");
  item(`Transfer of the property shall be effected by ${data.conveyancerName ?? "the conveyancer nominated by the Purchaser"} (the "Conveyancer"), who shall attend to registration of transfer in the Deeds Office.`);
  if (data.transferDate) {
    item(`The Parties shall use their reasonable endeavours to procure registration of transfer on or about ${data.transferDate.toLocaleDateString("en-ZA")}.`);
  }
  item("The Parties shall sign all such documents and do all such things and provide all such information (including FICA documentation) as the Conveyancer may reasonably require to give effect to this agreement, within 7 (seven) days of being requested to do so.");

  // 11. Costs and transfer duty
  heading("COSTS, TRANSFER DUTY AND CHARGES");
  item("The Purchaser shall be liable for and pay all costs of transfer, including transfer duty (or VAT where applicable), conveyancing fees, Deeds Office registration fees and disbursements, against presentation of the Conveyancer's pro-forma statement.");
  item("The Seller shall be liable for the costs of obtaining the statutory compliance certificates, any rates-clearance certificate and any bond-cancellation costs in respect of existing mortgage bonds.");
  item("Municipal rates, taxes, levies and service charges shall be apportioned between the Parties as at the date of registration of transfer, the Seller being liable up to and including that date and the Purchaser thereafter.");

  // 12. Breach and remedies
  heading("BREACH AND REMEDIES");
  item("Should either Party (the \"defaulting Party\") commit a breach of any provision of this agreement and fail to remedy such breach within 7 (seven) days of written notice from the aggrieved Party calling upon it to do so, the aggrieved Party shall be entitled, without prejudice to any other rights it may have in law, to either: (a) claim specific performance of all the defaulting Party's obligations; or (b) cancel this agreement and claim damages.");
  item("In the event of cancellation by reason of the Purchaser's default, the Seller shall be entitled to retain all amounts paid by the Purchaser as a genuine pre-estimate of liquidated damages, or to claim such further damages as the Seller may prove.");
  item("All amounts not paid on due date shall bear interest at the prime overdraft rate charged by the Purchaser's principal bankers from time to time, plus 2% (two percent) per annum, calculated daily and compounded monthly from the due date until date of payment.");

  // 13. Agent's commission
  heading("AGENT'S COMMISSION");
  item("The Parties record whether or not an estate agent introduced the Parties to one another. Where an agent was the effective cause of the sale, the agent's commission shall be payable by the Party agreed between them in a separate written mandate, and such commission shall become due and payable on registration of transfer.");
  item("Each Party warrants that, save as disclosed in writing, it has not dealt with any agent who may have a claim for commission arising from this sale, and indemnifies the other against any such undisclosed claim.");

  // 14. FICA compliance
  heading("FICA AND ANTI-MONEY-LAUNDERING");
  item("The Parties acknowledge that the Conveyancer and the Purchaser are accountable institutions in terms of the Financial Intelligence Centre Act 38 of 2001 (\"FICA\") and undertake to provide all identity, proof-of-address, source-of-funds and other documentation reasonably required to comply with FICA, the Prevention of Organised Crime Act and related legislation.");
  item("Registration of transfer shall not proceed until all FICA verification requirements have been met to the reasonable satisfaction of the Conveyancer.");

  // 15. POPIA / data protection
  heading("PROTECTION OF PERSONAL INFORMATION");
  item("Each Party consents to the collection, processing and storage of its personal information by the other Party and the Conveyancer for the purposes of giving effect to this agreement, in accordance with the Protection of Personal Information Act 4 of 2013 (\"POPIA\").");
  item("Personal information shall be processed only for the purposes of this transaction and shall not be shared with third parties save as required by law or as reasonably necessary to give effect to this agreement.");

  // 16. Cooling-off
  heading("COOLING-OFF RIGHTS");
  item("Where the Purchase Price is R250 000 (two hundred and fifty thousand rand) or less and the Purchaser is a natural person, the Purchaser shall be entitled to revoke this offer or terminate this agreement within 5 (five) ordinary days after the date of signature, by written notice delivered to the Seller, in terms of section 29A of the Alienation of Land Act 68 of 1981.");
  item("Where the Consumer Protection Act 68 of 2008 applies and this transaction resulted from direct marketing, the Purchaser shall enjoy the cooling-off rights conferred by section 16 of that Act.");

  // 17. Warranties
  heading("WARRANTIES AND REPRESENTATIONS");
  item("The Seller warrants that it is the registered owner of the property (or duly authorised to sell it), that it has full legal capacity and authority to enter into and give effect to this agreement, and that the property is not subject to any lease, option, pre-emptive right or other encumbrance not disclosed in writing to the Purchaser.");
  item("The Seller warrants that there are no pending or threatened expropriation, town-planning, land-claim or municipal enforcement proceedings affecting the property of which the Seller is aware and which have not been disclosed.");
  item("No representation, warranty or undertaking not recorded in this agreement shall be binding on either Party.");

  // 18. Domicilium and notices
  heading("DOMICILIUM AND NOTICES");
  item("Each Party chooses as its domicilium citandi et executandi (address for the service of legal process and notices) the physical address set out next to its name in this agreement, alternatively the address of the property in the case of the Seller.");
  item("Any notice given in terms of this agreement shall be in writing and shall be deemed to have been duly given: (a) on the date of delivery if delivered by hand; (b) on the 5th business day after posting if sent by prepaid registered post; or (c) on the date of transmission if sent by email, provided no delivery-failure notification is received.");

  // 19. Whole agreement
  heading("WHOLE AGREEMENT, VARIATION AND SEVERABILITY");
  item("This agreement constitutes the entire agreement between the Parties in regard to its subject matter, and no Party shall be bound by any representation, warranty, promise or the like not recorded herein.");
  item("No addition to, variation, novation or consensual cancellation of this agreement shall be of any force or effect unless reduced to writing and signed by or on behalf of both Parties.");
  item("No indulgence or relaxation granted by either Party shall constitute a waiver of that Party's rights, nor preclude that Party from exercising any rights which may have arisen.");
  item("If any provision of this agreement is found to be invalid, unlawful or unenforceable, such provision shall be severable and the remaining provisions shall continue to be of full force and effect.");

  // 20. Dispute resolution and governing law
  heading("DISPUTE RESOLUTION AND GOVERNING LAW");
  item("This agreement shall be governed by and construed in accordance with the laws of the Republic of South Africa.");
  item("Any dispute arising out of or in connection with this agreement shall first be referred to good-faith negotiation between the Parties and, failing resolution within 15 (fifteen) business days, to mediation, and failing resolution thereafter, to arbitration in accordance with the rules of the Arbitration Foundation of Southern Africa, save that either Party may approach a court of competent jurisdiction for urgent or interim relief.");
  item("The Parties consent, in respect of any litigation, to the jurisdiction of the Magistrate's Court having jurisdiction notwithstanding that the matter might otherwise exceed the jurisdiction of that court.");

  // 21. Special conditions
  heading("SPECIAL CONDITIONS");
  if (data.specialConditions?.length) {
    data.specialConditions.forEach((c) => item(c));
  } else {
    item("There are no additional special conditions applicable to this sale, save as set out elsewhere in this agreement.");
  }

  // 22. Acknowledgement
  heading("ACKNOWLEDGEMENT BY THE PARTIES");
  para(
    "The Parties acknowledge that they have read and understood the whole of this agreement, that they enter into it freely and voluntarily, that they have had the opportunity to obtain independent legal advice, and that they intend to be legally bound by its terms upon signature.",
    14,
  );

  // ── Signature page (always starts on a fresh page) ──
  doc.addPage();
  y = m;
  doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(20);
  doc.text("SIGNED BY THE PARTIES", m, y);
  y += 24;

  const sigBlock = (label: string) => {
    ensure(78);
    doc.setFontSize(9.5).setFont("helvetica", "normal").setTextColor(110);
    doc.setDrawColor(120);
    doc.line(m, y, m + 230, y);
    doc.line(m + 270, y, pageW - m, y);
    y += 13;
    doc.text(label, m, y);
    doc.text("Date", m + 270, y);
    y += 30;
  };

  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(40);
  doc.text(`Thus done and signed by the SELLER (${data.sellerName}):`, m, y);
  y += 26;
  sigBlock("Seller signature");
  sigBlock("Witness 1");
  sigBlock("Witness 2");
  y += 6;

  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(40);
  ensure(40);
  doc.text("Thus done and signed by the PURCHASER (InvestProp (Pty) Ltd):", m, y);
  y += 26;
  sigBlock("Duly authorised representative");
  sigBlock("Witness 1");
  sigBlock("Witness 2");

  // ── Annexure helpers ──
  const annexure = (letter: string, title: string, intro: string) => {
    doc.addPage();
    y = m;
    doc.setFontSize(13).setFont("helvetica", "bold").setTextColor(0);
    doc.text(`ANNEXURE ${letter}`, m, y);
    y += 18;
    doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(40);
    doc.text(title, m, y);
    y += 16;
    doc.setDrawColor(180);
    doc.line(m, y, pageW - m, y);
    y += 16;
    if (intro) para(intro, 10);
  };

  const checkRow = (label: string) => {
    ensure(20);
    doc.setDrawColor(120);
    // two tick boxes: Included / Excluded
    const boxY = y - 8;
    doc.rect(pageW - m - 150, boxY, 10, 10);
    doc.rect(pageW - m - 60, boxY, 10, 10);
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(110);
    doc.text("Incl.", pageW - m - 137, y);
    doc.text("Excl.", pageW - m - 47, y);
    doc.setFontSize(9.5).setTextColor(40);
    doc.text(label, m, y);
    y += 18;
  };

  const discRow = (label: string) => {
    ensure(20);
    doc.setDrawColor(120);
    const boxY = y - 8;
    doc.rect(pageW - m - 120, boxY, 10, 10);
    doc.rect(pageW - m - 60, boxY, 10, 10);
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(110);
    doc.text("Yes", pageW - m - 107, y);
    doc.text("No", pageW - m - 47, y);
    doc.setFontSize(9.5).setTextColor(40);
    const lines: string[] = doc.splitTextToSize(label, contentW - 140);
    lines.forEach((ln: string, i: number) => {
      if (i > 0) { ensure(13.5); }
      doc.text(ln, m, y);
      if (i < lines.length - 1) y += 13.5;
    });
    y += 18;
  };

  // ── Annexure A: Fixtures, Fittings and Inclusions Schedule ──
  annexure(
    "A",
    "FIXTURES, FITTINGS AND INCLUSIONS SCHEDULE",
    "The Parties record below which items are included in or excluded from the sale of the property. Where an item is marked neither included nor excluded, it shall be deemed included if it is a permanent fixture attached to the property as at the date of signature. This schedule forms an integral part of the Offer to Purchase.",
  );
  [
    "Fitted carpets and floor coverings",
    "Curtain rails, blinds and pelmets",
    "Curtains and curtaining",
    "Light fittings and chandeliers",
    "Fitted stove, hob and oven",
    "Extractor fan / cooker hood",
    "Built-in kitchen cupboards and cabinetry",
    "Built-in bedroom cupboards",
    "Fitted heaters and heated towel rails",
    "Awnings, shutters and blinds (external)",
    "Swimming-pool pump, filter and cleaning equipment",
    "Borehole, pump and irrigation system",
    "Television aerials and satellite dishes",
    "Automated gate motor and remote controls",
    "Garage-door motor and remote controls",
    "Alarm system, beams and control panel",
    "Electric fencing and energiser",
    "Intercom and access-control equipment",
    "Solar panels, inverter and battery storage",
    "Water tanks and rainwater-harvesting equipment",
    "Garden ornaments, statues and pot plants",
    "Wendy house / tool shed / storage structures",
  ].forEach(checkRow);

  // ── Annexure B: Seller's Mandatory Disclosure Statement ──
  annexure(
    "B",
    "SELLER'S MANDATORY DISCLOSURE STATEMENT",
    "In accordance with the Property Practitioners Act 22 of 2019 and the regulations promulgated thereunder, the Seller is required to disclose all defects and information known to it in respect of the property. The Seller warrants that the information provided below is true and correct to the best of its knowledge and belief as at the date of signature.",
  );
  [
    "Is the Seller aware of any latent or patent defects in the structure of the property (foundations, walls, roof)?",
    "Is the Seller aware of any defects in the electrical, plumbing, gas or drainage installations?",
    "Has the property been affected by flooding, rising or penetrating damp, or water ingress?",
    "Are there any unapproved building works, structures or alterations without municipal-approved building plans?",
    "Is the Seller aware of any boundary, encroachment or servitude disputes affecting the property?",
    "Is the property subject to any lease, right of occupation, or pre-emptive right in favour of a third party?",
    "Are there any outstanding amounts owing to the local authority, body corporate or home-owners' association?",
    "Is the Seller aware of any pending or threatened expropriation or land-restitution claim?",
    "Has the property been treated for, or is it affected by, wood borer, termites or other infestation?",
    "Are there any defects in fixed appliances, pool, borehole or irrigation systems included in the sale?",
  ].forEach(discRow);
  y += 6;
  para(
    "The Seller confirms that, save as disclosed above and in any attached explanatory note, the Seller is not aware of any further defect or fact materially affecting the value or desirability of the property. The Purchaser acknowledges receipt of this disclosure statement prior to signature.",
    10,
  );

  // ── Annexure C: FICA and Verification Checklist ──
  annexure(
    "C",
    "FICA AND VERIFICATION CHECKLIST",
    "The following documentation is required from each natural-person and juristic Party in order to comply with the Financial Intelligence Centre Act 38 of 2001 and to enable the Conveyancer to proceed with registration of transfer. Documents must be certified copies not older than three (3) months unless otherwise indicated.",
  );
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(40);
  ensure(16);
  doc.text("Natural persons:", m, y);
  y += 16;
  [
    "Certified copy of valid identity document or passport",
    "Proof of residential address (utility bill, bank statement) not older than 3 months",
    "Income-tax registration number / SARS confirmation",
    "Marriage certificate and antenuptial contract (where applicable)",
    "Bank confirmation of account details for payment / refund purposes",
  ].forEach(checkRow);
  y += 6;
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(40);
  ensure(16);
  doc.text("Juristic persons (companies, trusts, close corporations):", m, y);
  y += 16;
  [
    "Certified registration / incorporation documents (CIPC, Master's Office)",
    "Resolution authorising the transaction and the signatory",
    "Identity documents and proof of address of directors / trustees / members",
    "Proof of address of the registered office and place of business",
    "Income-tax and VAT registration confirmation (where applicable)",
  ].forEach(checkRow);
  y += 10;
  para(
    "The Parties undertake to deliver the above documentation to the Conveyancer within 7 (seven) days of written request. Registration of transfer shall not proceed until all verification requirements have been satisfied to the reasonable satisfaction of the Conveyancer.",
    10,
  );

  // ── Page footers ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(150);
    doc.text(
      `Offer to Purchase  |  Ref ${ref}  |  Generated ${today}`,
      m,
      pageH - 34,
    );
    doc.text(`Page ${p} of ${total}`, pageW - m, pageH - 34, { align: "right" });
    doc.text(
      "This is a legally binding agreement once signed. Independent legal advice is recommended before signature.",
      m,
      pageH - 22,
    );
  }

  return doc;
}

export function downloadOTP(data: OTPData) {
  const doc = generateOTP(data);
  doc.save(`OTP-${data.proposalId}.pdf`);
}

/* ───────────────────── Payment Receipt ───────────────────── */

export type ReceiptData = {
  receiptNumber: string;
  paidBy: string;
  paidByEmail: string;
  amount: number;
  reference?: string;
  date: Date;
  propertyTitle: string;
  contributionId: number;
};

export function downloadReceipt(data: ReceiptData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const m = 56;
  let y = m;
  doc.setFontSize(20).setFont("helvetica", "bold");
  doc.text("PAYMENT RECEIPT", m, y);
  y += 24;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(110);
  doc.text(`Receipt #: ${data.receiptNumber}`, m, y);
  doc.text(`Date: ${data.date.toLocaleDateString("en-ZA")}`, 400, y);
  y += 40;
  doc.setTextColor(0).setFontSize(11);
  const rows: [string, string][] = [
    ["Received from", data.paidBy],
    ["Email", data.paidByEmail],
    ["Property", data.propertyTitle],
    ["Contribution ID", `#${data.contributionId}`],
    ["Reference", data.reference ?? "—"],
    ["Amount", fmtZar(data.amount)],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold").text(k, m, y);
    doc.setFont("helvetica", "normal").text(v, m + 130, y);
    y += 20;
  });
  y += 20;
  doc.setFontSize(9).setTextColor(110);
  doc.text(
    "InvestProp (Pty) Ltd — Reg 2024/123456/07 — FSP TBC — VAT 4012345678",
    m,
    y
  );
  doc.save(`Receipt-${data.receiptNumber}.pdf`);
}

/* ───────────────────── IT3(b) Tax Certificate ───────────────────── */

export type IT3Data = {
  certNumber: string;
  taxYear: string; // e.g. "2025/2026"
  investorName: string;
  investorIdNumber?: string;
  totalDistributions: number;
  totalCapitalGains: number;
  contributions: Array<{
    propertyTitle: string;
    amountInvested: number;
    distributionsReceived: number;
  }>;
};

export function downloadIT3(data: IT3Data) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const m = 56;
  let y = m;
  doc.setFontSize(18).setFont("helvetica", "bold");
  doc.text("IT3(b) INVESTMENT INCOME CERTIFICATE", m, y);
  y += 22;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(110);
  doc.text(`Certificate: ${data.certNumber}`, m, y);
  doc.text(`Tax year: ${data.taxYear}`, 400, y);
  y += 30;

  doc.setTextColor(0).setFontSize(11).setFont("helvetica", "bold");
  doc.text("INVESTOR", m, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(`Name: ${data.investorName}`, m, y);
  y += 14;
  if (data.investorIdNumber) {
    doc.text(`ID/Reg: ${data.investorIdNumber}`, m, y);
    y += 14;
  }
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.text("HOLDINGS & INCOME", m, y);
  y += 16;
  doc.setFontSize(10).setFont("helvetica", "bold");
  doc.text("Property", m, y);
  doc.text("Invested", 280, y);
  doc.text("Distributions", 400, y);
  y += 4;
  doc.line(m, y, 540, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  data.contributions.forEach((c) => {
    doc.text(c.propertyTitle.substring(0, 38), m, y);
    doc.text(fmtZar(c.amountInvested), 280, y);
    doc.text(fmtZar(c.distributionsReceived), 400, y);
    y += 14;
  });
  y += 10;
  doc.line(m, y, 540, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.text("Total distributions (taxable income)", m, y);
  doc.text(fmtZar(data.totalDistributions), 400, y);
  y += 16;
  doc.text("Total capital gains realised", m, y);
  doc.text(fmtZar(data.totalCapitalGains), 400, y);
  y += 40;
  doc.setFontSize(9).setTextColor(110);
  doc.text(
    "This certificate is issued in terms of section 26A of the Income Tax Act for declaration on your annual SARS return.",
    m,
    y,
    { maxWidth: 480 }
  );
  doc.save(`IT3b-${data.certNumber}.pdf`);
}
