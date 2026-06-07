import jsPDF from "jspdf";

/**
 * Investprop — IT3 Tax Summary Certificate PDF Generator
 *
 * Produces a per-investor, per-tax-year summary of distribution income and
 * tax withheld, grouped by SARS tax classification. This is a SUMMARY for the
 * investor's records — Investprop is not a registered tax practitioner and this
 * is not a SARS-issued certificate.
 *
 * SA tax year runs 1 March → 28/29 February.
 */

export interface TaxCertificateData {
  certificateType: string; // "IT3 Summary"
  taxYear: number; // year the SA tax year ends (e.g. 2026 = 1 Mar 2025 → 28 Feb 2026)
  periodStart: string; // ISO
  periodEnd: string; // ISO
  generatedAt: string; // ISO
  investor: {
    id: number;
    name: string | null;
    email: string | null;
    investorCode: string | null;
  } | null;
  summary: Record<
    string,
    { count: number; gross: number; taxWithheld: number; net: number }
  >;
  totalGross: number;
  totalTaxWithheld: number;
  totalNet: number;
  payoutCount: number;
  disclaimer: string;
}

// ── Colour palette (shared with share certificate) ──
const NAVY = [15, 23, 42] as const;
const GOLD = [217, 164, 6] as const;
const WHITE = [255, 255, 255] as const;
const DARK_GREY = [55, 65, 81] as const;
const MED_GREY = [107, 114, 128] as const;
const LIGHT_GREY = [243, 244, 246] as const;

// SARS classification → human label + (indicative) IT3 source-code hint.
// Source codes are indicative only; confirm against the SARS IT3 specification.
const CLASSIFICATION_META: Record<string, { label: string; code: string }> = {
  DIVIDEND: { label: "Local Dividends", code: "IT3(b) · 4306" },
  INTEREST: { label: "Local Interest", code: "IT3(b) · 4201" },
  RENTAL_INCOME: { label: "Rental Income", code: "IT3(b) · 4210" },
  CAPITAL_GAIN: { label: "Capital Gain (share/property disposal)", code: "IT3(c)" },
};

function money(n: number): string {
  // Exact two-decimal formatting. SARS reconciliation is cents-sensitive.
  return `R ${(Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function generateTaxCertificatePDF(data: TaxCertificateData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); // 210
  const CX = W / 2;
  const M = 18; // page margin

  // ── Header band ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, "F");

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("INVESTPROP", M, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("FRACTIONAL PROPERTY INVESTMENT", M, 24);

  doc.setFontSize(6.5);
  doc.setTextColor(180, 190, 210);
  doc.text(
    "Republic of South Africa  |  Companies Act 71 of 2008",
    M,
    29,
  );

  // Title block (right)
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("TAX SUMMARY", W - M, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text(`${data.certificateType}`, W - M, 23, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(`Tax Year ${data.taxYear}`, W - M, 29, { align: "right" });

  // ── Period + investor info ──
  let y = 50;
  doc.setTextColor(...DARK_GREY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Investor Tax Summary", M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MED_GREY);
  y += 6;
  doc.text(
    `Tax period: ${fmtDate(data.periodStart)} — ${fmtDate(data.periodEnd)}  (SA tax year)`,
    M,
    y,
  );

  // Investor card
  y += 8;
  doc.setFillColor(...LIGHT_GREY);
  doc.roundedRect(M, y, W - 2 * M, 26, 2, 2, "F");
  doc.setTextColor(...DARK_GREY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(data.investor?.name ?? "—", M + 5, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MED_GREY);
  doc.text(`Email: ${data.investor?.email ?? "—"}`, M + 5, y + 14);
  doc.text(`Investor code: ${data.investor?.investorCode ?? "—"}`, M + 5, y + 20);
  doc.text(`Payouts in period: ${data.payoutCount}`, W - M - 5, y + 14, {
    align: "right",
  });

  // ── Income table ──
  y += 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text("Income by tax classification", M, y);

  y += 5;
  // Table header
  const colX = {
    label: M,
    code: M + 62,
    gross: W - M - 78,
    tax: W - M - 40,
    net: W - M,
  };
  doc.setFillColor(...NAVY);
  doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("CLASSIFICATION", colX.label + 2, y + 5.3);
  doc.text("SARS REF", colX.code, y + 5.3);
  doc.text("GROSS", colX.gross, y + 5.3, { align: "right" });
  doc.text("TAX W/H", colX.tax, y + 5.3, { align: "right" });
  doc.text("NET", colX.net, y + 5.3, { align: "right" });

  y += 8;
  const classes = Object.keys(data.summary);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (classes.length === 0) {
    doc.setTextColor(...MED_GREY);
    doc.text(
      "No distribution income was paid to you in this tax year.",
      CX,
      y + 10,
      { align: "center" },
    );
    y += 18;
  } else {
    let stripe = false;
    for (const cls of classes) {
      const row = data.summary[cls];
      const meta =
        CLASSIFICATION_META[cls] ?? { label: cls, code: "IT3" };
      if (stripe) {
        doc.setFillColor(...LIGHT_GREY);
        doc.rect(M, y, W - 2 * M, 8, "F");
      }
      stripe = !stripe;
      doc.setTextColor(...DARK_GREY);
      doc.text(meta.label, colX.label + 2, y + 5.3);
      doc.setTextColor(...MED_GREY);
      doc.setFontSize(6.8);
      doc.text(meta.code, colX.code, y + 5.3);
      doc.setFontSize(8);
      doc.setTextColor(...DARK_GREY);
      doc.text(money(row.gross), colX.gross, y + 5.3, { align: "right" });
      doc.text(money(row.taxWithheld), colX.tax, y + 5.3, { align: "right" });
      doc.text(money(row.net), colX.net, y + 5.3, { align: "right" });
      y += 8;
    }
  }

  // Totals row
  doc.setFillColor(...GOLD);
  doc.rect(M, y, W - 2 * M, 9, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL", colX.label + 2, y + 6);
  doc.text(money(data.totalGross), colX.gross, y + 6, { align: "right" });
  doc.text(money(data.totalTaxWithheld), colX.tax, y + 6, { align: "right" });
  doc.text(money(data.totalNet), colX.net, y + 6, { align: "right" });
  y += 9;

  // ── Disclaimer ──
  y += 10;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  doc.text("Important", M, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MED_GREY);
  const discLines = doc.splitTextToSize(data.disclaimer, W - 2 * M);
  doc.text(discLines, M, y);
  y += discLines.length * 3.6 + 3;
  const note =
    "SARS source-code references shown are indicative. This summary aggregates only payouts marked PAID within the SA tax year. Capital gains (IT3(c)) must be confirmed against your disposal records.";
  const noteLines = doc.splitTextToSize(note, W - 2 * M);
  doc.text(noteLines, M, y);

  // ── Footer ──
  const FY = 285;
  doc.setDrawColor(...LIGHT_GREY);
  doc.setLineWidth(0.3);
  doc.line(M, FY, W - M, FY);
  doc.setFontSize(6.5);
  doc.setTextColor(...MED_GREY);
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleString("en-ZA")}`,
    M,
    FY + 5,
  );
  doc.text("investprop.io", W - M, FY + 5, { align: "right" });

  return doc;
}

export function downloadTaxCertificatePDF(data: TaxCertificateData) {
  const doc = generateTaxCertificatePDF(data);
  const code = data.investor?.investorCode ?? `INV${data.investor?.id ?? ""}`;
  doc.save(`Investprop-TaxSummary-${data.taxYear}-${code}.pdf`);
}
