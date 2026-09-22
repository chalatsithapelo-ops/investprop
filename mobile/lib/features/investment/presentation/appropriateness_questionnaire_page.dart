import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../data/investment_repository.dart';

/// FAIS appropriateness assessment. Completing this is a hard gate before an
/// investor can submit any proposal (`submitAppropriatenessQuestionnaire`).
class AppropriatenessQuestionnairePage extends ConsumerStatefulWidget {
  const AppropriatenessQuestionnairePage({super.key});

  @override
  ConsumerState<AppropriatenessQuestionnairePage> createState() =>
      _AppropriatenessQuestionnairePageState();
}

class _AppropriatenessQuestionnairePageState
    extends ConsumerState<AppropriatenessQuestionnairePage> {
  final _formKey = GlobalKey<FormState>();
  final _maxLossController = TextEditingController();

  String? _experience;
  String? _income;
  String? _netWorth;
  bool _understandsIlliquid = false;
  bool _understandsLoss = false;
  bool _understandsCoolingOff = false;
  bool _submitting = false;

  static const _experienceOptions = <String, String>{
    'NONE': 'No prior experience',
    'BASIC': 'Basic — some savings / funds',
    'EXPERIENCED': 'Experienced — shares, property, funds',
    'PROFESSIONAL': 'Professional / advised',
  };
  static const _incomeOptions = <String, String>{
    'UNDER_350K': 'Under R350,000',
    '350_750K': 'R350,000 – R750,000',
    '750K_1_5M': 'R750,000 – R1.5m',
    'OVER_1_5M': 'Over R1.5m',
  };
  static const _netWorthOptions = <String, String>{
    'UNDER_500K': 'Under R500,000',
    '500K_2M': 'R500,000 – R2m',
    '2M_10M': 'R2m – R10m',
    'OVER_10M': 'Over R10m',
  };

  @override
  void dispose() {
    _maxLossController.dispose();
    super.dispose();
  }

  bool get _acknowledged =>
      _understandsIlliquid && _understandsLoss && _understandsCoolingOff;

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_acknowledged) {
      _snack('Please acknowledge all three risk statements.');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(investmentRepositoryProvider).submitAppropriateness(
            AppropriatenessAnswers(
              investmentExperience: _experience!,
              annualIncome: _income!,
              netWorth: _netWorth!,
              understandsIlliquid: _understandsIlliquid,
              understandsLossOfCapital: _understandsLoss,
              understandsCoolingOff: _understandsCoolingOff,
              maxLossTolerance:
                  double.tryParse(_maxLossController.text.trim()) ?? 0,
            ),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Suitability check')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Before you invest, we need to understand your experience and '
              'circumstances. This is a regulatory requirement (FAIS) and is '
              'completed once.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.5),
            ),
            const SizedBox(height: 24),
            _Dropdown(
              label: 'Investment experience',
              value: _experience,
              options: _experienceOptions,
              onChanged: (v) => setState(() => _experience = v),
            ),
            const SizedBox(height: 16),
            _Dropdown(
              label: 'Annual income (before tax)',
              value: _income,
              options: _incomeOptions,
              onChanged: (v) => setState(() => _income = v),
            ),
            const SizedBox(height: 16),
            _Dropdown(
              label: 'Estimated net worth',
              value: _netWorth,
              options: _netWorthOptions,
              onChanged: (v) => setState(() => _netWorth = v),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _maxLossController,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
              ],
              decoration: const InputDecoration(
                labelText: 'Maximum amount you could afford to lose (R)',
                prefixText: 'R ',
              ),
              validator: (v) {
                final n = double.tryParse((v ?? '').trim());
                if (n == null || n < 0) return 'Enter a valid amount';
                return null;
              },
            ),
            const SizedBox(height: 24),
            const Text(
              'I understand and accept that:',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            _Ack(
              value: _understandsIlliquid,
              onChanged: (v) => setState(() => _understandsIlliquid = v),
              text:
                  'This is an illiquid investment — I may not be able to sell '
                  'or exit when I want to.',
            ),
            _Ack(
              value: _understandsLoss,
              onChanged: (v) => setState(() => _understandsLoss = v),
              text:
                  'My capital is at risk and I could lose some or all of the '
                  'money I invest.',
            ),
            _Ack(
              value: _understandsCoolingOff,
              onChanged: (v) => setState(() => _understandsCoolingOff = v),
              text:
                  'A 5-day cooling-off period applies after I commit to an '
                  'investment.',
            ),
            const SizedBox(height: 28),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Save and continue'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Dropdown extends StatelessWidget {
  const _Dropdown({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String? value;
  final Map<String, String> options;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: options.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: onChanged,
      validator: (v) => v == null ? 'Please select an option' : null,
    );
  }
}

class _Ack extends StatelessWidget {
  const _Ack({
    required this.value,
    required this.onChanged,
    required this.text,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final String text;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: value,
      onChanged: (v) => onChanged(v ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(
        text,
        style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
      ),
    );
  }
}
