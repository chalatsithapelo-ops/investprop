import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

// ─── Generate Legal Document ───────────────────────────────────

export const generateLegalDocument = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      spvId: z.number().optional(),
      documentType: z.enum([
        "MOI",
        "SHAREHOLDER_AGREEMENT",
        "CESSION_OF_RIGHTS",
        "SHARE_CERTIFICATE",
        "TAX_CERTIFICATE",
        "DISTRIBUTION_STATEMENT",
        "COMPLIANCE_REPORT",
        "INVESTMENT_AGREEMENT",
      ]),
      generatedFor: z.number().optional(), // investorId for share certs
      metadata: z.record(z.any()).optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        spv: true,
        shareClasses: { include: { holdings: { include: { investor: true } } } },
        user: true,
      },
    });
    if (!property) throw new Error("Property not found");

    let spv = null;
    if (input.spvId) {
      spv = await db.sPV.findUnique({ where: { id: input.spvId } });
    } else if (property.spvId) {
      spv = property.spv;
    }

    let title = "";
    let content = "";

    switch (input.documentType) {
      case "MOI": {
        title = `Memorandum of Incorporation — ${spv?.name ?? "No SPV"}`;
        content = generateMOI(property, spv);
        break;
      }
      case "SHAREHOLDER_AGREEMENT": {
        title = `Shareholder Agreement — ${property.title}`;
        content = generateShareholderAgreement(property, spv);
        break;
      }
      case "CESSION_OF_RIGHTS": {
        const acquisition = await db.acquisition.findUnique({
          where: { propertyId: property.id },
        });
        title = `Cession of Rights — ${property.title}`;
        content = generateCessionOfRights(property, spv, acquisition);
        break;
      }
      case "SHARE_CERTIFICATE": {
        const investorId = input.generatedFor;
        if (!investorId) throw new Error("generatedFor (investorId) required for share certificates");
        const investor = await db.user.findUnique({ where: { id: investorId } });
        const holding = await db.shareHolding.findFirst({
          where: { propertyId: property.id, investorId },
          include: { shareClass: true },
        });
        title = `Share Certificate — ${investor?.name ?? "Investor"} — ${property.title}`;
        content = generateShareCertificate(property, spv, investor, holding);
        break;
      }
      case "TAX_CERTIFICATE": {
        const taxInvestorId = input.generatedFor;
        if (!taxInvestorId) throw new Error("generatedFor (investorId) required for tax certificates");
        title = `Tax Certificate — ${property.title}`;
        const payouts = await db.distributionPayout.findMany({
          where: { investorId: taxInvestorId, distribution: { propertyId: property.id } },
          include: { distribution: true },
        });
        content = generateTaxCertificate(property, spv, taxInvestorId, payouts);
        break;
      }
      case "DISTRIBUTION_STATEMENT": {
        title = `Distribution Statement — ${property.title}`;
        const distributions = await db.distribution.findMany({
          where: { propertyId: property.id },
          include: { payouts: true },
          orderBy: { createdAt: "desc" },
          take: 12,
        });
        content = generateDistributionStatement(property, distributions);
        break;
      }
      case "COMPLIANCE_REPORT": {
        title = `Compliance Report — ${property.title}`;
        content = await generateComplianceReport(property, spv);
        break;
      }
      case "INVESTMENT_AGREEMENT": {
        const iaInvestorId = input.generatedFor;
        if (!iaInvestorId) throw new Error("generatedFor (investorId) required for investment agreements");
        const iaInvestor = await db.user.findUnique({ where: { id: iaInvestorId } });
        const iaHolding = await db.shareHolding.findFirst({
          where: { propertyId: property.id, investorId: iaInvestorId },
          include: { shareClass: true },
        });
        title = `Investment Agreement — ${iaInvestor?.name ?? "Investor"} — ${property.title}`;
        content = generateInvestmentAgreement(property, spv, iaInvestor, iaHolding);
        break;
      }
    }

    return db.legalDocument.create({
      data: {
        propertyId: input.propertyId,
        spvId: input.spvId ?? property.spvId,
        documentType: input.documentType,
        title,
        content,
        status: "GENERATED",
        generatedFor: input.generatedFor,
        metadata: input.metadata ?? {},
      },
    });
  });

// ─── Get Legal Documents ───────────────────────────────────────

export const getLegalDocuments = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number().optional(),
      documentType: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const where: any = {};
    if (input.propertyId) where.propertyId = input.propertyId;
    if (input.documentType) where.documentType = input.documentType;

    return db.legalDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { id: true, title: true, city: true } },
        spv: { select: { id: true, name: true } },
      },
    });
  });

// ─── Update Document Status ────────────────────────────────────

export const updateDocumentStatus = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      documentId: z.number(),
      status: z.enum(["DRAFT", "GENERATED", "PENDING_SIGNATURE", "SIGNED", "ARCHIVED"]),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.legalDocument.update({
      where: { id: input.documentId },
      data: {
        status: input.status,
        ...(input.status === "SIGNED" ? { signedAt: new Date() } : {}),
      },
    });
  });

