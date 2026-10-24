import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/distressed_repository.dart';
import '../domain/distressed_deal.dart';
import 'distressed_deal_card.dart';

class DistressedDealDetailPage extends ConsumerStatefulWidget {
  const DistressedDealDetailPage({super.key, required this.listingId});

  final int listingId;

  @override
  ConsumerState<DistressedDealDetailPage> createState() =>
      _DistressedDealDetailPageState();
}

class _DistressedDealDetailPageState
    extends ConsumerState<DistressedDealDetailPage> {
  bool _grading = false;

  Future<void> _grade() async {
    setState(() => _grading = true);
    try {
      await ref.read(distressedRepositoryProvider).gradeDeal(widget.listingId);
      if (!mounted) return;
      ref.invalidate(distressedDetailProvider(widget.listingId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Deal graded by AI.')),
      );
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : 'Could not grade this deal.';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _grading = false);
    }
  }

  Future<void> _openSource(String? url) async {
    if (url == null || url.isEmpty) return;
    final launched = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the source listing.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(distressedDetailProvider(widget.listingId));
    return Scaffold(
      appBar: AppBar(title: const Text('Deal details')),
      body: AsyncValueView(
        value: detail,
        onRetry: () =>
            ref.invalidate(distressedDetailProvider(widget.listingId)),
        data: (d) => _DetailBody(
          detail: d,
          grading: _grading,
          onGrade: _grade,
          onOpenSource: () => _openSource(d.deal.sourceUrl),
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({
    required this.detail,
    required this.grading,
    required this.onGrade,
    required this.onOpenSource,
  });

  final DistressedDealDetail detail;
  final bool grading;
  final VoidCallback onGrade;
  final VoidCallback onOpenSource;

  @override
  Widget build(BuildContext context) {
    final deal = detail.deal;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        SizedBox(
          height: 220,
          width: double.infinity,
          child: deal.imageUrl != null && deal.imageUrl!.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: deal.imageUrl!,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Container(color: AppColors.border),
                  errorWidget: (_, __, ___) => Container(
                    color: AppColors.navyLight,
                    child: const Center(
                      child:
                          Icon(Icons.gavel, size: 48, color: Colors.white54),
                    ),
                  ),
                )
              : Container(
                  color: AppColors.navyLight,
                  child: const Center(
                    child: Icon(Icons.gavel, size: 48, color: Colors.white54),
                  ),
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                deal.title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.location_on_outlined,
                      size: 16, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      [deal.address, deal.location]
                          .where((s) => (s ?? '').isNotEmpty)
                          .join(' · '),
                      style: const TextStyle(color: AppColors.textSecondary),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _PriceRow(deal: deal),
              const SizedBox(height: 16),
              _FactChips(deal: deal),
              if (deal.isAuction) ...[
                const SizedBox(height: 16),
                _AuctionCard(detail: detail),
              ],
              const SizedBox(height: 20),
              _AICard(detail: detail, grading: grading, onGrade: onGrade),
              const SizedBox(height: 20),
              _MarketAnalysisCard(listingId: deal.id),
              if ((detail.description ?? '').isNotEmpty) ...[
                const SizedBox(height: 20),
                const _SectionTitle('Description'),
                const SizedBox(height: 8),
                Text(
                  detail.description!,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    height: 1.5,
                  ),
                ),
              ],
              if (detail.priceHistory.length > 1) ...[
                const SizedBox(height: 20),
                const _SectionTitle('Asking price history'),
                const SizedBox(height: 8),
                ...detail.priceHistory.reversed.map(
                  (p) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          Fmt.date(p.recordedAt),
                          style: const TextStyle(
                              color: AppColors.textSecondary),
                        ),
                        Text(
                          Fmt.money(p.askingPrice),
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: onOpenSource,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(50),
                  foregroundColor: AppColors.navy,
                  side: const BorderSide(color: AppColors.navy),
                ),
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text('View on ${deal.sourceLabel}'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.deal});

  final DistressedDeal deal;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Asking price',
                  style: TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(height: 2),
              Text(
                Fmt.money(deal.askingPrice),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.navy,
                ),
              ),
              if (deal.marketValue != null && deal.marketValue! > 0)
                Text(
                  'Market value ${Fmt.compactMoney(deal.marketValue!)}',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary),
                ),
              if (deal.hasPriceDrop)
                Text(
                  '↓ ${deal.priceDropPct!.toStringAsFixed(0)}% drop'
                  '${deal.previousPrice != null ? ' from ${Fmt.compactMoney(deal.previousPrice!)}' : ''}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.danger,
                  ),
                ),
            ],
          ),
        ),
        if ((deal.discount ?? 0) > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${deal.discount!.toStringAsFixed(0)}% off',
              style: const TextStyle(
                color: AppColors.success,
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          ),
      ],
    );
  }
}

