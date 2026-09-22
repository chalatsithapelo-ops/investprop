// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:investprop_mobile/features/auth/domain/app_user.dart';
import 'package:investprop_mobile/features/opportunities/domain/opportunity.dart';

void main() {
  test('AppUser parses role and derives initials', () {
    final user = AppUser.fromJson({
      'id': 1,
      'email': 'jane@example.com',
      'name': 'Jane Doe',
      'role': 'INVESTOR',
      'investorCode': 'IP-INV-00001',
    });
    expect(user.isInvestor, isTrue);
    expect(user.initials, 'JD');
    expect(user.roleLabel, 'Investor');
  });

  test('Opportunity derives rental strategy and funding progress', () {
    final opp = Opportunity.fromJson({
      'id': 42,
      'title': 'Cape Town Apartment',
      'price': 1000000,
      'fundingGoal': 500000,
      'fundingRaised': 250000,
      'riskRating': 'LOW',
      'rentalBond': {'capRate': 7.5},
    });
    expect(opp.strategy, DealStrategy.rental);
    expect(opp.expectedReturns, 7.5);
    expect(opp.fundingProgress, 0.5);
  });

  testWidgets('MaterialApp smoke test renders', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: Text('InvestProp'))),
    );
    expect(find.text('InvestProp'), findsOneWidget);
  });
}
