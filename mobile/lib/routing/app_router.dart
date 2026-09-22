import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/forgot_password_page.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/auth/presentation/register_page.dart';
import '../features/auth/presentation/reset_password_page.dart';
import '../features/ai/presentation/platform_track_record_page.dart';
import '../features/ai/presentation/property_chat_page.dart';
import '../features/certificates/presentation/certificates_page.dart';
import '../features/contributions/presentation/contributions_page.dart';
import '../features/dashboard/dashboard_page.dart';
import '../features/documents/presentation/documents_page.dart';
import '../features/governance/presentation/distributions_voting_page.dart';
import '../features/investment/presentation/invest_page.dart';
import '../features/ledger/presentation/share_ledger_page.dart';
import '../features/marketplace/domain/marketplace_models.dart';
import '../features/marketplace/presentation/market_detail_page.dart';
import '../features/marketplace/presentation/marketplace_page.dart';
import '../features/investment/presentation/payments_page.dart';
import '../features/kyc/presentation/kyc_page.dart';
import '../features/metrics/presentation/metrics_page.dart';
import '../features/notifications/presentation/notifications_page.dart';
import '../features/opportunities/presentation/opportunities_page.dart';
import '../features/opportunities/presentation/opportunity_detail_page.dart';
import '../features/opportunities/presentation/financing_calculator_page.dart';
import '../features/opportunities/domain/opportunity.dart';
import '../features/owner/presentation/owner_portal_page.dart';
import '../features/owner/presentation/owner_proposals_page.dart';
import '../features/portfolio/presentation/holding_detail_page.dart';
import '../features/portfolio/presentation/portfolio_page.dart';
import '../features/profile/presentation/edit_profile_page.dart';
import '../features/profile/presentation/profile_page.dart';
import '../features/shell/home_shell.dart';
import '../features/shell/splash_page.dart';
import '../features/statement/presentation/statement_page.dart';
import '../features/tax/presentation/tax_certificates_page.dart';

final _rootKey = GlobalKey<NavigatorState>();

/// Bridges the Riverpod auth state to go_router so navigation reacts to
/// sign-in / sign-out.
class _AuthRouterNotifier extends ChangeNotifier {
  _AuthRouterNotifier(this._ref) {
    _ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }

  final Ref _ref;

  String? redirect(BuildContext context, GoRouterState state) {
    final auth = _ref.read(authControllerProvider);
    final location = state.matchedLocation;
    final onAuthScreens = location == '/login' ||
        location == '/register' ||
        location == '/forgot-password' ||
        location == '/reset-password';

    if (!auth.isResolved) {
      return location == '/splash' ? null : '/splash';
    }

    if (!auth.isAuthenticated) {
      return onAuthScreens ? null : '/login';
    }

    // Authenticated: keep users out of the splash / auth screens.
    if (onAuthScreens || location == '/splash') return '/';
    return null;
  }
}

/// Second tab: investors see investment opportunities, property owners see the
/// "submit your property" portal.
class _InvestOrSellBranch extends ConsumerWidget {
  const _InvestOrSellBranch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    if (user?.isPropertyOwner == true) return const OwnerPortalPage();
    return const OpportunitiesPage();
  }
}

/// Third tab: investors see their portfolio, property owners see their
/// submitted deals.
class _PortfolioOrDealsBranch extends ConsumerWidget {
  const _PortfolioOrDealsBranch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    if (user?.isPropertyOwner == true) return const OwnerProposalsPage();
    return const PortfolioPage();
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = _AuthRouterNotifier(ref);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/splash',
    refreshListenable: notifier,
    redirect: notifier.redirect,
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashPage()),
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterPage()),
      GoRoute(
        path: '/forgot-password',
        builder: (_, __) => const ForgotPasswordPage(),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (_, state) =>
            ResetPasswordPage(token: state.uri.queryParameters['token']),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/', builder: (_, __) => const DashboardPage()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/opportunities',
                builder: (_, __) => const _InvestOrSellBranch(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => OpportunityDetailPage(
                      id: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
                    ),
                    routes: [
                      GoRoute(
                        path: 'invest',
                        parentNavigatorKey: _rootKey,
                        builder: (context, state) => InvestPage(
                          propertyId:
                              int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
                        ),
                      ),
                      GoRoute(
                        path: 'chat',
                        parentNavigatorKey: _rootKey,
                        builder: (context, state) => PropertyChatPage(
                          propertyId:
                              int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
                          propertyTitle:
                              state.extra is String ? state.extra as String : 'Deal',
                        ),
                      ),
                      GoRoute(
                        path: 'calculator',
                        parentNavigatorKey: _rootKey,
                        builder: (context, state) => FinancingCalculatorPage(
                          opportunity: state.extra is Opportunity
                              ? state.extra as Opportunity
                              : null,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/portfolio',
                builder: (_, __) => const _PortfolioOrDealsBranch(),
                routes: [
                  GoRoute(
                    path: 'payments',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const PaymentsPage(),
                  ),
                  GoRoute(
                    path: 'holding/:id',
                    parentNavigatorKey: _rootKey,
                    builder: (context, state) => HoldingDetailPage(
                      holdingId:
                          int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
                    ),
                  ),
                  GoRoute(
                    path: 'distributions',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const DistributionsVotingPage(),
                  ),
                  GoRoute(
                    path: 'contributions',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const ContributionsPage(),
                  ),
                  GoRoute(
                    path: 'metrics',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const MetricsPage(),
                  ),
                  GoRoute(
                    path: 'ledger',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const ShareLedgerPage(),
                  ),
                  GoRoute(
                    path: 'marketplace',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const MarketplacePage(),
                    routes: [
                      GoRoute(
                        path: ':id',
                        parentNavigatorKey: _rootKey,
                        builder: (context, state) => MarketDetailPage(
                          shareClassId: int.tryParse(
                                  state.pathParameters['id'] ?? '') ??
                              0,
                          shareClass: state.extra is MarketShareClass
                              ? state.extra as MarketShareClass
                              : null,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/notifications',
                builder: (_, __) => const NotificationsPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (_, __) => const ProfilePage(),
                routes: [
                  GoRoute(
                    path: 'edit',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const EditProfilePage(),
                  ),
                  GoRoute(
                    path: 'statement',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const StatementPage(),
                  ),
                  GoRoute(
                    path: 'kyc',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const KycPage(),
                  ),
                  GoRoute(
                    path: 'certificates',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const CertificatesPage(),
                  ),
                  GoRoute(
                    path: 'tax-certificates',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const TaxCertificatesPage(),
                  ),
                  GoRoute(
                    path: 'track-record',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const PlatformTrackRecordPage(),
                  ),
                  GoRoute(
                    path: 'documents',
                    parentNavigatorKey: _rootKey,
                    builder: (_, __) => const DocumentsPage(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
