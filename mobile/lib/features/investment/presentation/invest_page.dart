import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../opportunities/data/opportunities_repository.dart';
import '../../opportunities/domain/opportunity.dart';
import '../data/investment_repository.dart';
import '../domain/investment_constants.dart';
import '../domain/share_preview.dart';
import 'appropriateness_questionnaire_page.dart';

class InvestPage extends ConsumerWidget {
  const InvestPage({super.key, required this.propertyId});

  final int propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opportunity = ref.watch(opportunityByIdProvider(propertyId));
    final gate = ref.watch(investGateProvider(propertyId));

    return Scaffold(
      appBar: AppBar(title: const Text('Invest')),
      body: AsyncValueView(
        value: opportunity,
        onRetry: () => ref.invalidate(opportunityByIdProvider(propertyId)),
        data: (opp) => AsyncValueView(
          value: gate,
          onRetry: () => ref.invalidate(investGateProvider(propertyId)),
          data: (status) => _InvestForm(
            opportunity: opp,
            gate: status,
          ),
        ),
      ),
    );
  }
}

class _InvestForm extends ConsumerStatefulWidget {
  const _InvestForm({required this.opportunity, required this.gate});

  final Opportunity opportunity;
  final InvestGateStatus gate;

  @override
  ConsumerState<_InvestForm> createState() => _InvestFormState();
}

class _InvestFormState extends ConsumerState<_InvestForm> {
  final _amountController = TextEditingController();
  Timer? _debounce;

  SharePreview? _preview;
  bool _loadingPreview = false;
  bool _submitting = false;

  // Terms & conditions gates (all required).
  bool _tcFees = false;
  bool _tcGovernance = false;
  bool _tcCoolingOff = false;
  bool _tcRisk = false;
  bool _tcData = false;

  int get _propertyId => widget.opportunity.id;

  double get _amount => double.tryParse(_amountController.text.trim()) ?? 0;

  bool get _allTermsAccepted =>
      _tcFees && _tcGovernance && _tcCoolingOff && _tcRisk && _tcData;

  @override
  void dispose() {
    _debounce?.cancel();
    _amountController.dispose();
    super.dispose();
  }

  void _onAmountChanged(String _) {
    _debounce?.cancel();
    setState(() {}); // refresh gate warnings live
    final amount = _amount;
    if (amount < InvestmentRules.minInvestment) {
      setState(() => _preview = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 450), () => _loadPreview(amount));
  }

  Future<void> _loadPreview(double amount) async {
    setState(() => _loadingPreview = true);
    try {
      final preview = await ref
          .read(investmentRepositoryProvider)
          .sharePreview(propertyId: _propertyId, amount: amount);
      if (!mounted) return;
      setState(() => _preview = preview);
    } catch (_) {
      if (!mounted) return;
      setState(() => _preview = null);
    } finally {
      if (mounted) setState(() => _loadingPreview = false);
    }
  }

