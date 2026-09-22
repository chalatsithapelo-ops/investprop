import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/certificate.dart';

class CertificatesRepository {
  CertificatesRepository(this._client);

  final TrpcClient _client;

  Future<List<ShareCertificate>> myCertificates() async {
    final data = await _client.query('getMyCertificates');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => ShareCertificate.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Fetches the full PDF payload (also increments the server download count).
  Future<CertificatePdfData> pdfData(int certificateId) async {
    final data = await _client.mutation(
      'getCertificatePDFData',
      input: {'certificateId': certificateId},
    );
    return CertificatePdfData.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }
}

final certificatesRepositoryProvider = Provider<CertificatesRepository>((ref) {
  return CertificatesRepository(ref.watch(trpcClientProvider));
});

final myCertificatesProvider =
    FutureProvider.autoDispose<List<ShareCertificate>>((ref) async {
  return ref.watch(certificatesRepositoryProvider).myCertificates();
});
