import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/opportunities_repository.dart';
import '../domain/opportunity.dart';
import 'opportunity_card.dart';

class OpportunitiesPage extends ConsumerStatefulWidget {
  const OpportunitiesPage({super.key});

  @override
  ConsumerState<OpportunitiesPage> createState() => _OpportunitiesPageState();
}

class _OpportunitiesPageState extends ConsumerState<OpportunitiesPage> {
  DealStrategy? _filter;

  @override
  Widget build(BuildContext context) {
    final opportunities = ref.watch(opportunitiesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Opportunities')),
      body: Column(
        children: [
          _FilterBar(
            selected: _filter,
            onChanged: (f) => setState(() => _filter = f),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(opportunitiesProvider.future),
              child: AsyncValueView(
                value: opportunities,
                onRetry: () => ref.invalidate(opportunitiesProvider),
                data: (items) {
                  final filtered = _filter == null
                      ? items
                      : items
                          .where((o) => o.strategy == _filter)
                          .toList();
                  if (filtered.isEmpty) {
                    return ListView(
                      children: [
                        const SizedBox(height: 120),
                        EmptyState(
                          icon: Icons.search_off,
                          title: _filter == null
                              ? 'No open opportunities'
                              : 'No ${_labelFor(_filter!).toLowerCase()} available',
                          subtitle:
                              'New deals raising funds will appear here. '
                              'Pull down to refresh.',
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 16),
                    itemBuilder: (context, index) {
                      final opp = filtered[index];
                      return OpportunityCard(
                        opportunity: opp,
                        onTap: () => context.push('/opportunities/${opp.id}'),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _labelFor(DealStrategy s) => switch (s) {
        DealStrategy.rental => 'Rentals',
        DealStrategy.flip => 'Flips',
        DealStrategy.development => 'Developments',
        DealStrategy.unknown => 'Other',
      };
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.selected, required this.onChanged});

  final DealStrategy? selected;
  final ValueChanged<DealStrategy?> onChanged;

  @override
  Widget build(BuildContext context) {
    final options = <(DealStrategy?, String)>[
      (null, 'All'),
      (DealStrategy.rental, 'Rentals'),
      (DealStrategy.flip, 'Flips'),
      (DealStrategy.development, 'Developments'),
    ];
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (value, label) = options[i];
          final active = value == selected;
          return ChoiceChip(
            label: Text(label),
            selected: active,
            onSelected: (_) => onChanged(value),
            selectedColor: AppColors.navy,
            labelStyle: TextStyle(
              color: active ? Colors.white : AppColors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
            backgroundColor: AppColors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: AppColors.border),
            ),
          );
        },
      ),
    );
  }
}
