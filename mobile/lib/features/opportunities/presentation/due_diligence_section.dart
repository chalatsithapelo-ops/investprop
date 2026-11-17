import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/opportunities_repository.dart';
import 'development_due_diligence_panel.dart';
import 'property_due_diligence_panel.dart';

class DueDiligenceSection extends ConsumerWidget {
  const DueDiligenceSection({
    super.key,
    required this.propertyId,
    required this.isDevelopment,
  });

  final int propertyId;
  final bool isDevelopment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void retry() {
      if (isDevelopment) {
        ref.invalidate(developmentDueDiligenceProvider(propertyId));
      } else {
        ref.invalidate(propertyDueDiligenceProvider(propertyId));
      }
    }

    Widget loading() => const _PackState(
      message: 'Loading professional team, approvals and supporting documents…',
      loading: true,
    );
    Widget error(Object error, StackTrace stack) => _PackState(
      message:
          'Could not load due diligence. Check your connection and try again.',
      onRetry: retry,
    );
    const empty = _PackState(
      message:
          'No professional appointments, approvals or supporting documents '
          'have been recorded for this property yet.',
    );

    if (isDevelopment) {
      return ref
          .watch(developmentDueDiligenceProvider(propertyId))
          .when(
            data: (dd) =>
                dd == null ? empty : DevelopmentDueDiligencePanel(dd: dd),
            loading: loading,
            error: error,
          );
    }
    return ref
        .watch(propertyDueDiligenceProvider(propertyId))
        .when(
          data: (dd) => dd == null ? empty : PropertyDueDiligencePanel(dd: dd),
          loading: loading,
          error: error,
        );
  }
}

class _PackState extends StatelessWidget {
  const _PackState({required this.message, this.loading = false, this.onRetry});

  final String message;
  final bool loading;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Due Diligence Pack',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          if (loading) const LinearProgressIndicator(),
          const SizedBox(height: 8),
          Text(message),
          if (onRetry != null)
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry due diligence'),
            ),
        ],
      ),
    ),
  );
}
