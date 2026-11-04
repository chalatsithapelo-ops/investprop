import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/office_models.dart';

class OfficeRepository {
  OfficeRepository(this._client);
  final TrpcClient _client;

  Future<OfficeOverview> overview() async =>
      OfficeOverview.fromJson(await _client.query('officeOverview'));

  Future<List<OfficeConversation>> conversations() async => officeList(
    await _client.query('officeConversations'),
    OfficeConversation.fromJson,
  );

  Future<OfficeConversation> conversation(String id) async =>
      OfficeConversation.fromJson(
        await _client.query(
          'officeConversation',
          input: {'conversationId': id},
        ),
      );

  Future<OfficeChatReply> chat({
    String? conversationId,
    required String message,
    required OfficePersona persona,
  }) async => OfficeChatReply.fromJson(
    await _client.mutation(
      'officeChat',
      input: {
        if (conversationId != null) 'conversationId': conversationId,
        'message': message,
        'persona': persona.wire,
      },
    ),
  );

  Future<List<OfficeTask>> tasks() async =>
      officeList(await _client.query('officeTasks'), OfficeTask.fromJson);

  Future<OfficeVoiceReply> voiceTurn({
    String? conversationId,
    required OfficePersona persona,
    required bool speechConsent,
    required Uint8List wav,
  }) async {
    if (!speechConsent) throw StateError('Voice consent is required.');
    if (wav.length <= 44 ||
        wav.length > 2 * 1024 * 1024 ||
        ascii.decode(wav.sublist(0, 4), allowInvalid: true) != 'RIFF' ||
        ascii.decode(wav.sublist(8, 12), allowInvalid: true) != 'WAVE') {
      throw const FormatException('Recording must be a WAV under 2 MiB.');
    }
    return OfficeVoiceReply.fromJson(
      await _client.mutation(
        'officeVoiceTurn',
        input: {
          if (conversationId != null) 'conversationId': conversationId,
          'persona': persona.wire,
          'speechConsent': true,
          'audioBase64': base64Encode(wav),
          'mimeType': 'audio/wav',
        },
      ),
    );
  }

  Future<OfficeTask> prepare({
    required OfficeTaskKind kind,
    required String title,
    String? dueAt,
    String? notes,
    int? taxYear,
    int? proposalId,
  }) async => OfficeTask.fromJson(
    await _client.mutation(
      'officePrepareTask',
      input: {
        'kind': kind.wire,
        'title': title,
        'parameters': {
          if (dueAt != null) 'dueAt': dueAt,
          if (notes != null) 'notes': notes,
          if (taxYear != null) 'taxYear': taxYear,
          if (proposalId != null) 'proposalId': proposalId,
        },
      },
    ),
  );

  Future<void> approve(OfficeTask task) async {
    if (!task.canApproveAt(DateTime.now())) {
      throw StateError(
        'Task is expired, incomplete or not prepared. Refresh it.',
      );
    }
    await _client.mutation(
      'officeApproveTask',
      input: {'taskId': task.id, 'approvalDigest': task.approvalDigest},
    );
  }

  Future<void> cancel(String taskId) async {
    await _client.mutation('officeCancelTask', input: {'taskId': taskId});
  }
}

final officeRepositoryProvider = Provider.autoDispose<OfficeRepository>((ref) {
  // Dispose cached account data when the signed-in identity changes.
  ref.watch(authControllerProvider.select((state) => state.user?.id));
  return OfficeRepository(ref.watch(trpcClientProvider));
});

final officeOverviewProvider = FutureProvider.autoDispose<OfficeOverview>(
  (ref) => ref.watch(officeRepositoryProvider).overview(),
);
final officeConversationsProvider =
    FutureProvider.autoDispose<List<OfficeConversation>>(
      (ref) => ref.watch(officeRepositoryProvider).conversations(),
    );
final officeTasksProvider = FutureProvider.autoDispose<List<OfficeTask>>(
  (ref) => ref.watch(officeRepositoryProvider).tasks(),
);
