import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/portfolio_repository.dart';
import '../domain/holding.dart';

/// Detailed view of a single portfolio holding: position, projected returns,
/// distributions received, and the cooling-off withdrawal right.
class HoldingDetailPage extends ConsumerWidget {
  const HoldingDetailPage({super.key, required this.holdingId});

  final int holdingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Holding')),
      body: AsyncValueView(
        value: portfolio,
        onRetry: () => ref.invalidate(portfolioProvider),
        data: (summary) {
          Holding? holding;
          for (final h in summary.holdings) {
            if (h.id == holdingId) {
              holding = h;
              break;
            }
          }
          if (holding == null) {
            return const EmptyState(
              icon: Icons.search_off,
              title: 'Holding not found',
              subtitle: 'This holding is no longer in your portfolio.',
            );
          }
          return _HoldingDetailBody(holding: holding);
        },
      ),
    );
  }
}

class _HoldingDetailBody extends ConsumerWidget {
  const _HoldingDetailBody({required this.holding});

  final Holding holding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final distributions = ref.watch(distributionsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(portfolioProvider);
        return ref.refresh(distributionsProvider.future);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _Header(holding: holding),
          const SizedBox(height: 20),
          _ValueCard(holding: holding),
          const SizedBox(height: 20),
          _SectionTitle('Position'),
          const SizedBox(height: 8),
          _StatTile(
            label: 'Shares owned',
            value: holding.sharesOwned.toStringAsFixed(0),
          ),
          _StatTile(
            label: 'Share class',
            value: holding.shareClassName,
          ),
          _StatTile(
            label: 'Ownership',
            value: Fmt.percent(holding.ownershipPercentage, decimals: 2),
          ),
          _StatTile(
            label: 'Amount invested',
            value: Fmt.money(holding.investedAmount),
          ),
          const SizedBox(height: 20),
          _SectionTitle('Projected returns'),
          const SizedBox(height: 8),
          _StatTile(
            label: 'Annual yield',
            value: Fmt.percent(holding.projectedAnnualYield),
          ),
          _StatTile(
            label: 'Annual income',
            value: Fmt.money(holding.projectedAnnualIncome),
          ),
          _StatTile(
            label: '5-year projection',
            value: Fmt.money(holding.projected5YearReturn),
            hint: 'Projected total return over 5 years. Not guaranteed.',
          ),
          const SizedBox(height: 20),
          _SectionTitle('Distributions'),
          const SizedBox(height: 8),
          AsyncValueView(
            value: distributions,
            loading: const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
            onRetry: () => ref.invalidate(distributionsProvider),
            data: (summary) {
              final payouts = summary.forProperty(holding.propertyId);
              if (payouts.isEmpty) {
                return const _DistributionsEmpty();
              }
              return Column(
                children: [
                  for (final p in payouts) _PayoutTile(payout: p),
                ],
              );
            },
          ),
          const SizedBox(height: 20),
          if (holding.isWithinCoolingOff) _CoolingOffCard(holding: holding),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.holding});

  final Holding holding;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 72,
            width: 72,
            child: holding.imageUrl != null
                ? CachedNetworkImage(
                    imageUrl: holding.imageUrl!,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _thumbFallback(),
                  )
                : _thumbFallback(),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                holding.propertyTitle,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              if (holding.location.isNotEmpty) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.place_outlined,
                        size: 15, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        holding.location,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              TextButton(
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 0),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: () =>
                    context.push('/opportunities/${holding.propertyId}'),
                child: const Text('View property'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _thumbFallback() => Container(
        color: AppColors.navyLight,
        child: const Icon(Icons.apartment, color: Colors.white54),
      );
}

class _ValueCard extends StatelessWidget {
  const _ValueCard({required this.holding});

  final Holding holding;

