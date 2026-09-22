import '../../../core/financial_calculations.dart';
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
    this.flipInput,
    this.rentalInput,
    this.developmentInput,
    this.developmentTypeRaw,
    this.preferredReturn,
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

  /// Strategy sub-records, present only when the full property was fetched.
  final PropertyFlipInput? flipInput;
  final RentalPropertyInput? rentalInput;
  final PropertyDevelopmentInput? developmentInput;
  final String? developmentTypeRaw;
  final double? preferredReturn;

  bool get hasAnalysis =>
      flipInput != null || rentalInput != null || developmentInput != null;

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
    final double propertyPrice = asDouble(json['price']);

    PropertyFlipInput? flipInput;
    RentalPropertyInput? rentalInput;
    PropertyDevelopmentInput? developmentInput;
    String? developmentTypeRaw;

    if (json['propertyFlip'] != null) {
      strategy = DealStrategy.flip;
      final f = Map<String, dynamic>.from(json['propertyFlip'] as Map);
      expectedReturns = asDouble(f['expectedROI']) != 0
          ? asDouble(f['expectedROI'])
          : expectedReturns;
      flipInput = _buildFlipInput(f, propertyPrice);
    } else if (json['rentalBond'] != null) {
      strategy = DealStrategy.rental;
      final r = Map<String, dynamic>.from(json['rentalBond'] as Map);
      final cap = asDouble(r['capRate']);
      if (cap > 0) expectedReturns = cap;
      rentalInput = _buildRentalInput(r, propertyPrice);
    } else if (json['propertyDevelopment'] != null) {
      strategy = DealStrategy.development;
      final d = Map<String, dynamic>.from(json['propertyDevelopment'] as Map);
      expectedReturns = asDouble(d['expectedROI']) != 0
          ? asDouble(d['expectedROI'])
          : expectedReturns;
      developmentTypeRaw = d['developmentType']?.toString();
      developmentInput = _buildDevelopmentInput(d);
    }

    final sponsor = json['user'];

    return Opportunity(
      id: asInt(json['id']),
      title: asString(json['title'], 'Untitled property'),
      description: asString(json['description']),
      address: asString(json['address']),
      city: asString(json['city']),
      province: asString(json['state']),
      price: propertyPrice,
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
      flipInput: flipInput,
      rentalInput: rentalInput,
      developmentInput: developmentInput,
      developmentTypeRaw: developmentTypeRaw,
      preferredReturn: asDouble(json['preferredReturn']) != 0
          ? asDouble(json['preferredReturn'])
          : null,
    );
  }
}

PropertyFlipInput _buildFlipInput(Map<String, dynamic> f, double propertyPrice) {
  return PropertyFlipInput(
    purchasePrice: asDouble(f['purchasePrice']) != 0
        ? asDouble(f['purchasePrice'])
        : propertyPrice,
    renovationBudget: asDouble(f['renovationBudget']),
    estimatedValue: asDouble(f['estimatedValue']),
    holdingCosts: asDouble(f['holdingCosts']),
    closingCostsPurchase: asDouble(f['closingCostsPurchase']),
    closingCostsSale: asDouble(f['closingCostsSale']),
    estimatedRepairCosts: asDouble(f['estimatedRepairCosts']),
    afterRepairValue: asDouble(f['afterRepairValue']),
    maxOfferPrice: asDouble(f['maxOfferPrice']),
    expectedROI: asDouble(f['expectedROI']),
    expectedProfitMargin: asDouble(f['expectedProfitMargin']),
    daysToComplete: asDouble(f['daysToComplete']),
    totalInvestmentBudget: asDouble(f['totalInvestmentBudget']),
    spentInvestmentBudget: asDouble(f['spentInvestmentBudget']),
  );
}

RentalPropertyInput _buildRentalInput(
  Map<String, dynamic> r,
  double propertyPrice,
) {
  final loan = asDouble(r['loanAmount']) != 0
      ? asDouble(r['loanAmount'])
      : asDouble(r['bondAmount']);
  return RentalPropertyInput(
    purchasePrice: asDouble(r['purchasePrice']) != 0
        ? asDouble(r['purchasePrice'])
        : propertyPrice,
    monthlyRent: asDouble(r['monthlyRent']),
    annualPropertyTax: asDouble(r['annualPropertyTax']),
    annualInsurance: asDouble(r['annualInsurance']),
    monthlyHOAFees: asDouble(r['monthlyHOAFees']),
    monthlyMaintenanceReserve: asDouble(r['monthlyMaintenanceReserve']),
    monthlyUtilities: asDouble(r['monthlyUtilities']),
    monthlyManagementFee: asDouble(r['monthlyManagementFee']),
    vacancyRate: asDouble(r['vacancyRate']) != 0 ? asDouble(r['vacancyRate']) : 5,
    appreciationRate:
        asDouble(r['appreciationRate']) != 0 ? asDouble(r['appreciationRate']) : 3,
    capRate: asDouble(r['capRate']),
    downPaymentAmount: asDouble(r['downPaymentAmount']),
    loanAmount: loan,
    interestRate: asDouble(r['interestRate']),
    loanTermYears: asDouble(r['loanTermYears']),
    monthlyDebtService: asDouble(r['monthlyDebtService']),
    totalInvestmentBudget: asDouble(r['totalInvestmentBudget']),
    spentInvestmentBudget: asDouble(r['spentInvestmentBudget']),
    closingCosts: asDouble(r['closingCosts']),
  );
}

PropertyDevelopmentInput _buildDevelopmentInput(Map<String, dynamic> d) {
  return PropertyDevelopmentInput(
    developmentType: developmentTypeFromString(d['developmentType']?.toString()),
    landAcquisitionCost: asDouble(d['landAcquisitionCost']),
    hardCosts: asDouble(d['hardCosts']),
    softCosts: asDouble(d['softCosts']),
    financingCosts: asDouble(d['financingCosts']),
    contingencyPercent: asDouble(d['contingencyPercent']),
    contingencyAmount: asDouble(d['contingencyAmount']),
    expectedSalePricePerUnit: asDouble(d['expectedSalePricePerUnit']),
    totalExpectedRevenue: asDouble(d['totalExpectedRevenue']),
    expectedProfit: asDouble(d['expectedProfit']),
    expectedMonthlyRentPerUnit: asDouble(d['expectedMonthlyRentPerUnit']),
    annualOperatingExpenses: asDouble(d['annualOperatingExpenses']),
    stabilizedCapRate: asDouble(d['stabilizedCapRate']),
    expectedROI: asDouble(d['expectedROI']),
    expectedIRR: asDouble(d['expectedIRR']),
    developmentTimelineMonths: asDouble(d['developmentTimelineMonths']),
    preSaleUnits: asDouble(d['preSaleUnits']),
    numberOfUnits: asDouble(d['numberOfUnits']),
    totalBudget: asDouble(d['totalBudget']),
  );
}