class _FactChips extends StatelessWidget {
  const _FactChips({required this.deal});

  final DistressedDeal deal;

  @override
  Widget build(BuildContext context) {
    final facts = <(IconData, String)>[
      if ((deal.propertyType ?? '').isNotEmpty)
        (Icons.home_work_outlined, deal.propertyType!),
      if ((deal.bedrooms ?? 0) > 0)
        (Icons.king_bed_outlined, '${deal.bedrooms} bed'),
      if ((deal.bathrooms ?? 0) > 0)
        (Icons.bathtub_outlined, '${deal.bathrooms} bath'),
      if ((deal.erfSize ?? 0) > 0)
        (Icons.crop_square, '${deal.erfSize!.toStringAsFixed(0)} m² erf'),
      if ((deal.floorSize ?? 0) > 0)
        (Icons.straighten, '${deal.floorSize!.toStringAsFixed(0)} m² floor'),
    ];
    if (facts.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: facts
          .map(
            (f) => Chip(
              visualDensity: VisualDensity.compact,
              avatar: Icon(f.$1, size: 16, color: AppColors.navy),
              label: Text(f.$2),
              backgroundColor: AppColors.background,
            ),
          )
          .toList(),
    );
  }
}

class _AuctionCard extends StatelessWidget {
  const _AuctionCard({required this.detail});

  final DistressedDealDetail detail;

  @override
  Widget build(BuildContext context) {
    final deal = detail.deal;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.navy.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.navy.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.gavel, size: 18, color: AppColors.navy),
              const SizedBox(width: 8),
              Text(
                deal.auctionType?.isNotEmpty == true
                    ? deal.auctionType!
                    : 'Auction',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy,
                ),
              ),
              if (detail.noReserve) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.gold.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'No reserve',
                    style: TextStyle(
                      color: AppColors.goldDark,
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (deal.auctionDate != null) ...[
            const SizedBox(height: 8),
            _AuctionRow(
              icon: Icons.event,
              label: 'Date',
              value: [
                Fmt.date(deal.auctionDate),
                if ((detail.auctionTime ?? '').isNotEmpty) detail.auctionTime!,
              ].join(' · '),
            ),
          ],
          if ((deal.auctionVenue ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            _AuctionRow(
              icon: Icons.place_outlined,
              label: 'Venue',
              value: deal.auctionVenue!,
            ),
          ],
          if ((detail.caseNumber ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            _AuctionRow(
              icon: Icons.gavel_outlined,
              label: 'Case no.',
              value: detail.caseNumber!,
            ),
          ],
        ],
      ),
    );
  }
}