  @override
  Widget build(BuildContext context) {
    final gainPositive = holding.unrealizedGain >= 0;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.navy, AppColors.navyLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Current value', style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 6),
          Text(
            Fmt.money(holding.currentValue),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                gainPositive ? Icons.trending_up : Icons.trending_down,
                color: gainPositive ? AppColors.gold : Colors.redAccent,
                size: 18,
              ),
              const SizedBox(width: 4),
              Text(
                '${gainPositive ? '+' : ''}${Fmt.money(holding.unrealizedGain)} '
                '(${Fmt.percent(holding.gainPercent)})',
                style: TextStyle(
                  color: gainPositive ? AppColors.gold : Colors.redAccent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const Divider(color: Colors.white24, height: 28),
          Row(
            children: [
              _MiniStat(
                label: 'Invested',
                value: Fmt.compactMoney(holding.investedAmount),
              ),
              _MiniStat(
                label: 'Distributed',
                value: Fmt.compactMoney(holding.totalDistributed),
              ),
              _MiniStat(
                label: 'Shares',
                value: holding.sharesOwned.toStringAsFixed(0),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(color: Colors.white60, fontSize: 12)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, this.hint});

  final String label;
  final String value;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
          if (hint != null) ...[
            const SizedBox(height: 2),
            Text(
              hint!,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
          ],
          const Divider(height: 16, color: AppColors.border),
        ],
      ),
    );
  }
}

class _PayoutTile extends StatelessWidget {
  const _PayoutTile({required this.payout});

  final DistributionPayout payout;

  @override
  Widget build(BuildContext context) {
    final paid = payout.isPaid;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            height: 40,
            width: 40,
            decoration: BoxDecoration(
              color: (paid ? AppColors.success : AppColors.warning)
                  .withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              paid ? Icons.payments_outlined : Icons.schedule,
              size: 20,
              color: paid ? AppColors.success : AppColors.warning,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payout.typeLabel,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${paid ? 'Paid' : 'Pending'} · ${Fmt.date(payout.date)}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                Fmt.money(payout.netAmount, detailed: true),
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              if (payout.taxWithheld > 0)
                Text(
                  'Tax ${Fmt.money(payout.taxWithheld, detailed: true)}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DistributionsEmpty extends StatelessWidget {
  const _DistributionsEmpty();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: const Row(
        children: [
          Icon(Icons.savings_outlined, color: AppColors.textSecondary),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'No distributions yet. Rental income and other payouts for this '
              'holding will appear here once declared.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _CoolingOffCard extends ConsumerStatefulWidget {
  const _CoolingOffCard({required this.holding});

  final Holding holding;

  @override
  ConsumerState<_CoolingOffCard> createState() => _CoolingOffCardState();
}

class _CoolingOffCardState extends ConsumerState<_CoolingOffCard> {
  bool _submitting = false;

  Future<void> _confirm() async {
    final holding = widget.holding;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this investment?'),
        content: Text(
          'You are within the ${Holding.coolingOffDays}-day cooling-off window. '
          'Cancelling returns all ${holding.sharesOwned.toStringAsFixed(0)} '
          'shares and refunds ${Fmt.money(holding.investedAmount)}. '
          'This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep investment'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel & refund'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      final message = await ref
          .read(portfolioRepositoryProvider)
          .requestCoolingOff(shareHoldingId: holding.id);
      if (!mounted) return;
      ref.invalidate(portfolioProvider);
      ref.invalidate(distributionsProvider);
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Withdrawal processed'),
          content: Text(message),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Done'),
            ),
          ],
        ),
      );
      if (mounted) context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not process withdrawal: $e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = widget.holding.coolingOffDaysRemaining;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.gavel_outlined, color: AppColors.warning),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Cooling-off period · $remaining day${remaining == 1 ? '' : 's'} left',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'You may cancel this investment for a full refund until the '
            'cooling-off window closes. After that, you can sell your shares '
            'on the marketplace instead.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.danger,
                side: const BorderSide(color: AppColors.danger),
              ),
              onPressed: _submitting ? null : _confirm,
              icon: _submitting
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.undo),
              label: Text(
                _submitting ? 'Processing…' : 'Cancel & request refund',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
