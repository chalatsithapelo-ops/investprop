import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';

/// Affordability band returned by `previewPrequalification` /
/// `submitPrequalification`.
enum PrequalBand { strong, moderate, weak }

extension PrequalBandX on PrequalBand {
  static PrequalBand fromWire(String? value) {
    switch ((value ?? '').toUpperCase()) {
      case 'STRONG':
        return PrequalBand.strong;
      case 'MODERATE':
        return PrequalBand.moderate;
      default:
        return PrequalBand.weak;
    }
  }

  String get label => switch (this) {
    PrequalBand.strong => 'Strong',
    PrequalBand.moderate => 'Moderate',
    PrequalBand.weak => 'Weak',
  };

  Color get color => switch (this) {
    PrequalBand.strong => AppColors.success,
    PrequalBand.moderate => AppColors.warning,
    PrequalBand.weak => AppColors.danger,
  };
}

/// Result of an affordability calculation (indicative, not a credit approval).
class PrequalResult {
  const PrequalResult({
    required this.maxInstalment,
    required this.maxBondAmount,
    required this.maxPropertyPrice,
    required this.estimatedInstalment,
    required this.loanToValue,
    required this.annualInterestRate,
    required this.loanTermYears,
    required this.band,
    required this.qualifies,
    this.notes,
    this.id,
  });

  /// Present only after saving, not on a live preview.
  final int? id;
  final double maxInstalment;
  final double maxBondAmount;
  final double maxPropertyPrice;
  final double estimatedInstalment;
  final double loanToValue;
  final double annualInterestRate;
  final int loanTermYears;
  final PrequalBand band;
  final bool qualifies;
  final String? notes;

  factory PrequalResult.fromJson(Map<String, dynamic> json) {
    // A calculation is flat. Do not silently interpret an API envelope or an
    // invalid response as a valid zero-valued affordability estimate.
    for (final key in [
      'maxInstalment',
      'maxBondAmount',
      'maxPropertyPrice',
      'estimatedInstalment',
      'loanToValue',
      'annualInterestRate',
      'loanTermYears',
    ]) {
      final value = json[key];
      if (value is! num || !value.isFinite) {
        throw const FormatException('Invalid prequalification response.');
      }
    }
    if (json['qualifies'] is! bool ||
        !['STRONG', 'MODERATE', 'WEAK'].contains(json['band'])) {
      throw const FormatException('Invalid prequalification response.');
    }
    return PrequalResult(
      id: json['id'] == null ? null : asInt(json['id']),
      maxInstalment: asDouble(json['maxInstalment']),
      maxBondAmount: asDouble(json['maxBondAmount']),
      maxPropertyPrice: asDouble(json['maxPropertyPrice']),
      estimatedInstalment: asDouble(json['estimatedInstalment']),
      loanToValue: asDouble(json['loanToValue']),
      annualInterestRate: asDouble(json['annualInterestRate']),
      loanTermYears: asInt(json['loanTermYears']),
      band: PrequalBandX.fromWire(json['band']?.toString()),
      qualifies: json['qualifies'] == true,
      notes: json['notes']?.toString(),
    );
  }
}

/// A saved prequalification record.
class Prequalification {
  const Prequalification({
    required this.id,
    required this.maxBondAmount,
    required this.maxPropertyPrice,
    required this.estimatedInstalment,
    required this.band,
    required this.qualifies,
    required this.createdAt,
    this.propertyId,
    this.grossMonthlyIncome = 0,
    this.monthlyExpenses = 0,
    this.existingDebtRepayments = 0,
    this.depositAmount = 0,
    this.propertyPrice = 0,
    this.annualInterestRate = 11.75,
    this.loanTermYears = 20,
  });

  final int id;
  final int? propertyId;
  final double grossMonthlyIncome;
  final double monthlyExpenses;
  final double existingDebtRepayments;
  final double depositAmount;
  final double propertyPrice;
  final double annualInterestRate;
  final int loanTermYears;
  final double maxBondAmount;
  final double maxPropertyPrice;
  final double estimatedInstalment;
  final PrequalBand band;
  final bool qualifies;
  final DateTime? createdAt;

  factory Prequalification.fromJson(Map<String, dynamic> json) {
    return Prequalification(
      id: asInt(json['id']),
      propertyId: json['propertyId'] == null ? null : asInt(json['propertyId']),
      grossMonthlyIncome: asDouble(json['grossMonthlyIncome']),
      monthlyExpenses: asDouble(json['monthlyExpenses']),
      existingDebtRepayments: asDouble(json['existingDebtRepayments']),
      depositAmount: asDouble(json['depositAmount']),
      propertyPrice: asDouble(json['propertyPrice']),
      annualInterestRate: json['annualInterestRate'] == null
          ? 11.75
          : asDouble(json['annualInterestRate']),
      loanTermYears: json['loanTermYears'] == null
          ? 20
          : asInt(json['loanTermYears']),
      maxBondAmount: asDouble(json['maxBondAmount']),
      maxPropertyPrice: asDouble(json['maxPropertyPrice']),
      estimatedInstalment: asDouble(json['estimatedInstalment']),
      band: PrequalBandX.fromWire(json['band']?.toString()),
      qualifies: json['qualifies'] == true,
      createdAt: asDate(json['createdAt']),
    );
  }
}
