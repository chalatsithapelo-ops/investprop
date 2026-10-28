import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';

/// An investor's deal-matching preferences. Mirrors the web
/// `getInvestorPreferences` / `updateInvestorPreferences` contract.
class InvestorPreferences {
  const InvestorPreferences({
    required this.preferredPropertyTypes,
    required this.minInvestment,
    required this.maxInvestment,
    required this.preferredLocations,
    required this.riskTolerance,
    required this.preferredReturnRate,
  });

  final List<String> preferredPropertyTypes;
  final double? minInvestment;
  final double? maxInvestment;
  final List<String> preferredLocations;
  final String? riskTolerance;
  final double? preferredReturnRate;

  factory InvestorPreferences.empty() => const InvestorPreferences(
    preferredPropertyTypes: [],
    minInvestment: null,
    maxInvestment: null,
    preferredLocations: [],
    riskTolerance: null,
    preferredReturnRate: null,
  );

  factory InvestorPreferences.fromJson(Map<String, dynamic> json) {
    List<String> list(dynamic a, dynamic b) {
      final v = a ?? b;
      if (v is List) return v.map((e) => e.toString()).toList();
      return const [];
    }

    double? dbl(dynamic a, [dynamic b]) {
      final v = a ?? b;
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v);
      return null;
    }

    return InvestorPreferences(
      preferredPropertyTypes: list(
        json['preferredPropertyTypes'],
        json['propertyTypes'],
      ),
      minInvestment: dbl(json['minInvestment'], json['minInvestmentAmount']),
      maxInvestment: dbl(json['maxInvestment'], json['maxInvestmentAmount']),
      preferredLocations: list(
        json['preferredLocations'],
        json['preferredCities'],
      ),
      riskTolerance: json['riskTolerance'] as String?,
      preferredReturnRate: dbl(json['preferredReturnRate'], json['minROI']),
    );
  }

  Map<String, dynamic> toInput() => {
    'preferredPropertyTypes': preferredPropertyTypes,
    if (minInvestment != null) 'minInvestment': minInvestment,
    if (maxInvestment != null) 'maxInvestment': maxInvestment,
    'preferredLocations': preferredLocations,
    if (riskTolerance != null) 'riskTolerance': riskTolerance,
    if (preferredReturnRate != null) 'preferredReturnRate': preferredReturnRate,
  };
}

class InvestorPreferencesRepository {
  InvestorPreferencesRepository(this._client);

  final TrpcClient _client;

  Future<InvestorPreferences> fetch() async {
    final data = await _client.query('getInvestorPreferences');
    final prefs = data is Map ? data['preferences'] : null;
    if (prefs is Map) {
      return InvestorPreferences.fromJson(Map<String, dynamic>.from(prefs));
    }
    return InvestorPreferences.empty();
  }

  Future<void> save(InvestorPreferences prefs) async {
    await _client.mutation(
      'updateInvestorPreferences',
      input: {'preferences': prefs.toInput()},
    );
  }
}

final investorPreferencesRepositoryProvider =
    Provider<InvestorPreferencesRepository>((ref) {
      return InvestorPreferencesRepository(ref.watch(trpcClientProvider));
    });

final investorPreferencesProvider =
    FutureProvider.autoDispose<InvestorPreferences>((ref) async {
      return ref.watch(investorPreferencesRepositoryProvider).fetch();
    });
