import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/format.dart';
import '../../../core/providers.dart';

/// A property listed on the public resale market (an owner sale proposal that
/// managers have published). Mirrors `serialisePublicListing` on the web.
class ResaleListing {
  const ResaleListing({
    required this.id,
    required this.title,
    required this.description,
    required this.address,
    required this.city,
    required this.province,
    required this.propertyType,
    required this.askingPrice,
    required this.marketValue,
    required this.bedrooms,
    required this.bathrooms,
    required this.squareMeters,
    required this.erfSize,
    required this.imageUrls,
    required this.conditionRating,
    required this.publiclyListedAt,
  });

  final int id;
  final String title;
  final String description;
  final String address;
  final String city;
  final String province;
  final String propertyType;
  final double askingPrice;
  final double? marketValue;
  final int? bedrooms;
  final int? bathrooms;
  final double? squareMeters;
  final double? erfSize;
  final List<String> imageUrls;
  final String conditionRating;
  final DateTime? publiclyListedAt;

  String? get coverImage => imageUrls.isNotEmpty ? imageUrls.first : null;

  /// Discount to market value, as a percentage (null when no market value).
  double? get discountPct {
    final mv = marketValue;
    if (mv == null || mv <= 0) return null;
    return ((mv - askingPrice) / mv) * 100;
  }

  factory ResaleListing.fromJson(Map<String, dynamic> json) {
    int? intOrNull(dynamic v) => v is num ? v.toInt() : null;
    double? dblOrNull(dynamic v) => v is num ? v.toDouble() : null;
    return ResaleListing(
      id: asInt(json['id']),
      title: asString(json['title'], 'Property'),
      description: asString(json['description']),
      address: asString(json['address']),
      city: asString(json['city']),
      province: asString(json['province']),
      propertyType: asString(json['propertyType']),
      askingPrice: asDouble(json['askingPrice']),
      marketValue: dblOrNull(json['marketValue']),
      bedrooms: intOrNull(json['bedrooms']),
      bathrooms: intOrNull(json['bathrooms']),
      squareMeters: dblOrNull(json['squareMeters']),
      erfSize: dblOrNull(json['erfSize']),
      imageUrls: json['imageUrls'] is List
          ? (json['imageUrls'] as List).map((e) => e.toString()).toList()
          : const [],
      conditionRating: asString(json['conditionRating']),
      publiclyListedAt: asDate(json['publiclyListedAt']),
    );
  }
}

class ResaleFilter {
  const ResaleFilter({this.province, this.propertyType, this.maxPrice, this.search});

  final String? province;
  final String? propertyType;
  final double? maxPrice;
  final String? search;

  Map<String, dynamic> toInput() => {
    if (province != null && province!.isNotEmpty) 'province': province,
    if (propertyType != null && propertyType!.isNotEmpty) 'propertyType': propertyType,
    if (maxPrice != null && maxPrice! > 0) 'maxPrice': maxPrice,
    if (search != null && search!.trim().isNotEmpty) 'search': search!.trim(),
  };

  ResaleFilter copyWith({
    String? province,
    String? propertyType,
    double? maxPrice,
    String? search,
    bool clearMaxPrice = false,
  }) => ResaleFilter(
    province: province ?? this.province,
    propertyType: propertyType ?? this.propertyType,
    maxPrice: clearMaxPrice ? null : (maxPrice ?? this.maxPrice),
    search: search ?? this.search,
  );
}

class ResaleRepository {
  ResaleRepository(this._client);

  final TrpcClient _client;

  Future<List<ResaleListing>> fetchListings(ResaleFilter filter) async {
    final data = await _client.query(
      'getPublicResaleListings',
      input: filter.toInput(),
    );
    final rows = data is Map ? data['listings'] : null;
    if (rows is List) {
      return rows
          .map((e) => ResaleListing.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    }
    return const [];
  }

  Future<ResaleListing?> fetchListing(int id) async {
    final data = await _client.query('getPublicResaleListing', input: {'id': id});
    final row = data is Map ? data['listing'] : null;
    if (row is Map) {
      return ResaleListing.fromJson(Map<String, dynamic>.from(row));
    }
    return null;
  }

  Future<void> expressInterest({
    required int id,
    double? offerAmount,
    String? message,
    String? contactPhone,
  }) async {
    await _client.mutation(
      'expressResaleInterest',
      input: {
        'id': id,
        if (offerAmount != null && offerAmount > 0) 'offerAmount': offerAmount,
        if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
        if (contactPhone != null && contactPhone.trim().isNotEmpty)
          'contactPhone': contactPhone.trim(),
      },
    );
  }
}

final resaleRepositoryProvider = Provider<ResaleRepository>((ref) {
  return ResaleRepository(ref.watch(trpcClientProvider));
});

final resaleFilterProvider =
    StateProvider.autoDispose<ResaleFilter>((ref) => const ResaleFilter());

final resaleListingsProvider =
    FutureProvider.autoDispose<List<ResaleListing>>((ref) async {
      final filter = ref.watch(resaleFilterProvider);
      return ref.watch(resaleRepositoryProvider).fetchListings(filter);
    });
