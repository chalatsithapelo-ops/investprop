import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../config/theme.dart';
import '../../../core/financial_calculations.dart';
import '../../../core/format.dart';
import '../../opportunities/domain/opportunity.dart';

/// Strategy presets mirroring the web calculator's STRATEGY_PRESETS.
class _Preset {
  const _Preset({
    required this.vacancyRate,
    required this.downPaymentPercent,
    required this.annualInterestRate,
    required this.loanTermYears,
    required this.rentGrowthRate,
    required this.expenseGrowthRate,
    required this.holdingYears,
    required this.exitCapRate,
    required this.sellingCostPercent,
    required this.stressRateIncrease,
    required this.stressRentDrop,
  });

  final double vacancyRate;
  final double downPaymentPercent;
  final double annualInterestRate;
  final double loanTermYears;
  final double rentGrowthRate;
  final double expenseGrowthRate;
  final double holdingYears;
  final double exitCapRate;
  final double sellingCostPercent;
  final double stressRateIncrease;
  final double stressRentDrop;
}

const Map<String, _Preset> _strategyPresets = {
  'RENTAL': _Preset(
    vacancyRate: 6,
    downPaymentPercent: 20,
    annualInterestRate: 11.75,
    loanTermYears: 20,
    rentGrowthRate: 5.5,
    expenseGrowthRate: 6,
    holdingYears: 7,
    exitCapRate: 8.75,
    sellingCostPercent: 4,
    stressRateIncrease: 2,
    stressRentDrop: 10,
  ),
  'FLIP': _Preset(
    vacancyRate: 0,
    downPaymentPercent: 30,
    annualInterestRate: 12.5,
    loanTermYears: 2,
    rentGrowthRate: 0,
    expenseGrowthRate: 8,
    holdingYears: 1,
    exitCapRate: 0,
    sellingCostPercent: 5,
    stressRateIncrease: 2.5,
    stressRentDrop: 0,
  ),
  'DEVELOPMENT': _Preset(
    vacancyRate: 4,
    downPaymentPercent: 35,
    annualInterestRate: 12.0,
    loanTermYears: 10,
    rentGrowthRate: 4.5,
    expenseGrowthRate: 6.5,
    holdingYears: 4,
    exitCapRate: 9.5,
    sellingCostPercent: 4.5,
    stressRateIncrease: 2.25,
    stressRentDrop: 8,
  ),
};

class FinancingCalculatorPage extends StatefulWidget {
  const FinancingCalculatorPage({super.key, this.opportunity});

  final Opportunity? opportunity;

  @override
  State<FinancingCalculatorPage> createState() =>
      _FinancingCalculatorPageState();
}

class _FinancingCalculatorPageState extends State<FinancingCalculatorPage> {
  final Map<String, TextEditingController> _c = {};
  String _strategy = 'RENTAL';
  bool _includeTransferDuty = true;

  // Default deal (used when no opportunity is passed).
  static const Map<String, double> _defaults = {
    'purchasePrice': 1850000,
    'monthlyRent': 18500,
    'vacancyRate': 6,
    'closingCosts': 45000,
    'downPaymentPercent': 20,
    'annualInterestRate': 11.75,
    'loanTermYears': 20,
    'exitCapRate': 8.75,
    'annualPropertyTax': 22000,
    'annualInsurance': 11000,
    'monthlyHOA': 1400,
    'monthlyMaintenance': 1600,
    'monthlyUtilities': 900,
    'monthlyManagement': 1500,
    'holdingYears': 7,
    'rentGrowthRate': 5.5,
    'expenseGrowthRate': 6,
    'sellingCostPercent': 4,
    'exitValueOverride': 0,
    'stressRateIncrease': 2,
    'stressRentDrop': 10,
  };

