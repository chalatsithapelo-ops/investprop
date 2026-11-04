import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:investprop_mobile/core/api/trpc_client.dart';
import 'package:investprop_mobile/core/storage/token_storage.dart';
import 'package:investprop_mobile/features/office/data/office_repository.dart';
import 'package:investprop_mobile/features/office/domain/office_models.dart';
import 'package:investprop_mobile/features/office/presentation/office_chat_tab.dart';
import 'package:investprop_mobile/features/office/presentation/office_tasks_tab.dart';

Map<String, dynamic> overviewJson() => {
  'capabilities': {'textAI': true, 'voice': true, 'regulatedActions': false},
  'holdings': [
    {
      'propertyId': 42,
      'title': 'Cape Town',
      'shares': 2.5,
      'basisValue': 1234.56,
      'basisLabel': 'Recorded cost',
    },
  ],
  'paidDistributions': {
    'gross': 100,
    'net': 85.5,
    'withheld': 14.5,
    'count': 1,
  },
  'documents': [
    {
      'id': 'doc-1',
      'title': 'Agreement',
      'documentType': 'AGREEMENT',
      'propertyId': null,
    },
  ],
  'proposals': [
    {'id': 7, 'title': 'Owner land', 'status': 'REVIEW'},
  ],
  'evidence': [
    {
      'id': 2,
      'label': 'Ledger',
      'kind': 'LEDGER',
      'asOf': '2026-11-04T08:00:00Z',
    },
  ],
  'gaps': ['Missing invoice'],
};

Map<String, dynamic> taskJson({
  String status = 'PREPARED',
  String kind = 'REMINDER',
  String? expiry = '2099-01-01T00:00:00Z',
  String? digest = ' exact-server-digest ',
}) => {
  'id': 'task-1',
  'title': 'Review documents',
  'kind': kind,
  'status': status,
  'parameters': {'notes': 'Exact server notes', 'taxYear': 2026},
  'result': {'preview': 'Research only'},
  'approvalDigest': digest,
  'expiresAt': expiry,
  'createdAt': '2026-11-04T08:00:00Z',
};

class _Storage extends TokenStorage {
  @override
  Future<String?> get accessToken async => 'test-access-token';
}

class _RecordingClient extends TrpcClient {
  _RecordingClient() : super(_Storage());
  final calls =
      <
        ({
          String name,
          Map<String, dynamic>? input,
          bool query,
          bool authenticated,
        })
      >[];

  dynamic response(String name) => switch (name) {
    'officeOverview' => overviewJson(),
    'officeConversations' => [
      {
        'id': 'conversation-1',
        'title': 'Records',
        'createdAt': '2026-11-04T08:00:00Z',
      },
    ],
    'officeConversation' => {
      'id': 'conversation-1',
      'title': 'Records',
      'messages': [messageJson()],
    },
    'officeChat' => {
      'conversationId': 'conversation-1',
      'message': messageJson(),
    },
    'officeTasks' => [taskJson()],
    _ => taskJson(),
  };

  Map<String, dynamic> messageJson() => {
    'id': 'message-1',
    'role': 'assistant',
    'content': 'Check the ledger.',
    'evidence': [
      {'label': 'Ledger', 'id': 42},
    ],
    'createdAt': '2026-11-04T08:00:00Z',
  };

  @override
  Future<dynamic> query(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) async {
    calls.add((
      name: procedure,
      input: input,
      query: true,
      authenticated: authenticated,
    ));
    return response(procedure);
  }

  @override
  Future<dynamic> mutation(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) async {
    calls.add((
      name: procedure,
      input: input,
      query: false,
      authenticated: authenticated,
    ));
    return response(procedure);
  }
}

