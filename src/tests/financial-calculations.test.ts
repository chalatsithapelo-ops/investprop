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
});
