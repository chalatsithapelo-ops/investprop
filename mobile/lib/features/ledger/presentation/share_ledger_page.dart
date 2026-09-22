import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/ledger_repository.dart';
import '../domain/share_ledger_entry.dart';

class ShareLedgerPage extends ConsumerWidget {
  const ShareLedgerPage({super.key});

  IconData _iconFor(String type) {
    if (type.contains('APPROVED') || type.contains('ISSUED')) {
      return Icons.check_circle_outline;
    }
    if (type.contains('TRANSFER')) return Icons.swap_horiz;
    if (type.contains('SUBMITTED') || type.contains('PROPOSAL')) {
      return Icons.article_outlined;
    }
    if (type.contains('SOLD') || type.contains('SELL')) {
      return Icons.trending_down;
    }
    if (type.contains('BUY') || type.contains('PURCHASE')) {
      return Icons.trending_up;
    }
    return Icons.receipt_long_outlined;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ledger = ref.watch(myLedgerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Share Ledger')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myLedgerProvider.future),
        child: AsyncValueView<List<ShareLedgerEntry>>(
          value: ledger,
          onRetry: () => ref.invalidate(myLedgerProvider),
          data: (entries) {
            if (entries.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.list_alt_outlined,
                    title: 'No ledger entries yet',
                    subtitle:
                        'Every share transaction — proposals, approvals, '
                        'issuance and transfers — is recorded here.',
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: entries.length,
              itemBuilder: (_, i) {
                final e = entries[i];
                return _LedgerTile(entry: e, icon: _iconFor(e.transactionType));
              },
            );
          },
        ),
      ),
    );
  }
}

class _LedgerTile extends StatelessWidget {
  const _LedgerTile({required this.entry, required this.icon});

  final ShareLedgerEntry entry;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.navy.withValues(alpha: 0.1),
              child: Icon(icon, size: 18, color: AppColors.navy),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(entry.typeLabel,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 14)),
                      ),
                      if (entry.totalAmount > 0)
                        Text(Fmt.money(entry.totalAmount),
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppColors.navy)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(entry.propertyTitle,
                      style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w600)),
                  if (entry.reference.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(entry.reference,
                        style: const TextStyle(fontSize: 12, height: 1.3)),
                  ],
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (entry.shares > 0) ...[
                        Text('${entry.shares} shares',
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textSecondary)),
                        const SizedBox(width: 8),
                      ],
                      Text(Fmt.date(entry.createdAt),
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.textSecondary)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
