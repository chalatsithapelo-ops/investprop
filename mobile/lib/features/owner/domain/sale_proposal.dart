import '../../../core/format.dart';

/// Status of an owner's sale proposal as it moves through review.
enum SaleProposalStatus { pending, underReview, accepted, rejected, withdrawn }

SaleProposalStatus saleStatusFromString(String? v) {
  switch (v) {
    case 'UNDER_REVIEW':
      return SaleProposalStatus.underReview;
    case 'ACCEPTED':
      return SaleProposalStatus.accepted;
    case 'REJECTED':
      return SaleProposalStatus.rejected;
    case 'WITHDRAWN':
      return SaleProposalStatus.withdrawn;
    case 'PENDING':
    default:
      return SaleProposalStatus.pending;
  }
}

extension SaleProposalStatusX on SaleProposalStatus {
  String get label => switch (this) {
    SaleProposalStatus.pending => 'Pending review',
    SaleProposalStatus.underReview => 'Under review',
    SaleProposalStatus.accepted => 'Accepted',
    SaleProposalStatus.rejected => 'Declined',
    SaleProposalStatus.withdrawn => 'Withdrawn',
  };
}

/// A document attached to a sale proposal.
class ProposalDocument {
  const ProposalDocument({
    required this.kind,
    required this.url,
    required this.name,
  });

  final String kind; // TITLE_DEED | ID | RATES_ACCOUNT | BOND_STATEMENT | LEASE | OTHER
  final String url;
  final String name;

  Map<String, dynamic> toJson() => {'kind': kind, 'url': url, 'name': name};

  factory ProposalDocument.fromJson(Map<String, dynamic> j) => ProposalDocument(
    kind: asString(j['kind'], 'OTHER'),
    url: asString(j['url']),
    name: asString(j['name']),
  );
}

/// An owner's sale proposal record returned by getMySaleProposals.
class SaleProposal {
  SaleProposal({
    required this.id,
    required this.title,
    required this.description,
    required this.address,
    required this.city,
    required this.province,
    required this.propertyType,
    required this.askingPrice,
    required this.marketValue,
    required this.urgencyLevel,
    required this.saleType,
    required this.engagementType,
    required this.status,
    required this.counterOfferAmount,
    required this.counterOfferTerms,
    required this.reviewNotes,
    required this.reviewedByName,
    required this.createdAt,
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
  final String urgencyLevel;
  final String saleType;
  final String engagementType;
  final SaleProposalStatus status;
  final double? counterOfferAmount;
  final String? counterOfferTerms;
  final String? reviewNotes;
  final String? reviewedByName;
  final DateTime? createdAt;

  bool get hasPendingCounterOffer =>
      counterOfferAmount != null &&
      counterOfferAmount! > 0 &&
      status == SaleProposalStatus.underReview;

  bool get canWithdraw =>
      status != SaleProposalStatus.accepted &&
      status != SaleProposalStatus.withdrawn;

  String get location => [city, province].where((s) => s.isNotEmpty).join(', ');

  factory SaleProposal.fromJson(Map<String, dynamic> json) {
    final reviewer = json['reviewedBy'];
    return SaleProposal(
      id: asInt(json['id']),
      title: asString(json['title'], 'Untitled'),
      description: asString(json['description']),
      address: asString(json['address']),
      city: asString(json['city']),
      province: asString(json['province']),
      propertyType: asString(json['propertyType']),
      askingPrice: asDouble(json['askingPrice']),
      marketValue:
          asDouble(json['marketValue']) != 0 ? asDouble(json['marketValue']) : null,
      urgencyLevel: asString(json['urgencyLevel'], 'STANDARD'),
      saleType: asString(json['saleType'], 'CASH'),
      engagementType: asString(json['engagementType'], 'OUTRIGHT_SALE'),
      status: saleStatusFromString(json['status']?.toString()),
      counterOfferAmount: asDouble(json['counterOfferAmount']) != 0
          ? asDouble(json['counterOfferAmount'])
          : null,
      counterOfferTerms: (json['counterOfferTerms'] as String?)?.isNotEmpty == true
          ? json['counterOfferTerms'] as String
          : null,
      reviewNotes: (json['reviewNotes'] as String?)?.isNotEmpty == true
          ? json['reviewNotes'] as String
          : null,
      reviewedByName: reviewer is Map ? reviewer['name']?.toString() : null,
      createdAt: asDate(json['createdAt']),
    );
  }
}

/// Labels & option lists shared by the owner submission form.
class OwnerOptions {
  const OwnerOptions._();

  static const propertyTypes = [
    'HOUSE',
    'TOWNHOUSE',
    'APARTMENT',
    'COMMERCIAL',
    'LAND',
    'FARM',
    'INDUSTRIAL',
    'OTHER',
  ];

  static const provinces = [
    'Gauteng',
    'Western Cape',
    'KwaZulu-Natal',
    'Eastern Cape',
    'Free State',
    'Limpopo',
    'Mpumalanga',
    'North West',
    'Northern Cape',
  ];

  static const saleTypes = ['CASH', 'BOND', 'INSTALLMENT'];
  static const urgencyLevels = ['STANDARD', 'HIGH', 'URGENT'];
  static const engagementTypes = [
    'OUTRIGHT_SALE',
    'JOINT_VENTURE',
    'LEASE_BACK',
    'DEVELOPMENT_PARTNERSHIP',
  ];
  static const bondStatuses = ['NONE', 'EXISTING'];
  static const ratesStatuses = ['CURRENT', 'ARREARS'];
  static const tenancyStatuses = ['OWNER_OCCUPIED', 'TENANTED', 'VACANT'];
  static const conditionRatings = [
    'EXCELLENT',
    'GOOD',
    'FAIR',
    'NEEDS_RENOVATION',
    'DISTRESSED',
  ];
  static const documentKinds = [
    'TITLE_DEED',
    'ID',
    'RATES_ACCOUNT',
    'BOND_STATEMENT',
    'LEASE',
    'OTHER',
  ];

  static String label(String raw) => raw
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');
}
