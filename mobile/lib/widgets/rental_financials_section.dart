import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../core/format.dart';
import '../core/rental_financials.dart';

/// Holds the text controllers for the rental financial-performance form section.
/// The owner/land submission pages create one, dispose it, and read [toInput]
/// on submit. [build] renders the section and live projections.
class RentalFinancialsController {
  final isIncomeProducing = ValueNotifier<bool>(false);
  final numberOfUnits = TextEditingController();
  final occupancyRate = TextEditingController();
  final currentMonthlyRent = TextEditingController();
  final ratesMonthly = TextEditingController();
  final leviesMonthly = TextEditingController();
  final insuranceMonthly = TextEditingController();
  final managementMonthly = TextEditingController();
  final maintenanceMonthly = TextEditingController();
  final utilitiesMonthly = TextEditingController();
  final otherOpexMonthly = TextEditingController();
  final renovationBudget = TextEditingController();
  final renovationMonths = TextEditingController();
  final projectedMonthlyRent = TextEditingController();
  final projectedOccupancyRate = TextEditingController();
  final leaseTermMonths = TextEditingController();
  final leaseEscalationPct = TextEditingController();
  final leaseExpiry = TextEditingController();

  double? _d(TextEditingController c) {
    final t = c.text.trim();
    return t.isEmpty ? null : double.tryParse(t);
  }

  int? _i(TextEditingController c) {
    final t = c.text.trim();
    return t.isEmpty ? null : int.tryParse(t);
  }

  RentalFinancials value() => RentalFinancials(
        isIncomeProducing: isIncomeProducing.value,
        numberOfUnits: _i(numberOfUnits),
        occupancyRate: _d(occupancyRate),
        currentMonthlyRent: _d(currentMonthlyRent),
        ratesMonthly: _d(ratesMonthly),
        leviesMonthly: _d(leviesMonthly),
        insuranceMonthly: _d(insuranceMonthly),
        managementMonthly: _d(managementMonthly),
        maintenanceMonthly: _d(maintenanceMonthly),
        utilitiesMonthly: _d(utilitiesMonthly),
        otherOpexMonthly: _d(otherOpexMonthly),
        renovationBudget: _d(renovationBudget),
        renovationMonths: _i(renovationMonths),
        projectedMonthlyRent: _d(projectedMonthlyRent),
        projectedOccupancyRate: _d(projectedOccupancyRate),
        leaseTermMonths: _i(leaseTermMonths),
        leaseEscalationPct: _d(leaseEscalationPct),
        leaseExpiry: leaseExpiry.text.trim().isEmpty
            ? null
            : leaseExpiry.text.trim(),
      );

  /// API payload (null when not income-producing).
  Map<String, dynamic>? toInput() => value().toInput();

  void dispose() {
    isIncomeProducing.dispose();
    for (final c in [
      numberOfUnits,
      occupancyRate,
      currentMonthlyRent,
      ratesMonthly,
      leviesMonthly,
      insuranceMonthly,
      managementMonthly,
      maintenanceMonthly,
      utilitiesMonthly,
      otherOpexMonthly,
      renovationBudget,
      renovationMonths,
      projectedMonthlyRent,
      projectedOccupancyRate,
      leaseTermMonths,
      leaseEscalationPct,
      leaseExpiry,
    ]) {
      c.dispose();
    }
  }
}

/// Owner-facing inputs + live projections for an income-producing property the
/// owner may want to renovate for higher rent. Used by both submission forms.
class RentalFinancialsSection extends StatefulWidget {
  const RentalFinancialsSection({
    super.key,
    required this.controller,
    required this.baseValue,
  });

  final RentalFinancialsController controller;

  /// Property value used to measure yields (asking price / estimated value).
  final double baseValue;

  @override
  State<RentalFinancialsSection> createState() =>
      _RentalFinancialsSectionState();
}

