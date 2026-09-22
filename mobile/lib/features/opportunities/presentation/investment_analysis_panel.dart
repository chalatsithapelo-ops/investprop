import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/financial_calculations.dart';
import '../../../core/format.dart';
import '../domain/opportunity.dart';

/// Investment-analysis panel shown on the opportunity detail page. Mirrors the
/// web app's strategy-branched analysis (flip / rental / development) using the
/// exact same pure financial calculations.
class InvestmentAnalysisPanel extends StatelessWidget {
  const InvestmentAnalysisPanel({super.key, required this.opportunity});

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    final o = opportunity;
    if (o.flipInput != null) {
      return _FlipAnalysis(input: o.flipInput!, preferredReturn: o.preferredReturn);
    }
    if (o.rentalInput != null) {
      return _RentalAnalysis(
        input: o.rentalInput!,
        preferredReturn: o.preferredReturn,
      );
    }
    if (o.developmentInput != null) {
      return _DevelopmentAnalysis(
        input: o.developmentInput!,
        preferredReturn: o.preferredReturn,
      );
    }
    return const SizedBox.shrink();
  }
}

// ============================================================================
// FLIP
// ============================================================================

class _FlipAnalysis extends StatelessWidget {
  const _FlipAnalysis({required this.input, this.preferredReturn});

  final PropertyFlipInput input;
  final double? preferredReturn;

  @override
  Widget build(BuildContext context) {
    final c = calculateFlipMetrics(input);
    return _AnalysisCard(
      title: 'Property Flip — Investment Analysis',
      subtitle: 'Buy, renovate and sell strategy',
      children: [
        const _SectionLabel('Key investment metrics'),
        _MetricRow('Total investment required', Fmt.money(c.totalInvestment)),
        _MetricRow('After repair value (ARV)', Fmt.money(c.resaleValue)),
        _MetricRow(
          'Expected profit',
          Fmt.money(c.expectedProfit),
          valueColor: c.expectedProfit >= 0 ? AppColors.success : AppColors.danger,
        ),
        _MetricRow(
          'Return on investment (ROI)',
          Fmt.percent(c.displayROI),
          valueColor: c.displayROI >= 0 ? AppColors.success : AppColors.danger,
        ),
        _MetricRow('Annualised return', Fmt.percent(c.annualisedROI)),
        _MetricRow('Break-even price', Fmt.money(c.breakEvenPrice)),
        _MetricRow(
          'Margin of safety',
          Fmt.percent(c.marginOfSafety),
          valueColor: c.marginOfSafety >= 0 ? AppColors.success : AppColors.danger,
        ),
        const SizedBox(height: 16),
        const _SectionLabel('Cost breakdown'),
        _MetricRow('Purchase price', Fmt.money(input.purchasePrice)),
        _MetricRow('Renovation budget', Fmt.money(input.renovationBudget)),
        _MetricRow('Holding costs', Fmt.money(input.holdingCosts)),
        _MetricRow('Closing costs (purchase)', Fmt.money(input.closingCostsPurchase)),
        _MetricRow('Closing costs (sale)', Fmt.money(input.closingCostsSale)),
        _MetricRow('Total investment', Fmt.money(c.totalInvestment), emphasize: true),
        _MetricRow(
          'Est. SARS transfer duty',
          Fmt.money(c.estimatedTransferDuty),
          muted: true,
        ),
        const SizedBox(height: 16),
        const _SectionLabel('Fees & net returns'),
        _MetricRow('2% management fee', Fmt.money(c.totalInvestment * 0.02)),
        _MetricRow('Est. income tax (27%)', Fmt.money(c.estimatedIncomeTax), muted: true),
        _MetricRow(
          'Net profit after fees & tax',
          Fmt.money(c.netProfitAfterFeesAndTax),
          emphasize: true,
          valueColor: c.netProfitAfterFeesAndTax >= 0
              ? AppColors.success
              : AppColors.danger,
        ),
        _MetricRow(
          'Preferred return',
          preferredReturn != null ? Fmt.percent(preferredReturn!) : '8–10%',
        ),
        const SizedBox(height: 16),
        _SensitivityTable(rows: [
          _SensitivityRow('Resale −10%',
              (c.resaleValue * 0.9) - c.breakEvenPrice),
          _SensitivityRow('Resale as planned', c.expectedProfit),
          _SensitivityRow('Resale +10%',
              (c.resaleValue * 1.1) - c.breakEvenPrice),
        ]),
        const SizedBox(height: 16),
        const _WaterfallNote(),
      ],
    );
  }
}

// ============================================================================
// RENTAL
// ============================================================================

class _RentalAnalysis extends StatelessWidget {
  const _RentalAnalysis({required this.input, this.preferredReturn});

  final RentalPropertyInput input;
  final double? preferredReturn;

