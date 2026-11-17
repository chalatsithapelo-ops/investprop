import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:investprop_mobile/core/api/trpc_client.dart';
import 'package:investprop_mobile/core/storage/token_storage.dart';
import 'package:investprop_mobile/features/finance/data/finance_repository.dart';
import 'package:investprop_mobile/features/finance/domain/prequalification.dart';
import 'package:investprop_mobile/features/finance/presentation/prequalification_page.dart';

Map<String, dynamic> calculation({double bond = 1500000}) => {
  'maxInstalment': 15000,
  'maxBondAmount': bond,
  'maxPropertyPrice': bond + 100000,
  'estimatedInstalment': 10000,
  'loanToValue': 90,
  'annualInterestRate': 11.75,
  'loanTermYears': 20,
  'band': 'STRONG',
  'qualifies': true,
};

Map<String, dynamic> saved() => {
  ...calculation(),
  'id': 42,
  'propertyId': 7,
  'grossMonthlyIncome': 50000,
  'monthlyExpenses': 6000,
  'existingDebtRepayments': 1000,
  'depositAmount': 100000,
  'propertyPrice': 1000000,
  'annualInterestRate': 10.5,
  'loanTermYears': 25,
  'createdAt': '2026-11-16T08:00:00Z',
};

class _Storage extends TokenStorage {
  @override
  Future<String?> get accessToken async => 'finance-test-token';
}

class _Client extends TrpcClient {
  _Client() : super(_Storage());

  final calls = <({String name, Map<String, dynamic>? input})>[];
  FutureOr<dynamic> Function(String, Map<String, dynamic>?)? reply;

  dynamic _response(String name, Map<String, dynamic>? input) {
    calls.add((name: name, input: input));
    if (reply != null) return reply!(name, input);
    return switch (name) {
      'previewPrequalification' => calculation(),
      'getMyPrequalifications' => {
        'prequalifications': [saved()],
      },
      'submitPrequalification' => {
        'success': true,
        'id': 43,
        'result': calculation(),
      },
      _ => {'success': true},
    };
  }

  @override
  Future<dynamic> query(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) async => _response(procedure, input);

  @override
  Future<dynamic> mutation(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) async => _response(procedure, input);
}

