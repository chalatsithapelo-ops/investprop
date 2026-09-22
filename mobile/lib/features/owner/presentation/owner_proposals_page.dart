import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/owner_repository.dart';
import '../domain/sale_proposal.dart';

/// Owner "My deals" screen — tracks submitted sale proposals, surfaces
/// counter-offers (accept / decline) and allows withdrawal.
class OwnerProposalsPage extends ConsumerWidget {
  const OwnerProposalsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final proposals = ref.watch(myProposalsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My deals'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Submit property',
            onPressed: () => context.go('/opportunities'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myProposalsProvider.future),
        child: AsyncValueView(
          value: proposals,
          onRetry: () => ref.invalidate(myProposalsProvider),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.sell_outlined,
                    title: 'No submissions yet',
                    subtitle:
                        'Submit a property or land to Investprop and track '
                        'its review progress here.',
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _ProposalCard(proposal: items[i]),
            );
          },
        ),
      ),
    );
  }
}

class _ProposalCard extends ConsumerStatefulWidget {
  const _ProposalCard({required this.proposal});

  final SaleProposal proposal;

  @override
  ConsumerState<_ProposalCard> createState() => _ProposalCardState();
}

class _ProposalCardState extends ConsumerState<_ProposalCard> {
  bool _busy = false;

  Color get _statusColor => switch (widget.proposal.status) {
    SaleProposalStatus.accepted => AppColors.success,
    SaleProposalStatus.rejected => AppColors.danger,
    SaleProposalStatus.withdrawn => AppColors.textSecondary,
    SaleProposalStatus.underReview => AppColors.gold,
    SaleProposalStatus.pending => AppColors.navyLight,
  };

  Future<void> _respond(bool accept) async {
    setState(() => _busy = true);
    try {
      await ref.read(ownerRepositoryProvider).respondToCounterOffer(
            proposalId: widget.proposal.id,
            accept: accept,
          );
      ref.invalidate(myProposalsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(accept
                ? 'Counter-offer accepted.'
                : 'Counter-offer declined.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw proposal?'),
        content: Text(
          'This removes "${widget.proposal.title}" from review. '
          'You can submit a new proposal later.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(ownerRepositoryProvider).withdraw(widget.proposal.id);
      ref.invalidate(myProposalsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.proposal;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  p.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  p.status.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            p.location,
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _MiniStat('Asking', Fmt.money(p.askingPrice)),
              const SizedBox(width: 20),
              _MiniStat('Type', OwnerOptions.label(p.propertyType)),
              const SizedBox(width: 20),
              _MiniStat('Terms', OwnerOptions.label(p.saleType)),
            ],
          ),
          if (p.createdAt != null) ...[
            const SizedBox(height: 8),
            Text(
              'Submitted ${Fmt.date(p.createdAt)}',
              style:
                  const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
          if (p.reviewNotes != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'Reviewer note: ${p.reviewNotes}',
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textPrimary, height: 1.4),
              ),
            ),
          ],
          if (p.hasPendingCounterOffer) _counterOffer(p),
          if (p.canWithdraw && !p.hasPendingCounterOffer) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _busy ? null : _withdraw,
                icon: const Icon(Icons.close, size: 18),
                label: const Text('Withdraw'),
                style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _counterOffer(SaleProposal p) {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gold.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'COUNTER-OFFER RECEIVED',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppColors.warning,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            Fmt.money(p.counterOfferAmount ?? 0),
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          Text(
            'You asked ${Fmt.money(p.askingPrice)}',
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (p.counterOfferTerms != null) ...[
            const SizedBox(height: 8),
            Text(
              p.counterOfferTerms!,
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textPrimary, height: 1.4),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: _busy ? null : () => _respond(true),
                  child: const Text('Accept'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () => _respond(false),
                  child: const Text('Decline'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style:
                const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
