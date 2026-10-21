import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../data/finance_repository.dart';
import '../domain/prequalification.dart';

/// In-app home-loan affordability check (Phase 1). Indicative only — not a
/// credit approval. A qualifying result can flow into a real multi-bank
/// application on the next screen.
class PrequalificationPage extends ConsumerStatefulWidget {
  const PrequalificationPage({super.key});

  @override
  ConsumerState<PrequalificationPage> createState() =>
      _PrequalificationPageState();
}

class _PrequalificationPageState
    extends ConsumerState<PrequalificationPage> {
  final _income = TextEditingController();
  final _expenses = TextEditingController();
  final _debt = TextEditingController();
  final _deposit = TextEditingController();
  final _propertyPrice = TextEditingController();

  Timer? _debounce;
  PrequalResult? _result;
  bool _loading = false;
  bool _consent = false;
  bool _saving = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _income.dispose();
    _expenses.dispose();
    _debt.dispose();
    _deposit.dispose();
    _propertyPrice.dispose();
    super.dispose();
  }

  double _num(TextEditingController c) =>
      double.tryParse(c.text.trim().replaceAll(',', '')) ?? 0;

  double get _grossIncome => _num(_income);

  PrequalInput get _input => PrequalInput(
        grossMonthlyIncome: _grossIncome,
        monthlyExpenses: _num(_expenses),
        existingDebtRepayments: _num(_debt),
        depositAmount: _num(_deposit),
        propertyPrice: _num(_propertyPrice),
      );

  void _onChanged() {
    _debounce?.cancel();
    if (_grossIncome <= 0) {
      setState(() => _result = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), _loadPreview);
  }

  Future<void> _loadPreview() async {
    setState(() => _loading = true);
    try {
      final result =
          await ref.read(financeRepositoryProvider).preview(_input);
      if (!mounted) return;
      setState(() => _result = result);
    } catch (_) {
      if (!mounted) return;
      setState(() => _result = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_grossIncome <= 0) {
      _snack('Enter your gross monthly income first.', error: true);
      return;
    }
    if (!_consent) {
      _snack('Please tick the consent box to save your result.', error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      final result = await ref
          .read(financeRepositoryProvider)
          .submitPrequalification(input: _input, consent: _consent);
      if (!mounted) return;
      setState(() => _result = result);
      ref.invalidate(myPrequalificationsProvider);
      _snack('Prequalification saved.');
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (e) {
      _snack(e.toString().replaceFirst('Bad state: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
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
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: const Text('Home-loan prequalification')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'See how much home loan you could afford. This is an indicative '
            'estimate based on standard bank affordability rules — not a credit '
            'guarantee. When you are ready you can apply to all major banks in '
            'one step.',
            style: TextStyle(color: AppColors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: 20),
          _MoneyField(
            controller: _income,
            label: 'Gross monthly income (before tax)',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 14),
          _MoneyField(
            controller: _expenses,
            label: 'Monthly living expenses',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 14),
          _MoneyField(
            controller: _debt,
            label: 'Existing debt repayments (car, cards…)',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 14),
          _MoneyField(
            controller: _deposit,
            label: 'Deposit available',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 14),
          _MoneyField(
            controller: _propertyPrice,
            label: 'Target property price (optional)',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 24),
          if (_loading && result == null)
            const Center(child: CircularProgressIndicator())
          else if (result != null)
            _ResultCard(result: result),
          const SizedBox(height: 20),
          CheckboxListTile(
            value: _consent,
            onChanged: (v) => setState(() => _consent = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'I consent to InvestProp storing these details to calculate and '
              'save my prequalification (POPIA).',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 8),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Save my prequalification'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => context.push('/profile/home-loan/apply', extra: {
              'bondAmount': result?.maxBondAmount ?? 0,
              'propertyPrice': _num(_propertyPrice),
              'deposit': _num(_deposit),
              'grossIncome': _grossIncome,
              'instalment': _num(_propertyPrice) > 0
                  ? (result?.estimatedInstalment ?? 0)
                  : (result?.maxInstalment ?? 0),
            }),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.navy,
              side: const BorderSide(color: AppColors.navy),
              minimumSize: const Size.fromHeight(52),
            ),
            icon: const Icon(Icons.account_balance_outlined),
            label: const Text('Apply to all major banks'),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => context.push('/profile/home-loan'),
              child: const Text('View my applications'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});

  final PrequalResult result;

  @override
  Widget build(BuildContext context) {
    final band = result.band;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Indicative result',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: AppColors.textPrimary,
                  ),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: band.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${band.label} affordability',
                    style: TextStyle(
                      color: band.color,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _Row(label: 'Estimated max bond', value: Fmt.money(result.maxBondAmount)),
            _Row(
                label: 'Max property price',
                value: Fmt.money(result.maxPropertyPrice)),
            _Row(
                label: 'Monthly instalment',
                value: '${Fmt.money(result.estimatedInstalment)} /mo'),
            _Row(
                label: 'Interest rate',
                value: Fmt.percent(result.annualInterestRate, decimals: 2)),
            _Row(label: 'Term', value: '${result.loanTermYears} years'),
            if (result.notes != null && result.notes!.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                result.notes!,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(color: AppColors.textSecondary)),
          Text(value,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
        ],
      ),
    );
  }
}

class _MoneyField extends StatelessWidget {
  const _MoneyField({
    required this.controller,
    required this.label,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      onChanged: onChanged,
      decoration: InputDecoration(labelText: label, prefixText: 'R '),
    );
  }
}
