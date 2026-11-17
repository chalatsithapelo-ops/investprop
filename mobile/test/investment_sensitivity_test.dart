import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:investprop_mobile/core/api/api_exception.dart';
import 'package:investprop_mobile/core/api/trpc_client.dart';
import 'package:investprop_mobile/core/storage/token_storage.dart';
import 'package:investprop_mobile/features/investment/data/investment_repository.dart';
import 'package:investprop_mobile/features/investment/domain/investment_projection.dart';
import 'package:investprop_mobile/features/investment/presentation/investment_projection_card.dart';
import 'package:investprop_mobile/features/investment/presentation/scenario_sensitivity_page.dart';

Map<String, dynamic> response({double proceeds = 120000}) => {
  'share': {'numberOfShares': 100, 'sharePrice': 1000},
  'defaultStrategy': 'FLIP',
  'availableStrategies': ['FLIP', 'EARLY_RESALE'],
  'projectHoldMonths': 12,
  'projection': {
    'scenarios': {
      for (final band in ['downside', 'base', 'upside'])
        band: {
          'netProceeds': proceeds,
          'netProfit': proceeds - 100000,
          'moic': proceeds / 100000,
          'annualisedReturn': 20,
        },
    },
    'summary': 'These are your estimated scenario results.',
    'disclaimer': 'Not guarantees or financial advice.',
  },
};

class _Client extends TrpcClient {
  _Client() : super(TokenStorage());

  final calls = <Map<String, dynamic>>[];
  FutureOr<dynamic> Function()? reply;

  @override
  Future<dynamic> query(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) async {
    expect(procedure, 'calculateInvestmentProjection');
    calls.add(input!);
    return reply != null ? reply!() : response();
  }
}

Future<void> mount(WidgetTester tester, TrpcClient client) async {
  tester.view.physicalSize = const Size(390, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        investmentRepositoryProvider.overrideWithValue(
          InvestmentRepository(client),
        ),
      ],
      child: const MaterialApp(home: ScenarioSensitivityPage(propertyId: 9)),
    ),
  );
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('standalone calculator shows controls and results on a phone', (
    tester,
  ) async {
    final client = _Client();
    await mount(tester, client);
    expect(find.text('Scenario sensitivity'), findsOneWidget);
    expect(find.text('Stress the deal yourself'), findsOneWidget);
    expect(find.text('Net payout'), findsOneWidget);
    expect(find.text('Equity multiple'), findsOneWidget);
    expect(find.text('Use a bank loan to co-invest (gearing)'), findsOneWidget);
    expect(client.calls.single['propertyId'], 9);
    expect(client.calls.single['stressDownPct'], 10);
    expect(tester.takeException(), isNull);

    final slider = tester.widget<Slider>(find.byType(Slider).at(1));
    slider.onChanged!(25);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(client.calls.last['stressDownPct'], 25);
    expect(find.text('-25%'), findsOneWidget);
  });

  testWidgets('failed request is visible and retry restores results', (
    tester,
  ) async {
    final client = _Client();
    client.reply = () => throw ApiException('Server unavailable');
    await mount(tester, client);
    expect(find.text('Server unavailable'), findsOneWidget);
    client.reply = () => response();
    await tester.ensureVisible(find.text('Retry projection'));
    await tester.tap(find.text('Retry projection'));
    await tester.pumpAndSettle();
    expect(find.text('Net payout'), findsOneWidget);
    expect(find.text('Server unavailable'), findsNothing);
  });

  testWidgets('empty server response is not silently hidden', (tester) async {
    final client = _Client()..reply = () => null;
    await mount(tester, client);
    expect(
      find.textContaining('Could not load your investment projection'),
      findsOneWidget,
    );
    expect(find.text('Retry projection'), findsOneWidget);
  });

  testWidgets('stale requests cannot overwrite newer assumptions', (
    tester,
  ) async {
    final client = _Client();
    final old = Completer<dynamic>();
    client.reply = () => old.future;
    var config = const StrategyConfig();
    late StateSetter update;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          investmentRepositoryProvider.overrideWithValue(
            InvestmentRepository(client),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: StatefulBuilder(
                builder: (context, setState) {
                  update = setState;
                  return ProjectionCard(
                    propertyId: 9,
                    amount: 100000,
                    config: config,
                    onConfigChange: (_) {},
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
    update(() => config = config.copyWith(stressDownPct: 30));
    await tester.pump();
    client.reply = () => response(proceeds: 150000);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    old.complete(response(proceeds: 1));
    await tester.pumpAndSettle();
    expect(find.textContaining('R150'), findsWidgets);
    expect(client.calls.last['stressDownPct'], 30);
  });
}
