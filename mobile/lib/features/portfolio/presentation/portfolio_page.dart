import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../ai/presentation/portfolio_insight_card.dart';
import '../../investment/data/investment_repository.dart';
import '../data/portfolio_repository.dart';
import '../domain/holding.dart';

class PortfolioPage extends ConsumerWidget {
  const PortfolioPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Portfolio')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(portfolioProvider.future),
        child: AsyncValueView(
          value: portfolio,
          onRetry: () => ref.invalidate(portfolioProvider),
          data: (summary) {
            if (summary.holdings.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 24),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: _PaymentsDueBanner(),
                  ),
                  const SizedBox(height: 76),
                  const EmptyState(
                    icon: Icons.pie_chart_outline,
                    title: 'No holdings yet',
                    subtitle:
                        'Once you invest in an opportunity, your shares and '
                        'projected returns will appear here.',
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: FilledButton(
                      onPressed: () => context.go('/opportunities'),
                      child: const Text('Browse opportunities'),
                    ),
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                const _PaymentsDueBanner(),
                _SummaryCard(summary: summary),
                const SizedBox(height: 16),
                const _PortfolioTools(),
                const SizedBox(height: 16),
                const PortfolioInsightCard(),
                const SizedBox(height: 20),
                const Text(
                  'Holdings',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                ...summary.holdings.map(
                  (h) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _HoldingCard(holding: h),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _PortfolioTools extends StatelessWidget {
  const _PortfolioTools();

  @override
  Widget build(BuildContext context) {
    final tools = <(IconData, String, String)>[
      (Icons.payments_outlined, 'Distributions\n& Voting', '/portfolio/distributions'),
      (Icons.receipt_long_outlined, 'My\nContributions', '/portfolio/contributions'),
      (Icons.insights_outlined, 'Metrics', '/portfolio/metrics'),
      (Icons.storefront_outlined, 'Marketplace', '/portfolio/marketplace'),
      (Icons.list_alt_outlined, 'Share\nLedger', '/portfolio/ledger'),
    ];
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 0.85,
      children: [
        for (final (icon, label, route) in tools)
          InkWell(
            onTap: () => context.push(route),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: AppColors.navy, size: 24),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 10.5,
                        height: 1.1,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});

  final PortfolioSummary summary;

  @override
  Widget build(BuildContext context) {
    final gainPositive = summary.totalUnrealizedGain >= 0;
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
          const Text(
            'Portfolio value',
            style: TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 6),
          Text(
            Fmt.money(summary.totalValue),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
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
                '${gainPositive ? '+' : ''}${Fmt.money(summary.totalUnrealizedGain)} '
                '(${Fmt.percent(summary.totalReturnPercent)})',
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
              _SummaryStat(
                label: 'Invested',
                value: Fmt.compactMoney(summary.totalInvested),
              ),
              _SummaryStat(
                label: 'Distributed',
                value: Fmt.compactMoney(summary.totalDistributed),
              ),
              _SummaryStat(
                label: 'Holdings',
                value: '${summary.holdings.length}',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.label, required this.value});

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
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 12)),
        ],
      ),
    );
  }
}

class _HoldingCard extends StatelessWidget {
  const _HoldingCard({required this.holding});

  final Holding holding;

  @override
  Widget build(BuildContext context) {
    final gainPositive = holding.unrealizedGain >= 0;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/portfolio/holding/${holding.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  height: 64,
                  width: 64,
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
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      '${Fmt.percent(holding.ownershipPercentage, decimals: 2)} ownership · ${holding.shareClassName}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Value',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            Text(
                              Fmt.money(holding.currentValue),
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text(
                              'Unrealised',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            Text(
                              '${gainPositive ? '+' : ''}${Fmt.percent(holding.gainPercent)}',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: gainPositive
                                    ? AppColors.success
                                    : AppColors.danger,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(Icons.chevron_right,
                    color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _thumbFallback() => Container(
    color: AppColors.navyLight,
    child: const Icon(Icons.apartment, color: Colors.white54),
  );
}

class _PaymentsDueBanner extends ConsumerWidget {
  const _PaymentsDueBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payments = ref.watch(awaitingPaymentProvider).valueOrNull;
    if (payments == null || payments.isEmpty) return const SizedBox.shrink();

    final total = payments.fold<double>(
      0,
      (sum, c) => sum + c.contributionAmount,
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Material(
        color: AppColors.gold.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.push('/portfolio/payments'),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.account_balance_wallet_outlined,
                    color: AppColors.goldDark),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${payments.length} payment${payments.length == 1 ? '' : 's'} due',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      Text(
                        '${Fmt.money(total)} to complete your approved investments',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.textSecondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
