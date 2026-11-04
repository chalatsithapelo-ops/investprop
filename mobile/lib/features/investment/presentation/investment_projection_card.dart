import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/info_tooltip.dart';
import '../data/investment_repository.dart';
import '../domain/investment_projection.dart';

/// Live, strategy-aware projection of what the investor can expect for their
/// amount — three scenarios, optional bank-loan gearing, net of fees & tax.
class ProjectionCard extends ConsumerStatefulWidget {
  const ProjectionCard({
    super.key,
    required this.propertyId,
    required this.amount,
    required this.config,
    required this.onConfigChange,
  });

  final int propertyId;
  final double amount;
  final StrategyConfig config;
  final ValueChanged<StrategyConfig> onConfigChange;

  @override
  ConsumerState<ProjectionCard> createState() => _ProjectionCardState();
}

class _ProjectionCardState extends ConsumerState<ProjectionCard> {
  Timer? _debounce;
  InvestmentProjection? _projection;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(covariant ProjectionCard old) {
    super.didUpdateWidget(old);
    if (old.amount != widget.amount || old.config != widget.config) {
      _schedule();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _schedule() {
    _debounce?.cancel();
    if (widget.amount <= 0) {
      setState(() => _projection = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 450), _load);
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final c = widget.config;
      final p = await ref
          .read(investmentRepositoryProvider)
          .investmentProjection(
            propertyId: widget.propertyId,
            amount: widget.amount,
            strategy: c.strategy,
            holdMonths: c.holdMonths,
            financingAmount: c.usesFinancing ? c.financingAmount : null,
            financingRate: c.financingRate,
            financingTermMonths: c.financingTermMonths,
            stressDownPct: c.stressDownPct,
            stressUpPct: c.stressUpPct,
            holdingType: c.holdingType,
          );
      if (!mounted) return;
      setState(() => _projection = p);
    } catch (_) {
      if (!mounted) return;
      setState(() => _projection = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.amount <= 0) return const SizedBox.shrink();
    final p = _projection;
    final activeStrategy = widget.config.strategy ?? p?.defaultStrategy;
    final activeHold = widget.config.holdMonths ?? p?.projectHoldMonths ?? 12;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gold.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.track_changes,
                size: 16,
                color: AppColors.goldDark,
              ),
              const SizedBox(width: 6),
              const Text(
                'Your Investment Projection',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.goldDark,
                ),
              ),
              const InfoTip(term: 'investorStrategy'),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Estimates for your amount, based on the strategy you choose. '
            'Not guarantees, not financial advice.',
            style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),

          // Strategy chips
          if ((p?.availableStrategies ?? []).isNotEmpty) ...[
            Row(
              children: [
                const Text(
                  'Your strategy',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                ),
                const InfoTip(term: 'investorStrategy'),
              ],
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: p!.availableStrategies.map((s) {
                final active = activeStrategy == s;
                return GestureDetector(
                  onTap: () => widget.onConfigChange(
                    widget.config.copyWith(strategy: s),
                  ),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: active ? AppColors.gold : AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: active ? AppColors.gold : AppColors.border,
                      ),
                    ),
                    child: Text(
                      s.label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: active ? Colors.white : AppColors.textSecondary,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            if (activeStrategy != null) ...[
              const SizedBox(height: 6),
              Text(
                activeStrategy.blurb,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
            const SizedBox(height: 12),
          ],

          // Hold period
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Your hold period',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
              ),
              Text(
                activeHold >= 12 && activeHold % 12 == 0
                    ? '${activeHold ~/ 12} year${activeHold == 12 ? '' : 's'}'
                    : '$activeHold months',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.goldDark,
                ),
              ),
            ],
          ),
          Slider(
            value: activeHold.toDouble().clamp(3, 120),
            min: 3,
            max: 120,
            divisions: 39,
            activeColor: AppColors.gold,
            onChanged: (v) => widget.onConfigChange(
              widget.config.copyWith(holdMonths: (v ~/ 3) * 3),
            ),
          ),
          if ((p?.projectHoldMonths ?? 0) > 0)
            Text(
              'Platform plan: ~${p!.projectHoldMonths} months. Exit earlier by '
              'selling shares on the marketplace.',
              style: const TextStyle(
                fontSize: 10,
                color: AppColors.textSecondary,
              ),
            ),
          const SizedBox(height: 12),

          // Gearing toggle
          _GearingSection(
            config: widget.config,
            onConfigChange: widget.onConfigChange,
          ),

          const SizedBox(height: 12),

          // Investor-controlled stress test
          _StressSection(
            config: widget.config,
            onConfigChange: widget.onConfigChange,
          ),

          const SizedBox(height: 12),

          // Tax treatment: how the stake is held
          _HoldingSection(
            config: widget.config,
            onConfigChange: widget.onConfigChange,
          ),

          const SizedBox(height: 12),
          if (_loading && p == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Center(
                child: Text(
                  'Calculating your projection…',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ),

          if (p != null) _ScenarioTable(projection: p),
        ],
      ),
    );
  }
}

