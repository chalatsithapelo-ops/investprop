import { z } from "zod";

/**
 * Shared validation for owner-supplied rental financial performance, used by
 * both the owner sale-proposal and land-partnership submission flows. Mirrors
 * {@link RentalFinancialsInput} in `~/financial-calculations`. All fields are
 * optional so partial disclosures are accepted.
 */
export const rentalFinancialsSchema = z
  .object({
    isIncomeProducing: z.boolean().optional(),
    numberOfUnits: z.number().int().min(0).max(100000).optional(),
    occupancyRate: z.number().min(0).max(100).optional(),
    currentMonthlyRent: z.number().min(0).optional(),
    ratesMonthly: z.number().min(0).optional(),
    leviesMonthly: z.number().min(0).optional(),
    insuranceMonthly: z.number().min(0).optional(),
    managementMonthly: z.number().min(0).optional(),
    maintenanceMonthly: z.number().min(0).optional(),
    utilitiesMonthly: z.number().min(0).optional(),
    otherOpexMonthly: z.number().min(0).optional(),
    renovationBudget: z.number().min(0).optional(),
    renovationMonths: z.number().int().min(0).max(240).optional(),
    projectedMonthlyRent: z.number().min(0).optional(),
    projectedOccupancyRate: z.number().min(0).max(100).optional(),
    leaseTermMonths: z.number().int().min(0).max(1200).optional(),
    leaseEscalationPct: z.number().min(0).max(100).optional(),
    leaseExpiry: z.string().optional(),
  })
  .optional();
