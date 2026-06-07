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
});