void main() {
  test('Overview parses mixed IDs, fractional amounts, evidence and gaps', () {
    final overview = OfficeOverview.fromJson(overviewJson());
    expect(overview.textAI, isTrue);
    expect(overview.voice, isTrue);
    expect(overview.holdings.single.propertyId, '42');
    expect(overview.holdings.single.shares, 2.5);
    expect(overview.holdings.single.basisValue, 1234.56);
    expect(overview.paidDistributions.net, 85.5);
    expect(overview.documents.single.propertyId, isNull);
    expect(overview.proposals.single.id, '7');
    expect(overview.evidence.single.asOf, DateTime.utc(2026, 11, 4, 8));
    expect(overview.gaps, ['Missing invoice']);
    expect(() => OfficeOverview.fromJson({}), throwsFormatException);
    final unsafe = overviewJson();
    unsafe['capabilities']['regulatedActions'] = true;
    expect(() => OfficeOverview.fromJson(unsafe), throwsFormatException);
    final invalid = overviewJson();
    invalid['holdings'][0]['basisValue'] = 'unknown';
    expect(() => OfficeOverview.fromJson(invalid), throwsFormatException);
  });

  test('Approval fails closed for expiry, missing digest, kind and status', () {
    final now = DateTime.utc(2026, 11, 4);
    expect(OfficeTask.fromJson(taskJson()).canApproveAt(now), isTrue);
    for (final json in [
      taskJson(expiry: null),
      taskJson(expiry: 'invalid'),
      taskJson(expiry: now.toIso8601String()),
      taskJson(digest: null),
      taskJson(digest: '   '),
      taskJson(status: 'COMPLETED'),
      taskJson(kind: 'TRANSFER'),
      {...taskJson(), 'parameters': null},
    ]) {
      expect(OfficeTask.fromJson(json).canApproveAt(now), isFalse);
    }
  });

  test(
    'Repository uses every flat authenticated contract and exact digest',
    () async {
      final client = _RecordingClient();
      final repo = OfficeRepository(client);
      await repo.overview();
      expect((await repo.conversations()).single.id, 'conversation-1');
      expect(
        (await repo.conversation('conversation-1')).messages.single.content,
        'Check the ledger.',
      );
      for (final persona in OfficePersona.values) {
        final reply = await repo.chat(message: 'Evidence?', persona: persona);
        expect(reply.conversationId, 'conversation-1');
        expect(client.calls.last.input, {
          'message': 'Evidence?',
          'persona': persona.wire,
        });
      }
      await repo.chat(
        conversationId: 'conversation-1',
        message: 'More?',
        persona: OfficePersona.tax,
      );
      expect(client.calls.last.input?['conversationId'], 'conversation-1');
      await repo.tasks();
      for (final kind in OfficeTaskKind.values) {
        await repo.prepare(
          kind: kind,
          title: 'Review',
          taxYear: 2026,
          proposalId: 7,
          dueAt: '2099-01-01T00:00:00Z',
          notes: 'Keep exact',
        );
        expect(client.calls.last.input, {
          'kind': kind.wire,
          'title': 'Review',
          'parameters': {
            'taxYear': 2026,
            'proposalId': 7,
            'dueAt': '2099-01-01T00:00:00Z',
            'notes': 'Keep exact',
          },
        });
      }
      await repo.prepare(kind: OfficeTaskKind.reminder, title: 'Minimal');
      expect(client.calls.last.input?['parameters'], isEmpty);
      await repo.approve(OfficeTask.fromJson(taskJson()));
      expect(client.calls.last.input, {
        'taskId': 'task-1',
        'approvalDigest': ' exact-server-digest ',
      });
      final count = client.calls.length;
      await expectLater(
        repo.approve(OfficeTask.fromJson(taskJson(digest: null))),
        throwsStateError,
      );
      expect(client.calls.length, count);
      await repo.cancel('task-1');
      expect(client.calls.last.input, {'taskId': 'task-1'});
      expect(client.calls.every((call) => call.authenticated), isTrue);
      expect(
        client.calls.where((call) => call.query).map((call) => call.name),
        [
          'officeOverview',
          'officeConversations',
          'officeConversation',
          'officeTasks',
        ],
      );
    },
  );

  test(
    'Existing transport injects authToken and bearer header for office',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/trpc'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: 200,
                data: {
                  'result': {
                    'data': {
                      'json': request.method == 'GET'
                          ? overviewJson()
                          : taskJson(),
                    },
                  },
                },
              ),
            );
          },
        ),
      );
      final repo = OfficeRepository(TrpcClient(_Storage(), dio: dio));
      await repo.overview();
      await repo.prepare(kind: OfficeTaskKind.reminder, title: 'Review');
      final queryInput = jsonDecode(
        requests.first.queryParameters['input'] as String,
      );
      expect(queryInput['json']['authToken'], 'test-access-token');
      expect(requests.last.data['json']['authToken'], 'test-access-token');
      expect(
        requests.every(
          (request) =>
              request.headers['Authorization'] == 'Bearer test-access-token',
        ),
        isTrue,
      );
    },
  );

  testWidgets('Chat is content-based at narrow width with enlarged text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          officeOverviewProvider.overrideWith(
            (ref) async => OfficeOverview.fromJson(overviewJson()),
          ),
          officeConversationsProvider.overrideWith((ref) async => []),
        ],
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.8)),
            child: child!,
          ),
          home: const Scaffold(body: OfficeChatTab()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ChoiceChip), findsNWidgets(4));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Task approval requires review and sends server digest, not edits',
    (tester) async {
      final client = _RecordingClient();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            officeRepositoryProvider.overrideWith(
              (ref) => OfficeRepository(client),
            ),
            officeTasksProvider.overrideWith(
              (ref) async => [OfficeTask.fromJson(taskJson())],
            ),
          ],
          child: const MaterialApp(home: Scaffold(body: OfficeTasksTab())),
        ),
      );
      await tester.pumpAndSettle();
      final review = find.text('Review preview & digest');
      await tester.ensureVisible(review);
      await tester.pumpAndSettle();
      await tester.tap(review);
      await tester.pumpAndSettle();
      final approve = find.ancestor(
        of: find.text('Approve exact task'),
        matching: find.byWidgetPredicate((widget) => widget is FilledButton),
      );
      expect(tester.widget<FilledButton>(approve).onPressed, isNull);
      expect(find.text(' exact-server-digest '), findsOneWidget);
      final checkbox = find.byType(CheckboxListTile);
      await tester.ensureVisible(checkbox);
      await tester.pumpAndSettle();
      await tester.tap(checkbox);
      await tester.pumpAndSettle();
      await tester.ensureVisible(approve);
      await tester.pumpAndSettle();
      await tester.tap(approve);
      await tester.pumpAndSettle();
      expect(client.calls.single.input, {
        'taskId': 'task-1',
        'approvalDigest': ' exact-server-digest ',
      });
      expect(tester.takeException(), isNull);
    },
  );
}
