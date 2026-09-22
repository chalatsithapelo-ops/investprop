import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/investor_document.dart';

class DocumentsRepository {
  DocumentsRepository(this._client);

  final TrpcClient _client;

  Future<DocumentsResult> myDocuments() async {
    final data = await _client.query('getMyDocuments');
    return DocumentsResult.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }
}

final documentsRepositoryProvider = Provider<DocumentsRepository>((ref) {
  return DocumentsRepository(ref.watch(trpcClientProvider));
});

final myDocumentsProvider =
    FutureProvider.autoDispose<DocumentsResult>((ref) async {
  return ref.watch(documentsRepositoryProvider).myDocuments();
});
