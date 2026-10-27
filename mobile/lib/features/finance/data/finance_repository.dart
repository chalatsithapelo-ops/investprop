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
    final data = await _client.query(
      'previewPrequalification',
      input: input.toInput(),
    );
    return PrequalResult.fromJson(Map<String, dynamic>.from(data as Map));
  }

  /// Run and save a prequalification (requires POPIA consent).
  Future<PrequalResult> submitPrequalification({
    required PrequalInput input,
    required bool consent,
    int? propertyId,
  }) async {
    final data = await _client.mutation(
      'submitPrequalification',
      input: {
        ...input.toInput(),
        'consent': consent,
        if (propertyId != null) 'propertyId': propertyId,
      },
    );
    final map = Map<String, dynamic>.from(data as Map);
    if (map['success'] != true) {
      throw StateError(
        (map['error'] as String?) ?? 'Could not save your prequalification.',
      );
    }
    return PrequalResult.fromJson(
      Map<String, dynamic>.from(map['result'] as Map),
    );
  }

  Future<List<Prequalification>> myPrequalifications() async {
    final data = await _client.query('getMyPrequalifications');
    final list = data is Map ? data['prequalifications'] : null;
    if (list is! List) return [];
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
