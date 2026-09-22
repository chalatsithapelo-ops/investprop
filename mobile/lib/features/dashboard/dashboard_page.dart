import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../core/format.dart';
import '../auth/application/auth_controller.dart';
import '../opportunities/data/opportunities_repository.dart';
import '../opportunities/presentation/opportunity_card.dart';
import '../portfolio/data/portfolio_repository.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final portfolio = ref.watch(portfolioProvider);
    final opportunities = ref.watch(opportunitiesProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioProvider);
          ref.invalidate(opportunitiesProvider);
          await Future.wait([
            ref.read(portfolioProvider.future),
            ref.read(opportunitiesProvider.future),
          ]);
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              backgroundColor: AppColors.navy,
              title: Text('Hi, ${_firstName(user?.name)}'),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    portfolio.when(
                      data: (summary) => _ValueCard(
                        value: Fmt.money(summary.totalValue),
                        invested: summary.totalInvested,
                        distributed: summary.totalDistributed,
                      ),
                      loading: () => const _ValueCardSkeleton(),
                      error: (_, __) => const _ValueCard(
                        value: 'R0',
                        invested: 0,
                        distributed: 0,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Featured opportunities',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        TextButton(
                          onPressed: () => context.go('/opportunities'),
                          child: const Text('See all'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    opportunities.when(
                      data: (items) {
                        if (items.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Text(
                              'No open opportunities right now.',
                              style: TextStyle(color: AppColors.textSecondary),
                            ),
                          );
                        }
                        final featured = items.take(3).toList();
                        return Column(
                          children: [
                            for (final opp in featured)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: OpportunityCard(
                                  opportunity: opp,
                                  onTap: () =>
                                      context.push('/opportunities/${opp.id}'),
                                ),
                              ),
                          ],
                        );
                      },
                      loading: () => const Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                      error: (e, __) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: Text(
                          '$e',
                          style: const TextStyle(color: AppColors.textSecondary),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _firstName(String? name) {
    if (name == null || name.trim().isEmpty) return 'there';
    return name.trim().split(RegExp(r'\s+')).first;
  }
}

class _ValueCard extends StatelessWidget {
  const _ValueCard({
    required this.value,
    required this.invested,
    required this.distributed,
  });

  final String value;
  final double invested;
  final double distributed;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.navy, AppColors.navyLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Portfolio value',
            style: TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Divider(color: Colors.white24, height: 28),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  label: 'Invested',
                  value: Fmt.compactMoney(invested),
                ),
              ),
              Expanded(
                child: _MiniStat(
                  label: 'Distributed',
                  value: Fmt.compactMoney(distributed),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: Colors.white60, fontSize: 12)),
      ],
    );
  }
}

class _ValueCardSkeleton extends StatelessWidget {
  const _ValueCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 150,
      decoration: BoxDecoration(
        color: AppColors.navyLight,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Center(
        child: CircularProgressIndicator(color: Colors.white),
      ),
    );
  }
}
