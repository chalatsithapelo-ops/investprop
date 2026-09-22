import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../portfolio/data/portfolio_repository.dart';
import '../../portfolio/domain/holding.dart';
import '../data/governance_repository.dart';
import '../domain/proposal.dart';

class DistributionsVotingPage extends ConsumerWidget {
  const DistributionsVotingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Distributions & Voting'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Distributions'),
              Tab(text: 'Voting'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _DistributionsTab(),
            _VotingTab(),
          ],
        ),
      ),
    );
  }
}

class _DistributionsTab extends ConsumerWidget {
  const _DistributionsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dist = ref.watch(distributionsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(distributionsProvider.future),
      child: AsyncValueView<DistributionsSummary>(
        value: dist,
        onRetry: () => ref.invalidate(distributionsProvider),
        data: (summary) {
          if (summary.payouts.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 120),
                EmptyState(
                  icon: Icons.payments_outlined,
                  title: 'No distributions yet',
                  subtitle:
                      'Income and sale-proceeds payouts will appear here once '
                      'your properties start distributing.',
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(
                    child: _SummaryTile(
                      label: 'Received',
                      value: Fmt.money(summary.totalReceived),
                      color: AppColors.success,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _SummaryTile(
                      label: 'Pending',
                      value: Fmt.money(summary.totalPending),
                      color: AppColors.warning,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ...summary.payouts.map((p) => _PayoutCard(payout: p)),
            ],
          );
        },
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  fontSize: 20, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}

class _PayoutCard extends StatelessWidget {
  const _PayoutCard({required this.payout});

  final DistributionPayout payout;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(payout.propertyTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text('${payout.typeLabel} · ${Fmt.date(payout.date)}',
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 12)),
                  if (payout.taxWithheld > 0) ...[
                    const SizedBox(height: 2),
                    Text('Tax withheld ${Fmt.money(payout.taxWithheld)}',
                        style: const TextStyle(
                            color: AppColors.textSecondary, fontSize: 12)),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(Fmt.money(payout.netAmount),
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: AppColors.navy)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: (payout.isPaid
                            ? AppColors.success
                            : AppColors.warning)
                        .withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    payout.isPaid ? 'Paid' : 'Pending',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: payout.isPaid
                          ? AppColors.success
                          : AppColors.warning,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _VotingTab extends ConsumerWidget {
  const _VotingTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final proposals = ref.watch(proposalsProvider);
    // Restrict to properties the investor actually holds shares in.
    final portfolio = ref.watch(portfolioProvider).value;
    final myPropertyIds =
        portfolio?.holdings.map((h) => h.propertyId).toSet() ?? const {};

    return RefreshIndicator(
      onRefresh: () => ref.refresh(proposalsProvider.future),
      child: AsyncValueView<List<Proposal>>(
        value: proposals,
        onRetry: () => ref.invalidate(proposalsProvider),
        data: (all) {
          final relevant = myPropertyIds.isEmpty
              ? all
              : all.where((p) => myPropertyIds.contains(p.propertyId)).toList();
          if (relevant.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 120),
                EmptyState(
                  icon: Icons.how_to_vote_outlined,
                  title: 'No proposals to vote on',
                  subtitle:
                      'Shareholder proposals for your properties will appear '
                      'here when raised.',
                ),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: relevant.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _ProposalCard(proposal: relevant[i]),
          );
        },
      ),
    );
  }
}

class _ProposalCard extends ConsumerStatefulWidget {
  const _ProposalCard({required this.proposal});

  final Proposal proposal;

  @override
  ConsumerState<_ProposalCard> createState() => _ProposalCardState();
}

class _ProposalCardState extends ConsumerState<_ProposalCard> {
  bool _busy = false;

  Future<void> _vote(String choice) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(governanceRepositoryProvider)
          .castVote(proposalId: widget.proposal.id, choice: choice);
      ref.invalidate(proposalsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Vote recorded: $choice')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'.replaceFirst('ApiException: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.proposal;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(p.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                ),
                _StatusChip(proposal: p),
              ],
            ),
            const SizedBox(height: 4),
            Text('${p.propertyTitle} · ${p.typeLabel}',
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 12)),
            const SizedBox(height: 10),
            Text(p.description, style: const TextStyle(fontSize: 14)),
            const SizedBox(height: 12),
            _TallyBar(tally: p.tally),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  '${p.tally.yesCount} for · ${p.tally.noCount} against · '
                  '${p.tally.abstainCount} abstain',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary),
                ),
                const Spacer(),
                if (p.deadline != null)
                  Text('Closes ${Fmt.date(p.deadline)}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
            if (p.canVote) ...[
              const SizedBox(height: 14),
              if (p.myVote != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('You voted: ${p.myVote}',
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.navy)),
                ),
              Row(
                children: [
                  Expanded(
                    child: _VoteButton(
                      label: 'For',
                      color: AppColors.success,
                      selected: p.myVote == 'YES',
                      onPressed:
                          _busy ? null : () => _vote('YES'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _VoteButton(
                      label: 'Against',
                      color: AppColors.danger,
                      selected: p.myVote == 'NO',
                      onPressed:
                          _busy ? null : () => _vote('NO'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _VoteButton(
                      label: 'Abstain',
                      color: AppColors.textSecondary,
                      selected: p.myVote == 'ABSTAIN',
                      onPressed:
                          _busy ? null : () => _vote('ABSTAIN'),
                    ),
                  ),
                ],
              ),
            ] else if (p.myVote != null) ...[
              const SizedBox(height: 10),
              Text('You voted: ${p.myVote}',
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.navy)),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.proposal});

  final Proposal proposal;

  @override
  Widget build(BuildContext context) {
    final open = proposal.isOpen && !proposal.isExpired;
    final passed = proposal.result == 'PASSED';
    final color = open
        ? AppColors.gold
        : passed
            ? AppColors.success
            : AppColors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(proposal.statusLabel,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _TallyBar extends StatelessWidget {
  const _TallyBar({required this.tally});

  final ProposalTally tally;

  @override
  Widget build(BuildContext context) {
    final total = tally.totalVotedShares;
    final yes = total > 0 ? tally.yesShares / total : 0.0;
    final no = total > 0 ? tally.noShares / total : 0.0;
    final abstain = total > 0 ? tally.abstainShares / total : 0.0;
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: SizedBox(
        height: 8,
        child: total == 0
            ? Container(color: AppColors.border)
            : Row(
                children: [
                  Expanded(
                      flex: (yes * 1000).round(),
                      child: Container(color: AppColors.success)),
                  Expanded(
                      flex: (no * 1000).round(),
                      child: Container(color: AppColors.danger)),
                  Expanded(
                      flex: (abstain * 1000).round(),
                      child: Container(color: AppColors.border)),
                ],
              ),
      ),
    );
  }
}

class _VoteButton extends StatelessWidget {
  const _VoteButton({
    required this.label,
    required this.color,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final Color color;
  final bool selected;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        backgroundColor: selected ? color.withValues(alpha: 0.12) : null,
        side: BorderSide(color: color.withValues(alpha: selected ? 1 : 0.5)),
        padding: const EdgeInsets.symmetric(vertical: 10),
      ),
      child: Text(label,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
    );
  }
}
