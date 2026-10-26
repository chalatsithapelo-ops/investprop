import { describe, it, expect } from 'vitest';
import {
  calculateFlipProfit,
  calculateFlipROI,
  calculateFlipBreakEven,
  calculateMonthlyDebtService,
  calculateCapRate,
  calculateNOI,
  calculateAnnualGrossRent,
  calculateDevelopmentROI,
  calculatePreSalePercentage,
  calculateCostPerSquareMeter,
  calculateTransferDuty,
  extractVat,
  estimateFlipIncomeTax,
  calculateAnnualisedReturn,
  calculateIRRPerPeriod,
  calculateAnnualIRRFromMonthly,
  calculateMonthlyCashFlow,
  calculatePrequalification,
  bondAmountFromInstalment,
  buildDevelopmentCashflow,
  calculateResidualLandValue,
  runDevelopmentSensitivity,
  buildAffordableHousingModel,
  buildCommercialInvestmentModel,
  buildAffordableRentalModel,
  assessGreenfieldFeasibility,
  calculateMonthlyDebtService as _mds,
} from '../financial-calculations';

describe('Financial Calculations', () => {
  describe('calculateFlipProfit', () => {
    it('computes profit = estimatedValue - totalInvestment - closingCostsSale', () => {
      // 450000 - 355000 - 15000 = 80000
      expect(calculateFlipProfit(450000, 355000, 15000)).toBe(80000);
    });

    it('returns a negative number for a losing flip', () => {
      // 450000 - 510000 - 20000 = -80000
      expect(calculateFlipProfit(450000, 510000, 20000)).toBeLessThan(0);
    });
  });

  describe('calculateFlipROI', () => {
    it('computes ROI as a percentage of total investment', () => {
      // (80000 / 370000) * 100 ≈ 21.62
      expect(calculateFlipROI(80000, 370000)).toBeCloseTo(21.62, 1);
    });

    it('returns 0 when total investment is 0 (no divide-by-zero)', () => {
      expect(calculateFlipROI(80000, 0)).toBe(0);
    });
  });

  describe('calculateFlipBreakEven', () => {
    it('computes break-even = totalInvestment + closingCostsSale', () => {
      expect(calculateFlipBreakEven(355000, 15000)).toBe(370000);
    });
  });

  describe('calculateMonthlyDebtService', () => {
    it('computes a standard amortised monthly payment', () => {
      // R400 000 @ 6% over 30y ≈ R2 398.20
      expect(calculateMonthlyDebtService(400000, 6, 30)).toBeCloseTo(2398.2, 0);
    });

    it('returns 0 for a zero interest rate (guarded, no NaN)', () => {
      expect(calculateMonthlyDebtService(400000, 0, 30)).toBe(0);
    });

    it('returns 0 for a zero loan amount', () => {
      expect(calculateMonthlyDebtService(0, 6, 30)).toBe(0);
    });

    it('produces a higher payment for a short term', () => {
      const shortTerm = calculateMonthlyDebtService(100000, 5, 1);
      const longTerm = calculateMonthlyDebtService(100000, 5, 30);
      expect(shortTerm).toBeGreaterThan(longTerm);
    });
  });

  describe('calculateCapRate', () => {
    it('computes cap rate = (NOI / purchasePrice) * 100', () => {
      expect(calculateCapRate(50000, 1000000)).toBe(5);
    });

    it('handles a higher NOI', () => {
      expect(calculateCapRate(120000, 1000000)).toBe(12);
    });

    it('returns 0 when purchase price is 0 (no divide-by-zero)', () => {
      expect(calculateCapRate(50000, 0)).toBe(0);
    });

    it('returns a negative cap rate for a negative NOI', () => {
      expect(calculateCapRate(-10000, 1000000)).toBe(-1);
    });
  });

  describe('calculateNOI', () => {
    it('subtracts vacancy loss and operating expenses from gross rent', () => {
      // gross 120000, 5% vacancy = 6000 loss, EGI 114000, opex 24000 -> NOI 90000
      expect(calculateNOI(120000, 5, 24000)).toBe(90000);
    });

    it('handles zero vacancy', () => {
      expect(calculateNOI(120000, 0, 24000)).toBe(96000);
    });
  });

  describe('calculateAnnualGrossRent', () => {
    it('annualises monthly rent', () => {
      expect(calculateAnnualGrossRent(10000)).toBe(120000);
    });
  });

  describe('calculateDevelopmentROI', () => {
    it('computes ROI = (profit / totalCosts) * 100', () => {
      // (700000 / 2800000) * 100 = 25
      expect(calculateDevelopmentROI(700000, 2800000)).toBe(25);
    });

    it('returns 0 at break-even', () => {
      expect(calculateDevelopmentROI(0, 2800000)).toBe(0);
    });

    it('returns 0 when total costs are 0 (no divide-by-zero)', () => {
      expect(calculateDevelopmentROI(700000, 0)).toBe(0);
    });
  });

  describe('calculatePreSalePercentage', () => {
    it('computes pre-sold percentage of total units', () => {
      expect(calculatePreSalePercentage(5, 20)).toBe(25);
    });

    it('returns 0 when there are no units', () => {
      expect(calculatePreSalePercentage(5, 0)).toBe(0);
    });
  });

  describe('calculateCostPerSquareMeter', () => {
    it('divides total cost by total square meters', () => {
      expect(calculateCostPerSquareMeter(2800000, 700)).toBe(4000);
    });

    it('returns 0 when square meters is 0', () => {
      expect(calculateCostPerSquareMeter(2800000, 0)).toBe(0);
    });
  });

  describe('calculateTransferDuty (SARS 2025/26 sliding scale)', () => {
    it('charges no duty up to the R1 210 000 threshold', () => {
      expect(calculateTransferDuty(1_000_000)).toBe(0);
      expect(calculateTransferDuty(1_210_000)).toBe(0);
    });

    it('charges 3% on the slice above R1 210 000', () => {
      // (1 500 000 - 1 210 000) * 3% = 8 700
      expect(calculateTransferDuty(1_500_000)).toBeCloseTo(8_700, 0);
    });

    it('uses the R13 614 base + 6% band', () => {
      // 13 614 + (2 000 000 - 1 663 800) * 6% = 33 786
      expect(calculateTransferDuty(2_000_000)).toBeCloseTo(33_786, 0);
    });

    it('uses the R106 784 base + 11% band', () => {
      // 106 784 + (3 000 000 - 2 994 800) * 11% = 107 356
      expect(calculateTransferDuty(3_000_000)).toBeCloseTo(107_356, 0);
    });

    it('uses the top R1 241 456 base + 13% band', () => {
      // 1 241 456 + (15 000 000 - 13 310 000) * 13% = 1 461 156
      expect(calculateTransferDuty(15_000_000)).toBeCloseTo(1_461_156, 0);
    });

    it('returns 0 for a non-positive value', () => {
      expect(calculateTransferDuty(0)).toBe(0);
      expect(calculateTransferDuty(-100)).toBe(0);
    });
  });

  describe('extractVat', () => {
    it('extracts the 15% VAT portion from a VAT-inclusive price', () => {
      // 1 150 000 incl -> 150 000 VAT (1 000 000 ex)
      expect(extractVat(1_150_000)).toBeCloseTo(150_000, 0);
    });

    it('returns 0 for a non-positive price', () => {
      expect(extractVat(0)).toBe(0);
    });
  });

  describe('estimateFlipIncomeTax', () => {
    it('applies the default 27% rate to a positive profit', () => {
      expect(estimateFlipIncomeTax(100_000)).toBeCloseTo(27_000, 0);
    });

    it('respects a custom rate', () => {
      expect(estimateFlipIncomeTax(100_000, 0.4)).toBeCloseTo(40_000, 0);
    });

    it('returns 0 on a loss (no tax on a negative profit)', () => {
      expect(estimateFlipIncomeTax(-50_000)).toBe(0);
    });
  });

  describe('calculateAnnualisedReturn', () => {
    it('annualises a 20% six-month return above the simple figure', () => {
      // (1.2 ^ (1 / 0.5) - 1) * 100 = 44%
      expect(calculateAnnualisedReturn(20_000, 100_000, 6)).toBeCloseTo(44, 0);
    });

    it('falls back to the simple period return when months are unknown', () => {
      expect(calculateAnnualisedReturn(20_000, 100_000, 0)).toBeCloseTo(20, 0);
    });

    it('returns 0 when nothing was invested (no divide-by-zero)', () => {
      expect(calculateAnnualisedReturn(20_000, 0, 12)).toBe(0);
    });

    it('clamps a total wipe-out to -100%', () => {
      expect(calculateAnnualisedReturn(-150_000, 100_000, 12)).toBe(-100);
    });
  });

  describe('calculateIRRPerPeriod', () => {
    it('solves a simple two-period 10% return', () => {
      // -100 today, +110 next period -> 10% per period
      expect(calculateIRRPerPeriod([-100, 110])).toBeCloseTo(0.1, 3);
    });

    it('returns NaN when there is no sign change', () => {
      expect(Number.isNaN(calculateIRRPerPeriod([100, 110]))).toBe(true);
    });
  });

  describe('calculateAnnualIRRFromMonthly', () => {
    it('compounds a 1%/month return into an annual rate', () => {
      // -100 then +101 one month later -> 1%/m -> (1.01^12 - 1) * 100 ~ 12.68%
      expect(calculateAnnualIRRFromMonthly([-100, 101])).toBeCloseTo(12.68, 1);
    });
  });

  describe('calculateMonthlyCashFlow', () => {
    it('subtracts annual debt service before dividing by 12', () => {
      // (90 000 - 60 000) / 12 = 2 500
      expect(calculateMonthlyCashFlow(90_000, 60_000)).toBe(2500);
    });

    it('treats debt service as 0 by default', () => {
      expect(calculateMonthlyCashFlow(90_000)).toBe(7500);
    });
  });

  describe('bondAmountFromInstalment', () => {
    it('is the inverse of calculateMonthlyDebtService', () => {
      // A R1 000 000 bond at 11.75% over 20 years has a known instalment;
      // feeding that instalment back must recover ~R1 000 000.
      const instalment = _mds(1_000_000, 11.75, 20);
      const bond = bondAmountFromInstalment(instalment, 11.75, 20);
      expect(bond).toBeCloseTo(1_000_000, 0);
    });

    it('returns 0 for a non-positive instalment', () => {
      expect(bondAmountFromInstalment(0, 11.75, 20)).toBe(0);
    });
  });

  describe('calculatePrequalification', () => {
    it('caps the affordable instalment at 30% of gross income', () => {
      const r = calculatePrequalification({ grossMonthlyIncome: 50_000 });
      expect(r.maxInstalment).toBeCloseTo(15_000, 5);
      expect(r.maxBondAmount).toBeGreaterThan(0);
      expect(r.maxPropertyPrice).toBeCloseTo(r.maxBondAmount, 5);
    });

    it('subtracts existing debt via the total-debt cap', () => {
      // 36% of 50 000 = 18 000; minus 6 000 existing debt = 12 000, which is
      // lower than the 30% instalment cap (15 000) so it wins.
      const r = calculatePrequalification({
        grossMonthlyIncome: 50_000,
        existingDebtRepayments: 6_000,
      });
      expect(r.maxInstalment).toBeCloseTo(12_000, 5);
    });

    it('adds the deposit to the max property price', () => {
      const noDeposit = calculatePrequalification({ grossMonthlyIncome: 60_000 });
      const withDeposit = calculatePrequalification({
        grossMonthlyIncome: 60_000,
        depositAmount: 200_000,
      });
      expect(withDeposit.maxPropertyPrice).toBeCloseTo(
        noDeposit.maxBondAmount + 200_000,
        0
      );
    });

    it('qualifies an affordable deal and flags an unaffordable one', () => {
      const affordable = calculatePrequalification({
        grossMonthlyIncome: 80_000,
        propertyPrice: 1_200_000,
      });
      expect(affordable.qualifies).toBe(true);
      expect(affordable.estimatedInstalment).toBeGreaterThan(0);

      const tooBig = calculatePrequalification({
        grossMonthlyIncome: 25_000,
        propertyPrice: 3_000_000,
      });
      expect(tooBig.qualifies).toBe(false);
      expect(tooBig.band).toBe('WEAK');
    });

    it('computes loan-to-value against the requested price and deposit', () => {
      const r = calculatePrequalification({
        grossMonthlyIncome: 90_000,
        propertyPrice: 1_000_000,
        depositAmount: 100_000,
      });
      expect(r.loanToValue).toBeCloseTo(90, 5);
    });
  });
});

