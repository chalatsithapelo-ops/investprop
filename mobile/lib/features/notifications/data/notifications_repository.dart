import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/app_notification.dart';

class NotificationsRepository {
  NotificationsRepository(this._client);

  final TrpcClient _client;

  Future<NotificationFeed> fetch() async {
    final data = await _client.query(
      'getNotifications',
      input: {'page': 1, 'limit': 30},
    );
    final map = data is Map ? data : const {};
    final rawList = map['notifications'];
    final items = rawList is List
        ? rawList
              .whereType<Map>()
              .map((e) => AppNotification.fromJson(Map<String, dynamic>.from(e)))
              .toList()
        : <AppNotification>[];
    final unread = map['unreadCount'];
    return NotificationFeed(
      items: items,
      unreadCount: unread is num ? unread.toInt() : 0,
    );
  }

  Future<void> markAsRead(int id) async {
    await _client.mutation(
      'markNotificationAsRead',
      input: {'notificationId': id},
    );
  }

  Future<void> markAllAsRead() async {
    await _client.mutation('markAllNotificationsAsRead');
  }
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.watch(trpcClientProvider));
});

final notificationsProvider = FutureProvider.autoDispose<NotificationFeed>((
  ref,
) async {
  return ref.watch(notificationsRepositoryProvider).fetch();
});

/// Convenience provider for the unread badge on the nav bar.
final unreadCountProvider = Provider.autoDispose<int>((ref) {
  return ref.watch(notificationsProvider).valueOrNull?.unreadCount ?? 0;
});
