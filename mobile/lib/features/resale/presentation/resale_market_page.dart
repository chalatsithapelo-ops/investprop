import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../data/resale_repository.dart';

/// Browse owner-listed properties published to the public resale market.
/// Mirrors the web resale-market browse experience.
class ResaleMarketPage extends ConsumerStatefulWidget {
  const ResaleMarketPage({super.key});

  @override
  ConsumerState<ResaleMarketPage> createState() => _ResaleMarketPageState();
}

const _provinces = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
];

class _ResaleMarketPageState extends ConsumerState<ResaleMarketPage> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(resaleListingsProvider);
    final filter = ref.watch(resaleFilterProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Resale market')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search by title, city or address',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _search.clear();
                              ref.read(resaleFilterProvider.notifier).update(
                                    (f) => f.copyWith(search: ''),
                                  );
                            },
                          ),
                  ),
                  onChanged: (v) => setState(() {}),
                  onSubmitted: (v) => ref
                      .read(resaleFilterProvider.notifier)
                      .update((f) => f.copyWith(search: v)),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: 8,
                    children: [
                      _ProvinceDropdown(
                        value: filter.province,
                        onChanged: (v) => ref
                            .read(resaleFilterProvider.notifier)
                            .update((f) => f.copyWith(province: v ?? '')),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => _ErrorState(
                onRetry: () => ref.invalidate(resaleListingsProvider),
              ),
              data: (listings) {
                if (listings.isEmpty) {
                  return const _EmptyState();
                }
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(resaleListingsProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: listings.length,
                    itemBuilder: (_, i) => _ResaleCard(listing: listings[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ProvinceDropdown extends StatelessWidget {
  const _ProvinceDropdown({required this.value, required this.onChanged});
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String?>(
          value: (value != null && value!.isNotEmpty) ? value : null,
          hint: const Text('All provinces'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('All provinces')),
            ..._provinces.map(
              (p) => DropdownMenuItem<String?>(value: p, child: Text(p)),
            ),
          ],
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _ResaleCard extends StatelessWidget {
  const _ResaleCard({required this.listing});
  final ResaleListing listing;

  @override
  Widget build(BuildContext context) {
    final discount = listing.discountPct;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/resale-market/${listing.id}', extra: listing),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                children: [
                  SizedBox(
                    height: 160,
                    width: double.infinity,
                    child: listing.coverImage != null
                        ? CachedNetworkImage(
                            imageUrl: listing.coverImage!,
                            fit: BoxFit.cover,
                            placeholder: (_, __) =>
                                Container(color: AppColors.border),
                            errorWidget: (_, __, ___) => const _ImgFallback(),
                          )
                        : const _ImgFallback(),
                  ),
                  if (discount != null && discount > 0)
                    Positioned(
                      top: 12,
                      right: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.success,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '${discount.toStringAsFixed(0)}% below market',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      listing.title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.place_outlined,
                            size: 14, color: AppColors.textSecondary),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            [listing.city, listing.province]
                                .where((e) => e.isNotEmpty)
                                .join(', '),
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 13,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          Fmt.money(listing.askingPrice),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.navy,
                          ),
                        ),
                        if (listing.conditionRating.isNotEmpty)
                          _Chip(label: listing.conditionRating),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: AppColors.background,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: AppColors.border),
    ),
    child: Text(
      label.replaceAll('_', ' '),
      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
    ),
  );
}

class _ImgFallback extends StatelessWidget {
  const _ImgFallback();
  @override
  Widget build(BuildContext context) => Container(
    color: AppColors.navyLight,
    child: const Center(
      child: Icon(Icons.home_work_outlined, color: Colors.white54, size: 40),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) => ListView(
    children: const [
      SizedBox(height: 120),
      Icon(Icons.storefront_outlined, size: 56, color: AppColors.textSecondary),
      SizedBox(height: 16),
      Center(
        child: Text(
          'No resale listings match your filters yet.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
      ),
    ],
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('Could not load the resale market.'),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    ),
  );
}
