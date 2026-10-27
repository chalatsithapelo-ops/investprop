import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../auth/application/auth_controller.dart';
import '../data/wallet_repository.dart';
import '../domain/wallet_models.dart';

/// In-app wallet: fund via Paystack (EFT/card), view transactions and
/// withdraw proceeds to a bank account. Matched share trades settle instantly
/// from the wallet balance (Delivery-versus-Payment).
class WalletPage extends ConsumerWidget {
  const WalletPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(myWalletProvider);
    final isManager = ref.watch(authControllerProvider).user?.isManager == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Wallet'),
        actions: [
          if (isManager)
            IconButton(
              tooltip: 'Withdrawal queue',
              icon: const Icon(Icons.inbox_outlined),
              onPressed: () => context.push('/portfolio/wallet/queue'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myWalletProvider);
          ref.invalidate(myWithdrawalsProvider);
        },
        child: AsyncValueView<Wallet>(
          value: wallet,
          onRetry: () => ref.invalidate(myWalletProvider),
          data: (w) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _BalanceCard(wallet: w),
              const SizedBox(height: 16),
              _ActionsRow(wallet: w),
              const SizedBox(height: 24),
              const _SectionHeader('Recent transactions'),
              const SizedBox(height: 8),
              if (w.transactions.isEmpty)
                const _MutedCard(
                  'No transactions yet. Fund your wallet to get started.',
                )
              else
                ...w.transactions.map((t) => _TransactionTile(txn: t)),
              const SizedBox(height: 24),
              const _SectionHeader('My withdrawals'),
              const SizedBox(height: 8),
              const _MyWithdrawalsList(),
            ],
          ),
        ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet});

  final Wallet wallet;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.navy,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Available balance',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 6),
            Text(
              Fmt.money(wallet.balanceRands, detailed: true),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (wallet.pendingWithdrawalRands > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.schedule, size: 15, color: AppColors.gold),
                  const SizedBox(width: 6),
                  Text(
                    '${Fmt.money(wallet.pendingWithdrawalRands, detailed: true)} reserved for pending withdrawals',
                    style: const TextStyle(color: AppColors.gold, fontSize: 12),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActionsRow extends ConsumerStatefulWidget {
  const _ActionsRow({required this.wallet});

  final Wallet wallet;

  @override
  ConsumerState<_ActionsRow> createState() => _ActionsRowState();
}

class _ActionsRowState extends ConsumerState<_ActionsRow> {
  bool _busy = false;

  Future<void> _fund() async {
    final amount = await showDialog<double>(
      context: context,
      builder: (_) => const _AmountDialog(
        title: 'Fund wallet',
        hint: 'Amount in Rand (min R10)',
        minimum: 10,
      ),
    );
    if (amount == null) return;
    setState(() => _busy = true);
    try {
      final init = await ref
          .read(walletRepositoryProvider)
          .initiateDeposit(amountRands: amount);
      if (init.authorizationUrl.isEmpty) {
        _snack('Could not start the deposit. Please try again.', error: true);
        return;
      }
      final launched = await launchUrl(
        Uri.parse(init.authorizationUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        _snack('Could not open the payment page.', error: true);
        return;
      }
      if (mounted) _showVerifySheet(init.reference);
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Could not start the deposit. Please try again.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showVerifySheet(String reference) {
    showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      builder: (sheetCtx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.open_in_browser, size: 40, color: AppColors.navy),
            const SizedBox(height: 12),
            const Text(
              'Complete your payment in the browser, then tap below to confirm.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () async {
                  final ok = await ref
                      .read(walletRepositoryProvider)
                      .verifyDeposit(reference);
                  if (!sheetCtx.mounted) return;
                  Navigator.of(sheetCtx).pop();
                  if (ok) {
                    _snack('Deposit confirmed. Balance updated.');
                    ref.invalidate(myWalletProvider);
                  } else {
                    _snack(
                      'Payment not confirmed yet. If you completed it, try '
                      'again in a moment.',
                      error: true,
                    );
                  }
                },
                child: const Text('I have paid — confirm'),
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(sheetCtx).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
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
    return Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            onPressed: _busy ? null : _fund,
            icon: _busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.add),
            label: const Text('Fund'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => context.push('/portfolio/wallet/withdraw'),
            icon: const Icon(Icons.account_balance_outlined),
            label: const Text('Withdraw'),
          ),
        ),
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({required this.txn});

  final WalletTransaction txn;

  @override
  Widget build(BuildContext context) {
    final credit = txn.isCredit;
    final pending = txn.status == 'PENDING';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: (credit ? AppColors.success : AppColors.danger)
              .withValues(alpha: 0.12),
          child: Icon(
            credit ? Icons.south_west : Icons.north_east,
            color: credit ? AppColors.success : AppColors.danger,
            size: 20,
          ),
        ),
        title: Text(txn.typeLabel),
        subtitle: Text(
          '${txn.description ?? txn.reference}\n${Fmt.dateTime(txn.createdAt)}'
          '${pending ? ' · Pending' : ''}',
          style: const TextStyle(fontSize: 12),
        ),
        isThreeLine: true,
        trailing: Text(
          '${credit ? '+' : ''}${Fmt.money(txn.amountRands, detailed: true)}',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: credit ? AppColors.success : AppColors.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _MyWithdrawalsList extends ConsumerWidget {
  const _MyWithdrawalsList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final withdrawals = ref.watch(myWithdrawalsProvider);
    return withdrawals.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => _MutedCard('Could not load withdrawals.'),
      data: (items) {
        if (items.isEmpty) {
          return const _MutedCard('No withdrawals yet.');
        }
        return Column(
          children: items.map((w) => _WithdrawalTile(withdrawal: w)).toList(),
        );
      },
    );
  }
}

class _WithdrawalTile extends StatelessWidget {
  const _WithdrawalTile({required this.withdrawal});

  final MyWithdrawal withdrawal;

  Color get _statusColor => switch (withdrawal.status) {
    'PAID' => AppColors.success,
    'REJECTED' || 'FAILED' => AppColors.danger,
    _ => AppColors.warning,
  };

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(Fmt.money(withdrawal.amountRands, detailed: true)),
        subtitle: Text(
          '${withdrawal.bankName} · ${Fmt.date(withdrawal.createdAt)}'
          '${withdrawal.reviewNotes != null ? '\n${withdrawal.reviewNotes}' : ''}',
          style: const TextStyle(fontSize: 12),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: _statusColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            withdrawal.statusLabel,
            style: TextStyle(
              color: _statusColor,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Text(
    title,
    style: const TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w700,
      color: AppColors.textPrimary,
    ),
  );
}

class _MutedCard extends StatelessWidget {
  const _MutedCard(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Text(text, style: const TextStyle(color: AppColors.textSecondary)),
    ),
  );
}

/// Simple numeric-amount prompt used for funding.
class _AmountDialog extends StatefulWidget {
  const _AmountDialog({
    required this.title,
    required this.hint,
    required this.minimum,
  });

  final String title;
  final String hint;
  final double minimum;

  @override
  State<_AmountDialog> createState() => _AmountDialogState();
}

class _AmountDialogState extends State<_AmountDialog> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = double.tryParse(_controller.text.trim());
    if (value == null || value < widget.minimum) {
      setState(
        () => _error =
            'Enter an amount of at least ${Fmt.money(widget.minimum, detailed: true)}',
      );
      return;
    }
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          prefixText: 'R ',
          hintText: widget.hint,
          errorText: _error,
        ),
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Continue')),
      ],
    );
  }
}
