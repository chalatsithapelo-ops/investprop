import { describe, it, expect } from 'vitest';
import {
  calculateRentalROI,
  calculateFlipProfit,
  calculateDevelopmentROI,
  calculateMortgagePayment,
  calculateCapRate,
} from '../financial-calculations';

describe('Financial Calculations', () => {
  describe('calculateRentalROI', () => {
    it('should calculate correct ROI for rental property', () => {
      const result = calculateRentalROI({
        purchasePrice: 500000,
        downPayment: 100000,
        monthlyRent: 3000,
        monthlyExpenses: 1000,
        appreciationRate: 3,
        holdingPeriod: 10,
      });

      expect(result.cashOnCashReturn).toBeCloseTo(24, 0); // 24% annual return
      expect(result.totalROI).toBeGreaterThan(100); // Should be positive
      expect(result.breakEvenMonths).toBeGreaterThan(0);
      expect(result.netAnnualIncome).toBe(24000); // (3000-1000) * 12
    });

    it('should handle zero down payment', () => {
      const result = calculateRentalROI({
        purchasePrice: 500000,
        downPayment: 0,
        monthlyRent: 3000,
        monthlyExpenses: 1000,
        appreciationRate: 3,
        holdingPeriod: 10,
      });

      expect(result.cashOnCashReturn).toBe(0);
      expect(result.totalROI).toBe(0);
    });

    it('should handle negative cash flow', () => {
      const result = calculateRentalROI({
        purchasePrice: 500000,
        downPayment: 100000,
        monthlyRent: 500,
        monthlyExpenses: 1000,
        appreciationRate: 3,
        holdingPeriod: 10,
      });

      expect(result.netAnnualIncome).toBeLessThan(0);
      expect(result.cashOnCashReturn).toBeLessThan(0);
    });
  });

  describe('calculateFlipProfit', () => {
    it('should calculate correct profit for property flip', () => {
      const result = calculateFlipProfit({
        purchasePrice: 300000,
        rehabCost: 50000,
        arv: 450000,
        holdingCosts: 5000,
        closingCosts: 15000,
      });

      expect(result.profit).toBe(80000); // 450000 - 300000 - 50000 - 5000 - 15000
      expect(result.roi).toBeCloseTo(21.62, 1); // (80000 / 370000) * 100
      expect(result.totalInvestment).toBe(370000);
    });

    it('should handle losing scenario', () => {
      const result = calculateFlipProfit({
        purchasePrice: 400000,
        rehabCost: 100000,
        arv: 450000,
        holdingCosts: 10000,
        closingCosts: 20000,
      });

      expect(result.profit).toBeLessThan(0);
      expect(result.roi).toBeLessThan(0);
    });
  });

  describe('calculateDevelopmentROI', () => {
    it('should calculate correct ROI for development project', () => {
      const result = calculateDevelopmentROI({
        landCost: 500000,
        constructionCost: 2000000,
        professionalFees: 200000,
        contingency: 100000,
        expectedSalePrice: 3500000,
        holdingPeriod: 24,
      });

      expect(result.profit).toBe(700000); // 3500000 - 2800000
      expect(result.roi).toBeCloseTo(25, 0); // (700000 / 2800000) * 100
      expect(result.totalCost).toBe(2800000);
    });

    it('should handle break-even scenario', () => {
      const result = calculateDevelopmentROI({
        landCost: 500000,
        constructionCost: 2000000,
        professionalFees: 200000,
        contingency: 100000,
        expectedSalePrice: 2800000,
        holdingPeriod: 24,
      });

      expect(result.profit).toBe(0);
      expect(result.roi).toBe(0);
    });
  });

  describe('calculateMortgagePayment', () => {
    it('should calculate correct monthly mortgage payment', () => {
      const payment = calculateMortgagePayment({
        principal: 400000,
        annualRate: 6,
        years: 30,
      });

      expect(payment).toBeCloseTo(2398.20, 1); // Standard 30-year mortgage calculation
    });

    it('should handle zero interest rate', () => {
      const payment = calculateMortgagePayment({
        principal: 400000,
        annualRate: 0,
        years: 30,
      });

      expect(payment).toBeCloseTo(1111.11, 1); // 400000 / (30*12)
    });

    it('should handle short-term loan', () => {
      const payment = calculateMortgagePayment({
        principal: 100000,
        annualRate: 5,
        years: 1,
      });

      expect(payment).toBeGreaterThan(8000); // Should be high for 1-year term
    });
  });

  describe('calculateCapRate', () => {
    it('should calculate correct capitalization rate', () => {
      const capRate = calculateCapRate({
        noi: 50000,
        propertyValue: 1000000,
      });

      expect(capRate).toBe(5); // (50000 / 1000000) * 100
    });

    it('should handle high NOI', () => {
      const capRate = calculateCapRate({
        noi: 120000,
        propertyValue: 1000000,
      });

      expect(capRate).toBe(12);
    });

    it('should handle zero property value', () => {
      const capRate = calculateCapRate({
        noi: 50000,
        propertyValue: 0,
      });

      expect(capRate).toBe(0);
    });

    it('should handle negative NOI', () => {
      const capRate = calculateCapRate({
        noi: -10000,
        propertyValue: 1000000,
      });

      expect(capRate).toBe(-1);
    });
  });
});
