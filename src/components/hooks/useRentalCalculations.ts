import { useEffect } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";
import {
  calculateRentalMetrics,
  calculateMonthlyDebtService,
  calculateDebtServiceCoverageRatio,
  type RentalPropertyInput,
} from "~/financial-calculations";

/**
 * Custom hook for automatically calculating rental property financial metrics.
 * Watches rental-specific form fields and updates calculated fields when base values change.
 * 
 * @param watch - React Hook Form watch function
 * @param setValue - React Hook Form setValue function
 * @param isRental - Whether the current property type is a rental
 */
export function useRentalCalculations(
  watch: UseFormWatch<any>,
  setValue: UseFormSetValue<any>,
  isRental: boolean
) {
  useEffect(() => {
    if (!isRental) return;

    const subscription = watch((value, { name }) => {
      // Only recalculate if one of the base fields changed
      const rentalBaseFields = [
        "rentalPurchasePrice",
        "monthlyRent",
        "annualPropertyTax",
        "annualInsurance",
        "monthlyHOAFees",
        "monthlyMaintenanceReserve",
        "monthlyUtilities",
        "monthlyManagementFee",
        "vacancyRate",
        "downPaymentAmount",
        "interestRate",
        "loanTermYears",
      ];

      if (name && rentalBaseFields.includes(name)) {
        const purchasePrice = value.rentalPurchasePrice || 0;
        const downPayment = value.downPaymentAmount || 0;
        const interestRate = value.interestRate || 0;
        const loanTerm = value.loanTermYears || 0;

        // Calculate loan amount
        const loanAmount = purchasePrice - downPayment;
        setValue("loanAmount", parseFloat(loanAmount.toFixed(2)));

        // Calculate monthly debt service
        const monthlyDebt = calculateMonthlyDebtService(loanAmount, interestRate, loanTerm);
        setValue("monthlyDebtService", parseFloat(monthlyDebt.toFixed(2)));

        const rentalInput: RentalPropertyInput = {
          purchasePrice: purchasePrice,
          monthlyRent: value.monthlyRent || 0,
          annualPropertyTax: value.annualPropertyTax || 0,
          annualInsurance: value.annualInsurance || 0,
          monthlyHOAFees: value.monthlyHOAFees || 0,
          monthlyMaintenanceReserve: value.monthlyMaintenanceReserve || 0,
          monthlyUtilities: value.monthlyUtilities || 0,
          monthlyManagementFee: value.monthlyManagementFee || 0,
          vacancyRate: value.vacancyRate !== undefined ? value.vacancyRate : 5,
          appreciationRate: value.appreciationRate !== undefined ? value.appreciationRate : 3,
          capRate: value.capRate || 0,
          cashOnCashReturn: value.cashOnCashReturn || 0,
          grossRentMultiplier: value.grossRentMultiplier || 0,
          debtServiceCoverageRatio: value.debtServiceCoverageRatio || 0,
          grossYield: value.grossYield || 0,
          netYield: value.netYield || 0,
          downPaymentAmount: downPayment,
          loanAmount: loanAmount,
          interestRate: interestRate,
          loanTermYears: loanTerm,
          monthlyDebtService: monthlyDebt,
          totalInvestmentBudget: 0,
          spentInvestmentBudget: 0,
        };

        const calculations = calculateRentalMetrics(rentalInput);

        // Update calculated fields
        setValue("capRate", parseFloat(calculations.calculatedCapRate.toFixed(2)));
        setValue("cashOnCashReturn", parseFloat(calculations.cashOnCashReturn.toFixed(2)));
        
        // Calculate gross rent multiplier
        if (calculations.annualGrossRent > 0) {
          const grm = purchasePrice / calculations.annualGrossRent;
          setValue("grossRentMultiplier", parseFloat(grm.toFixed(2)));
        }

        // Calculate DSCR
        const annualDebtService = monthlyDebt * 12;
        const dscr = calculateDebtServiceCoverageRatio(calculations.noi, annualDebtService);
        setValue("debtServiceCoverageRatio", parseFloat(dscr.toFixed(2)));

        // Set gross yield and net yield
        setValue("grossYield", parseFloat(calculations.grossYield.toFixed(2)));
        setValue("netYield", parseFloat(calculations.netYield.toFixed(2)));
      }
    });

    return () => subscription.unsubscribe();
  }, [isRental, watch, setValue]);
}
