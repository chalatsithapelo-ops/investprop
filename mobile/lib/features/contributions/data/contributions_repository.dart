import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/contribution.dart';

class ContributionsRepository {
  ContributionsRepository(this._client);

  final TrpcClient _client;

  Future<ContributionsResult> myContributions() async {
    final data = await _client.query('getMyContributions');
    return ContributionsResult.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<void> cancelDuringCoolingOff({
    required int contributionId,
    String? reason,
  }) async {
    await _client.mutation(
      'cancelContributionDuringCoolingOff',
      input: {
        'contributionId': contributionId,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
  }

  Future<void> requestRefund({
    required int contributionId,
    required String reason,
  }) async {
    await _client.mutation(
      'requestRefund',
      input: {'contributionId': contributionId, 'reason': reason},
    );
  }

  /// Uploads a file (base64, no data-URI prefix) and returns its public URL.
  Future<String> uploadFile({
    required String fileName,
    required String fileType,
    required String base64,
  }) async {
    final data = await _client.mutation(
      'uploadFile',
      input: {
        'fileName': fileName,
        'fileType': fileType,
        'fileBase64': base64,
      },
    );
    if (data is Map && data['publicUrl'] != null) {
      return data['publicUrl'].toString();
    }
    throw StateError('Upload failed. Please try again.');
  }

  Future<void> submitProofOfPayment({
    required int contributionId,
    required String proofOfPaymentUrl,
    String? paymentReference,
    String? notes,
  }) async {
    await _client.mutation(
      'submitProofOfPayment',
      input: {
        'contributionId': contributionId,
        'proofOfPaymentUrl': proofOfPaymentUrl,
        if (paymentReference != null && paymentReference.isNotEmpty)
          'paymentReference': paymentReference,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
  }
}

final contributionsRepositoryProvider =
    Provider<ContributionsRepository>((ref) {
  return ContributionsRepository(ref.watch(trpcClientProvider));
});

final contributionsProvider =
    FutureProvider.autoDispose<ContributionsResult>((ref) async {
  return ref.watch(contributionsRepositoryProvider).myContributions();
});