// ─── Get Single Document (for viewing/printing) ────────────────

export const getLegalDocumentById = baseProcedure
  .input(z.object({ authToken: z.string(), documentId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.legalDocument.findUnique({
      where: { id: input.documentId },
      include: {
        property: true,
        spv: true,
      },
    });
  });

// ─── Investor Document Vault ──────────────────────────────────

export const getMyDocuments = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // Fetch documents explicitly generated for this investor
    const personalDocs = await db.legalDocument.findMany({
      where: { generatedFor: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { id: true, title: true, city: true, state: true } },
        spv: { select: { id: true, name: true } },
      },
    });

    // Also fetch shared documents (MOI, Shareholder Agreement) for properties where investor holds shares
    const holdings = await db.shareHolding.findMany({
      where: { investorId: user.id },
      select: { propertyId: true },
    });
    const propertyIds = [...new Set(holdings.map((h) => h.propertyId))];

    const sharedDocs = await db.legalDocument.findMany({
      where: {
        propertyId: { in: propertyIds },
        documentType: { in: ["MOI", "SHAREHOLDER_AGREEMENT", "DISTRIBUTION_STATEMENT", "COMPLIANCE_REPORT"] },
        generatedFor: null, // shared / property-level documents
      },
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { id: true, title: true, city: true, state: true } },
        spv: { select: { id: true, name: true } },
      },
    });

    // Merge and group by category
    const allDocs = [...personalDocs, ...sharedDocs];
    // Deduplicate by id
    const seen = new Set<number>();
    const uniqueDocs = allDocs.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    // Also fetch actual ShareCertificate records (auto-issued on payment confirmation)
    const realCertificates = await db.shareCertificate.findMany({
      where: { investorId: user.id, isValid: true },
      orderBy: { issueDate: "desc" },
      include: {
        property: { select: { id: true, title: true, city: true, state: true, imageUrl: true } },
      },
    });

    // Map ShareCertificate records to match the document shape expected by the frontend
    const certDocs = realCertificates.map((cert) => ({
      id: cert.id,
      documentType: "SHARE_CERTIFICATE" as const,
      status: "ISSUED" as const,
      createdAt: cert.issueDate,
      documentUrl: null as string | null,
      property: cert.property,
      spv: null,
      // Extra certificate-specific fields
      certificateNumber: cert.certificateNumber,
      investorName: cert.investorName,
      propertyTitle: cert.propertyTitle,
      propertyAddress: cert.propertyAddress,
      numberOfShares: cert.numberOfShares,
      sharePrice: cert.sharePrice,
      totalValue: cert.totalValue,
      ownershipPercentage: cert.ownershipPercentage,
      shareClassName: cert.shareClassName,
      issueDate: cert.issueDate,
      isCertificateRecord: true,
    }));

    // Group legal documents
    const legalShareCerts = uniqueDocs.filter((d) => d.documentType === "SHARE_CERTIFICATE");
    const taxCertificates = uniqueDocs.filter((d) => d.documentType === "TAX_CERTIFICATE");
    const distributionStatements = uniqueDocs.filter((d) => d.documentType === "DISTRIBUTION_STATEMENT");
    const companyDocs = uniqueDocs.filter((d) => ["MOI", "SHAREHOLDER_AGREEMENT", "CESSION_OF_RIGHTS"].includes(d.documentType));
    const complianceReports = uniqueDocs.filter((d) => d.documentType === "COMPLIANCE_REPORT");

    // Merge real certificates with any legacy legal-document share certs
    const shareCertificates = [...certDocs, ...legalShareCerts];

    return {
      totalDocuments: uniqueDocs.length + certDocs.length,
      shareCertificates,
      taxCertificates,
      distributionStatements,
      companyDocs,
      complianceReports,
    };
  });

// ═══════════════════════════════════════════════════════════════
//  Document Template Generators (South African Law)
// ═══════════════════════════════════════════════════════════════

