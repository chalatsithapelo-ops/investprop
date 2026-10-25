import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../data/distressed_repository.dart';
import '../domain/distressed_deal.dart';
import 'distressed_deal_card.dart';

class DistressedDealsPage extends ConsumerStatefulWidget {
  const DistressedDealsPage({super.key});

  @override
  ConsumerState<DistressedDealsPage> createState() =>
      _DistressedDealsPageState();
}

class _DistressedDealsPageState extends ConsumerState<DistressedDealsPage> {
  final _scrollController = ScrollController();
  final _deals = <DistressedDeal>[];

  DistressedFilter _filter = const DistressedFilter();
  bool _loading = true;
  bool _loadingMore = false;
  bool _entitled = true;
  int _currentPage = 1;
  int _totalPages = 1;
  int _totalCount = 0;
  int _newThisWeek = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      _loadMore();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(distressedRepositoryProvider)
          .fetchDeals(_filter, page: 1);
      if (!mounted) return;
      setState(() {
        _entitled = result.entitled;
        _deals
          ..clear()
          ..addAll(result.listings);
        _currentPage = result.currentPage;
        _totalPages = result.totalPages;
        _totalCount = result.totalCount;
        _newThisWeek = result.newThisWeek;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is ApiException ? e.message : e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _loading) return;
    if (_currentPage >= _totalPages) return;
    setState(() => _loadingMore = true);
    try {
      final next = _currentPage + 1;
      final result = await ref
          .read(distressedRepositoryProvider)
          .fetchDeals(_filter, page: next);
      if (!mounted) return;
      setState(() {
        _deals.addAll(result.listings);
        _currentPage = result.currentPage;
        _totalPages = result.totalPages;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
    }
  }

  void _applyFilter(DistressedFilter filter) {
    setState(() => _filter = filter);
    _load();
  }

  Future<void> _openPricing() async {
    final uri = Uri.parse('${Env.apiBaseUrl}/pricing');
    final launched =
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the pricing page.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Distressed Deals')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 120),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Icon(Icons.cloud_off,
                      size: 48, color: AppColors.textSecondary),
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }
    if (!_entitled) {
      return _UpgradeLock(onUpgrade: _openPricing);
    }

    return CustomScrollView(
      controller: _scrollController,
      slivers: [
        SliverToBoxAdapter(
          child: _FilterSection(
            filter: _filter,
            totalCount: _totalCount,
            newThisWeek: _newThisWeek,
            onChanged: _applyFilter,
          ),
        ),
        if (_deals.isEmpty)
          const SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: EdgeInsets.fromLTRB(24, 48, 24, 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.search_off,
                      size: 48, color: AppColors.textSecondary),
                  SizedBox(height: 12),
                  Text(
                    'No deals match your filters',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Try widening your filters or pull down to refresh.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            sliver: SliverList.separated(
              itemCount: _deals.length + (_loadingMore ? 1 : 0),
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                if (index >= _deals.length) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final deal = _deals[index];
                return DistressedDealCard(
                  deal: deal,
                  onTap: () =>
                      context.push('/profile/distressed/${deal.id}'),
                );
              },
            ),
          ),
      ],
    );
  }
}

class _FilterSection extends StatelessWidget {
  const _FilterSection({
    required this.filter,
    required this.totalCount,
    required this.newThisWeek,
    required this.onChanged,
  });

