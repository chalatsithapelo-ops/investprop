import { useEffect } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";
import {
  calculateDevelopmentMetrics,
  type PropertyDevelopmentInput,
} from "~/financial-calculations";

/**
 * Custom hook for automatically calculating development property financial metrics.
 * Watches development-specific form fields and updates calculated fields when base values change.
 * Handles both sale-focused and rental-focused developments.
 * 
 * @param watch - React Hook Form watch function
 * @param setValue - React Hook Form setValue function
 * @param isDevelopment - Whether the current property type is a development
 */
export function useDevelopmentCalculations(
  watch: UseFormWatch<any>,
  setValue: UseFormSetValue<any>,
  isDevelopment: boolean
) {
  useEffect(() => {
    if (!isDevelopment) return;

    const subscription = watch((value, { name }) => {
      // Only recalculate if one of the base fields changed
      const devBaseFields = [
        "landAcquisitionCost",
        "hardCosts",
        "softCosts",
        "financingCosts",
        "contingencyPercent",
        "numberOfUnits",
        "expectedSalePricePerUnit",
        "expectedMonthlyRentPerUnit",
        "annualOperatingExpenses",
        "totalSquareMeters",
        "developmentType",
      ];

      if (name && devBaseFields.includes(name)) {
        const baseCosts =
          (value.landAcquisitionCost || 0) +
          (value.hardCosts || 0) +
          (value.softCosts || 0) +
          (value.financingCosts || 0);

        const contingencyPercent = value.contingencyPercent !== undefined ? value.contingencyPercent : 10;
        const contingencyAmount = baseCosts * (contingencyPercent / 100);

        const currentDevType = value.developmentType || "AFFORDABLE_RESALE";

        const devInput: PropertyDevelopmentInput = {
          developmentType: currentDevType as "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL",
          landAcquisitionCost: value.landAcquisitionCost || 0,
          hardCosts: value.hardCosts || 0,
          softCosts: value.softCosts || 0,
          financingCosts: value.financingCosts || 0,
          contingencyPercent,
          contingencyAmount,
          expectedSalePricePerUnit: value.expectedSalePricePerUnit || 0,
          totalExpectedRevenue: value.totalExpectedRevenue || 0,
          expectedProfit: value.expectedProfit || 0,
          expectedMonthlyRentPerUnit: value.expectedMonthlyRentPerUnit || 0,
          annualOperatingExpenses: value.annualOperatingExpenses || 0,
          stabilizedCapRate: value.stabilizedCapRate || 0,
          expectedGrossYield: value.expectedGrossYield || 0,
          expectedNetYield: value.expectedNetYield || 0,
          expectedROI: value.developmentExpectedROI || 0,
          expectedIRR: value.expectedIRR || 0,
          developmentTimelineMonths: value.developmentTimelineMonths || 0,
          preSaleUnits: value.preSaleUnits || 0,
          costPerSquareMeter: value.costPerSquareMeter || 0,
          totalSquareMeters: value.totalSquareMeters || 0,
          numberOfUnits: value.numberOfUnits || 0,
          totalBudget: value.totalBudget || 0,
        };

        const calculations = calculateDevelopmentMetrics(devInput);

        // Update calculated fields
        setValue("contingencyAmount", parseFloat(contingencyAmount.toFixed(2)));

        if (currentDevType === "AFFORDABLE_RESALE") {
          // Sale-focused development calculations
          if (devInput.numberOfUnits > 0 && devInput.expectedSalePricePerUnit > 0) {
            const totalRevenue = devInput.numberOfUnits * devInput.expectedSalePricePerUnit;
            setValue("totalExpectedRevenue", parseFloat(totalRevenue.toFixed(2)));

            const expectedProfit = totalRevenue - calculations.totalCosts;
            setValue("expectedProfit", parseFloat(expectedProfit.toFixed(2)));

            if (calculations.totalCosts > 0) {
              const roi = (expectedProfit / calculations.totalCosts) * 100;
              setValue("developmentExpectedROI", parseFloat(roi.toFixed(2)));
            }
          }
        } else {
          // Rental-focused development calculations
          if (calculations.annualGrossRentalIncome !== undefined) {
            setValue("stabilizedCapRate", parseFloat((calculations.calculatedCapRate || 0).toFixed(2)));
            setValue("expectedGrossYield", parseFloat((calculations.calculatedGrossYield || 0).toFixed(2)));
            setValue("expectedNetYield", parseFloat((calculations.calculatedNetYield || 0).toFixed(2)));

            // For rental developments, ROI can be based on cap rate
            if (calculations.calculatedCapRate) {
              setValue("developmentExpectedROI", parseFloat(calculations.calculatedCapRate.toFixed(2)));
            }
          }
        }

        // Calculate cost per square meter
        if (devInput.totalSquareMeters > 0) {
          const costPerSqM = calculations.totalCosts / devInput.totalSquareMeters;
          setValue("costPerSquareMeter", parseFloat(costPerSqM.toFixed(2)));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isDevelopment, watch, setValue]);
}