  @override
  Widget build(BuildContext context) {
    final c = calculateRentalMetrics(input);
    final leveraged = input.monthlyDebtService > 0;
    return _AnalysisCard(
      title: 'Rental Property — Investment Analysis',
      subtitle: 'Buy-and-hold rental generating monthly income',
      children: [
        const _SectionLabel('Income & returns'),
        _MetricRow('Monthly rental income', Fmt.money(input.monthlyRent)),
        _MetricRow('Annual gross rent', Fmt.money(c.annualGrossRent)),
        _MetricRow('Net operating income (NOI)', Fmt.money(c.noi)),
        _MetricRow(
          'Monthly cash flow',
          Fmt.money(c.monthlyCashFlow),
          valueColor: c.monthlyCashFlow >= 0 ? AppColors.success : AppColors.danger,
        ),
        const SizedBox(height: 16),
        const _SectionLabel('Yield & return analysis'),
        _MetricRow('Gross yield', Fmt.percent(c.grossYield)),
        _MetricRow('Net yield', Fmt.percent(c.netYield)),
        _MetricRow('Cap rate', Fmt.percent(c.displayCapRate)),
        _MetricRow('Cap rate on total cost', Fmt.percent(c.capRateOnCost)),
        _MetricRow(
          'Cash-on-cash return',
          Fmt.percent(c.cashOnCashReturn),
          valueColor: _tone(c.cashOnCashReturn, 8, 4),
        ),
        _MetricRow('Gross rent multiplier', c.grossRentMultiplier.toStringAsFixed(1)),
        if (leveraged)
          _MetricRow(
            'DSCR',
            c.dscr.toStringAsFixed(2),
            valueColor: _tone(c.dscr, 1.2, 1),
          ),
        _MetricRow(
          'Preferred return',
          preferredReturn != null ? Fmt.percent(preferredReturn!) : '8–10%',
        ),
        const SizedBox(height: 16),
        const _SectionLabel('Annual expenses'),
        _MetricRow('Property tax', Fmt.money(input.annualPropertyTax)),
        _MetricRow('Insurance', Fmt.money(input.annualInsurance)),
        _MetricRow('HOA / levies', Fmt.money(input.monthlyHOAFees * 12)),
        _MetricRow('Maintenance reserve', Fmt.money(input.monthlyMaintenanceReserve * 12)),
        _MetricRow('Utilities', Fmt.money(input.monthlyUtilities * 12)),
        _MetricRow('Management fee', Fmt.money(input.monthlyManagementFee * 12)),
        _MetricRow(
          'Total operating expenses',
          Fmt.money(c.annualOperatingExpenses),
          emphasize: true,
        ),
        _MetricRow(
          'Est. SARS transfer duty',
          Fmt.money(c.estimatedTransferDuty),
          muted: true,
        ),
      ],
    );
  }
}

// ============================================================================
// DEVELOPMENT
// ============================================================================

class _DevelopmentAnalysis extends StatelessWidget {
  const _DevelopmentAnalysis({required this.input, this.preferredReturn});

  final PropertyDevelopmentInput input;
  final double? preferredReturn;

