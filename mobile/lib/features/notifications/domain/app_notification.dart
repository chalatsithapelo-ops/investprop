import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';

class AppNotification {
  AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.category,
    required this.read,
    required this.createdAt,
  });

  final int id;
  final String title;
  final String message;
  final String type;
  final String category;
  final bool read;
  final DateTime? createdAt;

  IconData get icon => switch (category.toUpperCase()) {
    'INVESTMENT' => Icons.trending_up,
    'PROPERTY' => Icons.apartment,
    'MILESTONE' => Icons.flag_outlined,
    _ => Icons.notifications_outlined,
  };

  Color get color => switch (type.toUpperCase()) {
    'SUCCESS' => AppColors.success,
    'WARNING' => AppColors.warning,
    'ERROR' => AppColors.danger,
    _ => AppColors.navy,
  };

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: asInt(json['id']),
      title: asString(json['title']),
      message: asString(json['message']),
      type: asString(json['type'], 'INFO'),
      category: asString(json['category'], 'SYSTEM'),
      read: json['read'] == true,
      createdAt: asDate(json['createdAt']),
    );
  }
}

class NotificationFeed {
  NotificationFeed({required this.items, required this.unreadCount});

  final List<AppNotification> items;
  final int unreadCount;
}