class _GearingSection extends StatelessWidget {
  const _GearingSection({required this.config, required this.onConfigChange});

  final StrategyConfig config;
  final ValueChanged<StrategyConfig> onConfigChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => onConfigChange(
              config.copyWith(usesFinancing: !config.usesFinancing),
            ),
            behavior: HitTestBehavior.opaque,
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: config.usesFinancing,
                    activeColor: AppColors.gold,
                    onChanged: (v) => onConfigChange(
                      config.copyWith(usesFinancing: v ?? false),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(
                  Icons.account_balance,
                  size: 14,
                  color: AppColors.goldDark,
                ),
                const SizedBox(width: 4),
                const Flexible(
                  child: Text(
                    'Use a bank loan to co-invest (gearing)',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
                const InfoTip(term: 'gearing'),
              ],
            ),
          ),
          if (config.usesFinancing) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _MiniField(
                    label: 'Loan (R)',
                    value: config.financingAmount == 0
                        ? ''
                        : config.financingAmount.toStringAsFixed(0),
                    onChanged: (v) => onConfigChange(
                      config.copyWith(financingAmount: double.tryParse(v) ?? 0),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _MiniField(
                    label: 'Rate % p.a.',
                    value: config.financingRate.toStringAsFixed(2),
                    onChanged: (v) => onConfigChange(
                      config.copyWith(
                        financingRate: double.tryParse(v) ?? 11.75,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _MiniField(
                    label: 'Term (mo)',
                    value: config.financingTermMonths.toString(),
                    onChanged: (v) => onConfigChange(
                      config.copyWith(
                        financingTermMonths: int.tryParse(v) ?? 60,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Investor-controlled downside / upside stress sliders so they can push the
/// deal themselves and see the table + breakdown react live.
class _StressSection extends StatelessWidget {
  const _StressSection({required this.config, required this.onConfigChange});

  final StrategyConfig config;
  final ValueChanged<StrategyConfig> onConfigChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.tune, size: 14, color: AppColors.goldDark),
              const SizedBox(width: 4),
              const Flexible(
                child: Text(
                  'Stress the deal yourself',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
              const InfoTip(term: 'scenarioBands'),
            ],
          ),
          const SizedBox(height: 2),
          const Text(
            'Push revenue down (downside) and up (upside). The table updates live.',
            style: TextStyle(fontSize: 10, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 6),
          _StressSlider(
            label: 'Downside severity',
            valueLabel: '-${config.stressDownPct}%',
            color: AppColors.danger,
            value: config.stressDownPct.toDouble(),
            onChanged: (v) => onConfigChange(
              config.copyWith(stressDownPct: (v / 5).round() * 5),
            ),
          ),
          _StressSlider(
            label: 'Upside optimism',
            valueLabel: '+${config.stressUpPct}%',
            color: AppColors.success,
            value: config.stressUpPct.toDouble(),
            onChanged: (v) => onConfigChange(
              config.copyWith(stressUpPct: (v / 5).round() * 5),
            ),
          ),
        ],
      ),
    );
  }
}

/// How the investor holds the stake — flexes the estimated tax assumption.
class _HoldingSection extends StatelessWidget {
  const _HoldingSection({required this.config, required this.onConfigChange});

  final StrategyConfig config;
  final ValueChanged<StrategyConfig> onConfigChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'How you hold this investment',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          const Text(
            'Changes the estimated tax below. Company/SPV uses 27% / ~21.6% CGT; individual uses your marginal rate.',
            style: TextStyle(fontSize: 10, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            children: HoldingType.values.map((h) {
              final active = config.holdingType == h;
              return GestureDetector(
                onTap: () => onConfigChange(config.copyWith(holdingType: h)),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: active ? AppColors.navy : AppColors.background,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    h.label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: active ? Colors.white : AppColors.textSecondary,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _StressSlider extends StatelessWidget {
  const _StressSlider({
    required this.label,
    required this.valueLabel,
    required this.color,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String valueLabel;
  final Color color;
  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              color: AppColors.textSecondary,
            ),
          ),
        ),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 2,
              overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
            ),
            child: Slider(
              value: value.clamp(0, 40),
              min: 0,
              max: 40,
              divisions: 8,
              activeColor: color,
              onChanged: onChanged,
            ),
          ),
        ),
        SizedBox(
          width: 44,
          child: Text(
            valueLabel,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ),
      ],
    );
  }
}

class _MiniField extends StatelessWidget {
  const _MiniField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 2),
        TextFormField(
          initialValue: value,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
          style: const TextStyle(fontSize: 12),
          decoration: const InputDecoration(
            isDense: true,
            contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          ),
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _ScenarioTable extends StatelessWidget {
  const _ScenarioTable({required this.projection});

  final InvestmentProjection projection;

  @override
  Widget build(BuildContext context) {
    final d = projection.downside;
    final b = projection.base;
    final u = projection.upside;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              const _HeaderRow(),
              _Row(
                label: 'Net payout',
                term: 'netProceeds',
                down: Fmt.money(d.netProceeds),
                base: Fmt.money(b.netProceeds),
                up: Fmt.money(u.netProceeds),
              ),
              _Row(
                label: 'Net profit',
                down: Fmt.money(d.netProfit),
                base: Fmt.money(b.netProfit),
                up: Fmt.money(u.netProfit),
                downNeg: d.netProfit < 0,
                baseNeg: b.netProfit < 0,
              ),
              _Row(
                label: 'Equity multiple',
                term: 'moic',
                down: '${d.moic.toStringAsFixed(2)}×',
                base: '${b.moic.toStringAsFixed(2)}×',
                up: '${u.moic.toStringAsFixed(2)}×',
              ),
              _Row(
                label: 'Annualised',
                term: 'annualisedReturn',
                down: Fmt.percent(d.annualisedReturn),
                base: Fmt.percent(b.annualisedReturn),
                up: Fmt.percent(u.annualisedReturn),
                downNeg: d.annualisedReturn < 0,
                baseNeg: b.annualisedReturn < 0,
                last: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            const Icon(
              Icons.info_outline,
              size: 11,
              color: AppColors.textSecondary,
            ),
            const SizedBox(width: 3),
            const Text(
              'Downside / Base / Upside',
              style: TextStyle(fontSize: 10, color: AppColors.textSecondary),
            ),
            const InfoTip(term: 'scenarioBands', size: 13),
          ],
        ),
        const SizedBox(height: 10),
        _BreakdownSection(base: b),
        if (projection.summary.isNotEmpty) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              projection.summary,
              style: const TextStyle(
                fontSize: 11,
                height: 1.5,
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
        if (projection.notes.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...projection.notes.map(
            (n) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.info_outline,
                    size: 11,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      n,
                      style: const TextStyle(
                        fontSize: 10,
                        height: 1.4,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 8),
        Text(
          projection.disclaimer,
          style: const TextStyle(
            fontSize: 10,
            color: AppColors.textSecondary,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

/// Base-case money-flow breakdown so the investor can see exactly where the
/// payout comes from and where it goes — not just the headline net figure.
class _BreakdownSection extends StatelessWidget {
  const _BreakdownSection({required this.base});

  final InvestorScenario base;

  @override
  Widget build(BuildContext context) {
    final hasPref = base.preferredReturnPaid > 0.5;
    final hasFee = base.platformFee > 0.5;
    final hasTax = base.taxEstimate > 0.5;
    final hasTxn = base.transactionCosts > 0.5;
    final hasLoanInt = base.loanInterestPaid > 0.5;
    final hasLoanPrin = base.loanPrincipalRepaid > 0.5;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.account_tree_outlined,
                size: 13,
                color: AppColors.goldDark,
              ),
              const SizedBox(width: 4),
              const Flexible(
                child: Text(
                  'Where your base-case money comes from & goes',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
              const InfoTip(term: 'promote', size: 13),
            ],
          ),
          const SizedBox(height: 8),
          _FlowRow(label: 'Your capital returned', value: base.capitalReturned),
          if (hasPref)
            _FlowRow(
              label: '+ Preferred return',
              value: base.preferredReturnPaid,
              sign: _FlowSign.positive,
              term: 'preferredReturn',
            ),
          _FlowRow(
            label: '+ Your profit share',
            value: base.profitShare,
            sign: _FlowSign.positive,
            term: 'promote',
          ),
          _FlowRow(
            label: '= Gross payout',
            value: base.grossPayout,
            bold: true,
          ),
          if (hasFee)
            _FlowRow(
              label: '− Platform fee',
              value: base.platformFee,
              sign: _FlowSign.negative,
            ),
          if (hasTax)
            _FlowRow(
              label: '− Estimated tax',
              value: base.taxEstimate,
              sign: _FlowSign.negative,
            ),
          if (hasTxn)
            _FlowRow(
              label: '− Estimated transaction costs',
              value: base.transactionCosts,
              sign: _FlowSign.negative,
            ),
          if (hasLoanInt)
            _FlowRow(
              label: '− Loan interest',
              value: base.loanInterestPaid,
              sign: _FlowSign.negative,
              term: 'gearing',
            ),
          if (hasLoanPrin)
            _FlowRow(
              label: '− Loan repaid at exit',
              value: base.loanPrincipalRepaid,
              sign: _FlowSign.negative,
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 4),
            child: Divider(height: 1, color: AppColors.border),
          ),
          _FlowRow(
            label: '= Net payout to you',
            value: base.netProceeds,
            bold: true,
            highlight: true,
          ),
          _FlowRow(
            label: 'Less your cash in',
            value: base.ownCashInvested,
            sign: _FlowSign.negative,
          ),
          _FlowRow(
            label: '= Net profit',
            value: base.netProfit,
            bold: true,
            highlight: base.netProfit >= 0,
            sign: base.netProfit < 0 ? _FlowSign.negative : _FlowSign.none,
          ),
        ],
      ),
    );
  }
}

enum _FlowSign { none, positive, negative }

class _FlowRow extends StatelessWidget {
  const _FlowRow({
    required this.label,
    required this.value,
    this.sign = _FlowSign.none,
    this.bold = false,
    this.highlight = false,
    this.term,
  });

  final String label;
  final double value;
  final _FlowSign sign;
  final bool bold;
  final bool highlight;
  final String? term;

  @override
  Widget build(BuildContext context) {
    final color = switch (sign) {
      _FlowSign.negative => AppColors.danger,
      _FlowSign.positive => AppColors.success,
      _FlowSign.none => highlight ? AppColors.goldDark : AppColors.textPrimary,
    };
    final prefix = sign == _FlowSign.negative ? '-' : '';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                if (term != null) InfoTip(term: term!, size: 12),
              ],
            ),
          ),
          const SizedBox(width: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              '$prefix${Fmt.money(value.abs())}',
              maxLines: 1,
              style: TextStyle(
                fontSize: 11,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderRow extends StatelessWidget {
  const _HeaderRow();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      child: const Row(
        children: [
          Expanded(flex: 3, child: SizedBox.shrink()),
          Expanded(
            flex: 2,
            child: Text(
              'Down',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.danger,
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              'Base',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              'Up',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.success,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.down,
    required this.base,
    required this.up,
    this.term,
    this.downNeg = false,
    this.baseNeg = false,
    this.last = false,
  });

  final String label;
  final String? term;
  final String down;
  final String base;
  final String up;
  final bool downNeg;
  final bool baseNeg;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: AppColors.border.withValues(alpha: 0.7)),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                if (term != null) InfoTip(term: term!, size: 13),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                down,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: downNeg ? AppColors.danger : AppColors.textPrimary,
                ),
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                base,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: baseNeg ? AppColors.danger : AppColors.textPrimary,
                ),
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                up,
                maxLines: 1,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.success,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
