import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/opportunities_repository.dart';
import '../domain/opportunity.dart';
import 'opportunity_card.dart';

class OpportunityDetailPage extends ConsumerWidget {
  const OpportunityDetailPage({super.key, required this.id});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opportunity = ref.watch(opportunityByIdProvider(id));
    final opp = opportunity.valueOrNull;
    final canInvest = opp != null && opp.remainingToRaise > 0;

    return Scaffold(
      body: AsyncValueView(
        value: opportunity,
        onRetry: () => ref.invalidate(opportunityByIdProvider(id)),
        data: (opp) => _Detail(opportunity: opp),
      ),
      bottomNavigationBar: canInvest
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: ElevatedButton.icon(
                  onPressed: () => context.push('/opportunities/$id/invest'),
                  icon: const Icon(Icons.trending_up, size: 20),
                  label: const Text('Invest now'),
                ),
              ),
            )
          : null,
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.opportunity});

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 240,
          flexibleSpace: FlexibleSpaceBar(
            background: opportunity.imageUrl != null
                ? CachedNetworkImage(
                    imageUrl: opportunity.imageUrl!,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => Container(
                      color: AppColors.navyLight,
                      child: const Icon(
                        Icons.apartment,
                        size: 64,
                        color: Colors.white54,
                      ),
                    ),
                  )
                : Container(
                    color: AppColors.navyLight,
                    child: const Icon(
                      Icons.apartment,
                      size: 64,
                      color: Colors.white54,
                    ),
                  ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        opportunity.title,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    RiskPill(rating: opportunity.riskRating),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(
                      Icons.location_on_outlined,
                      size: 16,
                      color: AppColors.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        [opportunity.address, opportunity.location]
                            .where((s) => s.isNotEmpty)
                            .join(', '),
                        style: const TextStyle(color: AppColors.textSecondary),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                _MetricsGrid(opportunity: opportunity),
                const SizedBox(height: 20),
                _FundingSection(opportunity: opportunity),
                if (opportunity.description.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const Text(
                    'About this deal',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    opportunity.description,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      height: 1.5,
                    ),
                  ),
                ],
                if (opportunity.sponsorName != null) ...[
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      const Icon(
                        Icons.business_center_outlined,
                        size: 18,
                        color: AppColors.textSecondary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Sponsored by ${opportunity.sponsorName}',
                        style: const TextStyle(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 20),
                const _Disclaimer(),
                const SizedBox(height: 100),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.opportunity});

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      _Tile('Property price', Fmt.money(opportunity.price)),
      _Tile(
        'Est. return',
        Fmt.percent(opportunity.expectedReturns),
        color: AppColors.success,
      ),
      _Tile('Strategy', opportunity.strategyLabel),
      _Tile('Funding goal', Fmt.compactMoney(opportunity.fundingGoal)),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.4,
      children: tiles,
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.label, this.value, {this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: color ?? AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _FundingSection extends StatelessWidget {
  const _FundingSection({required this.opportunity});

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.navy,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Funding progress',
                style: TextStyle(color: Colors.white70),
              ),
              Text(
                '${(opportunity.fundingProgress * 100).round()}%',
                style: const TextStyle(
                  color: AppColors.gold,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: opportunity.fundingProgress,
              minHeight: 10,
              backgroundColor: Colors.white24,
              valueColor: const AlwaysStoppedAnimation(AppColors.gold),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _FundingStat('Raised', Fmt.money(opportunity.fundingRaised)),
              _FundingStat(
                'Remaining',
                Fmt.money(opportunity.remainingToRaise),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FundingStat extends StatelessWidget {
  const _FundingStat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white60, fontSize: 12)),
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

class _Disclaimer extends StatelessWidget {
  const _Disclaimer();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: const Text(
        'Projected returns are illustrative estimates based on the sponsor\'s '
        'assumptions, not financial advice or a guarantee. Capital is at risk. '
        'Review all deal documents before investing.',
        style: TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4),
      ),
    );
  }
}
