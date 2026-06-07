import jsPDF from "jspdf";

/**
 * Investprop — Periodic Investor Statement PDF Generator
 *
 * Renders a multi-section statement: portfolio summary, current holdings,
 * distribution income for the period, and share transactions for the period.
 * Informational only — not a tax certificate, not an audited financial statement.
 */

export interface StatementHolding {
  propertyTitle: string;
  shareClassName: string;
  sharesOwned: number;
  pricePerShare: number;
  averageCostPerShare: number;
  ownershipPercentage: number;
  currentValue: number;
  investedAmount: number;
  unrealizedGain: number;
}

export interface StatementDistribution {
  date: string;
  propertyTitle: string;
  type: string;
  taxClassification: string;
  grossAmount: number;
  taxWithheld: number;
  netAmount: number;
}

export interface StatementTransaction {
  date: string;
  propertyTitle: string;
  transactionType: string;
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  reference: string;
  balanceAfter: number;
}

export interface StatementData {
  statementType: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  investor: {
    id: number;
    name: string | null;
    email: string | null;
    investorCode: string | null;
  } | null;
  holdings: StatementHolding[];
  totalInvested: number;
  totalCurrentValue: number;
  totalUnrealizedGain: number;
  distributions: StatementDistribution[];
  totalDistributionsGross: number;
  totalDistributionsTax: number;
  totalDistributionsNet: number;
  transactions: StatementTransaction[];
  disclaimer: string;
}

const NAVY = [15, 23, 42] as const;
const GOLD = [217, 164, 6] as const;
const WHITE = [255, 255, 255] as const;
const DARK_GREY = [55, 65, 81] as const;
const MED_GREY = [107, 114, 128] as const;
const LIGHT_GREY = [243, 244, 246] as const;
const GREEN = [22, 163, 74] as const;
const RED = [220, 38, 38] as const;

