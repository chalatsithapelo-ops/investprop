import '../../../core/format.dart';

/// A single tax classification bucket within an IT3 summary.
class TaxBucket {
  const TaxBucket({
    required this.classification,
    required this.count,
    required this.gross,
    required this.taxWithheld,
    required this.net,
  });

  final String classification;
  final int count;
  final double gross;
  final double taxWithheld;
  final double net;

  String get label {
    switch (classification) {
      case 'RENTAL_INCOME':
        return 'Rental income';
      case 'INTEREST':
        return 'Interest';
      case 'DIVIDEND':
        return 'Dividends';
      case 'CAPITAL_GAIN':
        return 'Capital gain';
      default:
        return classification
            .split('_')
            .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
            .join(' ');
    }
  }
}

/// The IT3 income summary returned by `generateTaxCertificate`.
class TaxCertificate {
  const TaxCertificate({
    required this.taxYear,
    required this.investorName,
    required this.investorCode,
    required this.buckets,
    required this.totalGross,
    required this.totalTaxWithheld,
    required this.totalNet,
    required this.payoutCount,
    required this.periodStart,
    required this.periodEnd,
    required this.generatedAt,
    required this.disclaimer,
  });

  final int taxYear;
  final String investorName;
  final String investorCode;
  final List<TaxBucket> buckets;
  final double totalGross;
  final double totalTaxWithheld;
  final double totalNet;
  final int payoutCount;
  final DateTime? periodStart;
  final DateTime? periodEnd;
  final DateTime? generatedAt;
  final String disclaimer;

  bool get isEmpty => payoutCount == 0;

  factory TaxCertificate.fromJson(Map<String, dynamic> json) {
    final investor = json['investor'] is Map
        ? Map<String, dynamic>.from(json['investor'] as Map)
        : const <String, dynamic>{};
    final summary = json['summary'] is Map
        ? Map<String, dynamic>.from(json['summary'] as Map)
        : const <String, dynamic>{};

    final buckets = <TaxBucket>[];
    summary.forEach((key, value) {
      if (value is Map) {
        final m = Map<String, dynamic>.from(value);
        buckets.add(TaxBucket(
          classification: key,
          count: asInt(m['count']),
          gross: asDouble(m['gross']),
          taxWithheld: asDouble(m['taxWithheld']),
          net: asDouble(m['net']),
        ));
      }
    });

    return TaxCertificate(
      taxYear: asInt(json['taxYear']),
      investorName: asString(investor['name']),
      investorCode: asString(investor['investorCode']),
      buckets: buckets,
      totalGross: asDouble(json['totalGross']),
      totalTaxWithheld: asDouble(json['totalTaxWithheld']),
      totalNet: asDouble(json['totalNet']),
      payoutCount: asInt(json['payoutCount']),
      periodStart: asDate(json['periodStart']),
      periodEnd: asDate(json['periodEnd']),
      generatedAt: asDate(json['generatedAt']),
      disclaimer: asString(json['disclaimer']),
    );
  }
}