class _AuctionRow extends StatelessWidget {
  const _AuctionRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Text('$label: ',
            style: const TextStyle(color: AppColors.textSecondary)),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _AICard extends StatelessWidget {
  const _AICard({
    required this.detail,
    required this.grading,
    required this.onGrade,
  });

  final DistressedDealDetail detail;
  final bool grading;
  final VoidCallback onGrade;

  @override
  Widget build(BuildContext context) {
    final deal = detail.deal;
    final breakdown = detail.breakdown;
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
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 18, color: AppColors.gold),
              const SizedBox(width: 8),
              const Text(
                'AI deal grade',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const Spacer(),
              if (deal.hasGrade) GradePill(grade: deal.aiGrade!),
            ],
          ),
          if (!deal.hasGrade) ...[
            const SizedBox(height: 12),
            const Text(
              'This listing has not been graded yet. Run an on-demand AI '
              'screen to see the grade, risk score and full breakdown.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.4),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: grading ? null : onGrade,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                backgroundColor: AppColors.navy,
              ),
              icon: grading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.bolt, size: 18),
              label: Text(grading ? 'Grading…' : 'Grade this deal'),
            ),
          ] else ...[
            const SizedBox(height: 12),
            if (deal.aiRiskScore != null)
              Row(
                children: [
                  const Text('Risk score: ',
                      style: TextStyle(color: AppColors.textSecondary)),
                  Text(
                    '${deal.aiRiskScore!.toStringAsFixed(0)}/100',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            if ((deal.aiSummary ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                deal.aiSummary!,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  height: 1.5,
                ),
              ),
            ],
            if (breakdown != null && !breakdown.isEmpty) ...[
              const SizedBox(height: 12),
              _BreakdownList(
                title: 'Pros',
                icon: Icons.check_circle_outline,
                color: AppColors.success,
                items: breakdown.pros,
              ),
              _BreakdownList(
                title: 'Cons',
                icon: Icons.remove_circle_outline,
                color: AppColors.warning,
                items: breakdown.cons,
              ),
              _BreakdownList(
                title: 'Red flags',
                icon: Icons.warning_amber_outlined,
                color: AppColors.danger,
                items: breakdown.redFlags,
              ),
              _BreakdownList(
                title: 'Recommendations',
                icon: Icons.lightbulb_outline,
                color: AppColors.navy,
                items: breakdown.recommendations,
              ),
            ],
            if (deal.aiScoredAt != null) ...[
              const SizedBox(height: 8),
              Text(
                'Graded ${Fmt.relative(deal.aiScoredAt)}',
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _BreakdownList extends StatelessWidget {
  const _BreakdownList({
    required this.title,
    required this.icon,
    required this.color,
    required this.items,
  });

  final String title;
  final IconData icon;
  final Color color;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: color,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ...items.map(
            (t) => Padding(
              padding: const EdgeInsets.only(left: 22, top: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('•  ',
                      style: TextStyle(color: AppColors.textSecondary)),
                  Expanded(
                    child: Text(
                      t,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
    );
  }
}

/// Deterministic comparable-sales / area-benchmark panel. Loads its own data so
/// the parent body can stay stateless.
class _MarketAnalysisCard extends ConsumerWidget {
  const _MarketAnalysisCard({required this.listingId});

  final int listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(distressedMarketAnalysisProvider(listingId));
    return async.when(
      loading: () => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (_, __) => const SizedBox.shrink(),
      data: (a) => _MarketAnalysisBody(analysis: a),
    );
  }
}

class _MarketAnalysisBody extends StatelessWidget {
  const _MarketAnalysisBody({required this.analysis});

  final DistressedMarketAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final a = analysis;
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
          Row(
            children: [
              const Icon(Icons.insights_outlined,
                  size: 18, color: AppColors.navy),
              const SizedBox(width: 8),
              const Text(
                'Market analysis',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: a.verdictColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${a.verdictLabel} · ${a.verdictScore}/100',
                  style: TextStyle(
                    color: a.verdictColor,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          if (a.verdictRationale.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              a.verdictRationale,
              style: const TextStyle(color: AppColors.textPrimary, height: 1.5),
            ),
          ],
          if (a.hasComparables) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (a.estimatedValue != null)
                  _MetricTile(
                    label: 'Benchmark value',
                    value: Fmt.compactMoney(a.estimatedValue!),
                  ),
                if (a.impliedMarginPct != null)
                  _MetricTile(
                    label: 'Margin of safety',
                    value:
                        '${a.impliedMarginPct! >= 0 ? '+' : ''}${a.impliedMarginPct!.toStringAsFixed(0)}%',
                    color: a.impliedMarginPct! >= 0
                        ? AppColors.success
                        : AppColors.danger,
                  ),
                if (a.medianPricePerSqm != null)
                  _MetricTile(
                    label: 'Area median R/m²',
                    value: Fmt.compactMoney(a.medianPricePerSqm!),
                  ),
                if (a.subjectPricePerSqm != null)
                  _MetricTile(
                    label: 'This deal R/m²',
                    value: Fmt.compactMoney(a.subjectPricePerSqm!),
                  ),
                if (a.pricePercentile != null)
                  _MetricTile(
                    label: 'Cheaper than',
                    value: '${a.pricePercentile}% of comps',
                  ),
                if (a.trendDirection != 'UNKNOWN')
                  _MetricTile(
                    label: 'Area trend',
                    value: a.trendDirection == 'RISING'
                        ? 'Rising'
                        : a.trendDirection == 'FALLING'
                            ? 'Softening'
                            : 'Flat',
                    color: a.trendDirection == 'RISING'
                        ? AppColors.success
                        : a.trendDirection == 'FALLING'
                            ? AppColors.danger
                            : AppColors.textSecondary,
                  ),
              ],
            ),
          ],
          if (a.signals.isNotEmpty) ...[
            const SizedBox(height: 14),
            ...a.signals.map(
              (s) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 5, right: 8),
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: s.color,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            height: 1.4,
                          ),
                          children: [
                            TextSpan(
                              text: '${s.label}: ',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: s.color,
                              ),
                            ),
                            TextSpan(text: s.detail),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (a.flip != null || a.rental != null) ...[
            const SizedBox(height: 14),
            const _SectionLabel(
                icon: Icons.handyman_outlined, text: 'Projected returns'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (a.flip != null) ...[
                  _MetricTile(
                    label: 'Flip net ROI',
                    value: '${a.flip!.roiPct.toStringAsFixed(0)}%',
                    color: AppColors.success,
                  ),
                  _MetricTile(
                    label: 'Flip net profit',
                    value: Fmt.compactMoney(a.flip!.netProfit),
                  ),
                  _MetricTile(
                    label: 'Annualised',
                    value: '${a.flip!.annualisedPct.toStringAsFixed(0)}%',
                  ),
                  _MetricTile(
                    label: 'Benchmark ARV',
                    value: Fmt.compactMoney(a.flip!.arv),
                  ),
                ],
                if (a.rental != null) ...[
                  _MetricTile(
                    label: 'Est. monthly rent',
                    value: Fmt.compactMoney(a.rental!.estimatedMonthlyRent),
                  ),
                  _MetricTile(
                    label: 'Gross yield',
                    value: '${a.rental!.grossYieldPct.toStringAsFixed(1)}%',
                  ),
                  _MetricTile(
                    label: 'Net yield',
                    value: '${a.rental!.netYieldPct.toStringAsFixed(1)}%',
                  ),
                  _MetricTile(
                    label: 'Monthly cashflow',
                    value: Fmt.compactMoney(a.rental!.monthlyNetCashflow),
                    color: a.rental!.monthlyNetCashflow >= 0
                        ? AppColors.success
                        : AppColors.danger,
                  ),
                ],
              ],
            ),
            if (a.projectionAssumptions.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                a.projectionAssumptions,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
          ],
          if (a.maxBid != null &&
              (a.maxBid!.maxBidForTarget != null ||
                  a.maxBid!.breakEvenPrice != null)) ...[
            const SizedBox(height: 14),
            const _SectionLabel(
                icon: Icons.gps_fixed_outlined, text: 'Bidding guide'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (a.maxBid!.maxBidForTarget != null)
                  _MetricTile(
                    label:
                        'Max bid (${a.maxBid!.targetRoiPct.toStringAsFixed(0)}% ROI)',
                    value: Fmt.compactMoney(a.maxBid!.maxBidForTarget!),
                  ),
                if (a.maxBid!.breakEvenPrice != null)
                  _MetricTile(
                    label: 'Break-even price',
                    value: Fmt.compactMoney(a.maxBid!.breakEvenPrice!),
                  ),
                if (a.maxBid!.askingVsMaxBidPct != null)
                  _MetricTile(
                    label: 'Asking vs max bid',
                    value:
                        '${a.maxBid!.askingVsMaxBidPct! > 0 ? '+' : ''}${a.maxBid!.askingVsMaxBidPct!.toStringAsFixed(0)}%',
                    color: a.maxBid!.askingVsMaxBidPct! <= 0
                        ? AppColors.success
                        : AppColors.danger,
                  ),
              ],
            ),
          ],
          if (a.activity != null && a.activity!.staleness != 'UNKNOWN') ...[
            const SizedBox(height: 14),
            const _SectionLabel(
                icon: Icons.schedule_outlined, text: 'Market activity'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (a.activity!.daysOnMarket != null)
                  _MetricTile(
                    label: 'Days on market',
                    value:
                        '${a.activity!.daysOnMarket} · ${a.activity!.stalenessLabel}',
                    color: a.activity!.stalenessColor,
                  ),
                if (a.activity!.priceDropCount > 0)
                  _MetricTile(
                    label: 'Price cuts',
                    value: '${a.activity!.priceDropCount}',
                  ),
                if (a.activity!.totalDropPct != null)
                  _MetricTile(
                    label: 'Total price cut',
                    value: '${a.activity!.totalDropPct!.toStringAsFixed(0)}%',
                  ),
                if (a.activity!.dropVelocityPctPerMonth != null)
                  _MetricTile(
                    label: 'Cut velocity',
                    value:
                        '${a.activity!.dropVelocityPctPerMonth!.toStringAsFixed(1)}%/mo',
                  ),
              ],
            ),
          ],
          if (a.auctionRisks.isNotEmpty) ...[
            const SizedBox(height: 14),
            const _SectionLabel(
                icon: Icons.gpp_maybe_outlined,
                text: 'Auction & distressed-sale risks'),
            const SizedBox(height: 8),
            ...a.auctionRisks.map(
              (r) => Container(
                margin: const EdgeInsets.symmetric(vertical: 3),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: r.color.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: r.color.withValues(alpha: 0.4)),
                ),
                child: RichText(
                  text: TextSpan(
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      height: 1.4,
                      fontSize: 13,
                    ),
                    children: [
                      TextSpan(
                        text: '${r.label}: ',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: r.color,
                        ),
                      ),
                      TextSpan(text: r.detail),
                    ],
                  ),
                ),
              ),
            ),
          ],
          if (a.verdictFactors.isNotEmpty) ...[
            const SizedBox(height: 14),
            const _SectionLabel(
                icon: Icons.checklist_outlined, text: 'How we scored this'),
            const SizedBox(height: 6),
            ...a.verdictFactors.map(
              (f) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            height: 1.4,
                            fontSize: 13,
                          ),
                          children: [
                            TextSpan(
                              text: f.label,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (f.note.isNotEmpty)
                              TextSpan(
                                text: ' — ${f.note}',
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${f.impact > 0 ? '+' : ''}${f.impact.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: f.color,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (a.comparables.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              'Comparable listings · ${a.areaLevel} ${a.areaName}',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 6),
            ...a.comparables.map(
              (c) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            c.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          if (c.location.isNotEmpty)
                            Text(
                              c.location,
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 11,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          Fmt.compactMoney(c.askingPrice),
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        if (c.pricePerSqm != null)
                          Text(
                            '${Fmt.compactMoney(c.pricePerSqm!)}/m²',
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 10),
          const Text(
            'Benchmark derived from comparable distressed/auction asking prices '
            'in the area — a guide, not a formal valuation. Always do your own '
            'due diligence.',
            style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: color ?? AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
