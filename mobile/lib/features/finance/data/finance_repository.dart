import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/home_loan.dart';
import '../domain/prequalification.dart';

/// Inputs for a prequalification affordability calculation.
class PrequalInput {
  const PrequalInput({
    required this.grossMonthlyIncome,
    this.monthlyExpenses = 0,
    this.existingDebtRepayments = 0,
    this.depositAmount = 0,
    this.propertyPrice = 0,
    this.annualInterestRate = 11.75,
    this.loanTermYears = 20,
  });

  final double grossMonthlyIncome;
  final double monthlyExpenses;
  final double existingDebtRepayments;
  final double depositAmount;
  final double propertyPrice;
  final double annualInterestRate;
  final int loanTermYears;

  factory PrequalInput.fromSaved(
    Prequalification saved, {
    double? propertyPrice,
  }) => PrequalInput(
    grossMonthlyIncome: saved.grossMonthlyIncome,
    monthlyExpenses: saved.monthlyExpenses,
    existingDebtRepayments: saved.existingDebtRepayments,
    depositAmount: saved.depositAmount,
    propertyPrice: propertyPrice ?? saved.propertyPrice,
    annualInterestRate: saved.annualInterestRate,
    loanTermYears: saved.loanTermYears,
  );

  String? get validationError {
    for (final entry in {
      'Gross monthly income': (grossMonthlyIncome, 100000000),
      'Monthly expenses': (monthlyExpenses, 100000000),
      'Debt repayments': (existingDebtRepayments, 100000000),
      'Deposit': (depositAmount, 1000000000),
      'Property price': (propertyPrice, 1000000000),
      'Interest rate': (annualInterestRate, 100),
    }.entries) {
      if (!entry.value.$1.isFinite ||
          entry.value.$1 < 0 ||
          entry.value.$1 > entry.value.$2) {
        return '${entry.key} must be between 0 and ${entry.value.$2}.';
      }
    }
    if (loanTermYears < 1 || loanTermYears > 40) {
      return 'Loan term must be a whole number from 1 to 40 years.';
    }
    return null;
  }

  double requestedBondAmount(PrequalResult result) => propertyPrice > 0
      ? math.min(
          math.max(propertyPrice - depositAmount, 0),
          result.maxBondAmount,
        )
      : result.maxBondAmount;

  Map<String, dynamic> applicationPrefill(
    PrequalResult result, {
    int? propertyId,
    int? prequalificationId,
  }) {
    final bond = requestedBondAmount(result);
    return {
      'bondAmount': bond,
      'propertyPrice': propertyPrice,
      'deposit': depositAmount,
      'grossIncome': grossMonthlyIncome,
      'instalment': monthlyInstalmentForBond(bond),
      'annualInterestRate': annualInterestRate,
      'loanTermYears': loanTermYears,
      if (propertyId != null) 'propertyId': propertyId,
      if (prequalificationId != null) 'prequalificationId': prequalificationId,
    };
  }

  double monthlyInstalmentForBond(double bond) {
    // Keep the quoted instalment consistent with the capped requested bond.
    final monthlyRate = annualInterestRate / 1200;
    final months = loanTermYears * 12;
    final factor = math.pow(1 + monthlyRate, months);
    return monthlyRate == 0
        ? bond / months
        : bond * monthlyRate * factor / (factor - 1);
  }

  Map<String, dynamic> toInput() => {
    'grossMonthlyIncome': grossMonthlyIncome,
    'monthlyExpenses': monthlyExpenses,
    'existingDebtRepayments': existingDebtRepayments,
    'depositAmount': depositAmount,
    if (propertyPrice > 0) 'propertyPrice': propertyPrice,
    'annualInterestRate': annualInterestRate,
    'loanTermYears': loanTermYears,
  };
}

class FinanceRepository {
  FinanceRepository(this._client);

  final TrpcClient _client;

  // ── Prequalification ──────────────────────────────────────────

  /// Live affordability preview (no database write).
  Future<PrequalResult> preview(PrequalInput input) async {
    _validate(input);
    final data = await _client.query(
      'previewPrequalification',
      input: input.toInput(),
    );
    // TrpcClient already unwraps result.data.json. Preview is a flat result,
    // unlike submitPrequalification's {success, id, result} payload.
    if (data is! Map) {
      throw const FormatException('Invalid prequalification response.');
    }
    return PrequalResult.fromJson(Map<String, dynamic>.from(data));
  }

  void _validate(PrequalInput input) {
    final error = input.validationError;
    if (error != null) throw StateError(error);
  }