function generateMOI(property: any, spv: any) {
  const companyName = spv?.name ?? "[SPV NAME]";
  const regNumber = spv?.registrationNumber ?? "[CIPC REG NUMBER]";
  const date = new Date().toLocaleDateString("en-ZA");

  return `
<div class="legal-document">
<h1 style="text-align:center;">MEMORANDUM OF INCORPORATION</h1>
<h2 style="text-align:center;">${companyName}</h2>
<p style="text-align:center;">Registration Number: ${regNumber}</p>
<p style="text-align:center;">Date: ${date}</p>

<hr/>

<h3>1. INTERPRETATION AND DEFINITIONS</h3>
<p>In this Memorandum of Incorporation ("MOI"), unless the context indicates otherwise:</p>
<ul>
<li><strong>"the Act"</strong> means the Companies Act, 2008 (Act No. 71 of 2008);</li>
<li><strong>"the Company"</strong> means ${companyName}, registration number ${regNumber};</li>
<li><strong>"Property"</strong> means the immovable property known as "${property.title}" situated at ${property.address}, ${property.city};</li>
<li><strong>"Shareholders"</strong> means the registered holders of shares in the Company;</li>
<li><strong>"Platform"</strong> means the Investprop fractional property investment platform.</li>
</ul>

<h3>2. NATURE OF THE COMPANY</h3>
<p>2.1 The Company is a private company as defined in section 8 of the Act.</p>
<p>2.2 The sole purpose of the Company is to acquire, hold, manage and (if resolved) dispose of the Property for the benefit of its Shareholders.</p>

<h3>3. AUTHORISED SHARES</h3>
<p>3.1 The Company is authorised to issue shares as configured on the Platform's share register.</p>
<p>3.2 Each share carries equal rights to distributions, voting, and capital returns.</p>
<p>3.3 The transfer of shares is facilitated through the Platform's electronic share ledger.</p>

<h3>4. SHAREHOLDER RIGHTS</h3>
<p>4.1 Each Shareholder is entitled to receive distributions pro-rata to their shareholding.</p>
<p>4.2 Each Shareholder is entitled to vote on resolutions in proportion to their shares held.</p>
<p>4.3 Shareholders have the right to inspect the Company's financial records via the Platform.</p>

<h3>5. BOARD AND MANAGEMENT</h3>
<p>5.1 The Company shall have a minimum of one director as required by section 66(2) of the Act.</p>
<p>5.2 Day-to-day management of the Property is delegated to the Platform's property management service.</p>

<h3>6. DISTRIBUTIONS</h3>
<p>6.1 The Board shall authorise distributions from net income after deduction of management fees, maintenance reserves, and applicable taxes.</p>
<p>6.2 Distributions shall be calculated and processed automatically through the Platform.</p>

<h3>7. DISPOSAL OF THE PROPERTY</h3>
<p>7.1 The Property may only be sold if a special resolution is passed by Shareholders holding at least 75% of the issued shares.</p>
<p>7.2 Upon sale, net proceeds shall be distributed to Shareholders pro-rata after settlement of all liabilities.</p>

<h3>8. REGULATORY COMPLIANCE</h3>
<p>8.1 The Company shall comply with the Financial Intelligence Centre Act (FICA) requirements.</p>
<p>8.2 All Shareholders must complete KYC verification through the Platform before shares are issued.</p>
<p>8.3 The Company shall file annual returns with CIPC and SARS as required.</p>

<p style="margin-top:40px;"><strong>Adopted by the incorporators on ${date}</strong></p>

<div style="margin-top:60px; display:flex; gap:100px;">
<div>
<p>_______________________</p>
<p>Director / Incorporator</p>
</div>
<div>
<p>_______________________</p>
<p>Witness</p>
</div>
</div>
</div>`;
}

function generateShareholderAgreement(property: any, spv: any) {
  const companyName = spv?.name ?? "[SPV NAME]";
  const date = new Date().toLocaleDateString("en-ZA");

  const shareholders = property.shareClasses
    ?.flatMap((sc: any) => sc.holdings?.map((h: any) => h.investor?.name ?? "Unknown"))
    ?.filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) ?? [];

  return `
<div class="legal-document">
<h1 style="text-align:center;">SHAREHOLDERS' AGREEMENT</h1>
<h2 style="text-align:center;">${companyName}</h2>
<p style="text-align:center;">Date: ${date}</p>
<hr/>

<h3>BETWEEN:</h3>
<p>The Shareholders of ${companyName} as listed in the Platform's electronic share register${shareholders.length > 0 ? `, currently including: ${shareholders.join(", ")}` : ""}.</p>

<h3>RECITALS</h3>
<p>A. The Company was incorporated for the purpose of acquiring and managing the property known as "${property.title}" at ${property.address}, ${property.city}.</p>
<p>B. The Shareholders have acquired fractional ownership interests in the Company through the Platform.</p>

<h3>1. MANAGEMENT</h3>
<p>1.1 The Property shall be managed by the designated property manager through the Platform.</p>
<p>1.2 A management fee of 2% of gross rental income (or as agreed) shall be levied.</p>

<h3>2. INCOME DISTRIBUTION</h3>
<p>2.1 Net rental income shall be distributed monthly to Shareholders in proportion to their shareholding.</p>
<p>2.2 A maintenance reserve of 5% of gross income shall be retained.</p>
<p>2.3 Applicable withholding tax (currently 20% for dividends) shall be deducted at source.</p>

<h3>3. SHARE TRANSFERS</h3>
<p>3.1 Shares may be transferred via the Platform's secondary marketplace.</p>
<p>3.2 Existing Shareholders have a right of first refusal on any proposed sale, exercisable within 14 days.</p>
<p>3.3 The transferee must complete KYC/FICA verification before transfer can be registered.</p>

<h3>4. VOTING</h3>
<p>4.1 Ordinary resolutions require a simple majority (>50%) of shares voted.</p>
<p>4.2 Special resolutions (sale, MOI amendment) require 75% of shares voted.</p>
<p>4.3 A quorum of 25% of issued shares must participate for a valid vote.</p>

<h3>5. EXIT MECHANISMS</h3>
<p>5.1 Shareholders may exit by selling shares on the Platform marketplace.</p>
<p>5.2 A buy-back offer may be initiated by the Company with Board approval.</p>

<h3>6. DISPUTE RESOLUTION</h3>
<p>6.1 Disputes shall first be referred to mediation.</p>
<p>6.2 Failing mediation, disputes shall be resolved by arbitration in accordance with the Arbitration Act.</p>

<h3>7. GOVERNING LAW</h3>
<p>This Agreement is governed by the laws of the Republic of South Africa.</p>

<p style="margin-top:40px;"><strong>Signed on ${date}</strong></p>
</div>`;
}

