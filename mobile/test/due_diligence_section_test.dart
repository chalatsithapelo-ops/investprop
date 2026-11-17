import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:investprop_mobile/features/opportunities/data/opportunities_repository.dart';
import 'package:investprop_mobile/features/opportunities/domain/property_due_diligence.dart';
import 'package:investprop_mobile/features/opportunities/presentation/due_diligence_section.dart';

void main() {
  testWidgets('shows loading and empty DD instead of hiding the pack', (
    tester,
  ) async {
    final result = Completer<PropertyDueDiligence?>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          propertyDueDiligenceProvider(9).overrideWith((ref) => result.future),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: DueDiligenceSection(propertyId: 9, isDevelopment: false),
          ),
        ),
      ),
    );
    expect(find.text('Due Diligence Pack'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    result.complete(null);
    await tester.pumpAndSettle();
    expect(find.textContaining('No professional appointments'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('failed request is visible and retry reloads DD', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          propertyDueDiligenceProvider(10).overrideWith((ref) async {
            calls++;
            if (calls == 1) throw StateError('offline');
            return null;
          }),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: DueDiligenceSection(propertyId: 10, isDevelopment: false),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not load due diligence'), findsOneWidget);
    await tester.tap(find.text('Retry due diligence'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.textContaining('No professional appointments'), findsOneWidget);
  });

  testWidgets('development request failures are visible too', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          developmentDueDiligenceProvider(
            11,
          ).overrideWith((ref) async => throw StateError('offline')),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: DueDiligenceSection(propertyId: 11, isDevelopment: true),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Due Diligence Pack'), findsOneWidget);
    expect(find.text('Retry due diligence'), findsOneWidget);
  });
}
