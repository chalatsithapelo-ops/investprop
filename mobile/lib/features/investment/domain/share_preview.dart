import '../../../core/format.dart';

/// Real-time share allocation preview returned by `calculateSharePreview`.
class SharePreview {
  const SharePreview({
    required this.numberOfShares,
    required this.sharePrice,
    required this.ownershipPercentage,
    required this.shareClassName,
  });

  final int numberOfShares;
  final double sharePrice;
  final double ownershipPercentage;
  final String shareClassName;

  static SharePreview? fromJson(dynamic json) {
    if (json is! Map) return null;
    return SharePreview(
      numberOfShares: asInt(json['numberOfShares']),
      sharePrice: asDouble(json['sharePrice']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      shareClassName: asString(json['shareClassName'], 'Ordinary'),
    );
  }
}