  @override
  void initState() {
    super.initState();
    final values = Map<String, double>.from(_defaults);
    final opp = widget.opportunity;
    if (opp != null) {
      _strategy = switch (opp.strategy) {
        DealStrategy.flip => 'FLIP',
        DealStrategy.development => 'DEVELOPMENT',
        _ => 'RENTAL',
      };
      _applyPresetTo(values, _strategy);
      values['purchasePrice'] = opp.price > 0 ? opp.price : values['purchasePrice']!;
      final r = opp.rentalInput;
      if (r != null) {
        if (r.purchasePrice > 0) values['purchasePrice'] = r.purchasePrice;
        if (r.monthlyRent > 0) values['monthlyRent'] = r.monthlyRent;
        if (r.vacancyRate > 0) values['vacancyRate'] = r.vacancyRate;
        if (r.annualPropertyTax > 0) values['annualPropertyTax'] = r.annualPropertyTax;
        if (r.annualInsurance > 0) values['annualInsurance'] = r.annualInsurance;
        if (r.monthlyHOAFees > 0) values['monthlyHOA'] = r.monthlyHOAFees;
        if (r.monthlyMaintenanceReserve > 0) {
          values['monthlyMaintenance'] = r.monthlyMaintenanceReserve;
        }
        if (r.monthlyUtilities > 0) values['monthlyUtilities'] = r.monthlyUtilities;
        if (r.monthlyManagementFee > 0) {
          values['monthlyManagement'] = r.monthlyManagementFee;
        }
        if (r.interestRate > 0) values['annualInterestRate'] = r.interestRate;
        if (r.loanTermYears > 0) values['loanTermYears'] = r.loanTermYears;
        if (r.closingCosts > 0) values['closingCosts'] = r.closingCosts;
      }
    } else {
      _applyPresetTo(values, _strategy);
    }
    for (final entry in values.entries) {
      _c[entry.key] = TextEditingController(text: _fmtInput(entry.value));
    }
  }

  @override
  void dispose() {
    for (final ctrl in _c.values) {
      ctrl.dispose();
    }
    super.dispose();
  }

  String _fmtInput(double v) {
    if (v == v.roundToDouble()) return v.toStringAsFixed(0);
    return v.toString();
  }

  double _v(String key) => double.tryParse(_c[key]?.text.trim() ?? '') ?? 0;

  void _applyPresetTo(Map<String, double> values, String strategy) {
    final p = _strategyPresets[strategy];
    if (p == null) return;
    values['vacancyRate'] = p.vacancyRate;
    values['downPaymentPercent'] = p.downPaymentPercent;
    values['annualInterestRate'] = p.annualInterestRate;
    values['loanTermYears'] = p.loanTermYears;
    values['rentGrowthRate'] = p.rentGrowthRate;
    values['expenseGrowthRate'] = p.expenseGrowthRate;
    values['holdingYears'] = p.holdingYears;
    values['exitCapRate'] = p.exitCapRate;
    values['sellingCostPercent'] = p.sellingCostPercent;
    values['stressRateIncrease'] = p.stressRateIncrease;
    values['stressRentDrop'] = p.stressRentDrop;
  }

  void _applyPreset(String strategy) {
    final p = _strategyPresets[strategy];
    if (p == null) return;
    setState(() {
      _strategy = strategy;
      _c['vacancyRate']!.text = _fmtInput(p.vacancyRate);
      _c['downPaymentPercent']!.text = _fmtInput(p.downPaymentPercent);
      _c['annualInterestRate']!.text = _fmtInput(p.annualInterestRate);
      _c['loanTermYears']!.text = _fmtInput(p.loanTermYears);
      _c['rentGrowthRate']!.text = _fmtInput(p.rentGrowthRate);
      _c['expenseGrowthRate']!.text = _fmtInput(p.expenseGrowthRate);
      _c['holdingYears']!.text = _fmtInput(p.holdingYears);
      _c['exitCapRate']!.text = _fmtInput(p.exitCapRate);
      _c['sellingCostPercent']!.text = _fmtInput(p.sellingCostPercent);
      _c['stressRateIncrease']!.text = _fmtInput(p.stressRateIncrease);
      _c['stressRentDrop']!.text = _fmtInput(p.stressRentDrop);
    });
  }