  @override
  Widget build(BuildContext context) {
    final c = calculateDevelopmentMetrics(input);
    final isResale = input.developmentType == DevelopmentType.affordableResale;
    return _AnalysisCard(
      title: isResale
          ? 'Development — Investment Analysis'
          : 'Rental Development — Investment Analysis',
      subtitle:
          '${input.numberOfUnits.toStringAsFixed(0)} unit development project. '
          'Estimated completion: ${input.developmentTimelineMonths.toStringAsFixed(0)} months.',
      children: [
        const _SectionLabel('Key investment metrics'),
        _MetricRow('Total development cost', Fmt.money(c.totalCosts)),
        _MetricRow(
          'Profit margin',
          Fmt.percent(c.profitMargin),
          valueColor: c.profitMargin >= 0 ? AppColors.success : AppColors.danger,
        ),
        _MetricRow('Cost per unit', Fmt.money(c.costPerUnit)),
        if (input.expectedROI > 0)
          _MetricRow("Manager's target ROI", Fmt.percent(input.expectedROI), muted: true),
        if (input.expectedIRR > 0)
          _MetricRow("Manager's target IRR", Fmt.percent(input.expectedIRR), muted: true),
        _MetricRow(
          'Preferred return',
          preferredReturn != null ? Fmt.percent(preferredReturn!) : '8–12%',
        ),
        if (isResale) ...[
          const SizedBox(height: 16),
          const _SectionLabel('Sale projections'),
          _MetricRow('Sale price per unit', Fmt.money(input.expectedSalePricePerUnit)),
          _MetricRow(
            'Gross development value',
            Fmt.money(c.grossDevelopmentValue ?? 0),
          ),
          _MetricRow(
            'Expected profit',
            Fmt.money(c.derivedProfit ?? 0),
            emphasize: true,
            valueColor: (c.derivedProfit ?? 0) >= 0
                ? AppColors.success
                : AppColors.danger,
          ),
          _MetricRow('Return on investment', Fmt.percent(c.derivedROI ?? 0)),
          _MetricRow('Annualised return', Fmt.percent(c.annualisedROI ?? 0)),
          _MetricRow(
            'Pre-sold units',
            '${input.preSaleUnits.toStringAsFixed(0)} of '
                '${input.numberOfUnits.toStringAsFixed(0)} '
                '(${c.preSalePercentage.toStringAsFixed(0)}%)',
          ),
        ] else ...[
          const SizedBox(height: 16),
          const _SectionLabel('Rental projections'),
          _MetricRow('Monthly rent per unit', Fmt.money(input.expectedMonthlyRentPerUnit)),
          _MetricRow(
            'Annual gross rental income',
            Fmt.money(c.annualGrossRentalIncome ?? 0),
          ),
          _MetricRow('NOI', Fmt.money(c.noi ?? 0)),
          _MetricRow('Cap rate', Fmt.percent(c.calculatedCapRate ?? 0)),
          _MetricRow('Gross yield', Fmt.percent(c.calculatedGrossYield ?? 0)),
          _MetricRow('Net yield', Fmt.percent(c.calculatedNetYield ?? 0)),
        ],
        const SizedBox(height: 16),
        const _SectionLabel('Cost breakdown'),
        _MetricRow('Land acquisition', Fmt.money(input.landAcquisitionCost)),
        _MetricRow('Construction (hard costs)', Fmt.money(input.hardCosts)),
        _MetricRow('Professional fees (soft costs)', Fmt.money(input.softCosts)),
        _MetricRow('Financing costs', Fmt.money(input.financingCosts)),
        _MetricRow(
          'Contingency (${input.contingencyPercent.toStringAsFixed(0)}%)',
          Fmt.money(c.contingencyAmount),
        ),
        _MetricRow('Total development cost', Fmt.money(c.totalCosts), emphasize: true),
        if (isResale) ...[
          const SizedBox(height: 8),
          const Text(
            'New-build residential sales are generally subject to 15% VAT '
            '(not transfer duty).',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
        ],
        if (isResale) ...[
          const SizedBox(height: 16),
          _SensitivityTable(rows: [
            _SensitivityRow('Cost +10% / Revenue −10%',
                ((c.grossDevelopmentValue ?? 0) * 0.9) - (c.totalCosts * 1.1)),
            _SensitivityRow('As planned', c.derivedProfit ?? 0),
            _SensitivityRow('Cost −5% / Revenue +10%',
                ((c.grossDevelopmentValue ?? 0) * 1.1) - (c.totalCosts * 0.95)),
          ]),
        ],
        const SizedBox(height: 16),
        const _WaterfallNote(),
      ],
    );
  }
}

// ============================================================================
// Shared UI pieces
// ============================================================================

Color _tone(double value, double good, double warn) {
  if (value >= good) return AppColors.success;
  if (value >= warn) return AppColors.warning;
  return AppColors.danger;
}

class _AnalysisCard extends StatelessWidget {
  const _AnalysisCard({
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.analytics_outlined, size: 20, color: AppColors.gold),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow(
    this.label,
    this.value, {
    this.emphasize = false,
    this.muted = false,
    this.valueColor,
  });

  final String label;
  final String value;
  final bool emphasize;
  final bool muted;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: muted ? AppColors.textSecondary : AppColors.textPrimary,
                fontWeight: emphasize ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: emphasize ? FontWeight.w700 : FontWeight.w600,
              color: valueColor ??
                  (muted ? AppColors.textSecondary : AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _SensitivityRow {
  const _SensitivityRow(this.label, this.value);
  final String label;
  final double value;
}

class _SensitivityTable extends StatelessWidget {
  const _SensitivityTable({required this.rows});
  final List<_SensitivityRow> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionLabel('Profit sensitivity'),
          ...rows.map(
            (r) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      r.label,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  Text(
                    Fmt.money(r.value),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: r.value >= 0 ? AppColors.success : AppColors.danger,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WaterfallNote extends StatelessWidget {
  const _WaterfallNote();

  @override
  Widget build(BuildContext context) {
    const steps = [
      'Capital return — investors get capital back first',
      'Deposit recovery — deposits & transaction costs',
      'Preferred return (8–12%) — before manager carry',
      '50/50 profit split — remaining profits shared',
    ];
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.navy,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PROFIT DISTRIBUTION WATERFALL',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppColors.gold,
            ),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${i + 1}. ',
                    style: const TextStyle(
                      color: AppColors.gold,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      steps[i],
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
