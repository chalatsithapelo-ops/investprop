import jsPDF from "jspdf";
import QRCode from "qrcode";

/**
 * Investprop — Secure Share Certificate PDF Generator
 *
 * Anti-fraud & traceability features:
 *  1. QR Code – links to verification URL with cert number + hash digest
 *  2. Copy Number – each download is numbered ("Document Copy #3")
 *  3. Unique Document Serial – per-download serial stamped on the certificate
 *  4. Full SHA-256 Hash – prominently displayed for tamper detection
 *  5. Document Fingerprint (UUID) – secondary verification token
 *  6. Anti-duplication watermark – serial number diagonal across the page
 *  7. Download timestamp – exact moment the PDF was generated
 *  8. Verification instructions – how to validate authenticity
 *  9. Audit trail reference – all downloads are logged in the database
 * 10. Tamper-evident notice – states any alteration invalidates the document
 */

export interface CertificateData {
  certificateNumber: string;
  investorName: string;
  investorCode: string;
  propertyTitle: string;
  propertyAddress: string;
  numberOfShares: number;
  sharePrice: number;
  totalValue: number;
  ownershipPercentage: number;
  shareClassName: string;
  issueDate: string;
  isValid: boolean;
  fingerprint: string;
  validationHash: string;
  verificationCount: number;
  propertyCity: string;
  propertyState: string;
  fundingGoal: number;
  paymentMethod: string;
  paymentReference: string;
  // SPV (legal entity) fields
  spvName: string | null;
  spvRegistrationNumber: string | null;
  // Anti-fraud fields
  copyNumber: number;
  documentSerial: string;
  downloadTimestamp: string;
  downloadedBy: string;
  totalDownloads: number;
  issuedAt: string;
}

// ── Colour Palette ────────────────────────────────────────────
const NAVY = [15, 23, 42] as const;
const GOLD = [217, 164, 6] as const;
const GOLD_LIGHT = [253, 243, 200] as const;
const DARK_GREY = [55, 65, 81] as const;
const MED_GREY = [107, 114, 128] as const;
const GREEN = [22, 163, 74] as const;
const RED = [220, 38, 38] as const;
const WHITE = [255, 255, 255] as const;
const LIGHT_BG = [248, 250, 252] as const;

// ── Helpers ─────────────────────────────────────────────────

function drawBorderFrame(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Outer navy border
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(3);
  doc.rect(8, 8, w - 16, h - 16);

  // Inner gold border
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.rect(12, 12, w - 24, h - 24);

  // Inner thin navy border
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.rect(15, 15, w - 30, h - 30);

  // Corner ornaments
  doc.setFillColor(...GOLD);
  doc.rect(14, 14, 6, 6, "F");
  doc.rect(w - 20, 14, 6, 6, "F");
  doc.rect(14, h - 20, 6, 6, "F");
  doc.rect(w - 20, h - 20, 6, 6, "F");
}

function drawSerialWatermark(doc: jsPDF, serial: string, copyNumber: number) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Diagonal watermark with serial and copy number
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(235, 235, 240);
  const watermarkText = `COPY #${copyNumber} | ${serial}`;

  for (let y = 55; y < h - 25; y += 40) {
    for (let x = 15; x < w - 15; x += 120) {
      doc.text(watermarkText, x, y, { angle: 25 });
    }
  }
}

