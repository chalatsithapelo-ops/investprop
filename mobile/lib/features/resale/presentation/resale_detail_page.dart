import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../data/resale_repository.dart';

/// A single public resale listing with an "express interest / make an offer"
/// action. Mirrors the web resale listing detail + enquiry flow.
class ResaleDetailPage extends ConsumerStatefulWidget {
  const ResaleDetailPage({super.key, required this.id, this.initial});

  final int id;
  final ResaleListing? initial;

  @override
  ConsumerState<ResaleDetailPage> createState() => _ResaleDetailPageState();
}

class _ResaleDetailPageState extends ConsumerState<ResaleDetailPage> {
  late Future<ResaleListing?> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.initial != null
        ? Future.value(widget.initial)
        : ref.read(resaleRepositoryProvider).fetchListing(widget.id);
  }

  Future<void> _expressInterest(ResaleListing listing) async {
    final offer = TextEditingController();
    final message = TextEditingController();
    final phone = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Express interest'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Our team will receive your enquiry and get back to you about "${listing.title}".',
                style: const TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: offer,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Your offer (R, optional)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Contact number (optional)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: message,
                maxLines: 3,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Message (optional)',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Send enquiry'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      final offerVal = double.tryParse(offer.text.trim().replaceAll(',', ''));
      await ref.read(resaleRepositoryProvider).expressInterest(
            id: listing.id,
            offerAmount: offerVal,
            message: message.text,
            contactPhone: phone.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enquiry sent — our team will be in touch.'),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Resale listing')),
      body: FutureBuilder<ResaleListing?>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final listing = snap.data;
          if (listing == null) {
            return const Center(child: Text('Listing not found.'));
          }
          final discount = listing.discountPct;
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    SizedBox(
                      height: 220,
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
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            listing.title,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              const Icon(Icons.place_outlined,
                                  size: 16, color: AppColors.textSecondary),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  [listing.address, listing.city, listing.province]
                                      .where((e) => e.isNotEmpty)
                                      .join(', '),
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                Fmt.money(listing.askingPrice),
                                style: const TextStyle(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.navy,
                                ),
                              ),
                              const SizedBox(width: 10),
                              if (listing.marketValue != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Text(
                                    'Market ${Fmt.compactMoney(listing.marketValue!)}',
                                    style: const TextStyle(
                                      color: AppColors.textSecondary,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          if (discount != null && discount > 0)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color:
                                      AppColors.success.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  '${discount.toStringAsFixed(0)}% below market value',
                                  style: const TextStyle(
                                    color: AppColors.success,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ),
                          const SizedBox(height: 20),
                          _Specs(listing: listing),
                          if (listing.description.isNotEmpty) ...[
                            const SizedBox(height: 20),
                            const Text(
                              'About this property',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              listing.description,
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: ElevatedButton.icon(
                    onPressed: () => _expressInterest(listing),
                    icon: const Icon(Icons.mail_outline),
                    label: const Text('Express interest / make an offer'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Specs extends StatelessWidget {
  const _Specs({required this.listing});
  final ResaleListing listing;

  @override
  Widget build(BuildContext context) {
    final items = <(IconData, String)>[
      if (listing.bedrooms != null) (Icons.bed_outlined, '${listing.bedrooms} bed'),
      if (listing.bathrooms != null)
        (Icons.bathtub_outlined, '${listing.bathrooms} bath'),
      if (listing.squareMeters != null)
        (Icons.square_foot_outlined, '${listing.squareMeters!.toStringAsFixed(0)} m²'),
      if (listing.erfSize != null)
        (Icons.crop_square, 'Erf ${listing.erfSize!.toStringAsFixed(0)} m²'),
      if (listing.propertyType.isNotEmpty)
        (Icons.home_work_outlined, listing.propertyType.replaceAll('_', ' ')),
    ];
    if (items.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: items.map((it) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(it.$1, size: 16, color: AppColors.navy),
              const SizedBox(width: 6),
              Text(it.$2, style: const TextStyle(fontSize: 13)),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _ImgFallback extends StatelessWidget {
  const _ImgFallback();
  @override
  Widget build(BuildContext context) => Container(
    color: AppColors.navyLight,
    child: const Center(
      child: Icon(Icons.home_work_outlined, color: Colors.white54, size: 48),
    ),
  );
}
