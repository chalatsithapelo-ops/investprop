import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../domain/distressed_deal.dart';

class DistressedDealCard extends StatelessWidget {
  const DistressedDealCard({
    super.key,
    required this.deal,
    required this.onTap,
  });

  final DistressedDeal deal;
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
            _Cover(deal: deal),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    deal.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
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
                          deal.location.isEmpty
                              ? 'South Africa'
                              : deal.location,
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
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Asking price',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              Fmt.compactMoney(deal.askingPrice),
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: AppColors.navy,
                              ),
                            ),
                            if (deal.hasPriceDrop)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  '↓ ${deal.priceDropPct!.toStringAsFixed(0)}%'
                                  '${deal.previousPrice != null ? ' from ${Fmt.compactMoney(deal.previousPrice!)}' : ''}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.danger,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if ((deal.discount ?? 0) > 0)
                        _DiscountBadge(discount: deal.discount!),
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

class _Cover extends StatelessWidget {
  const _Cover({required this.deal});

  final DistressedDeal deal;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SizedBox(
          height: 150,
          width: double.infinity,
          child: deal.imageUrl != null && deal.imageUrl!.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: deal.imageUrl!,
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
            text: deal.isAuction ? 'Auction' : 'Distressed',
            background: AppColors.navy.withValues(alpha: 0.85),
            foreground: Colors.white,
          ),
        ),
        if (deal.hasGrade)
          Positioned(
            top: 12,
            right: 12,
            child: GradePill(grade: deal.aiGrade!),
          ),
        if (deal.isNew)
          Positioned(
            bottom: 12,
            left: 12,
            child: _Pill(
              text: 'NEW',
              background: AppColors.gold,
              foreground: AppColors.navy,
            ),
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
        child: Icon(Icons.gavel, size: 42, color: Colors.white54),
      ),
    );
  }
}

class _DiscountBadge extends StatelessWidget {
  const _DiscountBadge({required this.discount});

  final double discount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.success.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '${discount.toStringAsFixed(0)}% off',
        style: const TextStyle(
          color: AppColors.success,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
    );
  }
}

class GradePill extends StatelessWidget {
  const GradePill({super.key, required this.grade});

  final String grade;

  @override
  Widget build(BuildContext context) {
    final color = DistressedDeal.gradeColorFor(grade);
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        grade,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 14,
        ),
      ),
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
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
