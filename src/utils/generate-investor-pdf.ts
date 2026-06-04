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
  let y = m;

  doc.setFontSize(18).setFont("helvetica", "bold");
  doc.text("OFFER TO PURCHASE / DEED OF SALE", m, y);
  y += 22;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(110);
  doc.text(`Reference: OTP-${data.proposalId.toString().padStart(6, "0")}`, m, y);
  doc.text(
    `Issued: ${(data.signedDate ?? new Date()).toLocaleDateString("en-ZA")}`,
    400,
    y,
  );
  y += 26;
  doc.setTextColor(0);

  doc.setFontSize(9).setFont("helvetica", "italic").setTextColor(120);
  const preamble = doc.splitTextToSize(
    "This Offer to Purchase, once signed by both parties, constitutes a binding agreement of sale in terms of the Alienation of Land Act 68 of 1981 and is subject to the suspensive conditions set out below.",
    480,
  );
  doc.text(preamble, m, y);
  y += preamble.length * 11 + 14;
  doc.setTextColor(0).setFont("helvetica", "normal");

  // Parties
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("1. PARTIES", m, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(`Seller:    ${data.sellerName}  <${data.sellerEmail}>`, m, y);
  y += 13;
  if (data.sellerIdNumber) {
    doc.text(`Seller ID: ${data.sellerIdNumber}`, m, y);
    y += 13;
  }
  doc.text(
    `Purchaser: InvestProp (Pty) Ltd (Reg 2024/123456/07) — represented by ${data.managerName ?? "Development Manager"}`,
    m,
    y,
  );
  y += 22;

  // Property
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("2. PROPERTY", m, y);
  y += 16;
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(data.propertyTitle, m, y);
  y += 13;
  const addrLines = doc.splitTextToSize(data.propertyAddress, 480);
  doc.text(addrLines, m, y);
  y += addrLines.length * 12 + 12;

  // Price
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("3. PURCHASE PRICE & PAYMENT", m, y);
  y += 16;
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`Total purchase price: ${fmtZar(data.purchasePrice)}`, m, y);
  y += 13;
  if (data.depositAmount) {
    doc.text(`Deposit payable on signature: ${fmtZar(data.depositAmount)}`, m, y);
    y += 13;
    doc.text(
      `Balance: ${fmtZar(data.purchasePrice - data.depositAmount)} payable on registration of transfer.`,
      m,
      y,
    );
    y += 13;
  }
  y += 10;

  // Dates
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("4. KEY DATES", m, y);
  y += 16;
  doc.setFontSize(10).setFont("helvetica", "normal");
  if (data.occupationDate) {
    doc.text(
      `Occupation date: ${data.occupationDate.toLocaleDateString("en-ZA")}`,
      m,
      y,
    );
    y += 13;
  }
  if (data.transferDate) {
    doc.text(
      `Target registration of transfer: ${data.transferDate.toLocaleDateString("en-ZA")}`,
      m,
      y,
    );
    y += 13;
  }
  y += 10;

  // Conveyancer
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("5. CONVEYANCER", m, y);
  y += 16;
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(
    `${data.conveyancerName ?? "To be nominated by Purchaser"}. The Purchaser shall pay transfer-duty and conveyancing fees.`,
    m,
    y,
    { maxWidth: 480 },
  );
  y += 22;

  // Suspensive conditions
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("6. SUSPENSIVE CONDITIONS", m, y);
  y += 16;
  doc.setFontSize(9).setFont("helvetica", "normal");
  const conds = [
    "6.1 Title-deed verification and Deeds-office search within 14 (fourteen) days of signature.",
    "6.2 Conveyancer due-diligence (municipal rates, sectional-title levies, encumbrances, servitudes) within 21 days.",
    "6.3 Compliance with FICA (Act 38 of 2001) and POPIA (Act 4 of 2013).",
    "6.4 Issuance of all statutory clearance certificates (rates, electrical, gas, beetle, plumbing where applicable).",
    "6.5 Statutory 5 (five) business-day cooling-off period in terms of section 29A of the Alienation of Land Act applies where the purchase price is below the threshold.",
    "6.6 Where any condition is not met by its stipulated date, this agreement lapses and any deposit paid is refunded without deduction.",
  ];
  conds.forEach((c) => {
    const lines = doc.splitTextToSize(c, 480);
    doc.text(lines, m, y);
    y += lines.length * 11 + 4;
  });
  y += 8;

  // Special conditions
  if (data.specialConditions?.length) {
    if (y > 680) {
      doc.addPage();
      y = m;
    }
    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.text("7. SPECIAL CONDITIONS", m, y);
    y += 16;
    doc.setFontSize(9).setFont("helvetica", "normal");
    data.specialConditions.forEach((c, i) => {
      const lines = doc.splitTextToSize(`7.${i + 1} ${c}`, 480);
      doc.text(lines, m, y);
      y += lines.length * 11 + 4;
    });
    y += 8;
  }

  // Signatures
  if (y > 680) {
    doc.addPage();
    y = m;
  }
  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("SIGNATURES", m, y);
  y += 20;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(110);
  doc.text("Seller signature:", m, y);
  doc.line(m + 110, y + 2, m + 340, y + 2);
  doc.text("Date:", m + 360, y);
  doc.line(m + 400, y + 2, m + 520, y + 2);
  y += 30;
  doc.text("Witness 1:", m, y);
  doc.line(m + 110, y + 2, m + 340, y + 2);
  y += 30;
  doc.text("InvestProp:", m, y);
  doc.line(m + 110, y + 2, m + 340, y + 2);
  doc.text("Date:", m + 360, y);
  doc.line(m + 400, y + 2, m + 520, y + 2);
  y += 30;
  doc.text("Witness 2:", m, y);
  doc.line(m + 110, y + 2, m + 340, y + 2);

  // Footer
  doc.setFontSize(8).setTextColor(150);
  doc.text(
    "This is a legally binding agreement once signed by both parties and all suspensive conditions are met. Independent legal advice is recommended.",
    m,
    810,
    { maxWidth: 480 },
  );
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
