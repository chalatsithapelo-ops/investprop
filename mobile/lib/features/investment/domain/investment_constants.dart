/// Regulatory constants mirrored from the backend so the UI can gate/validate
/// before hitting the server (the server remains the source of truth).
class InvestmentRules {
  const InvestmentRules._();

  /// Minimum contribution per the backend `MIN_INVESTMENT_ZAR`.
  static const double minInvestment = 1000;

  /// FICA verification becomes mandatory once cumulative investment reaches
  /// this threshold (`FICA_THRESHOLD`).
  static const double ficaThreshold = 20000;

  /// Cooling-off window in days (`COOLING_OFF_DAYS`).
  static const int coolingOffDays = 5;

  /// Grace window in days during which a PENDING proposal may be edited or
  /// cancelled.
  static const int graceDays = 5;
}
