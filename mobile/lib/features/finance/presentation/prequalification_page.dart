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
  const PrequalificationPage({super.key, this.propertyId, this.propertyPrice});

  final int? propertyId;
  final double? propertyPrice;

  @override
  ConsumerState<PrequalificationPage> createState() =>
      _PrequalificationPageState();
}

class _PrequalificationPageState extends ConsumerState<PrequalificationPage> {
  final _income = TextEditingController();
  final _expenses = TextEditingController();
  final _debt = TextEditingController();
  final _deposit = TextEditingController();
  final _propertyPrice = TextEditingController();
  final _rate = TextEditingController(text: '11.75');
  final _term = TextEditingController(text: '20');

  Timer? _debounce;
  PrequalResult? _result;
  bool _loading = false;
  bool _consent = false;
  bool _saving = false;
  bool _historyLoading = true;
  String? _historyError;
  String? _previewError;
  int _revision = 0;
  int _request = 0;
  int? _propertyId;
  int? _savedId;

  @override
  void initState() {
    super.initState();
    _propertyId = widget.propertyId;
    if (widget.propertyPrice != null) {
      _propertyPrice.text = widget.propertyPrice.toString();
    }
    unawaited(_loadHistory());
  }

  Future<void> _loadHistory() async {
    final revision = _revision;
    setState(() {
      _historyLoading = true;
      _historyError = null;
    });
    try {
      final history = await ref
          .read(financeRepositoryProvider)
          .myPrequalifications();
      if (!mounted || revision != _revision || _saving) return;
      if (history.isNotEmpty) {
        final latest = history.first;
        final input = PrequalInput.fromSaved(
          latest,
          propertyPrice: widget.propertyPrice,
        );
        _income.text = input.grossMonthlyIncome.toString();
        _expenses.text = input.monthlyExpenses.toString();
        _debt.text = input.existingDebtRepayments.toString();
        _deposit.text = input.depositAmount.toString();
        _propertyPrice.text = input.propertyPrice.toString();
        _rate.text = input.annualInterestRate.toString();
        _term.text = input.loanTermYears.toString();
        // A new property context must never inherit the old property's ID.
        _propertyId =
            widget.propertyId ??
            (widget.propertyPrice == null ? latest.propertyId : null);
        if ((widget.propertyId == null ||
                widget.propertyId == latest.propertyId) &&
            (widget.propertyPrice == null ||
                widget.propertyPrice == latest.propertyPrice)) {
          _savedId = latest.id;
        }
        unawaited(_loadPreview());
      }
    } catch (e) {
      if (mounted) setState(() => _historyError = _message(e));
    } finally {
      if (mounted) setState(() => _historyLoading = false);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _income.dispose();
    _expenses.dispose();
    _debt.dispose();
    _deposit.dispose();
    _propertyPrice.dispose();
    _rate.dispose();
    _term.dispose();
    super.dispose();
  }

  double _num(TextEditingController c) => c.text.trim().isEmpty
      ? 0
      : double.tryParse(c.text.trim().replaceAll(',', '')) ?? double.nan;

  double get _grossIncome => _num(_income);

  PrequalInput get _input => PrequalInput(
    grossMonthlyIncome: _grossIncome,
    monthlyExpenses: _num(_expenses),
    existingDebtRepayments: _num(_debt),
    depositAmount: _num(_deposit),
    propertyPrice: _num(_propertyPrice),
    annualInterestRate: _num(_rate),
    loanTermYears: int.tryParse(_term.text.trim()) ?? 0,
  );

  void _onChanged() {
    _debounce?.cancel();
    _revision++;
    _request++;
    setState(() {
      _savedId = null;
      _result = null;
      _loading = false;
      _previewError = _input.validationError;
    });
    if (_grossIncome <= 0 || _previewError != null) {
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), _loadPreview);
  }

