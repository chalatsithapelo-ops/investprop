import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/async_value_widget.dart';
import '../data/opportunities_repository.dart';
import 'opportunity_card.dart';

class OpportunitiesPage extends ConsumerWidget {
  const OpportunitiesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opportunities = ref.watch(opportunitiesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Opportunities')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(opportunitiesProvider.future),
        child: AsyncValueView(
          value: opportunities,
          onRetry: () => ref.invalidate(opportunitiesProvider),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.search_off,
                    title: 'No open opportunities',
                    subtitle:
                        'New deals raising funds will appear here. Pull down to refresh.',
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                final opp = items[index];
                return OpportunityCard(
                  opportunity: opp,
                  onTap: () => context.push('/opportunities/${opp.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
