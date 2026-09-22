import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../auth/application/auth_controller.dart';
import '../../kyc/data/kyc_repository.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final isOwner = user?.isPropertyOwner == true;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: AppColors.navy,
                child: Text(
                  user?.initials ?? '?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.name ?? 'Investor',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      user?.email ?? '',
                      style: const TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Card(
            child: Column(
              children: [
                _InfoRow(label: 'Role', value: user?.roleLabel ?? '—'),
                if (!isOwner) ...[
                  const Divider(height: 1),
                  _InfoRow(
                    label: 'Investor code',
                    value: user?.investorCode ?? '—',
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Account',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                _FicaTile(),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.edit_outlined, color: AppColors.navy),
                  title: const Text('Edit profile'),
                  subtitle: const Text('Name and contact details'),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => context.push('/profile/edit'),
                ),
                const Divider(height: 1),
                if (!isOwner) ...[
                  ListTile(
                    leading: const Icon(Icons.description_outlined,
                        color: AppColors.navy),
                    title: const Text('Investor statement'),
                    subtitle: const Text('Positions, income and tax withheld'),
                    trailing: const Icon(Icons.chevron_right, size: 20),
                    onTap: () => context.push('/profile/statement'),
                  ),
                  const Divider(height: 1),
                ],
                ListTile(
                  leading: const Icon(Icons.language, color: AppColors.navy),
                  title: const Text('Manage on the web'),
                  subtitle: const Text(Env.apiBaseUrl),
                  trailing: const Icon(Icons.open_in_new, size: 18),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Your web and app data stay in sync automatically.',
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Documents & reports',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                if (!isOwner) ...[
                  ListTile(
                    leading: const Icon(Icons.workspace_premium_outlined,
                        color: AppColors.navy),
                    title: const Text('Share certificates'),
                    subtitle: const Text('View and download your certificates'),
                    trailing: const Icon(Icons.chevron_right, size: 20),
                    onTap: () => context.push('/profile/certificates'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.receipt_long_outlined,
                        color: AppColors.navy),
                    title: const Text('Tax certificates'),
                    subtitle: const Text('IT3 income summaries by tax year'),
                    trailing: const Icon(Icons.chevron_right, size: 20),
                    onTap: () => context.push('/profile/tax-certificates'),
                  ),
                  const Divider(height: 1),
                ],
                ListTile(
                  leading: const Icon(Icons.folder_open_outlined,
                      color: AppColors.navy),
                  title: const Text('My documents'),
                  subtitle: const Text('Agreements and shared files'),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => context.push('/profile/documents'),
                ),
                if (!isOwner) ...[
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.verified_outlined,
                        color: AppColors.navy),
                    title: const Text('Platform track record'),
                    subtitle: const Text('Delivery and distribution history'),
                    trailing: const Icon(Icons.chevron_right, size: 20),
                    onTap: () => context.push('/profile/track-record'),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmLogout(context, ref),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.danger,
              side: const BorderSide(color: AppColors.danger),
              minimumSize: const Size.fromHeight(52),
            ),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
          ),
          const SizedBox(height: 16),
          const Center(
            child: Text(
              'InvestProp · v1.0.0',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to continue.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary)),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _FicaTile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fica = ref.watch(myFicaStatusProvider).valueOrNull;

    String subtitle;
    Color color;
    if (fica == null) {
      subtitle = 'Identity verification';
      color = AppColors.textSecondary;
    } else if (fica.ficaVerified || fica.ficaExempt) {
      subtitle = 'Verified';
      color = AppColors.success;
    } else if (fica.pendingDocuments.isNotEmpty) {
      subtitle = 'Under review';
      color = AppColors.warning;
    } else {
      subtitle = 'Not verified — tap to start';
      color = AppColors.textSecondary;
    }

    return ListTile(
      leading: const Icon(Icons.verified_user_outlined, color: AppColors.navy),
      title: const Text('FICA verification'),
      subtitle: Text(subtitle, style: TextStyle(color: color)),
      trailing: const Icon(Icons.chevron_right, size: 20),
      onTap: () => context.push('/profile/kyc'),
    );
  }
}
