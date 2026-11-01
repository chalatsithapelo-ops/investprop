import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Plain-language explanations of the financial jargon investors see across the
/// app. Mirrors the web glossary so both platforms teach the same definitions.
class FinancialTerms {
  const FinancialTerms._();

  static const Map<String, (String, String, String?)> _terms = {
    // key: (term, explanation, formula?)
    'capRate': (
      'Capitalisation Rate (Cap Rate)',
      'The yearly net rental income divided by the property price, shown as a '
          'percentage. It tells you the return on the property itself, ignoring '
          'any loan. A higher cap rate usually means more income for the price — '
          'but often more risk too.',
      'Cap Rate = Net Operating Income ÷ Property Value',
    ),
    'noi': (
      'Net Operating Income (NOI)',
      'The rent left over each year after paying running costs like rates, '
          'levies, insurance, maintenance and management — but before any '
          'bond/loan repayments and tax.',
      'NOI = Annual Rent − Operating Expenses',
    ),
    'grossYield': (
      'Gross Rental Yield',
      "The full year's rent as a percentage of the property price, before any "
          'costs are deducted. A quick headline number — net yield (after costs) '
          'is what you actually earn.',
      'Gross Yield = Annual Rent ÷ Property Price',
    ),
    'netYield': (
      'Net Rental Yield',
      "The year's rent as a percentage of the property price after deducting "
          'running costs. A truer picture of the income return than gross yield.',
      'Net Yield = (Annual Rent − Costs) ÷ Property Price',
    ),
    'roi': (
      'Return on Investment (ROI)',
      'Your total profit as a percentage of the cash you put in. It combines '
          'rental income and any increase in the property value.',
      'ROI = Total Profit ÷ Cash Invested',
    ),
    'cashOnCash': (
      'Cash-on-Cash Return',
      'The yearly cash profit (after the bond/loan repayment) as a percentage '
          'of the actual cash you invested — your deposit and fees.',
      'Cash-on-Cash = Annual Cash Flow ÷ Cash Invested',
    ),
    'irr': (
      'Internal Rate of Return (IRR)',
      'A single yearly percentage that captures the whole journey of an '
          'investment — money in, income along the way, and the final sale — '
          'accounting for the timing of each cash flow.',
      'The annualised return that makes all cash flows break even',
    ),
    'dscr': (
      'Debt Service Coverage Ratio (DSCR)',
      'How comfortably the rental income covers the bond/loan repayment. Above '
          '1.2 is generally considered safe; below 1.0 means rent cannot cover '
          'the loan.',
      'DSCR = Net Operating Income ÷ Annual Loan Repayment',
    ),
    'moic': (
      'Equity Multiple (MOIC)',
      'How many times your money comes back. A 1.5× multiple means for every R1 '
          'you put in you get R1.50 back in total. Above 1× is a profit; below '
          '1× is a loss. It ignores how long it took — pair it with the '
          'annualised return.',
      'Equity Multiple = Total Cash Returned ÷ Cash Invested',
    ),
    'annualisedReturn': (
      'Annualised Return',
      'The profit expressed as a yearly rate, so deals of different lengths can '
          'be compared fairly. A 15% profit in 6 months is far better than the '
          'same 15% over 3 years.',
      '(1 + Profit ÷ Invested) ^ (12 ÷ months) − 1',
    ),
    'preferredReturn': (
      'Preferred Return',
      'A minimum yearly return investors are paid out of profit before the '
          'sponsor/manager earns any share of the upside. It puts investors '
          'first in the queue for profit.',
      'Preferred = Capital × Preferred Rate × Years',
    ),
    'promote': (
      'Promote (Carried Interest)',
      'The share of profit the sponsor/manager keeps for running the deal — but '
          'only after investors have had their capital back plus the preferred '
          'return.',
      'Promote = Residual Profit × Manager Share',
    ),
    'gearing': (
      'Gearing (Using a Loan to Invest)',
      'Funding part of your investment with a bank loan instead of your own '
          'cash. It can magnify your return on the cash you put down — but it '
          'magnifies losses too, and you pay interest whatever happens.',
      'Return on Own Cash = Net Proceeds ÷ (Investment − Loan)',
    ),
    'netProceeds': (
      'Net Proceeds',
      'The actual cash you walk away with at the end — your capital plus profit, '
          'after platform fees, estimated tax, and after settling any loan you '
          'used to invest.',
      'Net Proceeds = Payout − Fees − Tax − Loan Settled',
    ),
    'scenarioBands': (
      'Downside / Base / Upside',
      'Three what-if outcomes. Base is the plan going as expected. Downside '
          'stresses the deal (costs up, prices/rent down). Upside shows a '
          'better-than-planned result. Always weigh the downside.',
      'Stress-tested ranges, not guarantees',
    ),
    'investorStrategy': (
      'Your Investment Strategy',
      'Your own plan for this investment, which can differ from the platform\'s. '
          'For example, if the platform plans to hold for 5 years, you might '
          'choose to exit after 3 by selling your shares. Your projected returns '
          'adjust to the strategy and hold period you pick.',
      'Return depends on strategy + hold period',
    ),
  };

  static (String, String, String?)? lookup(String key) => _terms[key];
}

/// A small tappable "ⓘ" icon that opens a plain-language explanation of a
/// financial term in a bottom sheet.
class InfoTip extends StatelessWidget {
  const InfoTip({super.key, required this.term, this.size = 15});

  final String term;
  final double size;

  @override
  Widget build(BuildContext context) {
    final entry = FinancialTerms.lookup(term);
    if (entry == null) return const SizedBox.shrink();
    return GestureDetector(
      onTap: () => _show(context, entry),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: Icon(Icons.info_outline, size: size, color: AppColors.gold),
      ),
    );
  }

  void _show(BuildContext context, (String, String, String?) entry) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              entry.$1,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 16,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              entry.$2,
              style: const TextStyle(
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
            if (entry.$3 != null) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  entry.$3!,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: AppColors.gold,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A label with an inline info icon, e.g. "Cap Rate ⓘ".
class LabelWithInfo extends StatelessWidget {
  const LabelWithInfo({
    super.key,
    required this.label,
    required this.term,
    this.style,
  });

  final String label;
  final String term;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(child: Text(label, style: style)),
        InfoTip(term: term),
      ],
    );
  }
}