function generateCessionOfRights(property: any, spv: any, acquisition: any) {
  const cederName = acquisition?.acquiredByName ?? "[CEDER NAME]";
  const cessionaryName = spv?.name ?? "[SPV NAME]";
  const date = new Date().toLocaleDateString("en-ZA");
  const auctionDate = acquisition?.auctionDate
    ? new Date(acquisition.auctionDate).toLocaleDateString("en-ZA")
    : "[AUCTION DATE]";
  const purchasePrice = acquisition?.purchasePrice ?? "[AMOUNT]";

  return `
<div class="legal-document">
<h1 style="text-align:center;">DEED OF CESSION</h1>
<p style="text-align:center;">Date: ${date}</p>
<hr/>

<h3>BETWEEN:</h3>
<p><strong>THE CEDENT:</strong> ${cederName} ("the Cedent")</p>
<p><strong>AND</strong></p>
<p><strong>THE CESSIONARY:</strong> ${cessionaryName}${spv?.registrationNumber ? ` (Registration No: ${spv.registrationNumber})` : ""} ("the Cessionary")</p>

<h3>RECITALS</h3>
<p>A. The Cedent was the successful bidder at a ${acquisition?.auctionType ?? "sheriff"} auction held on ${auctionDate} for the property described as "${property.title}" situated at ${property.address}, ${property.city} ("the Property").</p>
<p>B. The purchase price of the Property is R${Number(purchasePrice).toLocaleString()}.</p>
<p>C. The Cedent wishes to cede all rights, title and interest in the sale agreement to the Cessionary.</p>
<p>D. The Cessionary is a special purpose vehicle incorporated for the purpose of holding the Property.</p>

<h3>1. CESSION</h3>
<p>1.1 The Cedent hereby cedes, assigns and transfers to the Cessionary all rights, title and interest in and to the Agreement of Sale concluded at the auction held on ${auctionDate}.</p>
<p>1.2 The Cessionary hereby accepts the cession and assumes all obligations under the Agreement of Sale.</p>

<h3>2. PROPERTY REGISTRATION</h3>
<p>2.1 The Property shall be registered directly in the name of the Cessionary at the Deeds Office.</p>
<p>2.2 Only one transfer duty payment shall be applicable, paid by the Cessionary.</p>

<h3>3. REPRESENTATIONS AND WARRANTIES</h3>
<p>3.1 The Cedent warrants that no rights under the Agreement of Sale have been previously ceded.</p>
<p>3.2 The Cedent warrants that all conditions of the auction have been complied with.</p>

<h3>4. COSTS</h3>
<p>4.1 All conveyancing costs shall be borne by the Cessionary.</p>
<p>4.2 Transfer duty shall be calculated on the purchase price and paid by the Cessionary.</p>

<h3>5. GOVERNING LAW</h3>
<p>This Deed of Cession is governed by the laws of the Republic of South Africa.</p>

<div style="margin-top:60px; display:grid; grid-template-columns:1fr 1fr; gap:40px;">
<div>
<p style="font-weight:bold;">CEDENT:</p>
<p style="margin-top:40px;">_______________________</p>
<p>${cederName}</p>
<p>Date: _______________</p>
</div>
<div>
<p style="font-weight:bold;">CESSIONARY:</p>
<p style="margin-top:40px;">_______________________</p>
<p>For and on behalf of ${cessionaryName}</p>
<p>Date: _______________</p>
</div>
<div>
<p style="font-weight:bold;">WITNESS 1:</p>
<p style="margin-top:40px;">_______________________</p>
</div>
<div>
<p style="font-weight:bold;">WITNESS 2:</p>
<p style="margin-top:40px;">_______________________</p>
</div>
</div>
</div>`;
}

