import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../data/referral_repository.dart';

/// Lets an investor request a warm introduction to a vetted partner service
/// (bond originator, conveyancer, auction house, insurer). Mirrors the web
/// referral-intro flow.
class ReferralServicesPage extends ConsumerWidget {
  const ReferralServicesPage({super.key});

  static const _icons = {
    PartnerType.bondOriginator: Icons.account_balance_outlined,
    PartnerType.conveyancer: Icons.gavel_outlined,
    PartnerType.auctionHouse: Icons.real_estate_agent_outlined,
    PartnerType.insurance: Icons.shield_outlined,
    PartnerType.other: Icons.handshake_outlined,
  };

  Future<void> _request(
    BuildContext context,
    WidgetRef ref,
    PartnerType type,
  ) async {
    final noteController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(type.label),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              type.blurb,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: noteController,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Add a note (optional)',
                hintText: 'Anything the partner should know',
                alignLabelWithHint: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Request intro'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(referralRepositoryProvider).requestIntro(
            type: type,
            note: noteController.text,
          );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Request sent — we'll connect you with a ${type.label.toLowerCase()}."),
          backgroundColor: AppColors.success,
        ),
      );
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Partner services')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Need a service for your property journey? Request a warm introduction to one of our vetted partners and they will reach out to you.',
            style: TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 20),
          ...PartnerType.values.map((type) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  leading: CircleAvatar(
                    backgroundColor: AppColors.navy.withValues(alpha: 0.1),
                    child: Icon(_icons[type], color: AppColors.navy),
                  ),
                  title: Text(
                    type.label,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(type.blurb),
                  trailing: FilledButton(
                    onPressed: () => _request(context, ref, type),
                    child: const Text('Request'),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
