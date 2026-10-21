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
  });

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
    return PrequalResult(
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
  });

  final int id;
  final double maxBondAmount;
  final double maxPropertyPrice;
  final double estimatedInstalment;
  final PrequalBand band;
  final bool qualifies;
  final DateTime? createdAt;

  factory Prequalification.fromJson(Map<String, dynamic> json) {
    return Prequalification(
      id: asInt(json['id']),
      maxBondAmount: asDouble(json['maxBondAmount']),
      maxPropertyPrice: asDouble(json['maxPropertyPrice']),
      estimatedInstalment: asDouble(json['estimatedInstalment']),
      band: PrequalBandX.fromWire(json['band']?.toString()),
      qualifies: json['qualifies'] == true,
      createdAt: asDate(json['createdAt']),
    );
  }
}
