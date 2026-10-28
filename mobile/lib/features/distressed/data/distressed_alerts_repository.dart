import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/format.dart';
import '../../../core/providers.dart';

/// A subscriber's distressed-deal alert configuration. Mirrors the web
/// `getMyDistressedAlerts` / `upsertDistressedAlerts` contract.
class DistressedAlertSubscription {
  const DistressedAlertSubscription({
    required this.active,
    required this.provinces,
    required this.cities,
    required this.maxPrice,
    required this.minDiscountPct,
    required this.minAIGrade,
    required this.propertyTypes,
    required this.channelEmail,
    required this.channelPush,
    required this.lastAlertedAt,
  });

  final bool active;
  final List<String> provinces;
  final List<String> cities;
  final double? maxPrice;
  final double? minDiscountPct;
  final String? minAIGrade;
  final List<String> propertyTypes;
  final bool channelEmail;
  final bool channelPush;
  final DateTime? lastAlertedAt;

  factory DistressedAlertSubscription.empty() =>
      const DistressedAlertSubscription(
        active: true,
        provinces: [],
        cities: [],
        maxPrice: null,
        minDiscountPct: null,
        minAIGrade: null,
        propertyTypes: [],
        channelEmail: true,
        channelPush: true,
        lastAlertedAt: null,
      );

  factory DistressedAlertSubscription.fromJson(Map<String, dynamic> json) {
    List<String> list(dynamic v) =>
        v is List ? v.map((e) => e.toString()).toList() : const [];
    double? dbl(dynamic v) {
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v);
      return null;
    }

    return DistressedAlertSubscription(
      active: json['active'] != false,
      provinces: list(json['provinces']),
      cities: list(json['cities']),
      maxPrice: dbl(json['maxPrice']),
      minDiscountPct: dbl(json['minDiscountPct']),
      minAIGrade: json['minAIGrade'] as String?,
      propertyTypes: list(json['propertyTypes']),
      channelEmail: json['channelEmail'] != false,
      channelPush: json['channelPush'] != false,
      lastAlertedAt: asDate(json['lastAlertedAt']),
    );
  }

  DistressedAlertSubscription copyWith({
    bool? active,
    List<String>? provinces,
    List<String>? cities,
    double? maxPrice,
    double? minDiscountPct,
    String? minAIGrade,
    List<String>? propertyTypes,
    bool? channelEmail,
    bool? channelPush,
  }) => DistressedAlertSubscription(
    active: active ?? this.active,
    provinces: provinces ?? this.provinces,
    cities: cities ?? this.cities,
    maxPrice: maxPrice ?? this.maxPrice,
    minDiscountPct: minDiscountPct ?? this.minDiscountPct,
    minAIGrade: minAIGrade ?? this.minAIGrade,
    propertyTypes: propertyTypes ?? this.propertyTypes,
    channelEmail: channelEmail ?? this.channelEmail,
    channelPush: channelPush ?? this.channelPush,
    lastAlertedAt: lastAlertedAt,
  );

  Map<String, dynamic> toInput() => {
    'active': active,
    'provinces': provinces,
    'cities': cities,
    if (maxPrice != null && maxPrice! > 0) 'maxPrice': maxPrice,
    if (minDiscountPct != null) 'minDiscountPct': minDiscountPct,
    if (minAIGrade != null) 'minAIGrade': minAIGrade,
    'propertyTypes': propertyTypes,
    'channelEmail': channelEmail,
    'channelPush': channelPush,
  };
}

/// Result of `getMyDistressedAlerts`: whether the user is entitled (plan gate)
/// plus the existing subscription (may be null if never configured).
class DistressedAlertsState {
  const DistressedAlertsState({required this.entitled, required this.subscription});

  final bool entitled;
  final DistressedAlertSubscription? subscription;
}

class DistressedAlertsRepository {
  DistressedAlertsRepository(this._client);

  final TrpcClient _client;

  Future<DistressedAlertsState> fetch() async {
    final data = await _client.query('getMyDistressedAlerts');
    final map = data is Map ? Map<String, dynamic>.from(data) : const {};
    final sub = map['subscription'];
    return DistressedAlertsState(
      entitled: map['entitled'] == true,
      subscription: sub is Map
          ? DistressedAlertSubscription.fromJson(Map<String, dynamic>.from(sub))
          : null,
    );
  }

  Future<void> save(DistressedAlertSubscription sub) async {
    await _client.mutation('upsertDistressedAlerts', input: sub.toInput());
  }
}

final distressedAlertsRepositoryProvider =
    Provider<DistressedAlertsRepository>((ref) {
      return DistressedAlertsRepository(ref.watch(trpcClientProvider));
    });

final distressedAlertsProvider =
    FutureProvider.autoDispose<DistressedAlertsState>((ref) async {
      return ref.watch(distressedAlertsRepositoryProvider).fetch();
    });
