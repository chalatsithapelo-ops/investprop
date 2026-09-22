import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/compliance_status.dart';
import '../domain/contribution.dart';
import '../domain/share_preview.dart';

/// Payload for `submitAppropriatenessQuestionnaire` (FAIS hard gate).
class AppropriatenessAnswers {
  const AppropriatenessAnswers({
    required this.investmentExperience,
    required this.annualIncome,
    required this.netWorth,
    required this.understandsIlliquid,
    required this.understandsLossOfCapital,
    required this.understandsCoolingOff,
    required this.maxLossTolerance,
  });

  final String investmentExperience; // NONE | BASIC | EXPERIENCED | PROFESSIONAL
  final String annualIncome; // UNDER_350K | 350_750K | 750K_1_5M | OVER_1_5M
  final String netWorth; // UNDER_500K | 500K_2M | 2M_10M | OVER_10M
  final bool understandsIlliquid;
  final bool understandsLossOfCapital;
  final bool understandsCoolingOff;
  final double maxLossTolerance;

  Map<String, dynamic> toInput() => {
    'investmentExperience': investmentExperience,
    'annualIncome': annualIncome,
    'netWorth': netWorth,
    'understandsIlliquid': understandsIlliquid,
    'understandsLossOfCapital': understandsLossOfCapital,
    'understandsCoolingOff': understandsCoolingOff,
    'maxLossTolerance': maxLossTolerance,
  };
}

/// Result of starting a Paystack payment (`initiateInvestmentPayment`).
class PaymentInit {
  const PaymentInit({required this.authorizationUrl, required this.reference});

  final String authorizationUrl;
  final String reference;
}

class InvestmentRepository {
  InvestmentRepository(this._client);

  final TrpcClient _client;

  Future<SharePreview?> sharePreview({
    required int propertyId,
    required double amount,
  }) async {
    final data = await _client.query(
      'calculateSharePreview',
      input: {'propertyId': propertyId, 'amount': amount},
    );
    return SharePreview.fromJson(data);
  }

  Future<AppropriatenessStatus> appropriatenessStatus() async {
    final data = await _client.query('getAppropriatenessStatus');
    return AppropriatenessStatus.fromJson(data);
  }

  Future<void> submitAppropriateness(AppropriatenessAnswers answers) async {
    await _client.mutation(
      'submitAppropriatenessQuestionnaire',
      input: answers.toInput(),
    );
  }

  Future<FicaStatus> ficaStatus() async {
    final data = await _client.query('getMyFicaStatus');
    return FicaStatus.fromJson(data);
  }

  Future<List<Contribution>> myPropertyInvestments(int propertyId) async {
    final data = await _client.query(
      'getMyPropertyInvestments',
      input: {'propertyId': propertyId},
    );
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((e) => Contribution.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Contribution> submitProposal({
    required int propertyId,
    required double amount,
    String? notes,
  }) async {
    final data = await _client.mutation(
      'submitInvestmentProposal',
      input: {
        'propertyId': propertyId,
        'contributionAmount': amount,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
    final contribution = data is Map ? data['contribution'] : null;
    if (contribution is Map) {
      return Contribution.fromJson(Map<String, dynamic>.from(contribution));
    }
    throw StateError('Unexpected response from submitInvestmentProposal');
  }

  Future<void> updateProposal({
    required int contributionId,
    double? amount,
    String? notes,
  }) async {
    await _client.mutation(
      'updateInvestmentProposal',
      input: {
        'contributionId': contributionId,
        if (amount != null) 'contributionAmount': amount,
        if (notes != null) 'notes': notes,
      },
    );
  }

  Future<void> cancelProposal(int contributionId) async {
    await _client.mutation(
      'cancelInvestmentProposal',
      input: {'contributionId': contributionId},
    );
  }

  Future<List<Contribution>> awaitingPayment() async {
    final data = await _client.query('getMyAwaitingPayment');
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((e) => Contribution.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<PaymentInit> initiatePayment({
    required int contributionId,
    String? callbackUrl,
  }) async {
    final data = await _client.mutation(
      'initiateInvestmentPayment',
      input: {
        'contributionId': contributionId,
        if (callbackUrl != null) 'callbackUrl': callbackUrl,
      },
    );
    if (data is Map && data['authorizationUrl'] != null) {
      return PaymentInit(
        authorizationUrl: data['authorizationUrl'].toString(),
        reference: (data['reference'] ?? '').toString(),
      );
    }
    throw StateError('Could not start the payment. Please try again.');
  }

  Future<bool> verifyPayment({
    required int contributionId,
    required String reference,
  }) async {
    final data = await _client.mutation(
      'verifyInvestmentPayment',
      input: {'contributionId': contributionId, 'reference': reference},
    );
    return data is Map && data['success'] == true;
  }
}

final investmentRepositoryProvider = Provider<InvestmentRepository>((ref) {
  return InvestmentRepository(ref.watch(trpcClientProvider));
});

/// Combined compliance snapshot the invest screen needs before submitting.
class InvestGateStatus {
  const InvestGateStatus({
    required this.appropriateness,
    required this.fica,
    required this.existing,
  });

  final AppropriatenessStatus appropriateness;
  final FicaStatus fica;
  final List<Contribution> existing;
}

final investGateProvider = FutureProvider.autoDispose
    .family<InvestGateStatus, int>((ref, propertyId) async {
      final repo = ref.watch(investmentRepositoryProvider);
      final results = await Future.wait([
        repo.appropriatenessStatus(),
        repo.ficaStatus(),
        repo.myPropertyInvestments(propertyId),
      ]);
      return InvestGateStatus(
        appropriateness: results[0] as AppropriatenessStatus,
        fica: results[1] as FicaStatus,
        existing: results[2] as List<Contribution>,
      );
    });

final awaitingPaymentProvider =
    FutureProvider.autoDispose<List<Contribution>>((ref) async {
      return ref.watch(investmentRepositoryProvider).awaitingPayment();
    });
