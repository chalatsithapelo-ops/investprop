import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';

/// A distressed / auction listing as shown in the subscriber browse list.
class DistressedDeal {
  DistressedDeal({
    required this.id,
    required this.title,
    required this.propertyType,
    required this.suburb,
    required this.city,
    required this.province,
    required this.address,
    required this.askingPrice,
    required this.marketValue,
    required this.discount,
    required this.bedrooms,
    required this.bathrooms,
    required this.erfSize,
    required this.floorSize,
    required this.imageUrl,
    required this.source,
    required this.sourceUrl,
    required this.auctionType,
    required this.auctionDate,
    required this.auctionVenue,
    required this.aiGrade,
    required this.aiRiskScore,
    required this.aiSummary,
    required this.aiScoredAt,
    required this.createdAt,
    this.priceDropPct,
    this.previousPrice,
  });

  final int id;
  final String title;
  final String? propertyType;
  final String? suburb;
  final String? city;
  final String? province;
  final String? address;
  final double askingPrice;
  final double? marketValue;
  final double? discount; // percentage off market value
  final int? bedrooms;
  final int? bathrooms;
  final double? erfSize;
  final double? floorSize;
  final String? imageUrl;
  final String? source;
  final String? sourceUrl;
  final String? auctionType;
  final DateTime? auctionDate;
  final String? auctionVenue;
  final String? aiGrade; // A | B | C | D | E
  final double? aiRiskScore; // 0-100 (higher = more risk)
  final String? aiSummary;
  final DateTime? aiScoredAt;
  final DateTime? createdAt;
  final double? priceDropPct; // recent drop from a prior higher asking price
  final double? previousPrice;

  bool get hasGrade => (aiGrade ?? '').isNotEmpty;

  bool get hasPriceDrop => (priceDropPct ?? 0) >= 1;

  bool get isAuction => (auctionType ?? '').isNotEmpty || auctionDate != null;

  bool get isNew {
    final c = createdAt;
    if (c == null) return false;
    return DateTime.now().difference(c).inDays < 7;
  }

  String get location =>
      [suburb, city, province].where((s) => (s ?? '').isNotEmpty).join(', ');

