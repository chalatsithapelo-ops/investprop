import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../firebase_options.dart';
import '../api/trpc_client.dart';
import '../providers.dart';
import 'push_config.dart';

/// Background/terminated message handler. Must be a top-level function so it can
/// run in its own isolate. The system tray renders `notification` payloads
/// automatically; this hook is a placeholder for data-only handling.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // No-op: display is handled by the OS for notification payloads.
}

/// Owns Firebase Cloud Messaging setup, foreground display, token registration
/// with the backend, and tap-to-open routing. Entirely inert until
/// [kFirebaseConfigured] is set true.
class PushService {
  PushService(this._ref);

  final Ref _ref;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  bool _initialised = false;

  /// Invoked with a route path when the user taps a notification.
  void Function(String route)? onOpenRoute;

  TrpcClient get _client => _ref.read(trpcClientProvider);

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'high_importance_channel',
    'Notifications',
    description: 'InvestProp alerts and updates',
    importance: Importance.high,
  );

  Future<void> initialise() async {
    if (!kFirebaseConfigured || _initialised) return;
    _initialised = true;

    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      const initSettings = InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      );
      await _local.initialize(
        initSettings,
        onDidReceiveNotificationResponse: (response) {
          final payload = response.payload;
          if (payload != null) _handleTapPayload(payload);
        },
      );
      await _local
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(_channel);

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      FirebaseMessaging.onMessage.listen(_showForeground);
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _handleTap(m.data));
      final initial = await messaging.getInitialMessage();
      if (initial != null) _handleTap(initial.data);
    } catch (e) {
      debugPrint('PushService.initialise failed: $e');
    }
  }

  /// Registers this device's FCM token with the backend for the current user.
  Future<void> registerToken() async {
    if (!kFirebaseConfigured) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _client.mutation(
        'registerDeviceToken',
        input: {'token': token, 'platform': 'android'},
      );
      FirebaseMessaging.instance.onTokenRefresh.listen((refreshed) {
        _client.mutation(
          'registerDeviceToken',
          input: {'token': refreshed, 'platform': 'android'},
        );
      });
    } catch (e) {
      debugPrint('PushService.registerToken failed: $e');
    }
  }

  /// Removes this device's token from the backend (called on logout).
  Future<void> unregisterToken() async {
    if (!kFirebaseConfigured) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await _client.mutation(
          'unregisterDeviceToken',
          input: {'token': token},
        );
      }
    } catch (e) {
      debugPrint('PushService.unregisterToken failed: $e');
    }
  }

  void _showForeground(RemoteMessage message) {
    final notification = message.notification;
    final title =
        notification?.title ?? (message.data['title'] as String?) ?? 'InvestProp';
    final body = notification?.body ?? (message.data['body'] as String?) ?? '';

    _local.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: jsonEncode(message.data),
    );
  }

  void _handleTapPayload(String payload) {
    try {
      final decoded = jsonDecode(payload);
      if (decoded is Map) {
        _handleTap(Map<String, dynamic>.from(decoded));
      }
    } catch (_) {
      // Ignore malformed payloads.
    }
  }

  void _handleTap(Map<String, dynamic> data) {
    // Server deep-link paths differ from the mobile route tree, so land on the
    // notifications screen which always exists.
    onOpenRoute?.call('/notifications');
  }
}

final pushServiceProvider = Provider<PushService>((ref) => PushService(ref));
