import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../domain/investment_constants.dart';
import '../domain/investment_projection.dart';
import 'investment_projection_card.dart';

class ScenarioSensitivityPage extends StatefulWidget {
  const ScenarioSensitivityPage({super.key, required this.propertyId});

  final int propertyId;

  @override
  State<ScenarioSensitivityPage> createState() =>
      _ScenarioSensitivityPageState();
}

class _ScenarioSensitivityPageState extends State<ScenarioSensitivityPage> {
  final _amount = TextEditingController(
    text: InvestmentRules.minInvestment.toStringAsFixed(0),
  );
  StrategyConfig _config = const StrategyConfig();

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final amount = double.tryParse(_amount.text) ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Scenario sensitivity')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Explore downside, base and upside returns before investing. '
            'Adjust your amount, strategy, hold period, stress assumptions '
            'and optional bank loan. This does not submit an investment.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
            ],
            decoration: InputDecoration(
              labelText: 'Investment amount',
              prefixText: 'R ',
              errorText: amount <= 0 || !amount.isFinite
                  ? 'Enter a positive investment amount.'
                  : null,
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          if (amount > 0 && amount.isFinite)
            ProjectionCard(
              propertyId: widget.propertyId,
              amount: amount,
              config: _config,
              onConfigChange: (config) => setState(() => _config = config),
            ),
        ],
      ),
    );
  }
}
