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

  /// Reads a legal document's AI summary + risk register. Returns null when
  /// the document has not been analysed yet.
  Future<DocumentAiSummary?> aiSummary(int documentId) async {
    final data = await _client.query(
      'getLegalDocumentSummary',
      input: {'documentId': documentId},
    );
    return DocumentAiSummary.fromJson(data);
  }

  /// Runs (or re-runs) the AI analysis for a legal document.
  Future<DocumentAiSummary?> analyse(int documentId, {bool force = false}) async {
    final data = await _client.mutation(
      'summariseLegalDocument',
      input: {'documentId': documentId, 'force': force},
    );
    return DocumentAiSummary.fromJson(data);
  }
}

final documentsRepositoryProvider = Provider<DocumentsRepository>((ref) {
  return DocumentsRepository(ref.watch(trpcClientProvider));
});

final myDocumentsProvider =
    FutureProvider.autoDispose<DocumentsResult>((ref) async {
  return ref.watch(documentsRepositoryProvider).myDocuments();
});