  Future<void> _openQuestionnaire() async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => const AppropriatenessQuestionnairePage(),
      ),
    );
    if (done == true) {
      ref.invalidate(investGateProvider(_propertyId));
    }
  }

  String? _validationError() {
    final amount = _amount;
    if (amount < InvestmentRules.minInvestment) {
      return 'Minimum investment is ${Fmt.money(InvestmentRules.minInvestment)}.';
    }
    if (amount > widget.opportunity.remainingToRaise &&
        widget.opportunity.remainingToRaise > 0) {
      return 'Only ${Fmt.money(widget.opportunity.remainingToRaise)} remains in this raise.';
    }
    if (!widget.gate.appropriateness.completed) {
      return 'Please complete the suitability check first.';
    }
    if (widget.gate.fica.blocksAmount(amount)) {
      return 'FICA verification is required for this amount. Complete it under Profile to continue.';
    }
    if (!_allTermsAccepted) {
      return 'Please accept all the terms to continue.';
    }
    return null;
  }

  Future<void> _submit() async {
    final error = _validationError();
    if (error != null) {
      _snack(error, error: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(investmentRepositoryProvider).submitProposal(
            propertyId: _propertyId,
            amount: _amount,
          );
      if (!mounted) return;
      ref.invalidate(investGateProvider(_propertyId));
      await _showSuccess();
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Something went wrong. Please try again.', error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showSuccess() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.check_circle, color: AppColors.success, size: 48),
        title: const Text('Proposal submitted'),
        content: Text(
          'Your commitment of ${Fmt.money(_amount)} is now pending review. '
          'You have a ${InvestmentRules.coolingOffDays}-day cooling-off period '
          'and can edit or cancel it in the meantime. Once approved, you will '
          'be asked to complete payment.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
    if (mounted) {
      _amountController.clear();
      setState(() => _preview = null);
    }
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : AppColors.success,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final opp = widget.opportunity;
    final gate = widget.gate;
    final pending = gate.existing.where((c) => c.isPending).toList();

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          opp.title,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '${opp.strategyLabel} · ${Fmt.money(opp.remainingToRaise)} remaining',
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 24),

        if (pending.isNotEmpty) ...[
          _PendingBanner(count: pending.length),
          const SizedBox(height: 20),
        ],

        // 1. Suitability (FAIS) gate.
        if (!gate.appropriateness.completed)
          _GateCard(
            icon: Icons.assignment_outlined,
            color: AppColors.warning,
            title: 'Suitability check required',
            body:
                'A quick one-time questionnaire is required before you can invest.',
            actionLabel: 'Start check',
            onAction: _openQuestionnaire,
          )
        else
          const _ClearedRow(text: 'Suitability check complete'),
        const SizedBox(height: 16),

        // 2. Amount input.
        const Text(
          'Investment amount',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _amountController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
          onChanged: _onAmountChanged,
          decoration: InputDecoration(
            prefixText: 'R ',
            hintText: '${InvestmentRules.minInvestment.toStringAsFixed(0)}+',
            helperText:
                'Minimum ${Fmt.money(InvestmentRules.minInvestment)}',
          ),
        ),
        const SizedBox(height: 16),

        // 3. Live share preview.
        _PreviewCard(preview: _preview, loading: _loadingPreview),

        // 4. FICA warning.
        if (gate.fica.blocksAmount(_amount)) ...[
          const SizedBox(height: 16),
          _GateCard(
            icon: Icons.verified_user_outlined,
            color: AppColors.danger,
            title: 'FICA verification needed',
            body:
                'Investments totalling ${Fmt.money(gate.fica.threshold)} or more '
                'require identity verification. Complete FICA to continue with '
                'this amount.',
            actionLabel: 'Start FICA verification',
            onAction: () => context.push('/profile/kyc'),
          ),
        ],

        const SizedBox(height: 24),

        // 5. Terms & conditions.
        const Text(
          'Confirmations',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        _Term(
          value: _tcFees,
          onChanged: (v) => setState(() => _tcFees = v),
          text: 'I have reviewed and accept the fee structure.',
        ),
        _Term(
          value: _tcGovernance,
          onChanged: (v) => setState(() => _tcGovernance = v),
          text: 'I accept the governance rules of the investment vehicle.',
        ),
        _Term(
          value: _tcCoolingOff,
          onChanged: (v) => setState(() => _tcCoolingOff = v),
          text:
              'I understand a ${InvestmentRules.coolingOffDays}-day cooling-off '
              'period applies.',
        ),
        _Term(
          value: _tcRisk,
          onChanged: (v) => setState(() => _tcRisk = v),
          text: 'I understand my capital is at risk and returns are not guaranteed.',
        ),
        _Term(
          value: _tcData,
          onChanged: (v) => setState(() => _tcData = v),
          text: 'I consent to my information being processed for this investment.',
        ),

        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : Text(
                  _amount >= InvestmentRules.minInvestment
                      ? 'Commit ${Fmt.money(_amount)}'
                      : 'Commit investment',
                ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Submitting a proposal does not transfer any money. Payment is only '
          'requested after your proposal is approved.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 40),
      ],
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.preview, required this.loading});

  final SharePreview? preview;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: _boxDecoration(),
        child: const Row(
          children: [
            SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Text('Calculating your shares…',
                style: TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }
    final p = preview;
    if (p == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: _boxDecoration(),
        child: const Text(
          'Enter an amount to see how many shares you would receive.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.navy,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'You would receive',
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            '${p.numberOfShares} ${p.shareClassName} shares',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Stat('Share price', Fmt.money(p.sharePrice, detailed: true)),
              _Stat('Ownership', Fmt.percent(p.ownershipPercentage, decimals: 2)),
            ],
          ),
        ],
      ),
    );
  }

  BoxDecoration _boxDecoration() => BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(color: Colors.white60, fontSize: 12)),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _GateCard extends StatelessWidget {
  const _GateCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w700, color: color),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            body,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onAction,
                style: OutlinedButton.styleFrom(
                  foregroundColor: color,
                  side: BorderSide(color: color),
                ),
                child: Text(actionLabel!),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ClearedRow extends StatelessWidget {
  const _ClearedRow({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.check_circle, color: AppColors.success, size: 18),
        const SizedBox(width: 8),
        Text(text, style: const TextStyle(color: AppColors.textSecondary)),
      ],
    );
  }
}

class _PendingBanner extends StatelessWidget {
  const _PendingBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: AppColors.goldDark, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'You already have $count pending '
              '${count == 1 ? 'proposal' : 'proposals'} on this deal. You can '
              'add another below.',
              style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _Term extends StatelessWidget {
  const _Term({
    required this.value,
    required this.onChanged,
    required this.text,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final String text;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: value,
      onChanged: (v) => onChanged(v ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(
        text,
        style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
      ),
    );
  }
}