describe('Development Feasibility Engine', () => {
  describe('buildDevelopmentCashflow', () => {
    it('derives profit and profit-on-cost from an all-equity scheme (no debt, no VAT)', () => {
      const r = buildDevelopmentCashflow({
        landCost: 1_000_000,
        hardCosts: 2_000_000,
        softCosts: 0,
        contingencyAmount: 0,
        grossDevelopmentValue: 4_000_000,
        timelineMonths: 12,
        equityAmount: 5_000_000,
        seniorDebtAmount: 0,
        debtAnnualRate: 0,
      });
      expect(r.totalInterest).toBe(0);
      expect(r.outputVat).toBe(0);
      expect(r.profit).toBeCloseTo(1_000_000, 0);
      expect(r.profitOnCost).toBeCloseTo(33.33, 1);
      expect(r.profitOnGdv).toBeCloseTo(25, 1);
      expect(r.peakFunding).toBeGreaterThan(0);
      expect(r.projectIRR).toBeGreaterThan(0);
    });

    it('keeps peak funding and rolled-up interest bounded by total cost (S-curve sanity)', () => {
      // Regression: an inverted standard-normal CDF once made the S-curve dump
      // the whole build spend into month 1, exploding peak funding into the
      // billions and interest to many× the loan. Peak funding is a cumulative
      // outflow and can never exceed total project cost.
      const r = buildDevelopmentCashflow({
        landCost: 3_000_000,
        hardCosts: 12_000_000,
        softCosts: 1_800_000,
        contingencyAmount: 1_740_000,
        grossDevelopmentValue: 24_000_000,
        timelineMonths: 18,
        equityAmount: 8_000_000,
        seniorDebtAmount: 10_000_000,
        debtAnnualRate: 11.5,
        vatApplicable: true,
      });
      expect(r.peakFunding).toBeGreaterThan(0);
      expect(r.peakFunding).toBeLessThanOrEqual(r.totalCost);
      // Interest on a scheme that draws ~R4m of a R10m facility for ~1 year is
      // small relative to the loan, never a multiple of it.
      expect(r.totalInterest).toBeLessThan(10_000_000);
      expect(r.totalCost).toBeLessThan(25_000_000);
      expect(Number.isFinite(r.projectIRR)).toBe(true);
    });

    it('accrues rolled-up interest when the scheme is debt-funded', () => {
      const r = buildDevelopmentCashflow({
        landCost: 1_000_000,
        hardCosts: 2_000_000,
        softCosts: 0,
        contingencyAmount: 0,
        grossDevelopmentValue: 4_000_000,
        timelineMonths: 12,
        equityAmount: 0,
        seniorDebtAmount: 5_000_000,
        debtAnnualRate: 12,
      });
      expect(r.totalInterest).toBeGreaterThan(0);
      expect(r.profit).toBeLessThan(1_000_000); // interest erodes profit
    });

    it('handles a VAT-vendor sale (output VAT on GDV, input VAT on build cost)', () => {
      const r = buildDevelopmentCashflow({
        landCost: 1_000_000,
        hardCosts: 2_000_000,
        softCosts: 0,
        contingencyAmount: 0,
        grossDevelopmentValue: 4_600_000,
        timelineMonths: 12,
        equityAmount: 6_000_000,
        seniorDebtAmount: 0,
        debtAnnualRate: 0,
        vatApplicable: true,
      });
      expect(r.outputVat).toBeCloseTo(600_000, 0);
      expect(r.inputVat).toBeCloseTo(300_000, 0);
      expect(r.netVatPayable).toBeCloseTo(300_000, 0);
      expect(r.profit).toBeCloseTo(700_000, 0);
    });
  });

  describe('calculateResidualLandValue', () => {
    it('back-solves the max land price for a 20% profit-on-cost target', () => {
      const land = calculateResidualLandValue({
        grossDevelopmentValue: 4_000_000,
        hardCosts: 2_000_000,
        softCosts: 0,
        financingCosts: 0,
        contingencyPercent: 10,
        targetProfitOnCostPercent: 20,
      });
      expect(land).toBeCloseTo(1_030_303, 0);
    });

    it('returns 0 when the GDV cannot support any land cost', () => {
      const land = calculateResidualLandValue({
        grossDevelopmentValue: 1_000_000,
        hardCosts: 2_000_000,
        softCosts: 0,
        financingCosts: 0,
        contingencyPercent: 10,
        targetProfitOnCostPercent: 20,
      });
      expect(land).toBe(0);
    });
  });

  describe('runDevelopmentSensitivity', () => {
    it('returns a grid where higher cost / lower price reduces profit-on-cost', () => {
      const grid = runDevelopmentSensitivity({
        landCost: 1_000_000,
        buildCost: 2_000_000,
        contingencyPercent: 10,
        grossDevelopmentValue: 4_000_000,
        costDeltas: [0, 0.1],
        priceDeltas: [0, -0.1],
      });
      const base = grid.find((g) => g.costDelta === 0 && g.priceDelta === 0)!;
      const stressed = grid.find((g) => g.costDelta === 0.1 && g.priceDelta === -0.1)!;
      expect(base.profitOnCost).toBeCloseTo(21.21, 1);
      expect(stressed.profitOnCost).toBeLessThan(base.profitOnCost);
    });
  });

  describe('Greenfield models — affordable housing (build & sell)', () => {
    it('derives profit = GDV − full cost stack', () => {
      const r = buildAffordableHousingModel({
        numberOfUnits: 100,
        sellingPricePerUnit: 600_000,
        landCost: 5_000_000,
        bulkServicesCost: 3_000_000,
        internalServicesCost: 2_000_000,
        constructionCostPerUnit: 400_000,
        professionalFeesCost: 2_000_000,
        statutoryCost: 1_000_000,
        financeCost: 1_000_000,
        marketingCost: 1_000_000,
        contingencyPercent: 0,
      });
      // GDV = 100 * 600k = 60M; cost = 5+3+2+40+2+1+1+1 = 55M; profit = 5M.
      expect(r.grossDevelopmentValue).toBe(60_000_000);
      expect(r.totalDevelopmentCost).toBe(55_000_000);
      expect(r.profit).toBe(5_000_000);
      expect(r.profitOnCost).toBeCloseTo(9.09, 1);
    });

    it('flags unit pricing above the affordable ceiling', () => {
      const r = buildAffordableHousingModel({
        numberOfUnits: 10,
        sellingPricePerUnit: 900_000,
        landCost: 1_000_000,
        constructionCostPerUnit: 500_000,
        contingencyPercent: 0,
        affordablePriceCeiling: 700_000,
      });
      expect(r.rentWithinBand).toBe(false);
      expect(r.notes.join(' ')).toMatch(/affordable ceiling/i);
    });
  });

  describe('Greenfield models — commercial / shopping centre (income)', () => {
    it('capitalises NOI and reports the yield spread', () => {
      const r = buildCommercialInvestmentModel({
        grossLettableAreaSqm: 10_000,
        rentPerSqmPerMonth: 150,
        vacancyRate: 0.1,
        operatingExpenseRatio: 0.3,
        exitCapRate: 9,
        landCost: 20_000_000,
        constructionCost: 90_000_000,
        contingencyPercent: 0,
        professionalFeesCost: 0,
      });
      // Gross rent = 10k*150*12 = 18M; EGI = 16.2M; opex = 4.86M; NOI = 11.34M.
      expect(r.stabilisedNOI).toBeCloseTo(11_340_000, 0);
      // Value = NOI / 9% = 126M; cost = 110M; profit = 16M.
      expect(r.grossDevelopmentValue).toBeCloseTo(126_000_000, 0);
      expect(r.totalDevelopmentCost).toBe(110_000_000);
      expect(r.profit).toBeCloseTo(16_000_000, 0);
      // Dev yield = 11.34M/110M = 10.31%; spread over 9% is positive.
      expect(r.developmentYield).toBeCloseTo(10.31, 1);
      expect(r.yieldSpread!).toBeGreaterThan(0);
    });

    it('warns when development yield does not beat the cap rate', () => {
      const r = buildCommercialInvestmentModel({
        grossLettableAreaSqm: 5_000,
        rentPerSqmPerMonth: 100,
        vacancyRate: 0.1,
        operatingExpenseRatio: 0.35,
        exitCapRate: 9,
        landCost: 30_000_000,
        constructionCost: 60_000_000,
        contingencyPercent: 0,
      });
      expect(r.yieldSpread!).toBeLessThanOrEqual(0);
      expect(r.notes.join(' ')).toMatch(/does not exceed/i);
    });
  });

  describe('Greenfield models — affordable rental incl. SHRA', () => {
    it('reports returns net of the SHRA capital grant', () => {
      const r = buildAffordableRentalModel({
        numberOfUnits: 200,
        rentPerUnitPerMonth: 3_500,
        vacancyRate: 0.05,
        operatingCostPerUnitPerMonth: 1_400,
        exitCapRate: 10,
        landCost: 10_000_000,
        constructionCost: 140_000_000,
        contingencyPercent: 0,
        capitalGrantPerUnit: 150_000,
      });
      // Gross = 200*3500*12 = 8.4M; EGI = 7.98M; opex = 200*1400*12 = 3.36M; NOI = 4.62M.
      expect(r.stabilisedNOI).toBeCloseTo(4_620_000, 0);
      // Value = 4.62M / 10% = 46.2M.
      expect(r.grossDevelopmentValue).toBeCloseTo(46_200_000, 0);
      // Grant = 200*150k = 30M; cost = 150M; net cost = 120M.
      expect(r.capitalGrant).toBe(30_000_000);
      expect(r.netCostAfterGrant).toBe(120_000_000);
      // Dev yield on net cost = 4.62M/120M = 3.85%.
      expect(r.developmentYield).toBeCloseTo(3.85, 1);
    });

    it('flags rentals above the SHRA primary-market ceiling', () => {
      const r = buildAffordableRentalModel({
        numberOfUnits: 50,
        rentPerUnitPerMonth: 5_000,
        vacancyRate: 0.05,
        operatingCostPerUnitPerMonth: 1_500,
        exitCapRate: 10,
        landCost: 5_000_000,
        constructionCost: 40_000_000,
        contingencyPercent: 0,
        rentalBandCeiling: 4_500,
      });
      expect(r.rentWithinBand).toBe(false);
      expect(r.notes.join(' ')).toMatch(/ceiling/i);
    });
  });

  describe('assessGreenfieldFeasibility — unified go/no-go gate', () => {
    const model = buildAffordableHousingModel({
      numberOfUnits: 100,
      sellingPricePerUnit: 600_000,
      landCost: 5_000_000,
      constructionCostPerUnit: 350_000,
      contingencyPercent: 0,
    });

    it('clears construction only when every gate passes', () => {
      const r = assessGreenfieldFeasibility({
        model,
        minProfitOnCost: 15,
        requiredProfessionals: ['TOWN_PLANNER', 'QUANTITY_SURVEYOR'],
        appointedProfessionals: ['TOWN_PLANNER', 'QUANTITY_SURVEYOR'],
        requiredApprovals: ['REZONING', 'BUILDING_PLANS'],
        approvedApprovals: ['REZONING', 'BUILDING_PLANS'],
        committedFunding: 50_000_000,
        peakFunding: 40_000_000,
      });
      expect(r.constructionReady).toBe(true);
      expect(r.readinessScore).toBe(100);
    });

    it('blocks and reports every missing precondition', () => {
      const r = assessGreenfieldFeasibility({
        model,
        minProfitOnCost: 15,
        requiredProfessionals: ['TOWN_PLANNER', 'QUANTITY_SURVEYOR', 'CIVIL_ENGINEER'],
        appointedProfessionals: ['TOWN_PLANNER'],
        requiredApprovals: ['REZONING', 'BUILDING_PLANS'],
        approvedApprovals: ['REZONING'],
        committedFunding: 30_000_000,
        peakFunding: 40_000_000,
      });
      expect(r.constructionReady).toBe(false);
      expect(r.missingProfessionals).toContain('CIVIL_ENGINEER');
      expect(r.outstandingApprovals).toContain('BUILDING_PLANS');
      expect(r.fundingShortfall).toBe(10_000_000);
      expect(r.readinessScore).toBeLessThan(100);
    });
  });
});
