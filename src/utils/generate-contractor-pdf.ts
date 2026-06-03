import jsPDF from "jspdf";

// ── Colour Palette ────────────────────────────────────────────
const NAVY = [15, 23, 42] as const;
const GOLD = [217, 164, 6] as const;
const GOLD_LIGHT = [253, 243, 200] as const;
const DARK_GREY = [55, 65, 81] as const;
const MED_GREY = [107, 114, 128] as const;
const GREEN = [22, 163, 74] as const;
const WHITE = [255, 255, 255] as const;
const LIGHT_BG = [248, 250, 252] as const;

// ── Helpers ─────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-ZA", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const W = doc.internal.pageSize.getWidth();

  // Navy header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, "F");

  // Gold accent line
  doc.setFillColor(...GOLD);
  doc.rect(0, 38, W, 2, "F");

  // Company name
  doc.setTextColor(...WHITE);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("INVESTPROP", 20, 18);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text("FRACTIONAL PROPERTY INVESTMENT", 20, 25);

  // Document title (right-aligned)
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(title, W - 20, 18, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 190, 210);
  doc.text(subtitle, W - 20, 26, { align: "right" });
}

function drawFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFillColor(...NAVY);
  doc.rect(0, H - 18, W, 18, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, H - 18, W, 0.8, "F");

  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 170, 190);
  doc.text(
    `© ${new Date().getFullYear()} Investprop (Pty) Ltd | Generated: ${formatDateTime(new Date())} | This is a system-generated document`,
    W / 2, H - 8, { align: "center" }
  );
}

function drawInfoBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string) {
  doc.setFillColor(...GOLD_LIGHT);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(label, x + w / 2, y + 5.5, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(value, x + w / 2, y + 12, { align: "center" });
}

function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(title, 20, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(20, y + 2, 190, y + 2);
  return y + 8;
}

function drawKeyValue(doc: jsPDF, x: number, y: number, key: string, value: string, maxWidth?: number): number {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK_GREY);
  doc.text(key + ":", x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  const keyWidth = doc.getTextWidth(key + ": ");
  if (maxWidth) {
    doc.text(value, x + keyWidth, y, { maxWidth: maxWidth - keyWidth });
  } else {
    doc.text(value, x + keyWidth, y);
  }
  return y + 5;
}

// ─── Work Order PDF ─────────────────────────────────────────

export interface WorkOrderPDFData {
  title: string;
  description: string;
  status: string;
  agreedAmount: number;
  startDate: string;
  expectedEndDate: string;
  actualEndDate?: string | null;
  createdAt: string;
  property: { title: string; city: string; address?: string };
  contractor: { companyName: string; userName: string; phone?: string; email?: string; specialty?: string };
  issuedBy?: string;
  invoiceCount?: number;
}

export function generateWorkOrderPDF(data: WorkOrderPDFData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  drawHeader(doc, "WORK ORDER", `Issued: ${formatDate(data.createdAt)}`);
  drawFooter(doc);

  let y = 48;

  // Status badge
  const isActive = ["ISSUED", "ACCEPTED", "IN_PROGRESS"].includes(data.status);
  const isComplete = data.status === "COMPLETED";
  const sf = isComplete ? GREEN : isActive ? ([37, 99, 235] as const) : ([220, 38, 38] as const);
  doc.setFillColor(sf[0], sf[1], sf[2]);
  const statusText = data.status.replace(/_/g, " ");
  const statusWidth = doc.getTextWidth(statusText) + 14;
  doc.roundedRect(W - 20 - statusWidth, y, statusWidth, 8, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(statusText, W - 20 - statusWidth / 2, y + 5.5, { align: "center" });

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(data.title, 20, y + 6, { maxWidth: W - 60 - statusWidth });

  y += 16;

  // Key metrics boxes
  const boxW = (W - 50) / 3;
  drawInfoBox(doc, 20, y, boxW, 16, "Agreed Amount", formatCurrency(data.agreedAmount));
  drawInfoBox(doc, 25 + boxW, y, boxW, 16, "Start Date", formatDate(data.startDate));
  drawInfoBox(doc, 30 + boxW * 2, y, boxW, 16, "End Date", formatDate(data.expectedEndDate));

  y += 24;

  // Property Details
  y = drawSectionTitle(doc, y, "PROPERTY DETAILS");
  y = drawKeyValue(doc, 20, y, "Property", data.property.title);
  y = drawKeyValue(doc, 20, y, "Location", data.property.city);
  if (data.property.address) y = drawKeyValue(doc, 20, y, "Address", data.property.address, 170);

  y += 4;

  // Contractor Details
  y = drawSectionTitle(doc, y, "CONTRACTOR DETAILS");
  y = drawKeyValue(doc, 20, y, "Company", data.contractor.companyName);
  y = drawKeyValue(doc, 20, y, "Contact Person", data.contractor.userName);
  if (data.contractor.specialty) y = drawKeyValue(doc, 20, y, "Specialty", data.contractor.specialty);
  if (data.contractor.phone) y = drawKeyValue(doc, 20, y, "Phone", data.contractor.phone);
  if (data.contractor.email) y = drawKeyValue(doc, 20, y, "Email", data.contractor.email);

  y += 4;

  // Scope of Work
  y = drawSectionTitle(doc, y, "SCOPE OF WORK");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  const lines = doc.splitTextToSize(data.description, W - 40);
  doc.text(lines, 20, y);
  y += lines.length * 4 + 6;

  // Terms section
  y = drawSectionTitle(doc, y, "TERMS & CONDITIONS");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  const terms = [
    "1. The contractor shall complete the work described above within the agreed timeframe.",
    "2. Payment shall be made upon submission and approval of invoices with supporting evidence.",
    "3. All work must comply with South African building regulations and NHBRC standards.",
    "4. The contractor warrants that they hold all necessary licences, insurances and CIDB registration.",
    "5. Variations to the scope must be approved in writing by the development manager.",
    "6. Investprop reserves the right to inspect work at any stage during execution.",
  ];
  terms.forEach((t) => {
    doc.text(t, 20, y, { maxWidth: W - 40 });
    y += 5;
  });

  y += 6;

  // Signature lines
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(20, y + 10, 90, y + 10);
  doc.line(W - 90, y + 10, W - 20, y + 10);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  doc.text("Development Manager", 55, y + 14, { align: "center" });
  doc.text(data.issuedBy ?? "Investprop", 55, y + 18, { align: "center" });

  doc.text("Contractor", W - 55, y + 14, { align: "center" });
  doc.text(data.contractor.companyName, W - 55, y + 18, { align: "center" });

  doc.save(`WorkOrder-${data.title.replace(/\s+/g, "-").substring(0, 30)}.pdf`);
}

// ─── Invoice PDF ────────────────────────────────────────────

export interface InvoicePDFData {
  invoiceNumber: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  description: string;
  status: string;
  createdAt: string;
  paymentReference?: string | null;
  paidAt?: string | null;
  contractor: { companyName: string; userName: string; phone?: string; vatNumber?: string; registrationNumber?: string; address?: string; bankName?: string; bankAccountNumber?: string; bankBranchCode?: string };
  workOrder: { title: string; agreedAmount: number };
  property: { title: string; city: string };
}

export function generateInvoicePDF(data: InvoicePDFData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  drawHeader(doc, "TAX INVOICE", data.invoiceNumber);
  drawFooter(doc);

  let y = 48;

  // Status badge
  const isPaid = data.status === "PAID";
  const isApproved = data.status === "APPROVED";
  const isf = isPaid ? GREEN : isApproved ? ([37, 99, 235] as const) : ([234, 179, 8] as const);
  doc.setFillColor(isf[0], isf[1], isf[2]);
  const statusText = data.status.replace(/_/g, " ");
  const statusWidth = doc.getTextWidth(statusText) + 14;
  doc.roundedRect(W - 20 - statusWidth, y, statusWidth, 8, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(statusText, W - 20 - statusWidth / 2, y + 5.5, { align: "center" });

  // Invoice number
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(data.invoiceNumber, 20, y + 6);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text(`Date: ${formatDate(data.createdAt)}`, 20, y + 12);

  y += 20;

  // From / To columns
  y = drawSectionTitle(doc, y, "INVOICE DETAILS");

  // Left column — From (Contractor)
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("FROM:", 20, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  let fromY = y + 5;
  doc.text(data.contractor.companyName, 20, fromY); fromY += 4;
  doc.text(data.contractor.userName, 20, fromY); fromY += 4;
  if (data.contractor.address) { doc.text(data.contractor.address, 20, fromY); fromY += 4; }
  if (data.contractor.phone) { doc.text(`Tel: ${data.contractor.phone}`, 20, fromY); fromY += 4; }
  if (data.contractor.vatNumber) { doc.text(`VAT: ${data.contractor.vatNumber}`, 20, fromY); fromY += 4; }
  if (data.contractor.registrationNumber) { doc.text(`Reg: ${data.contractor.registrationNumber}`, 20, fromY); fromY += 4; }

  // Right column — To (Investprop / Property)
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("TO:", W / 2 + 10, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  let toY = y + 5;
  doc.text("Investprop (Pty) Ltd", W / 2 + 10, toY); toY += 4;
  doc.text(`Property: ${data.property.title}`, W / 2 + 10, toY); toY += 4;
  doc.text(`Location: ${data.property.city}`, W / 2 + 10, toY); toY += 4;
  doc.text(`Work Order: ${data.workOrder.title}`, W / 2 + 10, toY); toY += 4;

  y = Math.max(fromY, toY) + 6;

  // Line items table
  y = drawSectionTitle(doc, y, "LINE ITEMS");

  // Table header
  doc.setFillColor(...NAVY);
  doc.rect(20, y, W - 40, 8, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text("Description", 24, y + 5.5);
  doc.text("Amount", W - 24, y + 5.5, { align: "right" });
  y += 8;

  // Description row
  doc.setFillColor(...LIGHT_BG);
  doc.rect(20, y, W - 40, 8, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  const descLines = doc.splitTextToSize(data.description, W - 80);
  doc.text(descLines[0] || data.description, 24, y + 5.5);
  doc.text(formatCurrency(data.amount), W - 24, y + 5.5, { align: "right" });
  y += 8;

  // Separator
  doc.setDrawColor(200, 200, 210);
  doc.setLineWidth(0.3);
  doc.line(20, y, W - 20, y);
  y += 2;

  // Totals
  const totalsX = W - 80;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  doc.text("Subtotal:", totalsX, y + 4);
  doc.text(formatCurrency(data.amount), W - 24, y + 4, { align: "right" });
  y += 6;

  doc.text("VAT:", totalsX, y + 4);
  doc.text(formatCurrency(data.taxAmount), W - 24, y + 4, { align: "right" });
  y += 6;

  // Total line
  doc.setFillColor(...GOLD_LIGHT);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(totalsX - 4, y, W - totalsX + 4 - 16, 10, 1, 1, "FD");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("TOTAL:", totalsX, y + 7);
  doc.text(formatCurrency(data.totalAmount), W - 24, y + 7, { align: "right" });
  y += 18;

  // Banking details
  if (data.contractor.bankName) {
    y = drawSectionTitle(doc, y, "BANKING DETAILS");
    y = drawKeyValue(doc, 20, y, "Bank", data.contractor.bankName);
    if (data.contractor.bankAccountNumber) y = drawKeyValue(doc, 20, y, "Account Number", data.contractor.bankAccountNumber);
    if (data.contractor.bankBranchCode) y = drawKeyValue(doc, 20, y, "Branch Code", data.contractor.bankBranchCode);
    y += 4;
  }

  // Payment info
  if (data.paymentReference || data.paidAt) {
    y = drawSectionTitle(doc, y, "PAYMENT INFORMATION");
    if (data.paymentReference) y = drawKeyValue(doc, 20, y, "Payment Reference", data.paymentReference);
    if (data.paidAt) y = drawKeyValue(doc, 20, y, "Date Paid", formatDate(data.paidAt));
    y += 4;
  }

  // Notes
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MED_GREY);
  doc.text("Payment terms: 30 days from date of approval. Please use the invoice number as payment reference.", 20, y + 2, { maxWidth: W - 40 });

  doc.save(`Invoice-${data.invoiceNumber}.pdf`);
}

// ─── RFQ PDF ────────────────────────────────────────────────

export interface RFQPDFData {
  title: string;
  scopeOfWork: string;
  estimatedBudget?: number | null;
  deadline: string;
  status: string;
  createdAt: string;
  property: { title: string; city: string; address?: string };
  createdBy?: string;
  responses: Array<{
    contractor: string;
    quotedAmount: number;
    proposedTimeline?: string | null;
    status: string;
    notes?: string | null;
  }>;
}

export function generateRFQPDF(data: RFQPDFData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  drawHeader(doc, "REQUEST FOR QUOTATION", `RFQ Date: ${formatDate(data.createdAt)}`);
  drawFooter(doc);

  let y = 48;

  // Status badge
  const statusColor: readonly [number, number, number] = data.status === "AWARDED" ? GREEN : data.status === "OPEN" ? [37, 99, 235] as const : [107, 114, 128] as const;
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  const statusText = data.status.replace(/_/g, " ");
  const statusWidth = doc.getTextWidth(statusText) + 14;
  doc.roundedRect(W - 20 - statusWidth, y, statusWidth, 8, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(statusText, W - 20 - statusWidth / 2, y + 5.5, { align: "center" });

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(data.title, 20, y + 6, { maxWidth: W - 60 - statusWidth });

  y += 16;

  // Key metrics
  const boxCount = data.estimatedBudget ? 3 : 2;
  const boxW = (W - 40 - (boxCount - 1) * 5) / boxCount;
  drawInfoBox(doc, 20, y, boxW, 16, "Deadline", formatDate(data.deadline));
  drawInfoBox(doc, 25 + boxW, y, boxW, 16, "Responses", `${data.responses.length}`);
  if (data.estimatedBudget) {
    drawInfoBox(doc, 30 + boxW * 2, y, boxW, 16, "Est. Budget", formatCurrency(data.estimatedBudget));
  }

  y += 24;

  // Property
  y = drawSectionTitle(doc, y, "PROPERTY");
  y = drawKeyValue(doc, 20, y, "Property", data.property.title);
  y = drawKeyValue(doc, 20, y, "Location", data.property.city);
  if (data.property.address) y = drawKeyValue(doc, 20, y, "Address", data.property.address, 170);
  if (data.createdBy) y = drawKeyValue(doc, 20, y, "Issued By", data.createdBy);
  y += 4;

  // Scope of Work
  y = drawSectionTitle(doc, y, "SCOPE OF WORK");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GREY);
  const scopeLines = doc.splitTextToSize(data.scopeOfWork, W - 40);
  doc.text(scopeLines, 20, y);
  y += scopeLines.length * 4 + 6;

  // Quotation Responses
  if (data.responses.length > 0) {
    y = drawSectionTitle(doc, y, "QUOTATION RESPONSES");

    // Table header
    doc.setFillColor(...NAVY);
    doc.rect(20, y, W - 40, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("Contractor", 24, y + 5.5);
    doc.text("Amount", 100, y + 5.5);
    doc.text("Timeline", 130, y + 5.5);
    doc.text("Status", W - 30, y + 5.5);
    y += 8;

    data.responses.forEach((resp, i) => {
      doc.setFillColor(i % 2 === 0 ? 248 : 240, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 252 : 250);
      doc.rect(20, y, W - 40, 8, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK_GREY);
      doc.text(resp.contractor, 24, y + 5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(formatCurrency(resp.quotedAmount), 100, y + 5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MED_GREY);
      doc.text(resp.proposedTimeline ?? "—", 130, y + 5.5);
      const respColor: readonly [number, number, number] = resp.status === "ACCEPTED" ? GREEN : resp.status === "REJECTED" ? [220, 38, 38] as const : MED_GREY;
      doc.setTextColor(respColor[0], respColor[1], respColor[2]);
      doc.setFont("helvetica", "bold");
      doc.text(resp.status, W - 30, y + 5.5);
      y += 8;
    });
  }

  doc.save(`RFQ-${data.title.replace(/\s+/g, "-").substring(0, 30)}.pdf`);
}

// ─── Contractor Report PDF ──────────────────────────────────

export interface ContractorReportPDFData {
  companyName: string;
  tradingAs?: string | null;
  userName: string;
  email: string;
  phone: string;
  specialty: string;
  registrationNumber?: string | null;
  vatNumber?: string | null;
  beeLevel?: string | null;
  cidbGrade?: string | null;
  city?: string | null;
  province?: string | null;
  workOrders: Array<{
    title: string;
    property: string;
    amount: number;
    status: string;
    startDate: string;
    endDate: string;
  }>;
  invoices: Array<{
    invoiceNumber: string;
    amount: number;
    status: string;
    date: string;
  }>;
  totalEarnings: number;
  totalOutstanding: number;
}

export function generateContractorReportPDF(data: ContractorReportPDFData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  drawHeader(doc, "CONTRACTOR REPORT", data.companyName);
  drawFooter(doc);

  let y = 48;

  // Contractor info
  y = drawSectionTitle(doc, y, "CONTRACTOR PROFILE");
  y = drawKeyValue(doc, 20, y, "Company", data.companyName);
  if (data.tradingAs) y = drawKeyValue(doc, 20, y, "Trading As", data.tradingAs);
  y = drawKeyValue(doc, 20, y, "Contact", data.userName);
  y = drawKeyValue(doc, 20, y, "Email", data.email);
  y = drawKeyValue(doc, 20, y, "Phone", data.phone);
  y = drawKeyValue(doc, 20, y, "Specialty", data.specialty);
  if (data.registrationNumber) y = drawKeyValue(doc, 20, y, "Registration", data.registrationNumber);
  if (data.vatNumber) y = drawKeyValue(doc, 20, y, "VAT Number", data.vatNumber);
  if (data.beeLevel) y = drawKeyValue(doc, 20, y, "BEE Level", data.beeLevel);
  if (data.cidbGrade) y = drawKeyValue(doc, 20, y, "CIDB Grade", data.cidbGrade);
  if (data.city) y = drawKeyValue(doc, 20, y, "Location", `${data.city}${data.province ? ", " + data.province : ""}`);
  y += 4;

  // Financial summary boxes
  const boxW = (W - 50) / 2;
  drawInfoBox(doc, 20, y, boxW, 16, "Total Earnings", formatCurrency(data.totalEarnings));
  drawInfoBox(doc, 30 + boxW, y, boxW, 16, "Outstanding", formatCurrency(data.totalOutstanding));
  y += 24;

  // Work Orders table
  if (data.workOrders.length > 0) {
    y = drawSectionTitle(doc, y, "WORK ORDERS");

    doc.setFillColor(...NAVY);
    doc.rect(20, y, W - 40, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("Title", 24, y + 5.5);
    doc.text("Property", 75, y + 5.5);
    doc.text("Amount", 125, y + 5.5);
    doc.text("Status", 155, y + 5.5);
    doc.text("Dates", W - 24, y + 5.5, { align: "right" });
    y += 8;

    data.workOrders.forEach((wo, i) => {
      if (y > 260) { doc.addPage(); drawFooter(doc); y = 20; }
      doc.setFillColor(i % 2 === 0 ? 248 : 240, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 252 : 250);
      doc.rect(20, y, W - 40, 8, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK_GREY);
      doc.text(wo.title.substring(0, 30), 24, y + 5.5);
      doc.text(wo.property.substring(0, 25), 75, y + 5.5);
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(wo.amount), 125, y + 5.5);
      doc.setFont("helvetica", "normal");
      doc.text(wo.status.replace(/_/g, " "), 155, y + 5.5);
      doc.setFontSize(5.5);
      doc.text(`${formatDate(wo.startDate).substring(0, 12)}`, W - 24, y + 5.5, { align: "right" });
      y += 8;
    });
    y += 4;
  }

  // Invoices table
  if (data.invoices.length > 0) {
    if (y > 230) { doc.addPage(); drawFooter(doc); y = 20; }
    y = drawSectionTitle(doc, y, "INVOICES");

    doc.setFillColor(...NAVY);
    doc.rect(20, y, W - 40, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("Invoice #", 24, y + 5.5);
    doc.text("Amount", 90, y + 5.5);
    doc.text("Status", 130, y + 5.5);
    doc.text("Date", W - 24, y + 5.5, { align: "right" });
    y += 8;

    data.invoices.forEach((inv, i) => {
      if (y > 260) { doc.addPage(); drawFooter(doc); y = 20; }
      doc.setFillColor(i % 2 === 0 ? 248 : 240, i % 2 === 0 ? 250 : 245, i % 2 === 0 ? 252 : 250);
      doc.rect(20, y, W - 40, 8, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK_GREY);
      doc.text(inv.invoiceNumber, 24, y + 5.5);
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(inv.amount), 90, y + 5.5);
      doc.setFont("helvetica", "normal");
      doc.text(inv.status.replace(/_/g, " "), 130, y + 5.5);
      doc.text(formatDate(inv.date), W - 24, y + 5.5, { align: "right" });
      y += 8;
    });
  }

  doc.save(`ContractorReport-${data.companyName.replace(/\s+/g, "-").substring(0, 30)}.pdf`);
}
