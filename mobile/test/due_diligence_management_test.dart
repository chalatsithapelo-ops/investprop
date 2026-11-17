import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:investprop_mobile/core/api/trpc_client.dart';
import 'package:investprop_mobile/core/providers.dart';
import 'package:investprop_mobile/core/storage/token_storage.dart';
import 'package:investprop_mobile/features/auth/data/auth_repository.dart';
import 'package:investprop_mobile/features/auth/domain/app_user.dart';
import 'package:investprop_mobile/features/opportunities/data/due_diligence_management_repository.dart';
import 'package:investprop_mobile/features/opportunities/presentation/manage_due_diligence_page.dart';

class _Client extends TrpcClient {
  _Client() : super(TokenStorage());
  final calls = <({String name, Map<String, dynamic> input})>[];
  FutureOr<dynamic> Function(String, Map<String, dynamic>)? reply;

  Future<dynamic> _call(String name, Map<String, dynamic>? input) async {
    final body = input ?? {};
    calls.add((name: name, input: body));
    if (reply != null) return reply!(name, body);
    return switch (name) {
      'getDevelopmentProfessionals' => {'professionals': <dynamic>[]},
      'getDevelopmentApprovals' => {'approvals': <dynamic>[]},
      'getDocumentsPack' => {'documents': <dynamic>[]},
      'uploadFile' => {'publicUrl': 'https://example.com/photo.jpg'},
      _ => {'success': true},
    };
  }

  @override
  Future<dynamic> query(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) => _call(procedure, input);
  @override
  Future<dynamic> mutation(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) => _call(procedure, input);
}

class _Auth extends AuthRepository {
  _Auth(TrpcClient client, this.role) : super(client, TokenStorage());
  final String role;
  @override
  Future<AppUser?> restoreSession() async =>
      AppUser(id: 1, email: 'staff@example.com', name: 'Staff', role: role);
}

