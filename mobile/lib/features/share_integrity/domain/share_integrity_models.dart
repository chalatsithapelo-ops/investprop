import '../../../core/format.dart';

/// A single holding traced back to its property/SPV with valuation + how the
/// shares were acquired.
class ProvenanceHolding {
  const ProvenanceHolding({
    required this.holdingId,
    required this.propertyTitle,
    required this.propertyCity,
    required this.spvName,
    required this.spvRegistration,
    required this.shareClassName,
    required this.sharesOwned,
    required this.totalShares,
    required this.ownershipPercentage,
    required this.averageCostPerShare,
    required this.valuationPerShare,
    required this.valuationSource,
    required this.investedAmount,
    required this.currentValue,
    required this.unrealizedGain,
    required this.acquiredBySource,
  });

  final int holdingId;
  final String propertyTitle;
  final String propertyCity;
  final String? spvName;
  final String? spvRegistration;
  final String shareClassName;
  final int sharesOwned;
  final int totalShares;
  final double ownershipPercentage;
  final double averageCostPerShare;
  final double valuationPerShare;
  final String valuationSource;
  final double investedAmount;
  final double currentValue;
  final double unrealizedGain;
  final Map<String, int> acquiredBySource;

  bool get isUp => unrealizedGain >= 0;

  String get valuationSourceLabel => switch (valuationSource) {
    'NAV' => 'Net asset value',
    'LAST_TRADE' => 'Last traded price',
    'BASE_PRICE' => 'Issue price',
    _ => valuationSource,
  };

  factory ProvenanceHolding.fromJson(Map<String, dynamic> json) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    final spv = json['spv'] is Map
        ? Map<String, dynamic>.from(json['spv'] as Map)
        : const <String, dynamic>{};
    final sc = json['shareClass'] is Map
        ? Map<String, dynamic>.from(json['shareClass'] as Map)
        : const <String, dynamic>{};
    final sources = <String, int>{};
    if (json['acquiredBySource'] is Map) {
      (json['acquiredBySource'] as Map).forEach((k, v) {
        sources[k.toString()] = asInt(v);
      });
    }
    return ProvenanceHolding(
      holdingId: asInt(json['holdingId']),
      propertyTitle: asString(property['title'], 'Property'),
      propertyCity: asString(property['city']),
      spvName: spv['name']?.toString(),
      spvRegistration: spv['registrationNumber']?.toString(),
      shareClassName: asString(sc['name'], 'Shares'),
      sharesOwned: asInt(json['sharesOwned']),
      totalShares: asInt(json['totalShares']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      averageCostPerShare: asDouble(json['averageCostPerShare']),
      valuationPerShare: asDouble(json['valuationPerShare']),
      valuationSource: asString(json['valuationSource'], 'BASE_PRICE'),
      investedAmount: asDouble(json['investedAmount']),
      currentValue: asDouble(json['currentValue']),
      unrealizedGain: asDouble(json['unrealizedGain']),
      acquiredBySource: sources,
    );
  }
}

/// Full provenance report for an investor.
class ShareProvenance {
  const ShareProvenance({
    required this.holdingCount,
    required this.totalInvested,
    required this.totalCurrentValue,
    required this.holdings,
  });

  final int holdingCount;
  final double totalInvested;
  final double totalCurrentValue;
  final List<ProvenanceHolding> holdings;

  double get totalGain => totalCurrentValue - totalInvested;

  factory ShareProvenance.fromJson(Map<String, dynamic> json) {
    final list = json['holdings'];
    return ShareProvenance(
      holdingCount: asInt(json['holdingCount']),
      totalInvested: asDouble(json['totalInvested']),
      totalCurrentValue: asDouble(json['totalCurrentValue']),
      holdings: list is List
          ? list
                .whereType<Map>()
                .map(
                  (e) =>
                      ProvenanceHolding.fromJson(Map<String, dynamic>.from(e)),
                )
                .toList()
          : const [],
    );
  }
}

/// Conservation status of a single share class.
class ShareClassAudit {
  const ShareClassAudit({
    required this.shareClassId,
    required this.shareClassName,
    required this.propertyTitle,
    required this.spvName,
    required this.totalShares,
    required this.issued,
    required this.available,
    required this.reservedInSettlements,
    required this.holders,
    required this.valuationPerShare,
    required this.marketCap,
    required this.overIssued,
    required this.ledgerBalanced,
    required this.balanced,
  });

  final int shareClassId;
  final String shareClassName;
  final String propertyTitle;
  final String? spvName;
  final int totalShares;
  final int issued;
  final int available;
  final int reservedInSettlements;
  final int holders;
  final double valuationPerShare;
  final double marketCap;
  final bool overIssued;
  final bool ledgerBalanced;
  final bool balanced;

  factory ShareClassAudit.fromJson(Map<String, dynamic> json) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    final spv = json['spv'] is Map
        ? Map<String, dynamic>.from(json['spv'] as Map)
        : const <String, dynamic>{};
    return ShareClassAudit(
      shareClassId: asInt(json['shareClassId']),
      shareClassName: asString(json['shareClassName'], 'Shares'),
      propertyTitle: asString(property['title'], 'Property'),
      spvName: spv['name']?.toString(),
      totalShares: asInt(json['totalShares']),
      issued: asInt(json['issued']),
      available: asInt(json['available']),
      reservedInSettlements: asInt(json['reservedInSettlements']),
      holders: asInt(json['holders']),
      valuationPerShare: asDouble(json['valuationPerShare']),
      marketCap: asDouble(json['marketCap']),
      overIssued: json['overIssued'] == true,
      ledgerBalanced: json['ledgerBalanced'] == true,
      balanced: json['balanced'] == true,
    );
  }
}

/// Full conservation audit across share classes.
class ShareAudit {
  const ShareAudit({
    required this.overallBalanced,
    required this.classCount,
    required this.classes,
  });

  final bool overallBalanced;
  final int classCount;
  final List<ShareClassAudit> classes;

  factory ShareAudit.fromJson(Map<String, dynamic> json) {
    final list = json['classes'];
    return ShareAudit(
      overallBalanced: json['overallBalanced'] == true,
      classCount: asInt(json['classCount']),
      classes: list is List
          ? list
                .whereType<Map>()
                .map(
                  (e) => ShareClassAudit.fromJson(Map<String, dynamic>.from(e)),
                )
                .toList()
          : const [],
    );
  }
}
