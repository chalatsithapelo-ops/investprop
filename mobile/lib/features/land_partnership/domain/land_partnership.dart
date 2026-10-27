import '../../../core/format.dart';

/// Status of a land-into-SPV development partnership as it moves through the
/// lifecycle. Mirrors the server `LandPartnershipStatus` enum.
enum LandPartnershipStatus {
  submitted,
  underReview,
  approved,
  agreementReady,
  signed,
  countersigned,
  spvFormed,
  active,
  rejected,
  withdrawn,
}

LandPartnershipStatus landStatusFromString(String? v) {
  switch (v) {
    case 'UNDER_REVIEW':
      return LandPartnershipStatus.underReview;
    case 'APPROVED':
      return LandPartnershipStatus.approved;
    case 'AGREEMENT_READY':
      return LandPartnershipStatus.agreementReady;
    case 'SIGNED':
      return LandPartnershipStatus.signed;
    case 'COUNTERSIGNED':
      return LandPartnershipStatus.countersigned;
    case 'SPV_FORMED':
      return LandPartnershipStatus.spvFormed;
    case 'ACTIVE':
      return LandPartnershipStatus.active;
    case 'REJECTED':
      return LandPartnershipStatus.rejected;
    case 'WITHDRAWN':
      return LandPartnershipStatus.withdrawn;
    case 'SUBMITTED':
    default:
      return LandPartnershipStatus.submitted;
  }
}

extension LandPartnershipStatusX on LandPartnershipStatus {
  String get label => switch (this) {
    LandPartnershipStatus.submitted => 'Submitted',
    LandPartnershipStatus.underReview => 'Under review',
    LandPartnershipStatus.approved => 'Approved',
    LandPartnershipStatus.agreementReady => 'Ready to sign',
    LandPartnershipStatus.signed => 'Signed',
    LandPartnershipStatus.countersigned => 'Executed',
    LandPartnershipStatus.spvFormed => 'SPV formed',
    LandPartnershipStatus.active => 'Active',
    LandPartnershipStatus.rejected => 'Declined',
    LandPartnershipStatus.withdrawn => 'Withdrawn',
  };

  bool get canWithdraw =>
      this == LandPartnershipStatus.submitted ||
      this == LandPartnershipStatus.underReview ||
      this == LandPartnershipStatus.approved ||
      this == LandPartnershipStatus.agreementReady;
}

/// A landowner's land-into-SPV partnership record returned by
/// getMyLandPartnerships.
class LandPartnership {
  LandPartnership({
    required this.id,
    required this.referenceCode,
    required this.landTitle,
    required this.landDescription,
    required this.address,
    required this.city,
    required this.province,
    required this.estimatedLandValue,
    required this.estimatedGdv,
    required this.ownerEquityPct,
    required this.status,
    required this.reviewNotes,
    required this.rejectedReason,
    required this.agreementContent,
    required this.spvName,
    required this.createdAt,
  });

  final int id;
  final String referenceCode;
  final String landTitle;
  final String landDescription;
  final String address;
  final String city;
  final String province;
  final double? estimatedLandValue;
  final double? estimatedGdv;
  final double ownerEquityPct;
  final LandPartnershipStatus status;
  final String? reviewNotes;
  final String? rejectedReason;
  final String? agreementContent;
  final String? spvName;
  final DateTime? createdAt;

  factory LandPartnership.fromJson(Map<String, dynamic> j) {
    final spv = j['spv'];
    return LandPartnership(
      id: asInt(j['id']),
      referenceCode: asString(j['referenceCode']),
      landTitle: asString(j['landTitle']),
      landDescription: asString(j['landDescription']),
      address: asString(j['address']),
      city: asString(j['city']),
      province: asString(j['province']),
      estimatedLandValue: j['estimatedLandValue'] == null
          ? null
          : asDouble(j['estimatedLandValue']),
      estimatedGdv:
          j['estimatedGDV'] == null ? null : asDouble(j['estimatedGDV']),
      ownerEquityPct: asDouble(j['ownerEquityPct']),
      status: landStatusFromString(asString(j['status'], 'SUBMITTED')),
      reviewNotes: j['reviewNotes']?.toString(),
      rejectedReason: j['rejectedReason']?.toString(),
      agreementContent: j['agreementContent']?.toString(),
      spvName: spv is Map ? spv['name']?.toString() : null,
      createdAt: asDate(j['createdAt']),
    );
  }
}
