import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../data/wallet_repository.dart';

/// Lets an investor request a payout of their wallet balance to a bank
/// account. The funds are reserved immediately and released once a manager
/// marks the payout as paid (or refunded if rejected).
class WithdrawPage extends ConsumerStatefulWidget {
  const WithdrawPage({super.key});

  @override
  ConsumerState<WithdrawPage> createState() => _WithdrawPageState();
}

class _WithdrawPageState extends ConsumerState<WithdrawPage> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _bankName = TextEditingController();
  final _accountName = TextEditingController();
  final _accountNumber = TextEditingController();
  final _branchCode = TextEditingController();
  bool _busy = false;
  double _amountValue = 0;

  @override
  void initState() {
    super.initState();
    _amount.addListener(() {
      final v = double.tryParse(_amount.text.trim()) ?? 0;
      if (v != _amountValue) setState(() => _amountValue = v);
    });
  }

  @override
  void dispose() {
    _amount.dispose();
    _bankName.dispose();
    _accountName.dispose();
    _accountNumber.dispose();
    _branchCode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(walletRepositoryProvider)
          .requestWithdrawal(
            amountRands: double.parse(_amount.text.trim()),
            bankName: _bankName.text.trim(),
            accountName: _accountName.text.trim(),
            accountNumber: _accountNumber.text.trim(),
            branchCode: _branchCode.text.trim(),
          );
      ref.invalidate(myWalletProvider);
      ref.invalidate(myWithdrawalsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Withdrawal requested. Funds reserved pending payout.'),
          backgroundColor: AppColors.success,
        ),
      );
      context.pop();
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not submit the withdrawal. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'Required' : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Withdraw funds')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Withdraw your wallet balance to a South African bank account. '
              'Payouts are reviewed by a manager; funds are reserved until paid.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Amount',
                prefixText: 'R ',
                helperText: 'Minimum R100',
              ),
              validator: (v) {
                final value = double.tryParse((v ?? '').trim());
                if (value == null) return 'Enter an amount';
                if (value < 100) return 'Minimum withdrawal is R100';
                return null;
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _bankName,
              decoration: const InputDecoration(labelText: 'Bank name'),
              validator: _required,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _accountName,
              decoration: const InputDecoration(
                labelText: 'Account holder name',
              ),
              validator: _required,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _accountNumber,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Account number'),
              validator: _required,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _branchCode,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Branch code (optional)',
              ),
            ),
            const SizedBox(height: 16),
            _FeeBreakdown(gross: _amountValue),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Request withdrawal'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Live disclosure of the withdrawal fee and the net amount the bank receives.
class _FeeBreakdown extends ConsumerWidget {
  const _FeeBreakdown({required this.gross});

  final double gross;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(withdrawalFeeScheduleProvider);
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (schedule) {
        if (!schedule.enabled || gross <= 0) return const SizedBox.shrink();
        final fee = schedule.feeFor(gross);
        final net = schedule.netFor(gross);
        String money(double v) => 'R${v.toStringAsFixed(2)}';
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              _row('Requested', money(gross)),
              const SizedBox(height: 6),
              _row('Withdrawal fee', '- ${money(fee)}'),
              const Divider(height: 18),
              _row('Paid to your bank', money(net), bold: true),
            ],
          ),
        );
      },
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    final style = TextStyle(
      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
      color: bold ? AppColors.textPrimary : AppColors.textSecondary,
    );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: style),
        Text(value, style: style),
      ],
    );
  }
}
