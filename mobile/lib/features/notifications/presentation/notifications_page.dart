import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/notifications_repository.dart';
import '../domain/app_notification.dart';

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(notificationsRepositoryProvider).markAllAsRead();
              ref.invalidate(notificationsProvider);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: AsyncValueView(
          value: feed,
          onRetry: () => ref.invalidate(notificationsProvider),
          data: (data) {
            if (data.items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.notifications_none,
                    title: 'You are all caught up',
                    subtitle: 'Updates about your investments will appear here.',
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: data.items.length,
              separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
              itemBuilder: (context, index) {
                final n = data.items[index];
                return _NotificationTile(
                  notification: n,
                  onTap: () async {
                    if (!n.read) {
                      await ref
                          .read(notificationsRepositoryProvider)
                          .markAsRead(n.id);
                      ref.invalidate(notificationsProvider);
                    }
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      tileColor: notification.read
          ? AppColors.surface
          : AppColors.gold.withValues(alpha: 0.06),
      leading: CircleAvatar(
        backgroundColor: notification.color.withValues(alpha: 0.12),
        child: Icon(notification.icon, color: notification.color, size: 20),
      ),
      title: Text(
        notification.title,
        style: TextStyle(
          fontWeight: notification.read ? FontWeight.w500 : FontWeight.w700,
          color: AppColors.textPrimary,
        ),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 2),
          Text(notification.message),
          const SizedBox(height: 4),
          Text(
            Fmt.relative(notification.createdAt),
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
      isThreeLine: true,
      trailing: notification.read
          ? null
          : Container(
              height: 10,
              width: 10,
              decoration: const BoxDecoration(
                color: AppColors.gold,
                shape: BoxShape.circle,
              ),
            ),
    );
  }
}