function generateShareCertificate(property: any, spv: any, investor: any, holding: any) {
  const date = new Date().toLocaleDateString("en-ZA");
  const certNumber = `SC-${property.id}-${investor?.id ?? 0}-${Date.now().toString(36).toUpperCase()}`;

  return `
<div class="legal-document" style="border:3px double #1a365d; padding:40px; text-align:center;">
<div style="border:1px solid #2c5282; padding:30px;">

<p style="font-size:12px; letter-spacing:4px; color:#4a5568;">REPUBLIC OF SOUTH AFRICA</p>
<h1 style="color:#1a365d; font-family:serif; margin:10px 0;">SHARE CERTIFICATE</h1>
<p style="font-size:12px; color:#4a5568;">Certificate No: ${certNumber}</p>

<hr style="border-top:2px solid #2c5282; margin:20px 40px;"/>

<h2 style="color:#2c5282; font-family:serif;">${spv?.name ?? property.title}</h2>
<p style="color:#718096;">${spv?.registrationNumber ? `Registration: ${spv.registrationNumber}` : ""}</p>

<p style="margin:30px 0; font-size:16px;">This is to certify that</p>
<h2 style="color:#1a365d; font-family:serif; font-size:28px;">${investor?.name ?? "[INVESTOR NAME]"}</h2>

<p style="margin:20px 0; font-size:16px;">is the registered holder of</p>
<h1 style="color:#2c5282; font-family:serif; font-size:42px;">${holding?.sharesOwned?.toLocaleString() ?? 0}</h1>
<p style="font-size:18px; color:#4a5568;">${holding?.shareClass?.name ?? "Ordinary"} Shares</p>

<p style="margin-top:20px; color:#718096;">in the property known as</p>
<p style="font-size:16px; font-weight:bold; color:#2d3748;">"${property.title}"</p>
<p style="color:#718096;">${property.address}, ${property.city}</p>

<p style="margin-top:10px; color:#718096;">Price per share: R${holding?.shareClass?.pricePerShare?.toLocaleString() ?? "—"}</p>

<hr style="border-top:2px solid #2c5282; margin:30px 40px;"/>

<div style="display:flex; justify-content:space-around; margin-top:30px; text-align:center;">
<div>
<p style="margin-top:40px;">_______________________</p>
<p>Director</p>
</div>
<div>
<p style="font-weight:bold;">Date Issued</p>
<p style="font-size:18px;">${date}</p>
</div>
<div>
<p style="margin-top:40px;">_______________________</p>
<p>Company Secretary</p>
</div>
</div>

</div>
</div>`;
}