Future<void> _mount(
  WidgetTester tester,
  _Client client, {
  String role = 'PROJECT_MANAGER',
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        trpcClientProvider.overrideWithValue(client),
        authRepositoryProvider.overrideWithValue(_Auth(client, role)),
      ],
      child: const MaterialApp(home: ManageDueDiligencePage(propertyId: 7)),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  test('loads property-level registers without a development lookup', () async {
    final client = _Client();
    final container = ProviderContainer(
      overrides: [trpcClientProvider.overrideWithValue(client)],
    );
    addTearDown(container.dispose);
    final data = await container
        .read(dueDiligenceManagementRepositoryProvider)
        .load(7);
    expect(data.professionals, isEmpty);
    expect(data.approvals, isEmpty);
    expect(data.documents, isEmpty);
    expect(client.calls.map((c) => c.name), [
      'getDevelopmentProfessionals',
      'getDevelopmentApprovals',
      'getDocumentsPack',
    ]);
    expect(client.calls.every((c) => c.input['propertyId'] == 7), isTrue);
  });

  test(
    'all professional statuses use create/update contracts and omit empty email',
    () async {
      final client = _Client();
      final repo = DueDiligenceManagementRepository(client);
      for (final status in ddAppointmentStatuses) {
        await repo.saveProfessional(
          propertyId: 7,
          role: 'WET_SERVICES_ENGINEER',
          status: status,
          isRequired: false,
          feeAmount: 125.5,
        );
        expect(client.calls.last.name, 'createDevelopmentProfessional');
        expect(client.calls.last.input, {
          'propertyId': 7,
          'role': 'WET_SERVICES_ENGINEER',
          'status': status,
          'isRequired': false,
          'feeAmount': 125.5,
          'firmName': '',
          'contactName': '',
          'contactPhone': '',
          'registrationBody': '',
          'registrationNo': '',
        });
        await repo.saveProfessional(
          propertyId: 7,
          professionalId: 42,
          role: 'OTHER',
          status: status,
          isRequired: true,
          feeAmount: 0,
          contactEmail: ' staff@example.com ',
          notes: 'Updated',
        );
        expect(client.calls.last.name, 'updateDevelopmentProfessional');
        expect(client.calls.last.input['professionalId'], 42);
        expect(client.calls.last.input['contactEmail'], 'staff@example.com');
        expect(client.calls.last.input['notes'], 'Updated');
        expect(client.calls.last.input.containsKey('role'), isFalse);
        expect(client.calls.last.input.containsKey('propertyId'), isFalse);
      }
      await expectLater(
        repo.saveProfessional(
          propertyId: 7,
          role: 'OTHER',
          status: 'APPOINTED',
          isRequired: true,
          feeAmount: double.nan,
        ),
        throwsArgumentError,
      );
    },
  );

  test(
    'all approval statuses use correct IDs, dates and immutable field mapping',
    () async {
      final client = _Client();
      final repo = DueDiligenceManagementRepository(client);
      final date = DateTime.utc(2026, 11, 16);
      for (final status in ddApprovalStatuses) {
        await repo.saveApproval(
          propertyId: 7,
          type: 'WATER_LICENCE',
          status: status,
          isRequired: false,
          targetDate: date,
          submittedAt: date,
          decisionAt: date,
        );
        expect(client.calls.last.name, 'createDevelopmentApproval');
        expect(client.calls.last.input['propertyId'], 7);
        expect(client.calls.last.input['type'], 'WATER_LICENCE');
        expect(client.calls.last.input['isRequired'], false);
        expect(client.calls.last.input['status'], status);
        expect(client.calls.last.input['targetDate'], date.toIso8601String());
        expect(client.calls.last.input.containsKey('submittedAt'), isFalse);
        expect(client.calls.last.input.containsKey('decisionAt'), isFalse);
        await repo.saveApproval(
          propertyId: 7,
          approvalId: 9,
          type: 'WATER_LICENCE',
          status: status,
          isRequired: false,
          submittedAt: date,
          decisionAt: date,
          documentUrl: 'https://example.com/approval.pdf',
        );
        expect(client.calls.last.name, 'updateDevelopmentApproval');
        expect(client.calls.last.input['approvalId'], 9);
        expect(client.calls.last.input['submittedAt'], date.toIso8601String());
        expect(client.calls.last.input['decisionAt'], date.toIso8601String());
        expect(client.calls.last.input.containsKey('type'), isFalse);
        expect(client.calls.last.input.containsKey('isRequired'), isFalse);
        expect(client.calls.last.input.containsKey('targetDate'), isFalse);
      }
    },
  );

  test('pack and upload use actual server endpoints and bare base64', () async {
    final client = _Client();
    final repo = DueDiligenceManagementRepository(client);
    final bytes = Uint8List.fromList([1, 2, 3]);
    final url = await repo.uploadPhoto(fileName: 'photo.JPG', bytes: bytes);
    expect(client.calls.last.name, 'uploadFile');
    expect(client.calls.last.input, {
      'fileName': 'photo.JPG',
      'fileType': 'image/jpeg',
      'fileBase64': base64Encode(bytes),
    });
    await repo.addDocument(propertyId: 7, label: ' Valuation ', url: url);
    expect(client.calls.last.name, 'addDocumentToPack');
    expect(client.calls.last.input, {
      'propertyId': 7,
      'label': 'Valuation',
      'url': url,
    });
    await repo.removeDocument(propertyId: 7, url: url);
    expect(client.calls.last.name, 'removeDocumentFromPack');
    await expectLater(
      repo.addDocument(propertyId: 7, label: '', url: url),
      throwsArgumentError,
    );
    await expectLater(
      repo.addDocument(propertyId: 7, label: 'Bad', url: 'javascript:alert(1)'),
      throwsArgumentError,
    );
    await expectLater(
      repo.uploadPhoto(fileName: 'photo.heic', bytes: bytes),
      throwsArgumentError,
    );
    await expectLater(
      repo.uploadPhoto(fileName: 'photo.jpg', bytes: Uint8List(0)),
      throwsArgumentError,
    );
    await expectLater(
      repo.uploadPhoto(
        fileName: 'photo.jpg',
        bytes: Uint8List(5 * 1024 * 1024 + 1),
      ),
      throwsArgumentError,
    );
  });

  test('enum options cover every current server value', () {
    expect(ddProfessionalRoles.length, 18);
    expect(ddApprovalTypes.length, 19);
    expect(ddAppointmentStatuses, [
      'NOT_APPOINTED',
      'SHORTLISTED',
      'APPOINTED',
      'TERMINATED',
    ]);
    expect(ddApprovalStatuses, [
      'NOT_STARTED',
      'SUBMITTED',
      'IN_REVIEW',
      'APPROVED',
      'REJECTED',
      'CONDITIONAL',
    ]);
    expect(
      ddApprovalTypes,
      containsAll([
        'WATER_USE_LICENCE',
        'WATER_LICENCE',
        'OCCUPANCY_CERTIFICATE',
      ]),
    );
  });

  testWidgets('loading, failed request and retry render natively', (
    tester,
  ) async {
    final client = _Client();
    final pending = Completer<dynamic>();
    client.reply = (name, _) => name == 'getDocumentsPack'
        ? pending.future
        : {
            name == 'getDevelopmentProfessionals'
                    ? 'professionals'
                    : 'approvals':
                <dynamic>[],
          };
    await _mount(tester, client);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    pending.completeError(Exception('Pack unavailable'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Pack unavailable'), findsOneWidget);
    client.reply = null;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('No professionals recorded.'), findsOneWidget);
    expect(find.text('No approvals recorded.'), findsOneWidget);
    expect(find.text('No supporting documents added.'), findsOneWidget);
  });

  testWidgets('investor cannot fetch or mutate staff page', (tester) async {
    final client = _Client();
    await _mount(tester, client, role: 'INVESTOR');
    await tester.pumpAndSettle();
    expect(
      find.text('Staff access required to manage due diligence.'),
      findsOneWidget,
    );
    expect(client.calls, isEmpty);
  });

  testWidgets('professional form saves and refreshes the register', (
    tester,
  ) async {
    final client = _Client();
    await _mount(tester, client);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add Professional appointments'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Save'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(
      client.calls.where((c) => c.name == 'createDevelopmentProfessional'),
      hasLength(1),
    );
    expect(find.text('Due diligence saved.'), findsOneWidget);
    expect(
      client.calls.where((c) => c.name == 'getDevelopmentProfessionals'),
      hasLength(2),
    );
  });

  testWidgets('existing approval status and document changes use approvalId', (
    tester,
  ) async {
    final client = _Client();
    client.reply = (name, _) => switch (name) {
      'getDevelopmentProfessionals' => {'professionals': <dynamic>[]},
      'getDevelopmentApprovals' => {
        'approvals': [
          {
            'id': 42,
            'type': 'FIRE_APPROVAL',
            'status': 'IN_REVIEW',
            'isRequired': true,
            'authority': 'City',
            'targetDate': '2026-12-01T00:00:00.000Z',
          },
        ],
      },
      'getDocumentsPack' => {'documents': <dynamic>[]},
      _ => {'success': true},
    };
    await _mount(tester, client);
    await tester.pumpAndSettle();
    expect(find.text('FIRE APPROVAL'), findsOneWidget);
    await tester.tap(find.byTooltip('Edit approval'));
    await tester.pumpAndSettle();
    final dropdowns = tester
        .widgetList<DropdownButtonFormField<String>>(
          find.byType(DropdownButtonFormField<String>),
        )
        .toList();
    expect(dropdowns.first.onChanged, isNull);
    await tester.tap(find.text('IN REVIEW').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('CONDITIONAL').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Save'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    final call = client.calls.singleWhere(
      (c) => c.name == 'updateDevelopmentApproval',
    );
    expect(call.input['approvalId'], 42);
    expect(call.input['status'], 'CONDITIONAL');
    expect(call.input['targetDate'], '2026-12-01T00:00:00.000Z');
    expect(call.input.containsKey('isRequired'), isFalse);
  });

  testWidgets('supporting document removal requires confirmation', (
    tester,
  ) async {
    final client = _Client();
    client.reply = (name, _) => switch (name) {
      'getDevelopmentProfessionals' => {'professionals': <dynamic>[]},
      'getDevelopmentApprovals' => {'approvals': <dynamic>[]},
      'getDocumentsPack' => {
        'documents': [
          {
            'label': 'MOI',
            'url': 'https://example.com/moi.pdf',
            'uploadedAt': '2026-11-16T00:00:00Z',
          },
        ],
      },
      _ => {'success': true},
    };
    await _mount(tester, client);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byTooltip('Remove document'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Remove document'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(
      client.calls.where((c) => c.name == 'removeDocumentFromPack'),
      isEmpty,
    );
    await tester.tap(find.byTooltip('Remove document'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(
      client.calls.singleWhere((c) => c.name == 'removeDocumentFromPack').input,
      {'propertyId': 7, 'url': 'https://example.com/moi.pdf'},
    );
  });

  testWidgets(
    'supporting document requires label and valid URL, preserves failed form',
    (tester) async {
      final client = _Client();
      await _mount(tester, client);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Add Supporting documents'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add Supporting documents'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a document label.'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).at(0), 'Title deed');
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'https://example.com/deed.pdf',
      );
      client.reply = (_, _) => throw Exception('Save unavailable');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Save unavailable'), findsOneWidget);
      expect(find.text('Title deed'), findsOneWidget);
      client.reply = null;
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(
        client.calls.lastWhere((c) => c.name == 'addDocumentToPack').input,
        {
          'propertyId': 7,
          'label': 'Title deed',
          'url': 'https://example.com/deed.pdf',
        },
      );
    },
  );
}