  Future<void> _loadPreview() async {
    final input = _input;
    if (input.validationError != null || input.grossMonthlyIncome <= 0) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _previewError = null;
    });
    try {
      final result = await ref.read(financeRepositoryProvider).preview(input);
      if (!mounted || request != _request) return;
      setState(() => _result = result);
    } catch (e) {
      if (!mounted || request != _request) return;
      setState(() {
        _result = null;
        _previewError = _message(e);
      });
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  String _message(Object error) => error is ApiException
      ? error.message
      : error is FormatException
      ? error.message
      : error.toString().replaceFirst('Bad state: ', '');

  Future<void> _save() async {
    if (_saving) return;
    final input = _input;
    if (input.validationError != null) {
      _snack(input.validationError!, error: true);
      return;
    }
    if (_grossIncome <= 0) {
      _snack('Enter your gross monthly income first.', error: true);
      return;
    }
    if (!_consent) {
      _snack('Please tick the consent box to save your result.', error: true);
      return;
    }
    _debounce?.cancel();
    _request++;
    final revision = _revision;
    setState(() {
      _saving = true;
      _loading = false;
    });
    try {
      final result = await ref
          .read(financeRepositoryProvider)
          .submitPrequalification(
            input: input,
            consent: _consent,
            propertyId: _propertyId,
          );
      if (!mounted) return;
      if (revision == _revision) {
        setState(() {
          _result = result;
          _savedId = result.id;
          _previewError = null;
        });
      }
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
          if (_historyLoading) const LinearProgressIndicator(),
          if (_historyError != null) ...[
            Text(
              'Saved results could not be loaded: $_historyError',
              style: const TextStyle(color: AppColors.danger),
            ),
            TextButton(
              onPressed: _loadHistory,
              child: const Text('Retry saved results'),
            ),
          ],
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
          const SizedBox(height: 14),
          _MoneyField(
            controller: _rate,
            label: 'Annual interest rate (%)',
            prefix: '',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 14),
          _MoneyField(
            controller: _term,
            label: 'Loan term (years, 1–40)',
            prefix: '',
            onChanged: (_) => _onChanged(),
          ),
          const SizedBox(height: 24),
          if (_previewError != null) ...[
            Text(
              _previewError!,
              style: const TextStyle(color: AppColors.danger),
            ),
            TextButton(
              onPressed: _loading ? null : _loadPreview,
              child: const Text('Retry estimate'),
            ),
          ],
          if (_savedId != null)
            const Text(
              'Saved prequalification loaded. Your estimate is indicative, not a credit approval.',
            ),
          if (_loading && result == null)
            const Center(child: CircularProgressIndicator())
          else if (result != null)
            _ResultCard(
              result: result,
              hasPropertyPrice: _num(_propertyPrice) > 0,
            )
          else if (_previewError == null)
            const Text(
              'Enter your gross monthly income to see your indicative estimate.',
            ),
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
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Save my prequalification'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed:
                _saving ||
                    _loading ||
                    result == null ||
                    _input.requestedBondAmount(result) <= 0
                ? null
                : () => context.push(
                    '/profile/home-loan/apply',
                    extra: _input.applicationPrefill(
                      result,
                      propertyId: _propertyId,
                      prequalificationId: _savedId,
                    ),
                  ),
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
  const _ResultCard({required this.result, required this.hasPropertyPrice});

  final PrequalResult result;
  final bool hasPropertyPrice;

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
                const Expanded(
                  child: Text(
                    'Indicative result',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
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
            _Row(
              label: 'Estimated max bond',
              value: Fmt.money(result.maxBondAmount),
            ),
            _Row(
              label: 'Max property price',
              value: Fmt.money(result.maxPropertyPrice),
            ),
            _Row(
              label: 'Max affordable instalment',
              value: '${Fmt.money(result.maxInstalment)} /mo',
            ),
            if (hasPropertyPrice) ...[
              _Row(
                label: 'Instalment for this deal',
                value: '${Fmt.money(result.estimatedInstalment)} /mo',
              ),
              _Row(
                label: 'Loan-to-value',
                value: Fmt.percent(result.loanToValue),
              ),
              Text(
                result.qualifies
                    ? 'This deal looks affordable on your income.'
                    : 'This deal looks stretched. Consider a bigger deposit or lower price.',
              ),
            ],
            _Row(
              label: 'Interest rate',
              value: Fmt.percent(result.annualInterestRate, decimals: 2),
            ),
            _Row(label: 'Term', value: '${result.loanTermYears} years'),
            if (result.notes != null && result.notes!.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                result.notes!,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                ),
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
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
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
    this.prefix = 'R ',
  });

  final TextEditingController controller;
  final String label;
  final ValueChanged<String> onChanged;
  final String prefix;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      onChanged: onChanged,
      decoration: InputDecoration(labelText: label, prefixText: prefix),
    );
  }
}
