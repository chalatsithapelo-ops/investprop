import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/marketplace_repository.dart';
import '../domain/marketplace_models.dart';

class MarketplacePage extends ConsumerWidget {
  const MarketplacePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(marketplaceOverviewProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Share Marketplace')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(marketplaceOverviewProvider.future),
        child: AsyncValueView<List<MarketShareClass>>(
          value: overview,
          onRetry: () => ref.invalidate(marketplaceOverviewProvider),
          data: (classes) {
            if (classes.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.storefront_outlined,
                    title: 'No tradeable shares yet',
                    subtitle:
                        'Secondary-market share classes will appear here once '
                        'properties are tokenised for trading.',
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: classes.length,
              itemBuilder: (_, i) => _MarketCard(shareClass: classes[i]),
            );
          },
        ),
      ),
    );
  }
}

class _MarketCard extends StatelessWidget {
  const _MarketCard({required this.shareClass});

  final MarketShareClass shareClass;

  String? get _imageUrl {
    final url = shareClass.propertyImageUrl;
    if (url == null || url.isEmpty) return null;
    return url.startsWith('http') ? url : '${Env.apiBaseUrl}$url';
  }

  @override
  Widget build(BuildContext context) {
    final url = _imageUrl;
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/portfolio/marketplace/${shareClass.id}',
            extra: shareClass),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 120,
              width: double.infinity,
              child: url != null
                  ? CachedNetworkImage(
                      imageUrl: url,
                      fit: BoxFit.cover,
                      placeholder: (_, __) =>
                          Container(color: AppColors.border),
                      errorWidget: (_, __, ___) =>
                          Container(color: AppColors.border),
                    )
                  : Container(color: AppColors.border),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(shareClass.propertyTitle,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text('${shareClass.name} · ${shareClass.propertyCity}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _Metric(
                        label: 'Price',
                        value: Fmt.money(shareClass.pricePerShare),
                      ),
                      _Metric(
                        label: 'Best bid',
                        value: shareClass.bestBid == null
                            ? '—'
                            : Fmt.money(shareClass.bestBid!),
                        color: AppColors.success,
                      ),
                      _Metric(
                        label: 'Best ask',
                        value: shareClass.bestAsk == null
                            ? '—'
                            : Fmt.money(shareClass.bestAsk!),
                        color: AppColors.danger,
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _Tag(
                          icon: Icons.sell_outlined,
                          text: '${shareClass.openSellOrders} asks'),
                      const SizedBox(width: 8),
                      _Tag(
                          icon: Icons.shopping_cart_outlined,
                          text: '${shareClass.openBuyOrders} bids'),
                      const SizedBox(width: 8),
                      _Tag(
                          icon: Icons.people_outline,
                          text: '${shareClass.totalInvestors} holders'),
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

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
          const SizedBox(height: 2),
          Text(value,
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: color ?? AppColors.textPrimary)),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, size: 13, color: AppColors.textSecondary),
          const SizedBox(width: 4),
          Text(text,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}
