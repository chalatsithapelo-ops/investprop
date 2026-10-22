import '../../../core/format.dart';

/// The current user's effective subscription (from `getMySubscription`).
class MySubscription {
  const MySubscription({
    required this.tier,
    required this.status,
    required this.active,
    required this.billingCycle,
    required this.priceAmount,
    required this.planName,
    required this.capabilities,
    required this.trialEndsAt,
    required this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.staffBypass,
  });

  final String tier;
  final String status;
  final bool active;
  final String? billingCycle;
  final double priceAmount;
  final String planName;
  final List<String> capabilities;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final bool staffBypass;

  bool get isTrialing => status == 'TRIALING';
  bool get isFree => tier == 'FREE';

  String get statusLabel {
    if (staffBypass) return 'Staff access';
    if (isTrialing) return 'Free trial';
    return switch (status) {
      'ACTIVE' => 'Active',
      'PAST_DUE' => 'Payment due',
      'CANCELLED' => 'Cancelled',
      'EXPIRED' => 'Expired',
      _ => status,
    };
  }

  factory MySubscription.fromJson(Map<String, dynamic> json) => MySubscription(
        tier: asString(json['tier'], 'FREE'),
        status: asString(json['status'], 'ACTIVE'),
        active: json['active'] == true,
        billingCycle: (json['billingCycle'] as String?)?.isNotEmpty == true
            ? json['billingCycle'] as String
            : null,
        priceAmount: asDouble(json['priceAmount']),
        planName: asString(json['planName'], 'Starter'),
        capabilities: (json['capabilities'] as List? ?? const [])
            .map((e) => e.toString())
            .toList(),
        trialEndsAt: asDate(json['trialEndsAt']),
        currentPeriodEnd: asDate(json['currentPeriodEnd']),
        cancelAtPeriodEnd: json['cancelAtPeriodEnd'] == true,
        staffBypass: json['staffBypass'] == true,
      );
}

/// A sellable plan from the catalog (`getSubscriptionPlans`).
class SubscriptionPlan {
  const SubscriptionPlan({
    required this.tier,
    required this.name,
    required this.tagline,
    required this.description,
    required this.monthlyPrice,
    required this.annualPrice,
    required this.features,
    required this.rank,
    required this.highlighted,
    required this.standalone,
  });

  final String tier;
  final String name;
  final String tagline;
  final String description;
  final double monthlyPrice;
  final double annualPrice;
  final List<String> features;
  final int rank;
  final bool highlighted;
  final bool standalone;

  bool get isFree => monthlyPrice <= 0 && annualPrice <= 0;

  factory SubscriptionPlan.fromJson(Map<String, dynamic> json) =>
      SubscriptionPlan(
        tier: asString(json['tier']),
        name: asString(json['name']),
        tagline: asString(json['tagline']),
        description: asString(json['description']),
        monthlyPrice: asDouble(json['monthlyPrice']),
        annualPrice: asDouble(json['annualPrice']),
        features: (json['features'] as List? ?? const [])
            .map((e) => e.toString())
            .toList(),
        rank: asInt(json['rank']),
        highlighted: json['highlighted'] == true,
        standalone: json['standalone'] == true,
      );
}