  /// Run and save a prequalification (requires POPIA consent).
  Future<PrequalResult> submitPrequalification({
    required PrequalInput input,
    required bool consent,
    int? propertyId,
  }) async {
    _validate(input);
    final data = await _client.mutation(
      'submitPrequalification',
      input: {
        ...input.toInput(),
        'consent': consent,
        if (propertyId != null) 'propertyId': propertyId,
      },
    );
    final map = data is Map ? Map<String, dynamic>.from(data) : const {};
    if (map['success'] != true) {
      throw StateError(
        (map['error'] as String?) ?? 'Could not save your prequalification.',
      );
    }
    if (map['result'] is! Map || map['id'] is! num || map['id'] <= 0) {
      throw const FormatException('Invalid saved prequalification response.');
    }
    return PrequalResult.fromJson({
      ...Map<String, dynamic>.from(map['result'] as Map),
      'id': map['id'],
    });
  }

  Future<List<Prequalification>> myPrequalifications() async {
    final data = await _client.query('getMyPrequalifications');
    final list = data is Map ? data['prequalifications'] : null;
    if (list is! List) {
      throw const FormatException('Could not load saved prequalifications.');
    }
    return list
        .whereType<Map>()
        .map((e) => Prequalification.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  // ── Home-loan application ─────────────────────────────────────

  /// Uploads a file (base64, no data-URI prefix) and returns its public URL.
  Future<String> uploadFile({
    required String fileName,
    required String fileType,
    required String base64,
  }) async {
    final data = await _client.mutation(
      'uploadFile',
      input: {'fileName': fileName, 'fileType': fileType, 'fileBase64': base64},
    );
    if (data is Map && data['publicUrl'] != null) {
      return data['publicUrl'].toString();
    }
    throw StateError('Upload failed. Please try again.');
  }

  /// Submits a one-button multi-bank application. [documents] are already
  /// uploaded ({docType, fileName, fileUrl}).
  Future<void> submitApplication({
    required double requestedBondAmount,
    required bool consentShareData,
    int? prequalificationId,
    int? propertyId,
    double? propertyPrice,
    double? depositAmount,
    double? grossMonthlyIncome,
    double? estimatedInstalment,
    double? annualInterestRate,
    int? loanTermYears,
    String? applicantPhone,
    List<Map<String, String>> documents = const [],
  }) async {
    final data = await _client.mutation(
      'submitHomeLoanApplication',
      input: {
        'requestedBondAmount': requestedBondAmount,
        'consentShareData': consentShareData,
        if (prequalificationId != null)
          'prequalificationId': prequalificationId,
        if (propertyId != null) 'propertyId': propertyId,
        if (propertyPrice != null) 'propertyPrice': propertyPrice,
        if (depositAmount != null) 'depositAmount': depositAmount,
        if (grossMonthlyIncome != null)
          'grossMonthlyIncome': grossMonthlyIncome,
        if (estimatedInstalment != null)
          'estimatedInstalment': estimatedInstalment,
        if (annualInterestRate != null)
          'annualInterestRate': annualInterestRate,
        if (loanTermYears != null) 'loanTermYears': loanTermYears,
        if (applicantPhone != null && applicantPhone.isNotEmpty)
          'applicantPhone': applicantPhone,
        if (documents.isNotEmpty) 'documents': documents,
      },
    );
    final map = data is Map ? Map<String, dynamic>.from(data) : const {};
    if (map['success'] != true) {
      throw StateError(
        (map['error'] as String?) ?? 'Could not submit your application.',
      );
    }
  }

  Future<List<HomeLoanApplication>> myApplications() async {
    final data = await _client.query('getMyHomeLoanApplications');
    final list = data is Map ? data['applications'] : null;
    if (list is! List) return [];
    return list
        .whereType<Map>()
        .map((e) => HomeLoanApplication.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> withdrawApplication(int id) async {
    await _client.mutation('withdrawHomeLoanApplication', input: {'id': id});
  }

  Future<void> acceptOffer(int offerId) async {
    await _client.mutation('acceptHomeLoanOffer', input: {'offerId': offerId});
  }
}

final financeRepositoryProvider = Provider<FinanceRepository>((ref) {
  return FinanceRepository(ref.watch(trpcClientProvider));
});

final myHomeLoanApplicationsProvider =
    FutureProvider.autoDispose<List<HomeLoanApplication>>((ref) async {
      return ref.watch(financeRepositoryProvider).myApplications();
    });

final myPrequalificationsProvider =
    FutureProvider.autoDispose<List<Prequalification>>((ref) async {
      return ref.watch(financeRepositoryProvider).myPrequalifications();
    });
