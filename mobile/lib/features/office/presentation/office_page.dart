import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../auth/application/auth_controller.dart';
import '../data/office_repository.dart';
import 'office_chat_tab.dart';
import 'office_tasks_tab.dart';

class OfficePage extends ConsumerWidget {
  const OfficePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userId = ref.watch(
      authControllerProvider.select((state) => state.user?.id),
    );
    return DefaultTabController(
      key: ValueKey(userId),
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('AI Property Office'),
          bottom: const TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: AppColors.gold,
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Chat'),
              Tab(text: 'Tasks'),
            ],
          ),
        ),
        body: const SafeArea(
          child: TabBarView(
            children: [_OverviewTab(), OfficeChatTab(), OfficeTasksTab()],
          ),
        ),
      ),
    );
  }
}

class OfficeSection extends StatelessWidget {
  const OfficeSection({super.key, required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 16),
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    ),
  );
}

class OfficeNotice extends StatelessWidget {
  const OfficeNotice(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(text, style: const TextStyle(height: 1.5)),
    ),
  );
}

class OfficeError extends StatelessWidget {
  const OfficeError({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => OfficeSection(
    title: 'Office data unavailable',
    children: [
      OfficeNotice(
        'No data has been substituted. ${error.toString().replaceFirst('ApiException: ', '')}',
      ),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Retry'),
        ),
      ),
    ],
  );
}

class OfficeContent extends StatelessWidget {
  const OfficeContent({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.all(16),
    children: [
      Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 840),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          ),
        ),
      ),
    ],
  );
}

class _OverviewTab extends ConsumerWidget {
  const _OverviewTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(officeOverviewProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(officeOverviewProvider);
        try {
          await ref.read(officeOverviewProvider.future);
        } catch (_) {
          // The provider renders the error and retry state below.
        }
      },
      child: OfficeContent(
        children: [
          const OfficeSection(
            title: 'Your evidence-led property workspace',
            children: [
              OfficeNotice(
                'Four AI research modes, one office. Review holdings, paid income '
                'and source gaps; prepare limited administrative tasks for approval. '
                'No payments, trades, tax filings, signatures or legal execution. '
                'AI output is not professional financial, tax or legal advice.',
              ),
            ],
          ),
          ...overview.when(
            loading: () => [const Center(child: CircularProgressIndicator())],
            error: (error, _) => [
              OfficeError(
                error: error,
                onRetry: () => ref.invalidate(officeOverviewProvider),
              ),
            ],
            data: (data) => [
              OfficeSection(
                title: 'Capabilities',
                children: [
                  Text('Text AI: ${data.textAI ? 'available' : 'unavailable'}'),
                  const OfficeNotice(
                    'Voice unavailable in this mobile app: no audio recording '
                    'library is installed. Use text chat instead.',
                  ),
                  Text(
                    'Server voice: ${data.voice ? 'available' : 'unavailable'}',
                  ),
                  const Text('Regulated actions: disabled'),
                ],
              ),
              OfficeSection(
                title: 'Holdings • recorded basis, not a valuation',
                children: [
                  if (data.holdings.isEmpty)
                    const Text('No holdings returned.'),
                  for (final holding in data.holdings)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            holding.title,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          Text(
                            'Property ${holding.propertyId} • ${holding.shares} shares',
                          ),
                          Text(
                            '${holding.basisLabel}: ${Fmt.money(holding.basisValue, detailed: true)}',
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              OfficeSection(
                title: 'Paid distributions',
                children: [
                  Wrap(
                    spacing: 24,
                    runSpacing: 16,
                    children: [
                      Text(
                        'Gross\n${Fmt.money(data.paidDistributions.gross, detailed: true)}',
                      ),
                      Text(
                        'Net\n${Fmt.money(data.paidDistributions.net, detailed: true)}',
                      ),
                      Text(
                        'Withheld\n${Fmt.money(data.paidDistributions.withheld, detailed: true)}',
                      ),
                      Text('Payments\n${data.paidDistributions.count}'),
                    ],
                  ),
                  const OfficeNotice(
                    'Recorded paid income only; not projected returns or a certified tax statement.',
                  ),
                ],
              ),
              OfficeSection(
                title: 'Documents',
                children: [
                  if (data.documents.isEmpty)
                    const Text('No documents returned.'),
                  for (final doc in data.documents)
                    OfficeNotice(
                      '${doc.title}\n${doc.documentType} • ID ${doc.id}${doc.propertyId == null ? '' : ' • Property ${doc.propertyId}'}',
                    ),
                  const Text(
                    'Document index only; this response does not include download links.',
                  ),
                ],
              ),
              OfficeSection(
                title: 'Owner proposals',
                children: [
                  if (data.proposals.isEmpty)
                    const Text('No proposals returned.'),
                  for (final proposal in data.proposals)
                    OfficeNotice(
                      '${proposal.title}\n${proposal.status} • ID ${proposal.id}',
                    ),
                ],
              ),
              OfficeSection(
                title: 'Evidence & freshness',
                children: [
                  if (data.evidence.isEmpty)
                    const Text('No source evidence returned.'),
                  for (final evidence in data.evidence)
                    OfficeNotice(
                      '${evidence.label}\n${evidence.kind} • ID ${evidence.id}\nAs of: ${evidence.asOf == null ? 'Not supplied or invalid' : Fmt.dateTime(evidence.asOf!.toLocal())}',
                    ),
                ],
              ),
              OfficeSection(
                title: 'Data gaps',
                children: [
                  if (data.gaps.isEmpty)
                    const Text(
                      'No gaps reported by the server; this is not a completeness guarantee.',
                    ),
                  for (final gap in data.gaps) OfficeNotice('• $gap'),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
