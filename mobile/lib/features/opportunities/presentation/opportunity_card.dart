import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../domain/opportunity.dart';

class OpportunityCard extends StatelessWidget {
  const OpportunityCard({
    super.key,
    required this.opportunity,
    required this.onTap,
  });

  final Opportunity opportunity;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Cover(opportunity: opportunity),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    opportunity.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 15,
                        color: AppColors.textSecondary,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          opportunity.location.isEmpty
                              ? 'South Africa'
                              : opportunity.location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      _Metric(
                        label: 'Price',
                        value: Fmt.compactMoney(opportunity.price),
                      ),
                      _Metric(
                        label: 'Est. return',
                        value: Fmt.percent(opportunity.expectedReturns),
                        highlight: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _FundingBar(opportunity: opportunity),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({required this.opportunity});

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SizedBox(
          height: 160,
          width: double.infinity,
          child: opportunity.imageUrl != null
              ? CachedNetworkImage(
                  imageUrl: opportunity.imageUrl!,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Container(color: AppColors.border),
                  errorWidget: (_, __, ___) => const _CoverFallback(),
                )
              : const _CoverFallback(),
        ),
        Positioned(
          top: 12,
          left: 12,
          child: _Pill(
            text: opportunity.strategyLabel,
            background: AppColors.navy.withValues(alpha: 0.85),
            foreground: Colors.white,
          ),
        ),
        Positioned(
          top: 12,
          right: 12,
          child: RiskPill(rating: opportunity.riskRating),
        ),
      ],
    );
  }
}

class _CoverFallback extends StatelessWidget {
  const _CoverFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.navyLight,
      child: const Center(
        child: Icon(Icons.apartment, size: 44, color: Colors.white54),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: highlight ? AppColors.success : AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _FundingBar extends StatelessWidget {
  const _FundingBar({required this.opportunity});

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: opportunity.fundingProgress,
            minHeight: 8,
            backgroundColor: AppColors.border,
            valueColor: const AlwaysStoppedAnimation(AppColors.gold),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${Fmt.compactMoney(opportunity.fundingRaised)} raised',
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
            Text(
              '${(opportunity.fundingProgress * 100).round()}% of ${Fmt.compactMoney(opportunity.fundingGoal)}',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.text,
    required this.background,
    required this.foreground,
  });

  final String text;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: foreground,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class RiskPill extends StatelessWidget {
  const RiskPill({super.key, required this.rating});

  final String rating;

  @override
  Widget build(BuildContext context) {
    final color = switch (rating.toUpperCase()) {
      'LOW' => AppColors.success,
      'HIGH' => AppColors.danger,
      _ => AppColors.warning,
    };
    return _Pill(
      text: '${rating[0].toUpperCase()}${rating.substring(1).toLowerCase()} risk',
      background: color.withValues(alpha: 0.9),
      foreground: Colors.white,
    );
  }
}