  _CalcResult _compute() {
    final purchasePrice = _v('purchasePrice');
    final monthlyRent = _v('monthlyRent');
    final vacancyRate = _v('vacancyRate');
    final closingCosts = _v('closingCosts');
    final downPaymentPercent = _v('downPaymentPercent');
    final annualInterestRate = _v('annualInterestRate');
    final loanTermYears = _v('loanTermYears');
    final exitCapRate = _v('exitCapRate');
    final holdingYears = _v('holdingYears');
    final rentGrowthRate = _v('rentGrowthRate');
    final expenseGrowthRate = _v('expenseGrowthRate');
    final sellingCostPercent = _v('sellingCostPercent');
    final exitValueOverride = _v('exitValueOverride');
    final stressRateIncrease = _v('stressRateIncrease');
    final stressRentDrop = _v('stressRentDrop');

    final transferDuty =
        _includeTransferDuty ? calculateTransferDuty(purchasePrice) : 0.0;
    final acquisitionCosts = transferDuty + closingCosts;
    final downPayment = purchasePrice * (downPaymentPercent / 100);
    final loanAmount = math.max(0.0, purchasePrice - downPayment);

    final monthlyDebtService =
        calculateMonthlyDebtService(loanAmount, annualInterestRate, loanTermYears);
    final annualDebtService = monthlyDebtService * 12;

    final annualGrossRent = monthlyRent * 12;
    final annualOperatingExpenses = _v('annualPropertyTax') +
        _v('annualInsurance') +
        (_v('monthlyHOA') * 12) +
        (_v('monthlyMaintenance') * 12) +
        (_v('monthlyUtilities') * 12) +
        (_v('monthlyManagement') * 12);
    final noi = calculateNOI(annualGrossRent, vacancyRate, annualOperatingExpenses);

    final annualCashFlow = noi - annualDebtService;
    final monthlyCashFlow = annualCashFlow / 12;
    final cashInvested = downPayment + acquisitionCosts;
    final cashOnCashReturn =
        cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0.0;

    final dscr = annualDebtService > 0 ? noi / annualDebtService : 0.0;
    final debtYield = loanAmount > 0 ? (noi / loanAmount) * 100 : 0.0;
    final breakEvenOccupancy = annualGrossRent > 0
        ? (annualOperatingExpenses + annualDebtService) / annualGrossRent * 100
        : 0.0;

    final months = math.max(1, (holdingYears * 12).round());
    final monthlyRate = annualInterestRate / 100 / 12;

    final effectiveGrossRent = annualGrossRent * (1 - vacancyRate / 100);
    final grownEffectiveRent =
        effectiveGrossRent * math.pow(1 + rentGrowthRate / 100, holdingYears);
    final grownExpenses =
        annualOperatingExpenses * math.pow(1 + expenseGrowthRate / 100, holdingYears);
    final stabilizedNOI = math.max(0.0, grownEffectiveRent - grownExpenses);

    final incomeReversionValue =
        exitCapRate > 0 ? stabilizedNOI / (exitCapRate / 100) : 0.0;
    final appreciationValue =
        purchasePrice * math.pow(1 + rentGrowthRate / 100, holdingYears);
    final grossExitValue = exitValueOverride > 0
        ? exitValueOverride
        : (incomeReversionValue > 0
            ? incomeReversionValue
            : appreciationValue.toDouble());

    final sellingCosts = grossExitValue * (sellingCostPercent / 100);

    double outstandingLoan;
    if (loanAmount > 0 && monthlyRate > 0) {
      final growth = math.pow(1 + monthlyRate, months).toDouble();
      outstandingLoan =
          loanAmount * growth - monthlyDebtService * ((growth - 1) / monthlyRate);
      outstandingLoan = math.max(0.0, outstandingLoan);
    } else {
      outstandingLoan = math.max(0.0, loanAmount - monthlyDebtService * months);
    }

    final netSaleProceeds =
        math.max(0.0, grossExitValue - sellingCosts - outstandingLoan);

    final cashFlows = <double>[-cashInvested];
    for (var i = 0; i < months; i++) {
      cashFlows.add(monthlyCashFlow);
    }
    cashFlows[cashFlows.length - 1] += netSaleProceeds;
    final equityIRR = calculateAnnualIRRFromMonthly(cashFlows);

    // Stress scenario.
    final stressedRent = monthlyRent * (1 - stressRentDrop / 100);
    final stressedRate = annualInterestRate + stressRateIncrease;
    final stressedDebtService =
        calculateMonthlyDebtService(loanAmount, stressedRate, loanTermYears) * 12;
    final stressedNOI =
        calculateNOI(stressedRent * 12, vacancyRate, annualOperatingExpenses);
    final stressedAnnualCashFlow = stressedNOI - stressedDebtService;
    final stressedDSCR =
        stressedDebtService > 0 ? stressedNOI / stressedDebtService : 0.0;

    return _CalcResult(
      loanAmount: loanAmount,
      downPayment: downPayment,
      acquisitionCosts: acquisitionCosts,
      cashInvested: cashInvested,
      noi: noi,
      annualDebtService: annualDebtService,
      monthlyCashFlow: monthlyCashFlow,
      dscr: dscr,
      debtYield: debtYield,
      cashOnCashReturn: cashOnCashReturn,
      breakEvenOccupancy: breakEvenOccupancy,
      stressedRate: stressedRate,
      stressedRent: stressedRent,
      stressedAnnualCashFlow: stressedAnnualCashFlow,
      stressedDSCR: stressedDSCR,
      grossExitValue: grossExitValue,
      outstandingLoan: outstandingLoan,
      netSaleProceeds: netSaleProceeds,
      equityIRR: equityIRR,
    );
  }