function generateTaxCertificate(property: any, spv: any, investorId: number, payouts: any[]) {
  const date = new Date().toLocaleDateString("en-ZA");
  const taxYear = new Date().getFullYear();
  const totalGross = payouts.reduce((s, p) => s + p.grossAmount, 0);
  const totalTax = payouts.reduce((s, p) => s + p.taxWithheld, 0);
  const totalNet = payouts.reduce((s, p) => s + p.netAmount, 0);

  return `
<div class="legal-document">
<h1 style="text-align:center;">TAX CERTIFICATE</h1>
<h2 style="text-align:center;">Section 64G(3) — Dividends Tax</h2>
<p style="text-align:center;">Tax Year: ${taxYear} | Date: ${date}</p>
<hr/>

<h3>ISSUING ENTITY</h3>
<p><strong>Company:</strong> ${spv?.name ?? "Platform Trust"}</p>
<p><strong>Tax Number:</strong> ${spv?.taxNumber ?? "[TAX NUMBER]"}</p>
<p><strong>Property:</strong> ${property.title} — ${property.address}, ${property.city}</p>

<h3>INVESTOR DETAILS</h3>
<p><strong>Investor ID:</strong> ${investorId}</p>

<h3>DISTRIBUTION SUMMARY — TAX YEAR ${taxYear}</h3>
<table style="width:100%; border-collapse:collapse; margin:20px 0;">
<thead>
<tr style="background:#f7fafc; border-bottom:2px solid #e2e8f0;">
<th style="padding:8px; text-align:left;">Date</th>
<th style="padding:8px; text-align:left;">Type</th>
<th style="padding:8px; text-align:right;">Gross (R)</th>
<th style="padding:8px; text-align:right;">Tax Withheld (R)</th>
<th style="padding:8px; text-align:right;">Net (R)</th>
</tr>
</thead>
<tbody>
${payouts.map((p) => `
<tr style="border-bottom:1px solid #e2e8f0;">
<td style="padding:8px;">${new Date(p.distribution.createdAt).toLocaleDateString("en-ZA")}</td>
<td style="padding:8px;">${p.distribution.type}</td>
<td style="padding:8px; text-align:right;">${p.grossAmount.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">${p.taxWithheld.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">${p.netAmount.toLocaleString()}</td>
</tr>`).join("")}
</tbody>
<tfoot>
<tr style="font-weight:bold; border-top:2px solid #2d3748;">
<td style="padding:8px;" colspan="2">TOTAL</td>
<td style="padding:8px; text-align:right;">R${totalGross.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">R${totalTax.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">R${totalNet.toLocaleString()}</td>
</tr>
</tfoot>
</table>

<p style="margin-top:20px; font-size:12px; color:#718096;">This certificate is issued in terms of section 64G(3) of the Income Tax Act, 58 of 1962, confirming that dividends tax at the rate of 20% has been withheld on distributions paid.</p>

<div style="margin-top:60px;">
<p>_______________________</p>
<p>Authorised Signatory</p>
</div>
</div>`;
}

function generateDistributionStatement(property: any, distributions: any[]) {
  const date = new Date().toLocaleDateString("en-ZA");
  const totalGross = distributions.reduce((s, d) => s + d.grossAmount, 0);
  const totalFees = distributions.reduce((s, d) => s + d.managementFee, 0);
  const totalNet = distributions.reduce((s, d) => s + d.netAmount, 0);

  return `
<div class="legal-document">
<h1 style="text-align:center;">DISTRIBUTION STATEMENT</h1>
<h2 style="text-align:center;">${property.title}</h2>
<p style="text-align:center;">Generated: ${date}</p>
<hr/>

<table style="width:100%; border-collapse:collapse; margin:20px 0;">
<thead>
<tr style="background:#f7fafc; border-bottom:2px solid #e2e8f0;">
<th style="padding:8px; text-align:left;">Date</th>
<th style="padding:8px; text-align:left;">Type</th>
<th style="padding:8px; text-align:left;">Period</th>
<th style="padding:8px; text-align:right;">Gross (R)</th>
<th style="padding:8px; text-align:right;">Mgmt Fee (R)</th>
<th style="padding:8px; text-align:right;">Net Distributed (R)</th>
<th style="padding:8px; text-align:left;">Status</th>
</tr>
</thead>
<tbody>
${distributions.map((d) => `
<tr style="border-bottom:1px solid #e2e8f0;">
<td style="padding:8px;">${new Date(d.createdAt).toLocaleDateString("en-ZA")}</td>
<td style="padding:8px;">${d.type}</td>
<td style="padding:8px;">${d.period ?? "—"}</td>
<td style="padding:8px; text-align:right;">${d.grossAmount.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">${d.managementFee.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">${d.netAmount.toLocaleString()}</td>
<td style="padding:8px;">${d.status}</td>
</tr>`).join("")}
</tbody>
<tfoot>
<tr style="font-weight:bold; border-top:2px solid #2d3748;">
<td style="padding:8px;" colspan="3">TOTAL</td>
<td style="padding:8px; text-align:right;">R${totalGross.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">R${totalFees.toLocaleString()}</td>
<td style="padding:8px; text-align:right;">R${totalNet.toLocaleString()}</td>
<td></td>
</tr>
</tfoot>
</table>
</div>`;
}

async function generateComplianceReport(property: any, spv: any) {
  const date = new Date().toLocaleDateString("en-ZA");

  // Gather compliance data
  const kycDocs = await db.kYCDocument.findMany({
    where: { propertyId: property.id },
  });
  const totalInvestors = await db.shareHolding.count({
    where: { propertyId: property.id },
  });
  const kycApproved = kycDocs.filter((d) => d.status === "APPROVED").length;
  const kycPending = kycDocs.filter((d) => d.status === "PENDING").length;

  return `
<div class="legal-document">
<h1 style="text-align:center;">COMPLIANCE REPORT</h1>
<h2 style="text-align:center;">${property.title}</h2>
<p style="text-align:center;">Date: ${date}</p>
<hr/>

<h3>1. REGULATORY FRAMEWORK</h3>
<ul>
<li>Companies Act, 2008 (Act 71 of 2008) — SPV registration & governance</li>
<li>Financial Intelligence Centre Act (FICA) — KYC / anti-money laundering</li>
<li>Collective Investment Schemes Control Act (CISCA) — potential applicability</li>
<li>Electronic Communications & Transactions Act (ECT Act) — platform operations</li>
<li>Income Tax Act — dividends tax withholding</li>
</ul>

<h3>2. SPV STATUS</h3>
<p><strong>SPV Name:</strong> ${spv?.name ?? "Not assigned"}</p>
<p><strong>CIPC Status:</strong> ${spv?.status ?? "N/A"}</p>
<p><strong>Tax Number:</strong> ${spv?.taxNumber ?? "Not registered"}</p>

<h3>3. KYC / FICA COMPLIANCE</h3>
<p>Total investors: <strong>${totalInvestors}</strong></p>
<p>KYC documents approved: <strong>${kycApproved}</strong></p>
<p>KYC documents pending: <strong>${kycPending}</strong></p>
<p>Compliance rate: <strong>${totalInvestors > 0 ? ((kycApproved / Math.max(totalInvestors, 1)) * 100).toFixed(1) : 0}%</strong></p>

<h3>4. FINANCIAL COMPLIANCE</h3>
<p>All distributions have withholding tax applied at 20% as required by section 64E of the Income Tax Act.</p>
<p>Management fees are disclosed and deducted transparently.</p>

<h3>5. RECOMMENDATIONS</h3>
<ul>
<li>Ensure all investors complete KYC before share issuance</li>
<li>File annual CIPC returns on time</li>
<li>Submit IT12 tax returns for the SPV</li>
<li>Maintain share register in compliance with section 50 of the Companies Act</li>
</ul>

<p style="margin-top:40px;"><strong>Report prepared on ${date}</strong></p>
</div>`;
}

function generateInvestmentAgreement(property: any, spv: any, investor: any, holding: any) {
  const companyName = spv?.name ?? "[SPV NAME]";
  const regNumber = spv?.registrationNumber ?? "[CIPC REG NUMBER]";
  const date = new Date().toLocaleDateString("en-ZA");
  const investorName = investor?.name ?? "[INVESTOR NAME]";
  const idNumber = investor?.idNumber ?? "[ID / PASSPORT NUMBER]";
  const shares = holding?.sharesOwned ?? 0;
  const shareClass = holding?.shareClass?.name ?? "Ordinary";
  const pricePerShare = holding?.shareClass?.pricePerShare ?? 0;
  const totalInvestment = shares * pricePerShare;
  const ownershipPct = holding?.shareClass?.totalShares
    ? ((shares / holding.shareClass.totalShares) * 100).toFixed(4)
    : "0";

  return `
<div class="legal-document">
<h1 style="text-align:center;">SUBSCRIPTION AND INVESTMENT AGREEMENT</h1>
<h2 style="text-align:center;">${companyName}</h2>
<p style="text-align:center;">Registration Number: ${regNumber}</p>
<p style="text-align:center;">Date: ${date}</p>
<hr/>

<h3>PARTIES</h3>
<p><strong>1. THE COMPANY:</strong> ${companyName}, registration number ${regNumber}, a private company incorporated in accordance with the Companies Act, 2008 (Act No. 71 of 2008) ("the Company").</p>
<p><strong>2. THE INVESTOR:</strong> ${investorName}, Identity/Passport Number: ${idNumber} ("the Subscriber").</p>

<h3>RECITALS</h3>
<p>A. The Company is a special purpose vehicle incorporated for the sole purpose of acquiring, holding and managing the immovable property known as "${property.title}" situated at ${property.address}, ${property.city} ("the Property").</p>
<p>B. The Company has offered fractional ownership interests in the Property through the Investprop platform ("the Platform").</p>
<p>C. The Subscriber wishes to subscribe for shares in the Company, thereby acquiring an indirect fractional interest in the Property.</p>
<p>D. This Agreement is entered into subject to the Memorandum of Incorporation ("MOI") and Shareholders' Agreement of the Company.</p>

<h3>1. SUBSCRIPTION</h3>
<p>1.1 The Company hereby offers, and the Subscriber hereby subscribes for, <strong>${shares.toLocaleString()} ${shareClass} Shares</strong> in the Company.</p>
<p>1.2 The subscription price is <strong>R${pricePerShare.toLocaleString()}</strong> per share, for a total subscription consideration of <strong>R${totalInvestment.toLocaleString()}</strong>.</p>
<p>1.3 Upon allotment, the Subscriber will hold approximately <strong>${ownershipPct}%</strong> of the issued share capital.</p>

<h3>2. PAYMENT</h3>
<p>2.1 The subscription consideration shall be paid in full by the Subscriber via the Platform's payment facility or by electronic fund transfer ("EFT") with proof of payment uploaded to the Platform.</p>
<p>2.2 Shares shall only be allotted and issued upon receipt of cleared funds.</p>
<p>2.3 In terms of section 41 of the Consumer Protection Act, the Subscriber has a <strong>5 (five) business day cooling-off period</strong> from the date of this Agreement within which the Subscriber may cancel without penalty.</p>

<h3>3. RIGHTS ATTACHING TO SHARES</h3>
<p>3.1 Each share carries the following rights:</p>
<ul>
<li>(a) The right to receive pro-rata distributions of net rental income from the Property;</li>
<li>(b) The right to vote on shareholder resolutions in proportion to shares held;</li>
<li>(c) The right to a pro-rata share of net sale proceeds upon disposal of the Property;</li>
<li>(d) The right to inspect the financial records of the Company via the Platform.</li>
</ul>
<p>3.2 Share rights are subject to the MOI and Shareholders' Agreement.</p>

<h3>4. DISTRIBUTIONS</h3>
<p>4.1 The Company shall distribute net rental income to shareholders on a monthly basis, after deduction of:</p>
<ul>
<li>(a) Property management fees (as disclosed on the Platform);</li>
<li>(b) Maintenance reserve (minimum 5% of gross rental income);</li>
<li>(c) Operating expenses and statutory levies;</li>
<li>(d) Dividends withholding tax at the prevailing rate (currently <strong>20%</strong> per section 64E of the Income Tax Act, 58 of 1962).</li>
</ul>
<p>4.2 Distribution amounts are not guaranteed and depend on the financial performance of the Property.</p>

<h3>5. RISKS</h3>
<p>The Subscriber acknowledges and accepts the following risks:</p>
<ul>
<li>5.1 <strong>Property value risk</strong> — the value of the Property may decrease;</li>
<li>5.2 <strong>Income risk</strong> — rental income is not guaranteed, vacancies may occur;</li>
<li>5.3 <strong>Liquidity risk</strong> — shares may not be readily tradeable on the secondary marketplace;</li>
<li>5.4 <strong>Regulatory risk</strong> — changes in legislation (including FSCA classification) may affect the investment;</li>
<li>5.5 <strong>Tax risk</strong> — tax treatment may change; double taxation (corporate + dividends tax) applies;</li>
<li>5.6 <strong>Concentration risk</strong> — each SPV holds a single property.</li>
</ul>

<h3>6. TRANSFER RESTRICTIONS</h3>
<p>6.1 Shares may be transferred via the Platform's secondary marketplace, subject to:</p>
<ul>
<li>(a) Right of first refusal by existing shareholders (14 calendar days);</li>
<li>(b) KYC/FICA verification of the transferee;</li>
<li>(c) Board approval (not to be unreasonably withheld).</li>
</ul>

<h3>7. KYC / FICA COMPLIANCE</h3>
<p>7.1 The Subscriber warrants that all information provided for Know-Your-Customer and FICA verification is true and correct.</p>
<p>7.2 The Company reserves the right to refuse allotment if KYC verification is not satisfactorily completed.</p>

<h3>8. WARRANTIES BY THE SUBSCRIBER</h3>
<p>The Subscriber warrants that:</p>
<ul>
<li>8.1 The Subscriber is at least 18 years of age and has legal capacity to enter into this Agreement;</li>
<li>8.2 The Subscriber is a tax resident of the Republic of South Africa (or has disclosed foreign tax residency);</li>
<li>8.3 The funds used for the subscription are from lawful sources;</li>
<li>8.4 The Subscriber has read and understood the MOI, Shareholders' Agreement, and risk disclosures;</li>
<li>8.5 The Subscriber has not been induced by any representation not contained in this Agreement.</li>
</ul>

<h3>9. TERMINATION AND EXIT</h3>
<p>9.1 The Subscriber may exit by selling shares on the Platform marketplace.</p>
<p>9.2 The Company may buy back shares with Board approval and sufficient reserves.</p>
<p>9.3 Upon disposal of the Property (by special resolution of 75%+ shareholders), the Company will be wound up and net proceeds distributed pro-rata.</p>

<h3>10. DISPUTE RESOLUTION</h3>
<p>10.1 Any dispute arising from this Agreement shall first be referred to mediation.</p>
<p>10.2 Failing resolution within 30 days, the dispute shall be referred to arbitration in Johannesburg in terms of the Arbitration Act, 42 of 1965.</p>

<h3>11. GOVERNING LAW</h3>
<p>This Agreement is governed by the laws of the Republic of South Africa, and the parties consent to the jurisdiction of the High Court of South Africa.</p>

<h3>12. ENTIRE AGREEMENT</h3>
<p>This Agreement, together with the MOI and Shareholders' Agreement, constitutes the entire agreement between the parties. No amendment shall be valid unless reduced to writing and signed by both parties.</p>

<div style="margin-top:60px; display:grid; grid-template-columns:1fr 1fr; gap:40px;">
<div>
<p style="font-weight:bold;">FOR THE COMPANY:</p>
<p style="margin-top:40px;">_______________________</p>
<p>Authorised Director</p>
<p>${companyName}</p>
<p>Date: _______________</p>
</div>
<div>
<p style="font-weight:bold;">THE SUBSCRIBER:</p>
<p style="margin-top:40px;">_______________________</p>
<p>${investorName}</p>
<p>ID: ${idNumber}</p>
<p>Date: _______________</p>
</div>
<div>
<p style="font-weight:bold;">WITNESS 1:</p>
<p style="margin-top:40px;">_______________________</p>
<p>Name: _______________</p>
</div>
<div>
<p style="font-weight:bold;">WITNESS 2:</p>
<p style="margin-top:40px;">_______________________</p>
<p>Name: _______________</p>
</div>
</div>

<div style="margin-top:30px; padding:15px; background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px;">
<p style="font-size:12px; color:#718096; margin:0;"><strong>IMPORTANT NOTICE:</strong> This investment is in shares of a private company and is NOT a deposit or savings product. Your capital is at risk. Past performance does not guarantee future returns. This investment is not regulated by the Financial Sector Conduct Authority (FSCA) as a collective investment scheme. The Company holds a single property — this is not a diversified fund. Seek independent financial advice if in doubt.</p>
</div>
</div>`;
}