class _RentalFinancialsSectionState extends State<RentalFinancialsSection> {
  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.apartment_outlined,
                  size: 20, color: AppColors.gold),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Rental financial performance',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'For income-producing buildings — including ones you want to '
            'renovate for higher rent. We use this to build due-diligence '
            'projections.',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 8),
          ValueListenableBuilder<bool>(
            valueListenable: c.isIncomeProducing,
            builder: (context, isOn, _) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: isOn,
                    controlAffinity: ListTileControlAffinity.leading,
                    onChanged: (v) => c.isIncomeProducing.value = v ?? false,
                    title: const Text(
                      'This property earns (or will earn) rental income',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                  if (isOn) ...[
                    _heading('Current income'),
                    _num(c.currentMonthlyRent, 'Gross monthly rent (R)'),
                    _num(c.numberOfUnits, 'Lettable units'),
                    _num(c.occupancyRate, 'Occupancy (%)'),
                    _heading('Monthly operating expenses'),
                    _num(c.ratesMonthly, 'Rates (R)'),
                    _num(c.leviesMonthly, 'Levies (R)'),
                    _num(c.insuranceMonthly, 'Insurance (R)'),
                    _num(c.managementMonthly, 'Management (R)'),
                    _num(c.maintenanceMonthly, 'Maintenance (R)'),
                    _num(c.utilitiesMonthly, 'Utilities (R)'),
                    _num(c.otherOpexMonthly, 'Other (R)'),
                    _heading('Renovation & projected income'),
                    _num(c.renovationBudget, 'Renovation budget (R)'),
                    _num(c.renovationMonths, 'Renovation duration (months)'),
                    _num(c.projectedMonthlyRent, 'Projected monthly rent (R)'),
                    _num(c.projectedOccupancyRate, 'Projected occupancy (%)'),
                    _heading('Current lease (optional)'),
                    _num(c.leaseTermMonths, 'Lease term (months)'),
                    _num(c.leaseEscalationPct, 'Annual escalation (%)'),
                    const SizedBox(height: 12),
                    RentalProjectionsCard(
                      projections: computeRentalProjections(
                        c.value(),
                        widget.baseValue,
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _heading(String t) => Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 4),
        child: Text(
          t.toUpperCase(),
          style: const TextStyle(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w700,
            fontSize: 11,
            letterSpacing: 1,
          ),
        ),
      );

  Widget _num(TextEditingController c, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextFormField(
          controller: c,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: label),
          onChanged: (_) => setState(() {}),
        ),
      );
}

/// Read-only presentation of computed current vs post-renovation projections.
class RentalProjectionsCard extends StatelessWidget {
  const RentalProjectionsCard({super.key, required this.projections});

  final RentalProjections projections;

  @override
  Widget build(BuildContext context) {
    final cur = projections.current;
    final proj = projections.projected;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFECFDF5),
        border: Border.all(color: const Color(0xFFA7F3D0)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.trending_up, size: 16, color: Color(0xFF059669)),
              SizedBox(width: 6),
              Text(
                'Due-diligence projections',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: Color(0xFF065F46),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _headerRow(),
          _row('Gross annual rent', Fmt.money(cur.grossAnnualRent),
              Fmt.money(proj.grossAnnualRent)),
          _row('Operating expenses', Fmt.money(cur.annualOperatingExpenses),
              Fmt.money(proj.annualOperatingExpenses)),
          _row('Net operating income', Fmt.money(cur.noi), Fmt.money(proj.noi)),
          _row('Gross yield', Fmt.percent(cur.grossYield),
              Fmt.percent(proj.grossYield)),
          _row('Net yield', Fmt.percent(cur.netYield),
              Fmt.percent(proj.netYield)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _stat('Reno. budget', Fmt.money(projections.renovationBudget)),
              _stat('Annual NOI uplift', Fmt.money(projections.noiUpliftAnnual),
                  highlight: true),
              _stat('Yield on cost',
                  Fmt.percent(projections.yieldOnCostProjected)),
              _stat('Return on reno.',
                  Fmt.percent(projections.returnOnRenovation),
                  highlight: true),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Indicative, unleveraged projections computed from the figures you '
            'entered and the property value. Subject to Investprop due '
            'diligence and valuation.',
            style: TextStyle(fontSize: 10.5, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _headerRow() => const Padding(
        padding: EdgeInsets.only(bottom: 4),
        child: Row(
          children: [
            Expanded(
              flex: 4,
              child: Text('Metric',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textSecondary)),
            ),
            Expanded(
              flex: 3,
              child: Text('Current',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textSecondary)),
            ),
            Expanded(
              flex: 3,
              child: Text('Post-reno.',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textSecondary)),
            ),
          ],
        ),
      );

  Widget _row(String label, String now, String future) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Expanded(
              flex: 4,
              child: Text(label,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
            ),
            Expanded(
              flex: 3,
              child: Text(now,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary)),
            ),
            Expanded(
              flex: 3,
              child: Text(future,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF047857))),
            ),
          ],
        ),
      );

  Widget _stat(String label, String value, {bool highlight = false}) =>
      Container(
        width: 150,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: highlight ? const Color(0xFF059669) : AppColors.surface,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 0.5,
                color: highlight ? Colors.white70 : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: highlight ? Colors.white : AppColors.textPrimary,
              ),
            ),
          ],
        ),
      );
}
