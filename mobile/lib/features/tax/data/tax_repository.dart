import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/tax_certificate.dart';

class TaxRepository {
  TaxRepository(this._client);

  final TrpcClient _client;

  Future<TaxCertificate> certificate(int taxYear) async {
    final data = await _client.query(
      'generateTaxCertificate',
      input: {'taxYear': taxYear},
    );
    return TaxCertificate.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }
}

final taxRepositoryProvider = Provider<TaxRepository>((ref) {
  return TaxRepository(ref.watch(trpcClientProvider));
});

final taxCertificateProvider =
    FutureProvider.autoDispose.family<TaxCertificate, int>((ref, taxYear) async {
  return ref.watch(taxRepositoryProvider).certificate(taxYear);
});
