import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../data/investor_preferences_repository.dart';

/// Lets an investor tune the deal-matching preferences used by AI match scoring
/// and the weekly digest. Mirrors the web Investment Preferences form.
class InvestmentPreferencesPage extends ConsumerStatefulWidget {
  const InvestmentPreferencesPage({super.key});

  @override
  ConsumerState<InvestmentPreferencesPage> createState() =>
      _InvestmentPreferencesPageState();
}

const _propertyTypeOptions = {
  'flip': 'Flips',
  'rental': 'Rentals',
  'development': 'Developments',
};

const _riskOptions = {
  'low': 'Conservative',
  'medium': 'Moderate',
  'high': 'Aggressive',
};

class _InvestmentPreferencesPageState
    extends ConsumerState<InvestmentPreferencesPage> {
  final _minInvestment = TextEditingController();
  final _maxInvestment = TextEditingController();
  final _returnRate = TextEditingController();
  final _locations = TextEditingController();

  final Set<String> _types = {};
  String? _risk;
  bool _initialised = false;
  bool _saving = false;

  @override
  void dispose() {
    _minInvestment.dispose();
    _maxInvestment.dispose();
    _returnRate.dispose();
    _locations.dispose();
    super.dispose();
  }

  void _hydrate(InvestorPreferences p) {
    if (_initialised) return;
    _initialised = true;
    _types
      ..clear()
      ..addAll(p.preferredPropertyTypes);
    _risk = p.riskTolerance;
    if (p.minInvestment != null) {
      _minInvestment.text = p.minInvestment!.toStringAsFixed(0);
    }
    if (p.maxInvestment != null) {
      _maxInvestment.text = p.maxInvestment!.toStringAsFixed(0);
    }
    if (p.preferredReturnRate != null) {
      _returnRate.text = p.preferredReturnRate!.toStringAsFixed(0);
    }
    _locations.text = p.preferredLocations.join(', ');
  }

  double? _num(TextEditingController c) {
    final t = c.text.trim().replaceAll(',', '');
    if (t.isEmpty) return null;
    return double.tryParse(t);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final prefs = InvestorPreferences(
      preferredPropertyTypes: _types.toList(),
      minInvestment: _num(_minInvestment),
      maxInvestment: _num(_maxInvestment),
      preferredLocations: _locations.text
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList(),
      riskTolerance: _risk,
      preferredReturnRate: _num(_returnRate),
    );
    try {
      await ref.read(investorPreferencesRepositoryProvider).save(prefs);
      ref.invalidate(investorPreferencesProvider);
      _snack('Preferences saved.');
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
    final async = ref.watch(investorPreferencesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Investment preferences')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load preferences.\n$e',
                textAlign: TextAlign.center),
          ),
        ),
        data: (prefs) {
          _hydrate(prefs);
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Tell us what you are looking for. We use this to score deal matches and curate your weekly digest.',
                style: TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 20),
              _SectionLabel('Property types'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _propertyTypeOptions.entries.map((e) {
                  final selected = _types.contains(e.key);
                  return FilterChip(
                    label: Text(e.value),
                    selected: selected,
                    onSelected: (v) => setState(() {
                      if (v) {
                        _types.add(e.key);
                      } else {
                        _types.remove(e.key);
                      }
                    }),
                    selectedColor: AppColors.gold.withValues(alpha: 0.25),
                    checkmarkColor: AppColors.goldDark,
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),
              _SectionLabel('Risk appetite'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: _riskOptions.entries.map((e) {
                  return ChoiceChip(
                    label: Text(e.value),
                    selected: _risk == e.key,
                    onSelected: (_) => setState(() => _risk = e.key),
                    selectedColor: AppColors.navy.withValues(alpha: 0.15),
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _NumberField(
                      controller: _minInvestment,
                      label: 'Min investment (R)',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _NumberField(
                      controller: _maxInvestment,
                      label: 'Max investment (R)',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _NumberField(
                controller: _returnRate,
                label: 'Target return rate (%)',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _locations,
                decoration: const InputDecoration(
                  labelText: 'Preferred locations',
                  hintText: 'e.g. Cape Town, Sandton, Durban',
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
                label: Text(_saving ? 'Saving…' : 'Save preferences'),
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