  String get sourceLabel {
    final s = source ?? '';
    if (s.isEmpty) return 'Listing';
    return s
        .replaceAll('_', ' ')
        .split(' ')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  Color get gradeColor => gradeColorFor(aiGrade);

  static Color gradeColorFor(String? grade) {
    switch (grade) {
      case 'A':
        return AppColors.success;
      case 'B':
        return const Color(0xFF65A30D);
      case 'C':
        return AppColors.gold;
      case 'D':
        return AppColors.warning;
      case 'E':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }

  factory DistressedDeal.fromJson(Map<String, dynamic> json) {
    return DistressedDeal(
      id: asInt(json['id']),
      title: asString(json['title'], 'Distressed listing'),
      propertyType: json['propertyType'] as String?,
      suburb: json['suburb'] as String?,
      city: json['city'] as String?,
      province: json['province'] as String?,
      address: json['address'] as String?,
      askingPrice: asDouble(json['askingPrice']),
      marketValue: json['marketValue'] == null
          ? null
          : asDouble(json['marketValue']),
      discount: json['discount'] == null ? null : asDouble(json['discount']),
      bedrooms: json['bedrooms'] == null ? null : asInt(json['bedrooms']),
      bathrooms: json['bathrooms'] == null ? null : asInt(json['bathrooms']),
      erfSize: json['erfSize'] == null ? null : asDouble(json['erfSize']),
      floorSize: json['floorSize'] == null ? null : asDouble(json['floorSize']),
      imageUrl: json['imageUrl'] as String?,
      source: json['source'] as String?,
      sourceUrl: json['sourceUrl'] as String?,
      auctionType: json['auctionType'] as String?,
      auctionDate: asDate(json['auctionDate']),
      auctionVenue: json['auctionVenue'] as String?,
      aiGrade: json['aiGrade'] as String?,
      aiRiskScore:
          json['aiRiskScore'] == null ? null : asDouble(json['aiRiskScore']),
      aiSummary: json['aiSummary'] as String?,
      aiScoredAt: asDate(json['aiScoredAt']),
      createdAt: asDate(json['createdAt']),
      priceDropPct:
          json['priceDropPct'] == null ? null : asDouble(json['priceDropPct']),
      previousPrice:
          json['previousPrice'] == null ? null : asDouble(json['previousPrice']),
    );
  }
}

/// Result envelope for the subscriber browse query (includes the entitlement
/// flag so the UI can show an upgrade prompt instead of throwing).
class DistressedDealsResult {
  DistressedDealsResult({
    required this.entitled,
    required this.listings,
    required this.totalCount,
    required this.totalPages,
    required this.currentPage,
    required this.newThisWeek,
  });

  final bool entitled;
  final List<DistressedDeal> listings;
  final int totalCount;
  final int totalPages;
  final int currentPage;
  final int newThisWeek;

  factory DistressedDealsResult.fromJson(Map<String, dynamic> json) {
    final raw = json['listings'];
    final listings = raw is List
        ? raw
            .whereType<Map>()
            .map((e) => DistressedDeal.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <DistressedDeal>[];
    return DistressedDealsResult(
      entitled: json['entitled'] == true,
      listings: listings,
      totalCount: asInt(json['totalCount']),
      totalPages: asInt(json['totalPages']),
      currentPage: json['currentPage'] == null ? 1 : asInt(json['currentPage']),
      newThisWeek: asInt(json['newThisWeek']),
    );
  }
}

/// A single point in a listing's asking-price history.
class DistressedPricePoint {
  DistressedPricePoint({required this.askingPrice, required this.recordedAt});

  final double askingPrice;
  final DateTime? recordedAt;

  factory DistressedPricePoint.fromJson(Map<String, dynamic> json) {
    return DistressedPricePoint(
      askingPrice: asDouble(json['askingPrice']),
      recordedAt: asDate(json['recordedAt']),
    );
  }
}

/// The full AI underwriting breakdown stored on a graded listing.
class DistressedAIBreakdown {
  DistressedAIBreakdown({
    required this.pros,
    required this.cons,
    required this.redFlags,
    required this.recommendations,
  });

  final List<String> pros;
  final List<String> cons;
  final List<String> redFlags;
  final List<String> recommendations;

  bool get isEmpty =>
      pros.isEmpty &&
      cons.isEmpty &&
      redFlags.isEmpty &&
      recommendations.isEmpty;

  static List<String> _strings(dynamic v) {
    if (v is List) {
      return v.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    }
    return const [];
  }

  factory DistressedAIBreakdown.fromJson(Map<String, dynamic> json) {
    return DistressedAIBreakdown(
      pros: _strings(json['pros']),
      cons: _strings(json['cons']),
      redFlags: _strings(json['redFlags']),
      recommendations: _strings(json['recommendations']),
    );
  }
}

/// Full detail for a single listing, including the AI breakdown and the
/// asking-price history.
class DistressedDealDetail {
  DistressedDealDetail({
    required this.deal,
    required this.description,
    required this.caseNumber,
    required this.noReserve,
    required this.auctionTime,
    required this.breakdown,
    required this.priceHistory,
  });

  final DistressedDeal deal;
  final String? description;
  final String? caseNumber;
  final bool noReserve;
  final String? auctionTime;
  final DistressedAIBreakdown? breakdown;
  final List<DistressedPricePoint> priceHistory;

  factory DistressedDealDetail.fromJson(Map<String, dynamic> json) {
    DistressedAIBreakdown? breakdown;
    final uw = json['aiUnderwriting'];
    if (uw is Map) {
      breakdown = DistressedAIBreakdown.fromJson(Map<String, dynamic>.from(uw));
    }
    final history = json['priceHistory'];
    final points = history is List
        ? history
            .whereType<Map>()
            .map((e) =>
                DistressedPricePoint.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <DistressedPricePoint>[];
    return DistressedDealDetail(
      deal: DistressedDeal.fromJson(json),
      description: json['description'] as String?,
      caseNumber: json['caseNumber'] as String?,
      noReserve: json['noReserve'] == true,
      auctionTime: json['auctionTime'] as String?,
      breakdown: breakdown,
      priceHistory: points,
    );
  }
}

/// A market signal (positive / neutral / caution) backing the verdict.
class DistressedMarketSignal {
  DistressedMarketSignal({
    required this.label,
    required this.status,
    required this.detail,
  });

  final String label;
  final String status; // POSITIVE | NEUTRAL | CAUTION
  final String detail;

  Color get color {
    switch (status) {
      case 'POSITIVE':
        return AppColors.success;
      case 'CAUTION':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }

  factory DistressedMarketSignal.fromJson(Map<String, dynamic> json) {
    return DistressedMarketSignal(
      label: asString(json['label'], ''),
      status: asString(json['status'], 'NEUTRAL'),
      detail: asString(json['detail'], ''),
    );
  }
}

/// A comparable listing used to benchmark the subject property.
class DistressedComparable {
  DistressedComparable({
    required this.id,
    required this.title,
    required this.suburb,
    required this.city,
    required this.askingPrice,
    required this.pricePerSqm,
  });

  final int id;
  final String title;
  final String? suburb;
  final String? city;
  final double askingPrice;
  final double? pricePerSqm;

  String get location =>
      [suburb, city].where((s) => (s ?? '').isNotEmpty).join(', ');

  factory DistressedComparable.fromJson(Map<String, dynamic> json) {
    return DistressedComparable(
      id: asInt(json['id']),
      title: asString(json['title'], 'Listing'),
      suburb: json['suburb'] as String?,
      city: json['city'] as String?,
      askingPrice: asDouble(json['askingPrice']),
      pricePerSqm:
          json['pricePerSqm'] == null ? null : asDouble(json['pricePerSqm']),
    );
  }
}

/// Deterministic comparable-sales / area-benchmark analysis for a listing.
class DistressedMarketAnalysis {
  DistressedMarketAnalysis({
    required this.insufficientData,
    required this.areaLevel,
    required this.areaName,
    required this.sampleSize,
    required this.medianAskingPrice,
    required this.medianPricePerSqm,
    required this.subjectPricePerSqm,
    required this.vsAreaMedianPct,
    required this.vsAreaPricePerSqmPct,
    required this.pricePercentile,
    required this.estimatedValue,
    required this.impliedMarginPct,
    required this.trendDirection,
    required this.areaPriceChangePct,
    required this.verdictScore,
    required this.verdictLabel,
    required this.verdictRationale,
    required this.signals,
    required this.comparables,
  });

  final bool insufficientData;
  final String areaLevel; // suburb | city | province
  final String areaName;
  final int sampleSize;
  final double? medianAskingPrice;
  final double? medianPricePerSqm;
  final double? subjectPricePerSqm;
  final double? vsAreaMedianPct;
  final double? vsAreaPricePerSqmPct;
  final int? pricePercentile;
  final double? estimatedValue;
  final double? impliedMarginPct;
  final String trendDirection; // RISING | FALLING | FLAT | UNKNOWN
  final double? areaPriceChangePct;
  final int verdictScore;
  final String verdictLabel; // Strong | Solid | Fair | Weak | Avoid
  final String verdictRationale;
  final List<DistressedMarketSignal> signals;
  final List<DistressedComparable> comparables;

  bool get hasComparables => sampleSize > 0;

  Color get verdictColor {
    switch (verdictLabel) {
      case 'Strong':
        return AppColors.success;
      case 'Solid':
        return const Color(0xFF65A30D);
      case 'Fair':
        return AppColors.gold;
      case 'Weak':
        return AppColors.warning;
      case 'Avoid':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }

  static double? _optDouble(dynamic v) => v == null ? null : asDouble(v);

  factory DistressedMarketAnalysis.fromJson(Map<String, dynamic> json) {
    final area = json['area'] is Map
        ? Map<String, dynamic>.from(json['area'] as Map)
        : <String, dynamic>{};
    final subject = json['subject'] is Map
        ? Map<String, dynamic>.from(json['subject'] as Map)
        : <String, dynamic>{};
    final positioning = json['positioning'] is Map
        ? Map<String, dynamic>.from(json['positioning'] as Map)
        : <String, dynamic>{};
    final valuation = json['valuation'] is Map
        ? Map<String, dynamic>.from(json['valuation'] as Map)
        : <String, dynamic>{};
    final trend = json['trend'] is Map
        ? Map<String, dynamic>.from(json['trend'] as Map)
        : <String, dynamic>{};
    final verdict = json['verdict'] is Map
        ? Map<String, dynamic>.from(json['verdict'] as Map)
        : <String, dynamic>{};

    final signalsRaw = json['signals'];
    final signals = signalsRaw is List
        ? signalsRaw
            .whereType<Map>()
            .map((e) =>
                DistressedMarketSignal.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <DistressedMarketSignal>[];

    final compsRaw = json['comparables'];
    final comps = compsRaw is List
        ? compsRaw
            .whereType<Map>()
            .map((e) =>
                DistressedComparable.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <DistressedComparable>[];

    return DistressedMarketAnalysis(
      insufficientData: json['insufficientData'] == true,
      areaLevel: asString(area['level'], 'area'),
      areaName: asString(area['name'], ''),
      sampleSize: asInt(area['sampleSize']),
      medianAskingPrice: _optDouble(area['medianAskingPrice']),
      medianPricePerSqm: _optDouble(area['medianPricePerSqm']),
      subjectPricePerSqm: _optDouble(subject['pricePerSqm']),
      vsAreaMedianPct: _optDouble(positioning['vsAreaMedianPct']),
      vsAreaPricePerSqmPct: _optDouble(positioning['vsAreaPricePerSqmPct']),
      pricePercentile: positioning['pricePercentile'] == null
          ? null
          : asInt(positioning['pricePercentile']),
      estimatedValue: _optDouble(valuation['estimatedValue']),
      impliedMarginPct: _optDouble(valuation['impliedMarginPct']),
      trendDirection: asString(trend['direction'], 'UNKNOWN'),
      areaPriceChangePct: _optDouble(trend['areaPriceChangePct']),
      verdictScore: asInt(verdict['score']),
      verdictLabel: asString(verdict['label'], 'Fair'),
      verdictRationale: asString(verdict['rationale'], ''),
      signals: signals,
      comparables: comps,
    );
  }
}

/// Filter + sort state for the browse list.
class DistressedFilter {
  const DistressedFilter({
    this.province,
    this.propertyType,
    this.minAIGrade,
    this.onlyGraded = false,
    this.sortBy = 'newest',
  });

  final String? province;
  final String? propertyType;
  final String? minAIGrade;
  final bool onlyGraded;
  final String sortBy; // newest | discount | price_asc | ai_grade

  DistressedFilter copyWith({
    String? province,
    bool clearProvince = false,
    String? propertyType,
    bool clearPropertyType = false,
    String? minAIGrade,
    bool clearMinAIGrade = false,
    bool? onlyGraded,
    String? sortBy,
  }) {
    return DistressedFilter(
      province: clearProvince ? null : (province ?? this.province),
      propertyType:
          clearPropertyType ? null : (propertyType ?? this.propertyType),
      minAIGrade: clearMinAIGrade ? null : (minAIGrade ?? this.minAIGrade),
      onlyGraded: onlyGraded ?? this.onlyGraded,
      sortBy: sortBy ?? this.sortBy,
    );
  }

  Map<String, dynamic> toInput({required int page, int limit = 24}) {
    return {
      if (province != null && province != 'all') 'province': province,
      if (propertyType != null && propertyType != 'all')
        'propertyType': propertyType,
      if (minAIGrade != null) 'minAIGrade': minAIGrade,
      if (onlyGraded) 'onlyGraded': true,
      'sortBy': sortBy,
      'limit': limit,
      'page': page,
    };
  }
}
