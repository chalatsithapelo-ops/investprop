import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/land_partnership.dart';

/// Input for submitLandPartnership. Optional fields are omitted when null so
/// the server defaults and cross-field validation apply. Equity is fixed
/// server-side at 20% owner / 80% platform.
class LandPartnershipInput {
  const LandPartnershipInput({
    required this.ownerFullName,
    required this.landTitle,
    required this.landDescription,
    required this.address,
    required this.city,
    required this.province,
    required this.bondStatus,
    required this.ratesStatus,
    required this.popiaConsent,
    this.ownerIdNumber,
    this.ownerPhone,
    this.ownerEmail,
    this.ownerAddress,
    this.ownerEntityName,
    this.ownerEntityRegNumber,
    this.erfNumber,
    this.titleDeedNumber,
    this.erfSize,
    this.currentZoning,
    this.currentUse,
    this.municipalValue,
    this.estimatedLandValue,
    this.bondOutstanding,
    this.bondBank,
    this.ratesArrears,
    this.coOwners,
    this.developmentType,
    this.intendedStrategy,
    this.proposedUnits,
    this.estimatedGdv,
    this.estimatedBuildCost,
  });

  final String ownerFullName;
  final String landTitle;
  final String landDescription;
  final String address;
  final String city;
  final String province;
  final String bondStatus;
  final String ratesStatus;
  final bool popiaConsent;
  final String? ownerIdNumber;
  final String? ownerPhone;
  final String? ownerEmail;
  final String? ownerAddress;
  final String? ownerEntityName;
  final String? ownerEntityRegNumber;
  final String? erfNumber;
  final String? titleDeedNumber;
  final double? erfSize;
  final String? currentZoning;
  final String? currentUse;
  final double? municipalValue;
  final double? estimatedLandValue;
  final double? bondOutstanding;
  final String? bondBank;
  final double? ratesArrears;
  final String? coOwners;
  final String? developmentType;
  final String? intendedStrategy;
  final int? proposedUnits;
  final double? estimatedGdv;
  final double? estimatedBuildCost;

  bool _has(String? v) => v != null && v.isNotEmpty;

  Map<String, dynamic> toInput() => {
    'ownerFullName': ownerFullName,
    'landTitle': landTitle,
    'landDescription': landDescription,
    'address': address,
    'city': city,
    'province': province,
    'bondStatus': bondStatus,
    'ratesStatus': ratesStatus,
    'popiaConsent': popiaConsent,
    if (_has(ownerIdNumber)) 'ownerIdNumber': ownerIdNumber,
    if (_has(ownerPhone)) 'ownerPhone': ownerPhone,
    if (_has(ownerEmail)) 'ownerEmail': ownerEmail,
    if (_has(ownerAddress)) 'ownerAddress': ownerAddress,
    if (_has(ownerEntityName)) 'ownerEntityName': ownerEntityName,
    if (_has(ownerEntityRegNumber))
      'ownerEntityRegNumber': ownerEntityRegNumber,
    if (_has(erfNumber)) 'erfNumber': erfNumber,
    if (_has(titleDeedNumber)) 'titleDeedNumber': titleDeedNumber,
    if (erfSize != null) 'erfSize': erfSize,
    if (_has(currentZoning)) 'currentZoning': currentZoning,
    if (_has(currentUse)) 'currentUse': currentUse,
    if (municipalValue != null) 'municipalValue': municipalValue,
    if (estimatedLandValue != null) 'estimatedLandValue': estimatedLandValue,
    if (bondOutstanding != null) 'bondOutstanding': bondOutstanding,
    if (_has(bondBank)) 'bondBank': bondBank,
    if (ratesArrears != null) 'ratesArrears': ratesArrears,
    if (_has(coOwners)) 'coOwners': coOwners,
    if (_has(developmentType)) 'developmentType': developmentType,
    if (_has(intendedStrategy)) 'intendedStrategy': intendedStrategy,
    if (proposedUnits != null) 'proposedUnits': proposedUnits,
    if (estimatedGdv != null) 'estimatedGDV': estimatedGdv,
    if (estimatedBuildCost != null) 'estimatedBuildCost': estimatedBuildCost,
  };
}

class LandPartnershipRepository {
  LandPartnershipRepository(this._client);

  final TrpcClient _client;

  Future<List<LandPartnership>> myPartnerships() async {
    final data = await _client.query('getMyLandPartnerships');
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((e) => LandPartnership.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> submit(LandPartnershipInput input) async {
    await _client.mutation('submitLandPartnership', input: input.toInput());
  }

  Future<void> sign({
    required int id,
    required String signatureName,
    String? signatureId,
  }) async {
    await _client.mutation(
      'signLandPartnership',
      input: {
        'id': id,
        'signatureName': signatureName,
        'acceptTerms': true,
        if (signatureId != null && signatureId.isNotEmpty)
          'signatureId': signatureId,
      },
    );
  }

  Future<void> withdraw(int id) async {
    await _client.mutation('withdrawLandPartnership', input: {'id': id});
  }
}

final landPartnershipRepositoryProvider = Provider<LandPartnershipRepository>((
  ref,
) {
  return LandPartnershipRepository(ref.watch(trpcClientProvider));
});

final myLandPartnershipsProvider =
    FutureProvider.autoDispose<List<LandPartnership>>((ref) async {
      return ref.watch(landPartnershipRepositoryProvider).myPartnerships();
    });
