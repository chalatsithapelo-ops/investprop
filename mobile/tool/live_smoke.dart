// Standalone live smoke test for the mobile data layer.
//
// Replicates the exact wire protocol used by lib/core/api/trpc_client.dart
// (superjson envelope, Bearer header + `authToken` injected into the body)
// and exercises the real investor-facing tRPC endpoints against the live
// backend. Proves the mobile app's networking + endpoint contract works
// end-to-end against production.
//
// Run:  dart run tool/live_smoke.dart [email] [password]
//
// Not part of the app build; a diagnostic harness only.
import 'dart:convert';
import 'package:dio/dio.dart';

const String baseUrl = 'https://investprop.io/trpc';

late final Dio dio;
String? accessToken;

Future<dynamic> query(String proc, [Map<String, dynamic>? input]) async {
  final body = <String, dynamic>{...?input};
  final headers = <String, dynamic>{};
  if (accessToken != null) {
    headers['Authorization'] = 'Bearer $accessToken';
    body['authToken'] = accessToken;
  }
  final res = await dio.get(
    '/$proc',
    queryParameters: {
      'input': jsonEncode({'json': body}),
    },
    options: Options(headers: headers),
  );
  return _unwrap(proc, res);
}

Future<dynamic> mutation(String proc, [Map<String, dynamic>? input]) async {
  final body = <String, dynamic>{...?input};
  final headers = <String, dynamic>{};
  if (accessToken != null) {
    headers['Authorization'] = 'Bearer $accessToken';
    body['authToken'] = accessToken;
  }
  final res = await dio.post(
    '/$proc',
    data: {'json': body},
    options: Options(headers: headers),
  );
  return _unwrap(proc, res);
}

dynamic _unwrap(String proc, Response res) {
  final status = res.statusCode ?? 0;
  if (status >= 400) {
    final data = res.data;
    String msg = 'HTTP $status';
    if (data is Map && data['error'] is Map) {
      final env = (data['error'] as Map)['json'] ?? data['error'];
      if (env is Map) msg = (env['message'] ?? msg).toString();
    }
    throw 'HTTP $status: $msg';
  }
  final data = res.data;
  if (data is Map && data['result'] is Map) {
    final result = data['result'] as Map;
    if (result['data'] is Map) return (result['data'] as Map)['json'];
  }
  return null;
}

int passed = 0;
int failed = 0;

Future<void> check(String label, Future<dynamic> Function() fn,
    [String Function(dynamic)? summarise]) async {
  try {
    final v = await fn();
    final extra = summarise != null ? ' — ${summarise(v)}' : '';
    print('  PASS  $label$extra');
    passed++;
  } catch (e) {
    print('  FAIL  $label — $e');
    failed++;
  }
}

String count(dynamic v) {
  if (v is List) return '${v.length} item(s)';
  if (v is Map) return '${v.keys.length} field(s)';
  return v == null ? 'null' : v.toString();
}

Future<void> main(List<String> args) async {
  final email = args.isNotEmpty ? args[0] : 'investor@demo.com';
  final password = args.length > 1 ? args[1] : 'password123';

  dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
    validateStatus: (s) => s != null && s < 500,
  ));

  print('InvestProp mobile live smoke — $email @ $baseUrl\n');

  print('Auth');
  try {
    final login = await mutation('login', {'email': email, 'password': password});
    accessToken = (login as Map)['accessToken'] as String?;
    if (accessToken == null) throw 'no accessToken in response';
    final user = login['user'];
    print('  PASS  login — ${user is Map ? user['name'] : 'ok'} '
        '(${user is Map ? user['role'] : '?'})');
    passed++;
  } catch (e) {
    print('  FAIL  login — $e');
    print('\nCannot continue without a session. Aborting.');
    return;
  }

  print('\nIdentity & profile');
  await check('getMe', () => query('getMe'),
      (v) => v is Map ? '${v['email']}' : count(v));
  await check('getAiDigestPrefs', () => query('getAiDigestPrefs'));

  print('\nOpportunities & properties');
  dynamic firstPropId;
  await check('getInvestmentOpportunities',
      () => query('getInvestmentOpportunities'), (v) {
    if (v is List && v.isNotEmpty && v.first is Map) {
      firstPropId = (v.first as Map)['id'];
    }
    return count(v);
  });
  await check('getPropertyById(first)',
      () => query('getPropertyById', {'id': firstPropId ?? 1}),
      (v) => v is Map ? '${v['title']}' : count(v));

  print('\nPortfolio & holdings');
  await check('getInvestorPortfolio', () => query('getInvestorPortfolio'), count);
  await check('getMyContributions', () => query('getMyContributions'), count);
  await check('getMyPropertyInvestments', () => query('getMyPropertyInvestments'), count);
  await check('getMyDistributions', () => query('getMyDistributions'), count);
  await check('getShareLedger', () => query('getShareLedger'), count);
  await check('getMyCertificates', () => query('getMyCertificates'), count);

  print('\nMarketplace & wallet');
  dynamic shareClassId;
  await check('getMarketplaceOverview',
      () => query('getMarketplaceOverview', {}), (v) {
    if (v is Map && v['shareClasses'] is List && (v['shareClasses'] as List).isNotEmpty) {
      shareClassId = ((v['shareClasses'] as List).first as Map)['id'];
    }
    return count(v);
  });
  await check('getOrderBook',
      () => query('getOrderBook', {'shareClassId': shareClassId ?? 1}), count);
  await check('getMyOrders', () => query('getMyOrders'), count);
  await check('getMyWallet', () => query('getMyWallet', {}),
      (v) => v is Map ? 'balance=${v['balance'] ?? v['availableBalance']}' : count(v));
  await check('getMyWithdrawals', () => query('getMyWithdrawals', {}), count);
  await check('getShareProvenance', () => query('getShareProvenance', {}), count);
  await check('auditShareConservation', () => query('auditShareConservation', {}), count);

  print('\nCompliance & finance');
  await check('getMyFicaStatus', () => query('getMyFicaStatus'), count);
  await check('getKYCProfile', () => query('getKYCProfile'), count);
  await check('getAppropriatenessStatus', () => query('getAppropriatenessStatus'), count);
  await check('getMyDocuments', () => query('getMyDocuments'), count);
  await check('getMyPrequalifications', () => query('getMyPrequalifications'), count);
  await check('getMyHomeLoanApplications', () => query('getMyHomeLoanApplications'), count);
  await check('getMyAwaitingPayment', () => query('getMyAwaitingPayment'), count);

  print('\nSubscription, statement, governance, AI');
  await check('getSubscriptionPlans', () => query('getSubscriptionPlans'), count);
  await check('getMySubscription', () => query('getMySubscription'), count);
  await check('getInvestorStatement', () => query('getInvestorStatement'), count);
  await check('getProposals', () => query('getProposals'), count);
  await check('getNotifications', () => query('getNotifications'), count);
  await check('getPortfolioInsight', () => query('getPortfolioInsight'), count);
  await check('getPlatformTrackRecord', () => query('getPlatformTrackRecord'), count);

  print('\nOwner & land (read-only)');
  await check('getMySaleProposals', () => query('getMySaleProposals'), count);
  await check('getOwnerFeeSchedule', () => query('getOwnerFeeSchedule', {}), count);
  await check('getMyLandPartnerships', () => query('getMyLandPartnerships'), count);

  print('\n----------------------------------------');
  print('RESULT: $passed passed, $failed failed');
}