Future<void> mount(
  WidgetTester tester,
  TrpcClient client, {
  int? propertyId,
  double? propertyPrice,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        financeRepositoryProvider.overrideWithValue(FinanceRepository(client)),
      ],
      child: MaterialApp(
        home: PrequalificationPage(
          propertyId: propertyId,
          propertyPrice: propertyPrice,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextFormField, label);

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  test(
    'defaults match web; optional price is omitted, zero interest is kept',
    () {
      const input = PrequalInput(grossMonthlyIncome: 50000);
      expect(input.toInput(), {
        'grossMonthlyIncome': 50000.0,
        'monthlyExpenses': 0.0,
        'existingDebtRepayments': 0.0,
        'depositAmount': 0.0,
        'annualInterestRate': 11.75,
        'loanTermYears': 20,
      });
      expect(
        const PrequalInput(
          grossMonthlyIncome: 1,
          annualInterestRate: 0,
        ).toInput()['annualInterestRate'],
        0,
      );
    },
  );

  test('saved financial inputs and property link survive model parsing', () {
    final record = Prequalification.fromJson(saved());
    final input = PrequalInput.fromSaved(record, propertyPrice: 2000000);
    expect(record.propertyId, 7);
    expect(record.id, 42);
    expect(record.createdAt, DateTime.utc(2026, 11, 16, 8));
    expect(input.toInput(), {
      'grossMonthlyIncome': 50000.0,
      'monthlyExpenses': 6000.0,
      'existingDebtRepayments': 1000.0,
      'depositAmount': 100000.0,
      'propertyPrice': 2000000.0,
      'annualInterestRate': 10.5,
      'loanTermYears': 25,
    });
  });

  test(
    'missing saved assumptions default but explicit zero interest survives',
    () {
      final json = saved()
        ..remove('annualInterestRate')
        ..remove('loanTermYears');
      final record = Prequalification.fromJson(json);
      expect(record.annualInterestRate, 11.75);
      expect(record.loanTermYears, 20);
      expect(
        Prequalification.fromJson({
          ...json,
          'annualInterestRate': 0,
        }).annualInterestRate,
        0,
      );
    },
  );

  test('requested bond uses price minus deposit, capped at affordability', () {
    final result = PrequalResult.fromJson(calculation());
    expect(
      const PrequalInput(grossMonthlyIncome: 1).requestedBondAmount(result),
      1500000,
    );
    expect(
      const PrequalInput(
        grossMonthlyIncome: 1,
        propertyPrice: 1000000,
        depositAmount: 100000,
      ).requestedBondAmount(result),
      900000,
    );
    expect(
      const PrequalInput(
        grossMonthlyIncome: 1,
        propertyPrice: 3000000,
      ).requestedBondAmount(result),
      1500000,
    );
    expect(
      const PrequalInput(
        grossMonthlyIncome: 1,
        propertyPrice: 100000,
        depositAmount: 200000,
      ).requestedBondAmount(result),
      0,
    );
  });

  test(
    'application prefill retains IDs/assumptions and consistent instalment',
    () {
      const input = PrequalInput(
        grossMonthlyIncome: 50000,
        propertyPrice: 1000000,
        depositAmount: 100000,
        annualInterestRate: 0,
        loanTermYears: 25,
      );
      final prefill = input.applicationPrefill(
        PrequalResult.fromJson(calculation()),
        propertyId: 7,
        prequalificationId: 42,
      );
      expect(prefill['bondAmount'], 900000);
      expect(prefill['instalment'], 3000);
      expect(prefill['annualInterestRate'], 0);
      expect(prefill['loanTermYears'], 25);
      expect(prefill['propertyId'], 7);
      expect(prefill['prequalificationId'], 42);
      expect(
        const PrequalInput(
          grossMonthlyIncome: 1,
        ).monthlyInstalmentForBond(1000000),
        closeTo(10837.08, 0.02),
      );
    },
  );

  test('invalid input fails before API calls', () async {
    final client = _Client();
    for (final input in [
      const PrequalInput(grossMonthlyIncome: -1),
      const PrequalInput(grossMonthlyIncome: double.nan),
      const PrequalInput(grossMonthlyIncome: 100000001),
      const PrequalInput(grossMonthlyIncome: 1, annualInterestRate: 101),
      const PrequalInput(grossMonthlyIncome: 1, loanTermYears: 0),
      const PrequalInput(grossMonthlyIncome: 1, loanTermYears: 41),
      const PrequalInput(grossMonthlyIncome: 1, depositAmount: double.infinity),
    ]) {
      await expectLater(
        FinanceRepository(client).preview(input),
        throwsStateError,
      );
    }
    expect(client.calls, isEmpty);
  });

  test(
    'actual tRPC transport unwraps flat preview and nested save separately',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://finance.invalid/trpc'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(
              options.headers['Authorization'],
              'Bearer finance-test-token',
            );
            final payload = options.path.endsWith('previewPrequalification')
                ? calculation()
                : {'success': true, 'id': 43, 'result': calculation()};
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'result': {
                    'data': {'json': payload},
                  },
                },
              ),
            );
          },
        ),
      );
      final repo = FinanceRepository(TrpcClient(_Storage(), dio: dio));
      const input = PrequalInput(grossMonthlyIncome: 50000);
      expect((await repo.preview(input)).maxBondAmount, 1500000);
      expect(
        (await repo.submitPrequalification(input: input, consent: true)).id,
        43,
      );
      dio.close();
    },
  );

  test(
    'save preserves property link and server refusal is not success',
    () async {
      final client = _Client();
      final repo = FinanceRepository(client);
      const input = PrequalInput(grossMonthlyIncome: 50000);
      final result = await repo.submitPrequalification(
        input: input,
        consent: true,
        propertyId: 7,
      );
      expect(result.id, 43);
      expect(client.calls.single.input, {
        ...input.toInput(),
        'consent': true,
        'propertyId': 7,
      });
      client.reply = (_, _) => {'success': false, 'error': 'Consent required'};
      await expectLater(
        repo.submitPrequalification(input: input, consent: false),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'message',
            'Consent required',
          ),
        ),
      );
    },
  );

  test(
    'invalid previews and saved-history envelopes fail visibly, not as zero/empty',
    () async {
      final client = _Client();
      final repo = FinanceRepository(client);
      for (final response in [
        null,
        {},
        {'result': calculation()},
        {'success': false, 'error': 'Unavailable'},
      ]) {
        client.reply = (_, _) => response;
        await expectLater(
          repo.preview(const PrequalInput(grossMonthlyIncome: 1)),
          throwsFormatException,
        );
      }
      await expectLater(repo.myPrequalifications(), throwsFormatException);
      client.reply = (_, _) => {'success': true, 'result': calculation()};
      await expectLater(
        repo.submitPrequalification(
          input: const PrequalInput(grossMonthlyIncome: 1),
          consent: true,
        ),
        throwsFormatException,
      );
    },
  );

  test(
    'application submission passes property/saved IDs and chosen assumptions',
    () async {
      final client = _Client();
      await FinanceRepository(client).submitApplication(
        requestedBondAmount: 900000,
        consentShareData: true,
        prequalificationId: 42,
        propertyId: 7,
        annualInterestRate: 10.5,
        loanTermYears: 25,
      );
      expect(client.calls.single.name, 'submitHomeLoanApplication');
      expect(client.calls.single.input, {
        'requestedBondAmount': 900000.0,
        'consentShareData': true,
        'prequalificationId': 42,
        'propertyId': 7,
        'annualInterestRate': 10.5,
        'loanTermYears': 25,
      });
    },
  );

  testWidgets('saved history prefills inputs; explicit property price wins', (
    tester,
  ) async {
    final client = _Client();
    await mount(tester, client, propertyId: 8, propertyPrice: 2000000);
    final request = client.calls.last.input!;
    expect(request['grossMonthlyIncome'], 50000);
    expect(request['propertyPrice'], 2000000);
    expect(request['annualInterestRate'], 10.5);
    expect(request['loanTermYears'], 25);
    expect(find.text('50000.0'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('late saved history cannot overwrite user edits', (tester) async {
    final history = Completer<dynamic>();
    final client = _Client()
      ..reply = (name, _) =>
          name == 'getMyPrequalifications' ? history.future : calculation();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          financeRepositoryProvider.overrideWithValue(
            FinanceRepository(client),
          ),
        ],
        child: const MaterialApp(home: PrequalificationPage()),
      ),
    );
    await tester.enterText(field('Gross monthly income (before tax)'), '60000');
    history.complete({
      'prequalifications': [saved()],
    });
    await tester.pumpAndSettle();
    expect(find.text('60000'), findsOneWidget);
    expect(find.text('50000.0'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'out-of-order previews and clearing income cannot restore stale results',
    (tester) async {
      final pending = <Completer<dynamic>>[];
      final client = _Client()
        ..reply = (name, _) {
          if (name == 'getMyPrequalifications') {
            return {'prequalifications': []};
          }
          final completer = Completer<dynamic>();
          pending.add(completer);
          return completer.future;
        };
      await mount(tester, client);
      await tester.enterText(
        field('Gross monthly income (before tax)'),
        '50000',
      );
      await tester.pump(const Duration(milliseconds: 501));
      await tester.enterText(
        field('Gross monthly income (before tax)'),
        '60000',
      );
      await tester.pump(const Duration(milliseconds: 501));
      pending[1].complete(calculation(bond: 2000000));
      await tester.pumpAndSettle();
      pending[0].completeError(StateError('Stale failure'));
      await tester.pumpAndSettle();
      expect(find.text('Stale failure'), findsNothing);
      await tester.enterText(
        field('Gross monthly income (before tax)'),
        '70000',
      );
      await tester.pump(const Duration(milliseconds: 501));
      await tester.enterText(field('Gross monthly income (before tax)'), '');
      pending[2].complete(calculation());
      await tester.pumpAndSettle();
      expect(find.text('Indicative result'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('preview failure is shown with retry and apply stays disabled', (
    tester,
  ) async {
    final client = _Client()
      ..reply = (name, _) {
        if (name == 'getMyPrequalifications') return {'prequalifications': []};
        throw StateError('Finance service unavailable');
      };
    await mount(tester, client);
    await tester.enterText(field('Gross monthly income (before tax)'), '50000');
    await tester.pump(const Duration(milliseconds: 501));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Finance service unavailable'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Finance service unavailable'), findsOneWidget);
    expect(find.text('Retry estimate'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Apply to all major banks'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    final apply = tester.widget<OutlinedButton>(
      find.ancestor(
        of: find.text('Apply to all major banks'),
        matching: find.byWidgetPredicate((w) => w is OutlinedButton),
      ),
    );
    expect(apply.onPressed, isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'save forwards explicit property ID and apply forwards saved ID',
    (tester) async {
      final client = _Client();
      Map<String, dynamic>? prefill;
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) => const PrequalificationPage(
              propertyId: 8,
              propertyPrice: 1000000,
            ),
          ),
          GoRoute(
            path: '/profile/home-loan/apply',
            builder: (_, state) {
              prefill = state.extra as Map<String, dynamic>;
              return const Scaffold(body: Text('Application form'));
            },
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            financeRepositoryProvider.overrideWithValue(
              FinanceRepository(client),
            ),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();
      await tapVisible(tester, find.byType(CheckboxListTile));
      await tapVisible(tester, find.text('Save my prequalification'));
      expect(client.calls.last.input?['propertyId'], 8);
      await tapVisible(tester, find.text('Apply to all major banks'));
      expect(prefill?['propertyId'], 8);
      expect(prefill?['prequalificationId'], 43);
      expect(prefill?['bondAmount'], 900000);
      expect(prefill?['annualInterestRate'], 10.5);
      expect(prefill?['loanTermYears'], 25);
      await tester.pumpWidget(const SizedBox());
      router.dispose();
    },
  );
}
