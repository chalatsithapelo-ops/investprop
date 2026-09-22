import '../../../core/format.dart';
import 'investment_constants.dart';

/// An investor's contribution / investment proposal into a property.
///
/// Backing procedures: `submitInvestmentProposal`, `getMyPropertyInvestments`,
/// `getMyAwaitingPayment`.
class Contribution {
  const Contribution({
    required this.id,
    required this.propertyId,
    required this.contributionAmount,
    required this.status,
    required this.paymentStatus,
    required this.numberOfShares,
    required this.sharePrice,
    required this.ownershipPercentage,
    required this.notes,
    required this.propertyTitle,
    required this.createdAt,
    required this.coolingOffExpiresAt,
  });

  final int id;
  final int propertyId;
  final double contributionAmount;
  final String status; // PENDING | APPROVED | REJECTED
  final String paymentStatus; // NOT_PAID | AWAITING_PAYMENT | PAID | ...
  final int numberOfShares;
  final double sharePrice;
  final double ownershipPercentage;
  final String? notes;
  final String propertyTitle;
  final DateTime? createdAt;
  final DateTime? coolingOffExpiresAt;

  bool get isPending => status == 'PENDING';
  bool get isApproved => status == 'APPROVED';
  bool get isRejected => status == 'REJECTED';
  bool get isPaid => paymentStatus == 'PAID';

  /// Whole days remaining in the edit/cancel grace window (0 once expired).
  int get graceDaysRemaining {
    if (createdAt == null) return 0;
    final deadline = createdAt!.add(
      const Duration(days: InvestmentRules.graceDays),
    );
    final left = deadline.difference(DateTime.now()).inHours;
    if (left <= 0) return 0;
    return (left / 24).ceil();
  }

  bool get canEdit => isPending && graceDaysRemaining > 0;

  String get statusLabel => switch (status) {
    'PENDING' => 'Pending review',
    'APPROVED' => isPaid ? 'Invested' : 'Approved — payment due',
    'REJECTED' => 'Declined',
    _ => status,
  };

  factory Contribution.fromJson(Map<String, dynamic> json) {
    final property = json['property'];
    return Contribution(
      id: asInt(json['id']),
      propertyId: asInt(json['propertyId']),
      contributionAmount: asDouble(json['contributionAmount']),
      status: asString(json['status'], 'PENDING'),
      paymentStatus: asString(json['paymentStatus'], 'NOT_PAID'),
      numberOfShares: asInt(json['numberOfShares']),
      sharePrice: asDouble(json['sharePrice']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      notes: json['notes']?.toString(),
      propertyTitle: property is Map
          ? asString(property['title'], 'Property')
          : asString(json['propertyTitle'], 'Property'),
      createdAt: asDate(json['createdAt']),
      coolingOffExpiresAt: asDate(json['coolingOffExpiresAt']),
    );
  }
}
