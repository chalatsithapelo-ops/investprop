import { useEffect } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";
import {
  calculateFlipMetrics,
  type PropertyFlipInput,
} from "~/financial-calculations";

/**
 * Custom hook for automatically calculating flip property financial metrics.
 * Watches flip-specific form fields and updates calculated fields when base values change.
 *
 * @param watch - React Hook Form watch function
 * @param setValue - React Hook Form setValue function
 * @param isFlip - Whether the current property type is a flip
 */
export function useFlipCalculations(
  watch: UseFormWatch<any>,
  setValue: UseFormSetValue<any>,
  isFlip: boolean
) {
  useEffect(() => {
    if (!isFlip) return;

    const subscription = watch((value, { name }) => {
      // Only recalculate if one of the base fields changed
      const flipBaseFields = [
        "purchasePrice",
        "renovationBudget",
        "estimatedValue",
        "holdingCosts",
        "closingCostsPurchase",
        "closingCostsSale",
        "estimatedRepairCosts",
        "afterRepairValue",
        "maxOfferPrice",
        "daysToComplete",
      ];

      if (name && flipBaseFields.includes(name)) {
        const flipInput: PropertyFlipInput = {
          purchasePrice: value.purchasePrice || 0,
          renovationBudget: value.renovationBudget || 0,
          estimatedValue: value.estimatedValue || 0,
          holdingCosts: value.holdingCosts || 0,
          closingCostsPurchase: value.closingCostsPurchase || 0,
          closingCostsSale: value.closingCostsSale || 0,
          estimatedRepairCosts: value.estimatedRepairCosts || 0,
          afterRepairValue: value.afterRepairValue || 0,
          maxOfferPrice: value.maxOfferPrice || 0,
          expectedROI: value.expectedROI || 0,
          expectedProfitMargin: value.expectedProfitMargin || 0,
          daysToComplete: value.daysToComplete || 0,
          totalInvestmentBudget: 0,
          spentInvestmentBudget: 0,
        };

        const calculations = calculateFlipMetrics(flipInput);

        // Update calculated fields
        setValue("expectedROI", parseFloat(calculations.calculatedROI.toFixed(2)));

        // Profit (value)
        setValue("expectedProfit", parseFloat(calculations.expectedProfit.toFixed(2)));

        // Calculate profit margin if we have estimated value
        if (flipInput.estimatedValue > 0) {
          const profitMargin = (calculations.expectedProfit / flipInput.estimatedValue) * 100;
          setValue("expectedProfitMargin", parseFloat(profitMargin.toFixed(2)));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isFlip, watch, setValue]);
}
