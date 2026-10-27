import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/wallet_repository.dart';
import '../domain/wallet_models.dart';

/// Manager-only queue of withdrawal requests awaiting payout. Marking a
/// request as paid completes it; rejecting refunds the reserved funds back to
/// the investor's wallet.
class WithdrawalQueuePage extends ConsumerWidget {
  const WithdrawalQueuePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(pendingWithdrawalsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Withdrawal queue')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(pendingWithdrawalsProvider),
        child: AsyncValueView<List<PendingWithdrawal>>(
          value: queue,
          onRetry: () => ref.invalidate(pendingWithdrawalsProvider),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.inbox_outlined,
                    title: 'No pending withdrawals',
                    subtitle:
                        'Payout requests from investors will appear here.',
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _QueueCard(withdrawal: items[i]),
            );
          },
        ),
      ),
    );
  }
}

class _QueueCard extends ConsumerStatefulWidget {
  const _QueueCard({required this.withdrawal});

  final PendingWithdrawal withdrawal;

  @override
  ConsumerState<_QueueCard> createState() => _QueueCardState();
}

class _QueueCardState extends ConsumerState<_QueueCard> {
  bool _busy = false;

  PendingWithdrawal get _w => widget.withdrawal;

  Future<void> _review(String action) async {
    String? notes;
    if (action == 'REJECT') {
      notes = await _promptReason();
      if (notes == null) return;
    } else {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Confirm payout'),
          content: Text(
            'Confirm you have paid ${Fmt.money(_w.amountRands, detailed: true)} '
            'to ${_w.accountName} at ${_w.bankName}?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Mark paid'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(walletRepositoryProvider)
          .reviewWithdrawal(
            withdrawalId: _w.id,
            action: action,
            reviewNotes: notes,
          );
      ref.invalidate(pendingWithdrawalsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            action == 'MARK_PAID'
                ? 'Withdrawal marked as paid.'
                : 'Withdrawal rejected and funds refunded.',
          ),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not process the withdrawal. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _promptReason() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Reject withdrawal'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Reason (optional)',
            hintText: 'Shown to the investor',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Reject & refund'),
          ),
        ],
      ),
    );
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _w.investorName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      if (_w.investorCode != null)
                        Text(
                          _w.investorCode!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                Text(
                  Fmt.money(_w.amountRands, detailed: true),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.navy,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _DetailRow(label: 'Bank', value: _w.bankName),
            _DetailRow(label: 'Account name', value: _w.accountName),
            _DetailRow(label: 'Account number', value: _w.accountNumber),
            if (_w.branchCode != null && _w.branchCode!.isNotEmpty)
              _DetailRow(label: 'Branch code', value: _w.branchCode!),
            _DetailRow(label: 'Requested', value: Fmt.dateTime(_w.createdAt)),
            const SizedBox(height: 12),
            if (_busy)
              const Center(child: CircularProgressIndicator())
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: const BorderSide(color: AppColors.danger),
                      ),
                      onPressed: () => _review('REJECT'),
                      child: const Text('Reject'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _review('MARK_PAID'),
                      child: const Text('Mark paid'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ),
      ],
    ),
  );
}
