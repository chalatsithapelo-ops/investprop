import '../../../core/format.dart';

enum DealStrategy { rental, flip, development, unknown }

class Opportunity {
  Opportunity({
    required this.id,
    required this.title,
    required this.description,
    required this.address,
    required this.city,
    required this.province,
    required this.price,
    required this.imageUrl,
    required this.investmentStatus,
    required this.fundingGoal,
    required this.fundingRaised,
    required this.expectedReturns,
    required this.riskRating,
    required this.strategy,
    required this.sponsorName,
  });

  final int id;
  final String title;
  final String description;
  final String address;
  final String city;
  final String province;
  final double price;
  final String? imageUrl;
  final String investmentStatus;
  final double fundingGoal;
  final double fundingRaised;
  final double expectedReturns;
  final String riskRating;
  final DealStrategy strategy;
  final String? sponsorName;

  double get fundingProgress =>
      fundingGoal > 0 ? (fundingRaised / fundingGoal).clamp(0, 1).toDouble() : 0;

  double get remainingToRaise =>
      (fundingGoal - fundingRaised).clamp(0, double.infinity).toDouble();

  String get location => [city, province].where((s) => s.isNotEmpty).join(', ');

  String get strategyLabel => switch (strategy) {
    DealStrategy.rental => 'Buy-to-Rent',
    DealStrategy.flip => 'Fix & Flip',
    DealStrategy.development => 'Development',
    DealStrategy.unknown => 'Opportunity',
  };

  factory Opportunity.fromJson(Map<String, dynamic> json) {
    DealStrategy strategy = DealStrategy.unknown;
    double expectedReturns = asDouble(json['expectedReturns']);
    if (json['propertyFlip'] != null) {
      strategy = DealStrategy.flip;
      expectedReturns = asDouble(
        (json['propertyFlip'] as Map)['expectedROI'] ?? expectedReturns,
      );
    } else if (json['rentalBond'] != null) {
      strategy = DealStrategy.rental;
      final cap = asDouble((json['rentalBond'] as Map)['capRate']);
      if (cap > 0) expectedReturns = cap;
    } else if (json['propertyDevelopment'] != null) {
      strategy = DealStrategy.development;
      expectedReturns = asDouble(
        (json['propertyDevelopment'] as Map)['expectedROI'] ?? expectedReturns,
      );
    }

    final sponsor = json['user'];

    return Opportunity(
      id: asInt(json['id']),
      title: asString(json['title'], 'Untitled property'),
      description: asString(json['description']),
      address: asString(json['address']),
      city: asString(json['city']),
      province: asString(json['state']),
      price: asDouble(json['price']),
      imageUrl: (json['imageUrl'] as String?)?.isNotEmpty == true
          ? json['imageUrl'] as String
          : null,
      investmentStatus: asString(json['investmentStatus'], 'RAISING_FUNDS'),
      fundingGoal: asDouble(json['fundingGoal']),
      fundingRaised: asDouble(json['fundingRaised']),
      expectedReturns: expectedReturns,
      riskRating: asString(json['riskRating'], 'MEDIUM'),
      strategy: strategy,
      sponsorName: sponsor is Map ? sponsor['name']?.toString() : null,
    );
  }
}