function money(n: number): string {
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

const TX_LABELS: Record<string, string> = {
  PURCHASE: "Purchase",
  SALE: "Sale",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  BONUS_ISSUE: "Bonus issue",
};

export function generateInvestorStatementPDF(data: StatementData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); // 210
  const H = doc.internal.pageSize.getHeight(); // 297
  const M = 16;
  const BOTTOM = H - 16;

  let y = 0;

  const drawHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 34, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("INVESTPROP", M, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GOLD);
    doc.text("FRACTIONAL PROPERTY INVESTMENT", M, 22);

    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("INVESTOR STATEMENT", W - M, 15, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    const periodText = data.periodLabel
      ? data.periodLabel
      : `${fmtDate(data.periodStart)} - ${fmtDate(data.periodEnd)}`;
    doc.text(periodText, W - M, 21, { align: "right" });
    doc.setFontSize(7);
    doc.setTextColor(180, 190, 210);
    doc.text(
      `${fmtDate(data.periodStart)} to ${fmtDate(data.periodEnd)}`,
      W - M,
      26,
      { align: "right" },
    );
    y = 42;
  };

  const drawFooter = () => {
    doc.setDrawColor(...LIGHT_GREY);
    doc.setLineWidth(0.3);
    doc.line(M, BOTTOM, W - M, BOTTOM);
    doc.setFontSize(6.5);
    doc.setTextColor(...MED_GREY);
    doc.text(
      `Generated ${new Date(data.generatedAt).toLocaleString("en-ZA")}`,
      M,
      BOTTOM + 5,
    );
    const pageNo = doc.getNumberOfPages();
    doc.text(`Page ${pageNo}`, W / 2, BOTTOM + 5, { align: "center" });
    doc.text("investprop.io", W - M, BOTTOM + 5, { align: "right" });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > BOTTOM - 6) {
      drawFooter();
      doc.addPage();
      drawHeader();
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(title, M, y);
    y += 5;
  };

  drawHeader();

  // ── Investor card ──
  doc.setFillColor(...LIGHT_GREY);
  doc.roundedRect(M, y, W - 2 * M, 22, 2, 2, "F");
  doc.setTextColor(...DARK_GREY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(data.investor?.name ?? "-", M + 5, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MED_GREY);
  doc.text(`Email: ${data.investor?.email ?? "-"}`, M + 5, y + 14);
  doc.text(
    `Investor code: ${data.investor?.investorCode ?? "-"}`,
    M + 5,
    y + 19,
  );
  y += 30;

  // ── Portfolio summary ──
  sectionTitle("Portfolio summary");
  const cardW = (W - 2 * M - 2 * 4) / 3;
  const cards: Array<{ label: string; value: string; color: readonly number[] }> = [
    { label: "Invested (cost)", value: money(data.totalInvested), color: NAVY },
    { label: "Current value", value: money(data.totalCurrentValue), color: GREEN },
    {
      label: "Unrealised gain/loss",
      value: money(data.totalUnrealizedGain),
      color: data.totalUnrealizedGain >= 0 ? GREEN : RED,
    },
  ];
  cards.forEach((c, i) => {
    const cx = M + i * (cardW + 4);
    doc.setFillColor(...LIGHT_GREY);
    doc.roundedRect(cx, y, cardW, 18, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MED_GREY);
    doc.text(c.label, cx + 3, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...(c.color as [number, number, number]));
    doc.text(c.value, cx + 3, y + 13);
  });
  y += 26;

  // ── Holdings table ──
  sectionTitle("Current holdings");
  {
    const cx = {
      prop: M + 2,
      shares: M + 96,
      avg: M + 112,
      price: M + 132,
      value: M + 152,
      gain: W - M - 2,
    };
    ensureSpace(9);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("PROPERTY / CLASS", cx.prop, y + 4.6);
    doc.text("SHARES", cx.shares, y + 4.6);
    doc.text("AVG", cx.avg, y + 4.6);
    doc.text("PRICE", cx.price, y + 4.6);
    doc.text("VALUE", cx.value, y + 4.6);
    doc.text("GAIN", cx.gain, y + 4.6, { align: "right" });
    y += 7;

    doc.setFont("helvetica", "normal");
    if (data.holdings.length === 0) {
      doc.setTextColor(...MED_GREY);
      doc.setFontSize(8);
      doc.text("No current holdings.", M + 2, y + 6);
      y += 12;
    } else {
      let stripe = false;
      for (const h of data.holdings) {
        ensureSpace(9);
        if (stripe) {
          doc.setFillColor(...LIGHT_GREY);
          doc.rect(M, y, W - 2 * M, 8, "F");
        }
        stripe = !stripe;
        doc.setTextColor(...DARK_GREY);
        doc.setFontSize(7);
        const title = `${h.propertyTitle} - ${h.shareClassName}`;
        doc.text(doc.splitTextToSize(title, 90)[0], cx.prop, y + 5);
        doc.text(String(h.sharesOwned), cx.shares, y + 5);
        doc.setFontSize(6.6);
        doc.text(money(h.averageCostPerShare).replace("R ", ""), cx.avg, y + 5);
        doc.text(money(h.pricePerShare).replace("R ", ""), cx.price, y + 5);
        doc.text(money(h.currentValue).replace("R ", ""), cx.value, y + 5);
        doc.setTextColor(...(h.unrealizedGain >= 0 ? GREEN : RED) as readonly [number, number, number]);
        doc.text(money(h.unrealizedGain).replace("R ", ""), cx.gain, y + 5, {
          align: "right",
        });
        y += 8;
      }
    }
  }
  y += 6;

  // ── Distributions table ──
  sectionTitle(`Distribution income (${fmtDate(data.periodStart)} - ${fmtDate(data.periodEnd)})`);
  {
    const cx = {
      date: M + 2,
      prop: M + 24,
      type: M + 92,
      gross: M + 128,
      tax: M + 150,
      net: W - M - 2,
    };
    ensureSpace(9);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("DATE", cx.date, y + 4.6);
    doc.text("PROPERTY", cx.prop, y + 4.6);
    doc.text("TYPE", cx.type, y + 4.6);
    doc.text("GROSS", cx.gross, y + 4.6);
    doc.text("TAX", cx.tax, y + 4.6);
    doc.text("NET", cx.net, y + 4.6, { align: "right" });
    y += 7;

    doc.setFont("helvetica", "normal");
    if (data.distributions.length === 0) {
      doc.setTextColor(...MED_GREY);
      doc.setFontSize(8);
      doc.text("No distributions were paid to you in this period.", M + 2, y + 6);
      y += 12;
    } else {
      let stripe = false;
      for (const d of data.distributions) {
        ensureSpace(8);
        if (stripe) {
          doc.setFillColor(...LIGHT_GREY);
          doc.rect(M, y, W - 2 * M, 7, "F");
        }
        stripe = !stripe;
        doc.setTextColor(...DARK_GREY);
        doc.setFontSize(6.8);
        doc.text(fmtDate(d.date), cx.date, y + 4.8);
        doc.text(doc.splitTextToSize(d.propertyTitle, 64)[0], cx.prop, y + 4.8);
        doc.text(d.type.replace(/_/g, " "), cx.type, y + 4.8);
        doc.text(money(d.grossAmount).replace("R ", ""), cx.gross, y + 4.8);
        doc.text(money(d.taxWithheld).replace("R ", ""), cx.tax, y + 4.8);
        doc.setTextColor(...GREEN);
        doc.text(money(d.netAmount).replace("R ", ""), cx.net, y + 4.8, {
          align: "right",
        });
        y += 7;
      }
      // Totals row
      ensureSpace(8);
      doc.setFillColor(...GOLD);
      doc.rect(M, y, W - 2 * M, 7, "F");
      doc.setTextColor(...NAVY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("TOTAL", cx.date, y + 4.8);
      doc.text(money(data.totalDistributionsGross).replace("R ", ""), cx.gross, y + 4.8);
      doc.text(money(data.totalDistributionsTax).replace("R ", ""), cx.tax, y + 4.8);
      doc.text(money(data.totalDistributionsNet).replace("R ", ""), cx.net, y + 4.8, {
        align: "right",
      });
      y += 7;
    }
  }
  y += 6;

  // ── Transactions table ──
  sectionTitle(`Share transactions (${fmtDate(data.periodStart)} - ${fmtDate(data.periodEnd)})`);
  {
    const cx = {
      date: M + 2,
      prop: M + 24,
      type: M + 92,
      shares: M + 120,
      price: M + 138,
      bal: W - M - 2,
    };
    ensureSpace(9);
    doc.setFillColor(...NAVY);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("DATE", cx.date, y + 4.6);
    doc.text("PROPERTY", cx.prop, y + 4.6);
    doc.text("TYPE", cx.type, y + 4.6);
    doc.text("SHARES", cx.shares, y + 4.6);
    doc.text("PRICE", cx.price, y + 4.6);
    doc.text("BALANCE", cx.bal, y + 4.6, { align: "right" });
    y += 7;

    doc.setFont("helvetica", "normal");
    if (data.transactions.length === 0) {
      doc.setTextColor(...MED_GREY);
      doc.setFontSize(8);
      doc.text("No share transactions in this period.", M + 2, y + 6);
      y += 12;
    } else {
      let stripe = false;
      for (const t of data.transactions) {
        ensureSpace(8);
        if (stripe) {
          doc.setFillColor(...LIGHT_GREY);
          doc.rect(M, y, W - 2 * M, 7, "F");
        }
        stripe = !stripe;
        doc.setTextColor(...DARK_GREY);
        doc.setFontSize(6.8);
        doc.text(fmtDate(t.date), cx.date, y + 4.8);
        doc.text(doc.splitTextToSize(t.propertyTitle, 64)[0], cx.prop, y + 4.8);
        doc.text(TX_LABELS[t.transactionType] ?? t.transactionType, cx.type, y + 4.8);
        doc.setTextColor(...(t.shares >= 0 ? GREEN : RED) as readonly [number, number, number]);
        doc.text((t.shares >= 0 ? "+" : "") + String(t.shares), cx.shares, y + 4.8);
        doc.setTextColor(...DARK_GREY);
        doc.text(money(t.pricePerShare).replace("R ", ""), cx.price, y + 4.8);
        doc.text(String(t.balanceAfter), cx.bal, y + 4.8, { align: "right" });
        y += 7;
      }
    }
  }
  y += 8;

  // ── Disclaimer ──
  ensureSpace(28);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  y += 5;
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

  drawFooter();
  return doc;
}

export function downloadInvestorStatementPDF(data: StatementData) {
  const doc = generateInvestorStatementPDF(data);
  const code = data.investor?.investorCode ?? `INV${data.investor?.id ?? ""}`;
  const label = (data.periodLabel || `${data.periodStart.slice(0, 10)}_${data.periodEnd.slice(0, 10)}`).replace(
    /[^A-Za-z0-9_-]/g,
    "-",
  );
  doc.save(`Investprop-Statement-${label}-${code}.pdf`);
}
