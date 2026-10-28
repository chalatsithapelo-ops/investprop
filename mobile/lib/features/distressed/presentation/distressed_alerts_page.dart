import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../data/distressed_alerts_repository.dart';

/// Configure distressed-deal alert filters. New or price-dropped listings that
/// match are pushed to the subscriber. Mirrors the web Deal Alerts form.
class DistressedAlertsPage extends ConsumerStatefulWidget {
  const DistressedAlertsPage({super.key});

  @override
  ConsumerState<DistressedAlertsPage> createState() =>
      _DistressedAlertsPageState();
}

const _provinces = [
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

const _propertyTypes = ['House', 'Apartment', 'Townhouse', 'Vacant Land', 'Commercial'];
const _grades = ['A', 'B', 'C', 'D', 'E'];

class _DistressedAlertsPageState extends ConsumerState<DistressedAlertsPage> {
  final _maxPrice = TextEditingController();
  final _minDiscount = TextEditingController();

  final Set<String> _provincesSel = {};
  final Set<String> _typesSel = {};
  String? _minGrade;
  bool _active = true;
  bool _channelEmail = true;
  bool _channelPush = true;

  bool _initialised = false;
  bool _saving = false;

  @override
  void dispose() {
    _maxPrice.dispose();
    _minDiscount.dispose();
    super.dispose();
  }

  void _hydrate(DistressedAlertSubscription? s) {
    if (_initialised) return;
    _initialised = true;
    if (s == null) return;
    _active = s.active;
    _provincesSel.addAll(s.provinces);
    _typesSel.addAll(s.propertyTypes);
    _minGrade = s.minAIGrade;
    _channelEmail = s.channelEmail;
    _channelPush = s.channelPush;
    if (s.maxPrice != null) _maxPrice.text = s.maxPrice!.toStringAsFixed(0);
    if (s.minDiscountPct != null) {
      _minDiscount.text = s.minDiscountPct!.toStringAsFixed(0);
    }
  }

  double? _num(TextEditingController c) {
    final t = c.text.trim().replaceAll(',', '');
    if (t.isEmpty) return null;
    return double.tryParse(t);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final sub = DistressedAlertSubscription(
      active: _active,
      provinces: _provincesSel.toList(),
      cities: const [],
      maxPrice: _num(_maxPrice),
      minDiscountPct: _num(_minDiscount),
      minAIGrade: _minGrade,
      propertyTypes: _typesSel.toList(),
      channelEmail: _channelEmail,
      channelPush: _channelPush,
      lastAlertedAt: null,
    );
    try {
      await ref.read(distressedAlertsRepositoryProvider).save(sub);
      ref.invalidate(distressedAlertsProvider);
      _snack('Alert preferences saved.');
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (e) {
      _snack(e.toString().replaceFirst('Bad state: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : AppColors.success,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(distressedAlertsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Distressed deal alerts')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load alerts.\n$e', textAlign: TextAlign.center),
          ),
        ),
        data: (state) {
          _hydrate(state.subscription);
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (!state.entitled)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.warning.withValues(alpha: 0.4),
                    ),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock_outline, color: AppColors.warning, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Distressed alerts are a paid feature. You can set your filters now; '
                          'upgrade your plan to start receiving matches.',
                          style: TextStyle(color: AppColors.textPrimary, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              Card(
                child: SwitchListTile(
                  value: _active,
                  activeColor: AppColors.gold,
                  title: const Text('Alerts active'),
                  subtitle: Text(
                    state.subscription?.lastAlertedAt != null
                        ? 'Last alert ${Fmt.relative(state.subscription!.lastAlertedAt)}'
                        : 'Turn on to receive matching deals',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                  onChanged: (v) => setState(() => _active = v),
                ),
              ),
              const SizedBox(height: 20),
              _SectionLabel('Provinces'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _provinces.map((p) {
                  return FilterChip(
                    label: Text(p),
                    selected: _provincesSel.contains(p),
                    onSelected: (v) => setState(() {
                      v ? _provincesSel.add(p) : _provincesSel.remove(p);
                    }),
                    selectedColor: AppColors.gold.withValues(alpha: 0.25),
                    checkmarkColor: AppColors.goldDark,
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),
              _SectionLabel('Property types'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _propertyTypes.map((t) {
                  return FilterChip(
                    label: Text(t),
                    selected: _typesSel.contains(t),
                    onSelected: (v) => setState(() {
                      v ? _typesSel.add(t) : _typesSel.remove(t);
                    }),
                    selectedColor: AppColors.gold.withValues(alpha: 0.25),
                    checkmarkColor: AppColors.goldDark,
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _NumberField(
                      controller: _maxPrice,
                      label: 'Max price (R)',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _NumberField(
                      controller: _minDiscount,
                      label: 'Min discount (%)',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _SectionLabel('Minimum AI grade'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('Any'),
                    selected: _minGrade == null,
                    onSelected: (_) => setState(() => _minGrade = null),
                    selectedColor: AppColors.navy.withValues(alpha: 0.15),
                  ),
                  ..._grades.map((g) {
                    return ChoiceChip(
                      label: Text(g),
                      selected: _minGrade == g,
                      onSelected: (_) => setState(() => _minGrade = g),
                      selectedColor: AppColors.navy.withValues(alpha: 0.15),
                    );
                  }),
                ],
              ),
              const SizedBox(height: 20),
              _SectionLabel('Delivery'),
              const SizedBox(height: 4),
              Card(
                child: Column(
                  children: [
                    SwitchListTile(
                      value: _channelEmail,
                      activeColor: AppColors.gold,
                      title: const Text('Email'),
                      onChanged: (v) => setState(() => _channelEmail = v),
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      value: _channelPush,
                      activeColor: AppColors.gold,
                      title: const Text('Push notification'),
                      onChanged: (v) => setState(() => _channelPush = v),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              ElevatedButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check),
                label: Text(_saving ? 'Saving…' : 'Save alert preferences'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 15,
      fontWeight: FontWeight.w700,
      color: AppColors.textPrimary,
    ),
  );
}

class _NumberField extends StatelessWidget {
  const _NumberField({required this.controller, required this.label});
  final TextEditingController controller;
  final String label;
  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
    decoration: InputDecoration(labelText: label),
  );
}