function drawGoldDivider(doc: jsPDF, y: number, leftX: number, rightX: number) {
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(leftX, y, rightX, y);

  const midX = (leftX + rightX) / 2;
  doc.setFillColor(...GOLD);
  doc.setDrawColor(...GOLD);
  doc.triangle(midX - 3, y, midX, y - 2.5, midX + 3, y, "F");
  doc.triangle(midX - 3, y, midX, y + 2.5, midX + 3, y, "F");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-ZA", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-ZA", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatCurrency(n: number): string {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── QR Code Generation ──────────────────────────────────────

async function generateQRDataURL(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 200,
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
}

// ── Main Generator ──────────────────────────────────────────

export async function generateCertificatePDF(data: CertificateData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();   // 297
  const H = doc.internal.pageSize.getHeight();  // 210
  const CX = W / 2;

  // ── 0. Anti-duplication serial watermark ──
  drawSerialWatermark(doc, data.documentSerial, data.copyNumber);

  // ── 1. Border frame ──
  drawBorderFrame(doc);

  // ── 2. Header — Navy band ──
  doc.setFillColor(...NAVY);
  doc.rect(15, 18, W - 30, 30, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("INVESTPROP", CX, 29, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text("FRACTIONAL PROPERTY INVESTMENT", CX, 36, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(180, 190, 210);
  doc.text("Registered in terms of the Companies Act 71 of 2008  |  Republic of South Africa", CX, 43, { align: "center" });

  // ── Copy number badge (top right) ──
  const badgeX = W - 58;
  const badgeY = 20;
  doc.setFillColor(...GOLD);
  doc.roundedRect(badgeX, badgeY, 40, 12, 2, 2, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`DOCUMENT COPY #${data.copyNumber}`, badgeX + 20, badgeY + 5, { align: "center" });
  doc.setFontSize(5.5);
  doc.text(`of ${data.totalDownloads} issued`, badgeX + 20, badgeY + 9, { align: "center" });

  // ── 3. Certificate Title ──
  let y = 55;
  doc.setFontSize(18);
  doc.setTextColor(...GOLD);
  doc.setFont("helvetica", "bold");
  doc.text("SHARE CERTIFICATE", CX, y, { align: "center" });

  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...MED_GREY);
  doc.setFont("helvetica", "normal");
  doc.text("Certificate of Ownership — Issued under Section 51 of the Companies Act", CX, y, { align: "center" });

  // ── 4. Certificate Number + Date ──
  y += 7;
  drawGoldDivider(doc, y, 40, W - 40);

  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`Certificate No: ${data.certificateNumber}`, CX, y, { align: "center" });

  y += 4.5;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(`Issue Date: ${formatDate(data.issueDate)}  |  Document Serial: ${data.documentSerial}`, CX, y, { align: "center" });

  // ── 5. Investor declaration ──
  y += 7;
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK_GREY);
  doc.text("This is to certify that", CX, y, { align: "center" });

  y += 7;
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(data.investorName.toUpperCase(), CX, y, { align: "center" });

  y += 5;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(`Investor ID: ${data.investorCode}`, CX, y, { align: "center" });

  y += 6;
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK_GREY);
  doc.text("is the registered holder of", CX, y, { align: "center" });

  // ── 6. Shares details ──
  y += 8;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`${data.numberOfShares.toLocaleString()} ${data.shareClassName} Shares`, CX, y, { align: "center" });

  y += 6;
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  doc.text(`at ${formatCurrency(data.sharePrice)} per share`, CX, y, { align: "center" });

  y += 5;
  doc.text("in the property known as", CX, y, { align: "center" });

  y += 7;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(data.propertyTitle, CX, y, { align: "center" });

  y += 5;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(data.propertyAddress, CX, y, { align: "center" });

  // SPV legal entity line
  if (data.spvName) {
    y += 4.5;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GOLD);
    const spvLine = data.spvRegistrationNumber
      ? `Held by ${data.spvName} (Reg: ${data.spvRegistrationNumber})`
      : `Held by ${data.spvName}`;
    doc.text(spvLine, CX, y, { align: "center" });
  }

  // ── 7. Key Metrics boxes ──
  y += 8;
  const boxW = 54;
  const boxH = 16;
  const gap = 6;
  const totalBoxW = boxW * 4 + gap * 3;
  const startX = (W - totalBoxW) / 2;

  const boxes = [
    { label: "Total Value", value: formatCurrency(data.totalValue) },
    { label: "Ownership", value: `${data.ownershipPercentage.toFixed(4)}%` },
    { label: "Share Class", value: data.shareClassName },
    { label: "Payment", value: data.paymentMethod.replace(/_/g, " ") },
  ];

  boxes.forEach((box, i) => {
    const bx = startX + i * (boxW + gap);
    doc.setFillColor(...GOLD_LIGHT);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, boxW, boxH, 2, 2, "FD");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MED_GREY);
    doc.text(box.label, bx + boxW / 2, y + 5, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(box.value, bx + boxW / 2, y + 12, { align: "center" });
  });

  // ── 8. Divider ──
  y += boxH + 6;
  drawGoldDivider(doc, y, 40, W - 40);

  // ── 9. Signatures + QR Code section ──
  y += 4;
  const sigY = y;

  // Left signature
  const leftSigX = 40;
  const sigLineW = 55;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(leftSigX, sigY + 10, leftSigX + sigLineW, sigY + 10);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  doc.text("Authorised Director", leftSigX + sigLineW / 2, sigY + 14, { align: "center" });
  doc.setFontSize(6.5);
  doc.setTextColor(...MED_GREY);
  doc.text("Investprop (Pty) Ltd", leftSigX + sigLineW / 2, sigY + 17.5, { align: "center" });

  // Right signature
  const rightSigX = W - 40 - sigLineW;
  doc.setDrawColor(...NAVY);
  doc.line(rightSigX, sigY + 10, rightSigX + sigLineW, sigY + 10);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  doc.text("Company Secretary", rightSigX + sigLineW / 2, sigY + 14, { align: "center" });
  doc.setFontSize(6.5);
  doc.setTextColor(...MED_GREY);
  doc.text("Certificate Registry", rightSigX + sigLineW / 2, sigY + 17.5, { align: "center" });

  // Company seal circle (center-left)
  const sealX = CX - 18;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.circle(sealX, sigY + 8, 8);
  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("INVESTPROP", sealX, sigY + 6, { align: "center" });
  doc.text("SEAL", sealX, sigY + 9.5, { align: "center" });

  // QR Code (to the right of seal)
  try {
    const verifyURL = `https://investprop.io/verify?cert=${data.certificateNumber}&hash=${data.validationHash.substring(0, 16)}&serial=${data.documentSerial}`;
    const qrDataURL = await generateQRDataURL(verifyURL);
    const qrSize = 22;
    const qrX = CX + 6;
    const qrY = sigY - 2;
    doc.addImage(qrDataURL, "PNG", qrX, qrY, qrSize, qrSize);

    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MED_GREY);
    doc.text("Scan to verify", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
    doc.text("authenticity", qrX + qrSize / 2, qrY + qrSize + 6, { align: "center" });
  } catch {
    // QR code failed — continue without it
  }

  // ── 10. Validity + Copy badge ──
  y = sigY + 22;
  if (data.isValid) {
    doc.setFillColor(...GREEN);
    doc.roundedRect(CX - 30, y, 60, 7, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("CERTIFICATE VALID  |  VERIFIED AUTHENTIC", CX, y + 5, { align: "center" });
  } else {
    doc.setFillColor(...RED);
    doc.roundedRect(CX - 30, y, 60, 7, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("CERTIFICATE REVOKED  |  NO LONGER VALID", CX, y + 5, { align: "center" });
  }

  // ── 11. Security & Traceability Section ──
  y += 12;
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(200, 200, 210);
  doc.setLineWidth(0.3);
  doc.roundedRect(18, y, W - 36, 34, 2, 2, "FD");

  // Title
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("SECURITY & TRACEABILITY", 22, y + 4.5);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(22, y + 6, 72, y + 6);

  // Left column
  const colL = 22;
  let row = y + 10;

  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("Document Fingerprint:", colL, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(data.fingerprint, colL + 35, row);

  row += 4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("SHA-256 Validation Hash:", colL, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(data.validationHash, colL + 38, row);

  row += 4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("Document Serial:", colL, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(data.documentSerial, colL + 28, row);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("Copy Number:", colL + 100, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(`#${data.copyNumber} of ${data.totalDownloads} total copies issued`, colL + 122, row);

  row += 4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("Payment Reference:", colL, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(data.paymentReference, colL + 31, row);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("Verification Count:", colL + 100, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(`${data.verificationCount} verification(s) performed`, colL + 128, row);

  row += 4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text("Downloaded:", colL, row);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(`${formatDateTime(data.downloadTimestamp)} by ${data.downloadedBy}`, colL + 22, row);

  // Right column — verification instructions
  const instrY = y + 10;
  const colR = CX + 90;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.setFontSize(5.5);
  doc.text("HOW TO VERIFY THIS CERTIFICATE:", colR, instrY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text("1. Scan the QR code above, or", colR, instrY + 4);
  doc.text("2. Visit investprop.io/verify", colR, instrY + 7.5);
  doc.text("3. Enter the Certificate Number", colR, instrY + 11);
  doc.text("   and validation hash", colR, instrY + 14);

  // ── 12. Legal footer ──
  y += 36;
  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 170);

  doc.text(
    "ANTI-FRAUD NOTICE: This document is digitally generated with tamper-evident security. Each copy is uniquely serialised and tracked. " +
    "Any alteration, forgery, or unauthorised duplication of this certificate constitutes fraud under the Prevention and Combating of Corrupt Activities Act 12 of 2004. " +
    "All downloads are logged with timestamp, user identity, and unique serial number. Verify authenticity at investprop.io/verify.",
    CX, y, { align: "center", maxWidth: W - 40 }
  );

  y += 6;
  doc.text(
    `(c) ${new Date().getFullYear()} Investprop (Pty) Ltd. This certificate does not require a physical signature. ` +
    `Generated: ${formatDateTime(data.downloadTimestamp)} | Document Serial: ${data.documentSerial}`,
    CX, y, { align: "center", maxWidth: W - 40 }
  );

  return doc;
}

/** Download the PDF directly in the browser */
export async function downloadCertificatePDF(data: CertificateData) {
  const doc = await generateCertificatePDF(data);
  doc.save(`${data.certificateNumber}-Copy${data.copyNumber}-${data.documentSerial}.pdf`);
}