  @override
  Widget build(BuildContext context) {
    final r = _compute();
    return Scaffold(
      appBar: AppBar(title: const Text('Financing deal calculator')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          if (widget.opportunity != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Prefilled from: ${widget.opportunity!.title}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          _presetChips(),
          const SizedBox(height: 16),
          _card('Deal inputs', [
            _field('purchasePrice', 'Purchase price (R)'),
            _field('monthlyRent', 'Monthly rent (R)'),
            _field('vacancyRate', 'Vacancy rate (%)'),
            _field('closingCosts', 'Closing costs (R)'),
            _field('downPaymentPercent', 'Down payment (%)'),
            _field('annualInterestRate', 'Interest rate (%)'),
            _field('loanTermYears', 'Loan term (years)'),
            _field('exitCapRate', 'Exit cap rate (%)'),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Include SARS transfer duty',
                  style: TextStyle(fontSize: 14)),
              value: _includeTransferDuty,
              onChanged: (v) => setState(() => _includeTransferDuty = v),
            ),
          ]),
          _card('Operating expenses', [
            _field('annualPropertyTax', 'Property tax (annual R)'),
            _field('annualInsurance', 'Insurance (annual R)'),
            _field('monthlyHOA', 'HOA / levies (monthly R)'),
            _field('monthlyMaintenance', 'Maintenance (monthly R)'),
            _field('monthlyUtilities', 'Utilities (monthly R)'),
            _field('monthlyManagement', 'Management (monthly R)'),
          ]),
          _card('Projection & stress', [
            _field('holdingYears', 'Holding period (years)'),
            _field('rentGrowthRate', 'Rent growth (%/yr)'),
            _field('expenseGrowthRate', 'Expense growth (%/yr)'),
            _field('sellingCostPercent', 'Selling cost (%)'),
            _field('exitValueOverride', 'Exit value override (R, 0=auto)'),
            _field('stressRateIncrease', 'Stress rate shock (%)'),
            _field('stressRentDrop', 'Stress rent drop (%)'),
          ]),
          const SizedBox(height: 8),
          _resultCard('Loan & equity', [
            _resultRow('Loan amount', Fmt.money(r.loanAmount)),
            _resultRow('Down payment', Fmt.money(r.downPayment)),
            _resultRow('Acquisition costs', Fmt.money(r.acquisitionCosts)),
            _resultRow('Cash invested', Fmt.money(r.cashInvested), emphasize: true),
          ]),
          _resultCard('Income & coverage', [
            _resultRow('NOI (annual)', Fmt.money(r.noi)),
            _resultRow('Debt service (annual)', Fmt.money(r.annualDebtService)),
            _resultRow(
              'Monthly cash flow',
              Fmt.money(r.monthlyCashFlow),
              color: r.monthlyCashFlow >= 0 ? AppColors.success : AppColors.danger,
            ),
            _resultRow(
              'DSCR',
              r.dscr.toStringAsFixed(2),
              color: _tone(r.dscr, 1.2, 1),
            ),
            _resultRow(
              'Debt yield',
              Fmt.percent(r.debtYield),
              color: _tone(r.debtYield, 10, 8),
            ),
            _resultRow(
              'Cash-on-cash',
              Fmt.percent(r.cashOnCashReturn),
              color: _tone(r.cashOnCashReturn, 8, 4),
            ),
            _resultRow(
              'Break-even occupancy',
              Fmt.percent(r.breakEvenOccupancy),
              color: _toneInverse(r.breakEvenOccupancy, 85, 95),
            ),
          ]),
          _resultCard('Stress test', [
            _resultRow('Stressed interest rate', Fmt.percent(r.stressedRate)),
            _resultRow('Stressed monthly rent', Fmt.money(r.stressedRent)),
            _resultRow(
              'Stressed annual cash flow',
              Fmt.money(r.stressedAnnualCashFlow),
              color: r.stressedAnnualCashFlow >= 0
                  ? AppColors.success
                  : AppColors.danger,
            ),
            _resultRow(
              'Stressed DSCR',
              r.stressedDSCR.toStringAsFixed(2),
              color: _tone(r.stressedDSCR, 1.1, 1),
            ),
          ]),
          _resultCard('Exit & IRR view', [
            _resultRow('Estimated exit value', Fmt.money(r.grossExitValue)),
            _resultRow('Outstanding loan at exit', Fmt.money(r.outstandingLoan)),
            _resultRow(
              'Net sale proceeds to equity',
              Fmt.money(r.netSaleProceeds),
              emphasize: true,
            ),
            _resultRow(
              'Estimated equity IRR',
              r.equityIRR.isNaN ? '—' : Fmt.percent(r.equityIRR),
              color: r.equityIRR.isNaN ? null : _tone(r.equityIRR, 12, 8),
            ),
          ]),
          const SizedBox(height: 12),
          const Text(
            'Estimates use the same engine as the web platform. Figures are '
            'illustrative, not financial advice. Capital is at risk.',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _presetChips() {
    return Wrap(
      spacing: 8,
      children: _strategyPresets.keys.map((key) {
        final selected = _strategy == key;
        return ChoiceChip(
          label: Text(key[0] + key.substring(1).toLowerCase()),
          selected: selected,
          onSelected: (_) => _applyPreset(key),
          selectedColor: AppColors.navy,
          labelStyle: TextStyle(
            color: selected ? Colors.white : AppColors.textPrimary,
            fontWeight: FontWeight.w600,
          ),
        );
      }).toList(),
    );
  }

  Widget _field(String key, String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextField(
        controller: _c[key],
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
        ],
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
        onChanged: (_) => setState(() {}),
      ),
    );
  }

  Widget _card(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }

  Widget _resultCard(String title, List<Widget> rows) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.navy,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppColors.gold,
            ),
          ),
          const SizedBox(height: 10),
          ...rows,
        ],
      ),
    );
  }

  Widget _resultRow(String label, String value,
      {Color? color, bool emphasize = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: Colors.white70,
                fontSize: 13,
                fontWeight: emphasize ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: color ?? Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Color _tone(double value, double good, double warn) {
    if (value >= good) return AppColors.success;
    if (value >= warn) return AppColors.gold;
    return AppColors.danger;
  }

  Color _toneInverse(double value, double good, double warn) {
    if (value <= good) return AppColors.success;
    if (value <= warn) return AppColors.gold;
    return AppColors.danger;
  }
}

class _CalcResult {
  const _CalcResult({
    required this.loanAmount,
    required this.downPayment,
    required this.acquisitionCosts,
    required this.cashInvested,
    required this.noi,
    required this.annualDebtService,
    required this.monthlyCashFlow,
    required this.dscr,
    required this.debtYield,
    required this.cashOnCashReturn,
    required this.breakEvenOccupancy,
    required this.stressedRate,
    required this.stressedRent,
    required this.stressedAnnualCashFlow,
    required this.stressedDSCR,
    required this.grossExitValue,
    required this.outstandingLoan,
    required this.netSaleProceeds,
    required this.equityIRR,
  });

  final double loanAmount;
  final double downPayment;
  final double acquisitionCosts;
  final double cashInvested;
  final double noi;
  final double annualDebtService;
  final double monthlyCashFlow;
  final double dscr;
  final double debtYield;
  final double cashOnCashReturn;
  final double breakEvenOccupancy;
  final double stressedRate;
  final double stressedRent;
  final double stressedAnnualCashFlow;
  final double stressedDSCR;
  final double grossExitValue;
  final double outstandingLoan;
  final double netSaleProceeds;
  final double equityIRR;
}
