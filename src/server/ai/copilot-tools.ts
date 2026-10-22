/**
 * Agentic co-pilot tools.
 *
 * Exposes the platform's verified financial calculators to the deal co-pilot as
 * AI-SDK tools. When an investor asks a "what if the numbers were…" question,
 * the model calls these instead of hallucinating arithmetic, so every figure it
 * quotes is computed by the same functions that power the rest of the app.
 *
 * All tools are pure and self-contained (no DB / auth) — they only transform the
 * numbers the model passes in, which it draws from the grounded property context.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  calculateTransferDuty,
  calculateMonthlyDebtService,
  calculateAnnualGrossRent,
  calculateNOI,
  calculateCapRate,
  calculateMonthlyCashFlow,
} from "~/financial-calculations";

const round = (n: number) => Math.round(n * 100) / 100;

export const financialTools = {
  transfer_duty: tool({
    description:
      "Calculate South African property transfer duty (SARS 2025/26 brackets) on a purchase price in Rand. Returns the duty payable.",
    parameters: z.object({
      purchasePrice: z.number().positive().describe("Property purchase price in Rand"),
    }),
    execute: async ({ purchasePrice }) => {
      const duty = calculateTransferDuty(purchasePrice);
      return { purchasePrice, transferDuty: round(duty), note: "Excludes conveyancing fees, deeds-office and VAT." };
    },
  }),

  bond_repayment: tool({
    description:
      "Calculate the monthly home-loan (bond) repayment using standard amortisation. Use for affordability and leverage questions.",
    parameters: z.object({
      loanAmount: z.number().positive().describe("Loan / bond amount in Rand"),
      annualInterestRatePct: z.number().positive().describe("Annual nominal interest rate, e.g. 11.75 for 11.75%"),
      loanTermYears: z.number().positive().describe("Loan term in years, typically 20"),
    }),
    execute: async ({ loanAmount, annualInterestRatePct, loanTermYears }) => {
      const monthly = calculateMonthlyDebtService(loanAmount, annualInterestRatePct, loanTermYears);
      return {
        loanAmount,
        annualInterestRatePct,
        loanTermYears,
        monthlyRepayment: round(monthly),
        totalRepaid: round(monthly * loanTermYears * 12),
        totalInterest: round(monthly * loanTermYears * 12 - loanAmount),
      };
    },
  }),

  rental_yield: tool({
    description:
      "Calculate rental investment metrics (NOI, cap rate, monthly cash flow) from monthly rent, purchase price, and optional annual operating expenses, vacancy rate and annual bond repayment.",
    parameters: z.object({
      monthlyRent: z.number().positive().describe("Gross monthly rent in Rand"),
      purchasePrice: z.number().positive().describe("Purchase price in Rand"),
      annualOperatingExpenses: z
        .number()
        .min(0)
        .optional()
        .describe("Annual operating expenses (rates, levies, insurance, maintenance). Defaults to 0."),
      vacancyRatePct: z.number().min(0).max(100).optional().describe("Expected vacancy rate %. Defaults to 0."),
      annualDebtService: z
        .number()
        .min(0)
        .optional()
        .describe("Annual bond repayment (monthly × 12) if leveraged. Defaults to 0 (cash purchase)."),
    }),
    execute: async ({ monthlyRent, purchasePrice, annualOperatingExpenses = 0, vacancyRatePct = 0, annualDebtService = 0 }) => {
      const annualGrossRent = calculateAnnualGrossRent(monthlyRent);
      const noi = calculateNOI(annualGrossRent, vacancyRatePct, annualOperatingExpenses);
      const capRate = calculateCapRate(noi, purchasePrice);
      const monthlyCashFlow = calculateMonthlyCashFlow(noi, annualDebtService);
      return {
        annualGrossRent: round(annualGrossRent),
        netOperatingIncome: round(noi),
        capRatePct: round(capRate),
        monthlyCashFlow: round(monthlyCashFlow),
      };
    },
  }),

  flip_roi: tool({
    description:
      "Calculate the profit and ROI of a buy-renovate-sell (flip) deal from purchase price, renovation cost, other holding/selling costs, and expected sale price. Transfer duty on the purchase is included automatically.",
    parameters: z.object({
      purchasePrice: z.number().positive().describe("Purchase price in Rand"),
      renovationCost: z.number().min(0).describe("Renovation / refurbishment budget in Rand"),
      otherCosts: z.number().min(0).optional().describe("Other holding + selling costs (agent, legal, interest). Defaults to 0."),
      expectedSalePrice: z.number().positive().describe("Expected resale price in Rand"),
    }),
    execute: async ({ purchasePrice, renovationCost, otherCosts = 0, expectedSalePrice }) => {
      const transferDuty = calculateTransferDuty(purchasePrice);
      const totalInvestment = purchasePrice + renovationCost + otherCosts + transferDuty;
      const profit = expectedSalePrice - totalInvestment;
      const roiPct = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
      return {
        totalInvestment: round(totalInvestment),
        transferDuty: round(transferDuty),
        grossProfit: round(profit),
        roiPct: round(roiPct),
        note: "Before income tax on profit. Confirm costs with the sponsor.",
      };
    },
  }),

  fractional_return: tool({
    description:
      "Project the return on a fractional investment amount given the deal's expected annual return percentage and a holding period in years (simple, non-compounded).",
    parameters: z.object({
      investmentAmount: z.number().positive().describe("Amount the investor puts in, in Rand"),
      expectedAnnualReturnPct: z.number().describe("Deal's expected annual return %, e.g. 14 for 14%"),
      years: z.number().positive().optional().describe("Holding period in years. Defaults to 1."),
    }),
    execute: async ({ investmentAmount, expectedAnnualReturnPct, years = 1 }) => {
      const annualProfit = (investmentAmount * expectedAnnualReturnPct) / 100;
      const totalProfit = annualProfit * years;
      return {
        investmentAmount,
        years,
        annualProfit: round(annualProfit),
        totalProfit: round(totalProfit),
        projectedValue: round(investmentAmount + totalProfit),
        note: "Projection only, not guaranteed. Returns depend on deal performance.",
      };
    },
  }),
};
