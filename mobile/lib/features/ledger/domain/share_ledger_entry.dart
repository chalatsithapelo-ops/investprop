import '../../../core/format.dart';

class ShareLedgerEntry {
  const ShareLedgerEntry({
    required this.id,
    required this.transactionType,
    required this.shares,
    required this.pricePerShare,
    required this.totalAmount,
    required this.reference,
    required this.propertyTitle,
    required this.investorName,
    required this.txHash,
    required this.createdAt,
  });

  final int id;
  final String transactionType;
  final int shares;
  final double pricePerShare;
  final double totalAmount;
  final String reference;
  final String propertyTitle;
  final String investorName;
  final String txHash;
  final DateTime? createdAt;

  String get typeLabel => transactionType
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');

  factory ShareLedgerEntry.fromJson(Map<String, dynamic> json) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    final investor = json['investor'] is Map
        ? Map<String, dynamic>.from(json['investor'] as Map)
        : const <String, dynamic>{};
    return ShareLedgerEntry(
      id: asInt(json['id']),
      transactionType: asString(json['transactionType']),
      shares: asInt(json['shares']),
      pricePerShare: asDouble(json['pricePerShare']),
      totalAmount: asDouble(json['totalAmount']),
      reference: asString(json['reference']),
      propertyTitle: asString(property['title'], 'Property'),
      investorName: asString(investor['name']),
      txHash: asString(json['txHash']),
      createdAt: asDate(json['createdAt']),
    );
  }
}