  final DistressedFilter filter;
  final int totalCount;
  final int newThisWeek;
  final ValueChanged<DistressedFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  totalCount == 1
                      ? '1 AI-graded deal'
                      : '$totalCount AI-graded deals',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (newThisWeek > 0)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.gold.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$newThisWeek new this week',
                    style: const TextStyle(
                      color: AppColors.goldDark,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            children: [
              _FiltersChip(filter: filter, onChanged: onChanged),
              const SizedBox(width: 8),
              _SortChip(filter: filter, onChanged: onChanged),
              const SizedBox(width: 8),
              _GradeChip(filter: filter, onChanged: onChanged),
              const SizedBox(width: 8),
              FilterChip(
                label: const Text('Graded only'),
                selected: filter.onlyGraded,
                onSelected: (v) =>
                    onChanged(filter.copyWith(onlyGraded: v)),
                selectedColor: AppColors.navy,
                checkmarkColor: Colors.white,
                labelStyle: TextStyle(
                  color: filter.onlyGraded
                      ? Colors.white
                      : AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SortChip extends StatelessWidget {
  const _SortChip({required this.filter, required this.onChanged});

  final DistressedFilter filter;
  final ValueChanged<DistressedFilter> onChanged;

  static const _labels = {
    'newest': 'Newest',
    'discount': 'Biggest discount',
    'price_asc': 'Lowest price',
    'ai_grade': 'Best AI grade',
  };

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      initialValue: filter.sortBy,
      onSelected: (v) => onChanged(filter.copyWith(sortBy: v)),
      itemBuilder: (_) => _labels.entries
          .map((e) => PopupMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      child: Chip(
        avatar: const Icon(Icons.sort, size: 18, color: AppColors.navy),
        label: Text(_labels[filter.sortBy] ?? 'Sort'),
      ),
    );
  }
}

class _GradeChip extends StatelessWidget {
  const _GradeChip({required this.filter, required this.onChanged});

  final DistressedFilter filter;
  final ValueChanged<DistressedFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final selected = filter.minAIGrade;
    return PopupMenuButton<String>(
      onSelected: (v) {
        if (v == 'all') {
          onChanged(filter.copyWith(clearMinAIGrade: true));
        } else {
          onChanged(filter.copyWith(minAIGrade: v));
        }
      },
      itemBuilder: (_) => const [
        PopupMenuItem(value: 'all', child: Text('Any grade')),
        PopupMenuItem(value: 'A', child: Text('A only')),
        PopupMenuItem(value: 'B', child: Text('B and above')),
        PopupMenuItem(value: 'C', child: Text('C and above')),
        PopupMenuItem(value: 'D', child: Text('D and above')),
      ],
      child: Chip(
        avatar: const Icon(Icons.star_outline, size: 18, color: AppColors.navy),
        label: Text(selected == null ? 'Any grade' : 'Grade $selected+'),
      ),
    );
  }
}

class _FiltersChip extends StatelessWidget {
  const _FiltersChip({required this.filter, required this.onChanged});

  final DistressedFilter filter;
  final ValueChanged<DistressedFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final count = filter.activeCount;
    return ActionChip(
      avatar: const Icon(Icons.tune, size: 18, color: AppColors.navy),
      label: Text(count > 0 ? 'Filters ($count)' : 'Filters'),
      backgroundColor:
          count > 0 ? AppColors.gold.withValues(alpha: 0.18) : null,
      onPressed: () async {
        final updated = await showModalBottomSheet<DistressedFilter>(
          context: context,
          isScrollControlled: true,
          backgroundColor: AppColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          builder: (_) => _FilterSheet(filter: filter),
        );
        if (updated != null) onChanged(updated);
      },
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.filter});

  final DistressedFilter filter;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late DistressedFilter _draft = widget.filter;

  static const _provinces = <String>[
    'Gauteng',
    'Western Cape',
    'KwaZulu-Natal',
    'Eastern Cape',
    'Free State',
    'Limpopo',
    'Mpumalanga',
    'North West',
    'Northern Cape',
  ];

  static const _propertyTypes = <(String, String)>[
    ('HOUSE', 'House'),
    ('RESIDENTIAL', 'Residential'),
    ('VACANT LAND', 'Vacant land'),
    ('COMMERCIAL', 'Commercial'),
    ('INDUSTRIAL', 'Industrial'),
    ('OFFICE', 'Office'),
    ('STUDENT', 'Student'),
  ];

  static const _maxPrices = <(double, String)>[
    (250000, 'R250k'),
    (500000, 'R500k'),
    (1000000, 'R1m'),
    (2000000, 'R2m'),
    (5000000, 'R5m'),
  ];

  static const _discounts = <(double, String)>[
    (10, '10%+'),
    (20, '20%+'),
    (30, '30%+'),
    (40, '40%+'),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Text(
                    'Filters',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () =>
                        setState(() => _draft = const DistressedFilter()
                            .copyWith(sortBy: _draft.sortBy)),
                    child: const Text('Reset'),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              _label('Province'),
              _chipWrap(
                options: _provinces.map((p) => (p, p)).toList(),
                selected: _draft.province,
                onSelect: (v) => setState(() => _draft = v == null
                    ? _draft.copyWith(clearProvince: true)
                    : _draft.copyWith(province: v)),
              ),
              const SizedBox(height: 16),
              _label('City / suburb'),
              TextFormField(
                initialValue: _draft.city,
                decoration: const InputDecoration(
                  hintText: 'e.g. Johannesburg',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => _draft = v.trim().isEmpty
                    ? _draft.copyWith(clearCity: true)
                    : _draft.copyWith(city: v.trim()),
              ),
              const SizedBox(height: 16),
              _label('Property type'),
              _chipWrap(
                options: _propertyTypes,
                selected: _draft.propertyType,
                onSelect: (v) => setState(() => _draft = v == null
                    ? _draft.copyWith(clearPropertyType: true)
                    : _draft.copyWith(propertyType: v)),
              ),
              const SizedBox(height: 16),
              _label('Max asking price'),
              _chipWrap(
                options: _maxPrices
                    .map((e) => (e.$1.toStringAsFixed(0), e.$2))
                    .toList(),
                selected: (_draft.maxPrice ?? 0) > 0
                    ? _draft.maxPrice!.toStringAsFixed(0)
                    : null,
                onSelect: (v) => setState(() => _draft = v == null
                    ? _draft.copyWith(clearMaxPrice: true)
                    : _draft.copyWith(maxPrice: double.parse(v))),
              ),
              const SizedBox(height: 16),
              _label('Minimum discount'),
              _chipWrap(
                options:
                    _discounts.map((e) => (e.$1.toStringAsFixed(0), e.$2)).toList(),
                selected: (_draft.minDiscountPct ?? 0) > 0
                    ? _draft.minDiscountPct!.toStringAsFixed(0)
                    : null,
                onSelect: (v) => setState(() => _draft = v == null
                    ? _draft.copyWith(clearMinDiscountPct: true)
                    : _draft.copyWith(minDiscountPct: double.parse(v))),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(_draft),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: AppColors.navy,
                ),
                child: const Text('Apply filters'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
      );

  /// A wrap of single-select choice chips. Tapping the selected chip clears it
  /// (passes null to onSelect).
  Widget _chipWrap({
    required List<(String, String)> options,
    required String? selected,
    required ValueChanged<String?> onSelect,
  }) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((o) {
        final isSel = selected == o.$1;
        return ChoiceChip(
          label: Text(o.$2),
          selected: isSel,
          selectedColor: AppColors.navy,
          labelStyle: TextStyle(
            color: isSel ? Colors.white : AppColors.textPrimary,
            fontWeight: FontWeight.w600,
          ),
          onSelected: (_) => onSelect(isSel ? null : o.$1),
        );
      }).toList(),
    );
  }
}

class _UpgradeLock extends StatelessWidget {
  const _UpgradeLock({required this.onUpgrade});

  final VoidCallback onUpgrade;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 40),
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: AppColors.gold.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: const Icon(Icons.lock_outline,
              size: 36, color: AppColors.goldDark),
        ),
        const SizedBox(height: 20),
        const Text(
          'Unlock distressed deals',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Browse AI-graded distressed and auction properties across South '
          'Africa, see the full deal breakdown, and grade any listing on '
          'demand. Available on our Pro, Enterprise and Distressed plans.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textSecondary, height: 1.4),
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: onUpgrade,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: AppColors.navy,
          ),
          icon: const Icon(Icons.open_in_new, size: 18),
          label: const Text('View plans'),
        ),
      ],
    );
  }
}
