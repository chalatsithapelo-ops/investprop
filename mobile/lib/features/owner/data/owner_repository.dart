import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/sale_proposal.dart';

/// All fields for submitSaleProposal. Optional numeric fields are omitted from
/// the payload when null so the server defaults / cross-field validation apply.
class SaleProposalInput {
  const SaleProposalInput({
    required this.title,
    required this.description,
    required this.address,
    required this.city,
    required this.province,
    required this.propertyType,
    required this.askingPrice,
    required this.saleType,
    required this.urgencyLevel,
    required this.engagementType,
    required this.bondStatus,
    required this.ratesStatus,
    required this.tenancyStatus,
    required this.conditionRating,
    required this.popiaConsent,
    this.marketValue,
    this.reason,
    this.bedrooms,
    this.bathrooms,
    this.squareMeters,
    this.erfSize,
    this.titleDeedNumber,
    this.erfNumber,
    this.bondOutstanding,
    this.bondBank,
    this.ratesArrears,
    this.monthlyRent,
    this.leaseEndDate,
    this.estimatedRenoCost,
    this.coOwners,
    this.contactPhone,
    this.contactEmail,
    this.imageUrls = const [],
    this.documents = const [],
  });

  final String title;
  final String description;
  final String address;
  final String city;
  final String province;
  final String propertyType;
  final double askingPrice;
  final String saleType;
  final String urgencyLevel;
  final String engagementType;
  final String bondStatus;
  final String ratesStatus;
  final String tenancyStatus;
  final String conditionRating;
  final bool popiaConsent;
  final double? marketValue;
  final String? reason;
  final int? bedrooms;
  final int? bathrooms;
  final int? squareMeters;
  final double? erfSize;
  final String? titleDeedNumber;
  final String? erfNumber;
  final double? bondOutstanding;
  final String? bondBank;
  final double? ratesArrears;
  final double? monthlyRent;
  final String? leaseEndDate; // ISO date string
  final double? estimatedRenoCost;
  final String? coOwners;
  final String? contactPhone;
  final String? contactEmail;
  final List<String> imageUrls;
  final List<ProposalDocument> documents;

  Map<String, dynamic> toInput() => {
    'title': title,
    'description': description,
    'address': address,
    'city': city,
    'province': province,
    'propertyType': propertyType,
    'askingPrice': askingPrice,
    'saleType': saleType,
    'urgencyLevel': urgencyLevel,
    'engagementType': engagementType,
    'bondStatus': bondStatus,
    'ratesStatus': ratesStatus,
    'tenancyStatus': tenancyStatus,
    'conditionRating': conditionRating,
    'popiaConsent': popiaConsent,
    if (marketValue != null) 'marketValue': marketValue,
    if (reason != null && reason!.isNotEmpty) 'reason': reason,
    if (bedrooms != null) 'bedrooms': bedrooms,
    if (bathrooms != null) 'bathrooms': bathrooms,
    if (squareMeters != null) 'squareMeters': squareMeters,
    if (erfSize != null) 'erfSize': erfSize,
    if (titleDeedNumber != null && titleDeedNumber!.isNotEmpty)
      'titleDeedNumber': titleDeedNumber,
    if (erfNumber != null && erfNumber!.isNotEmpty) 'erfNumber': erfNumber,
    if (bondOutstanding != null) 'bondOutstanding': bondOutstanding,
    if (bondBank != null && bondBank!.isNotEmpty) 'bondBank': bondBank,
    if (ratesArrears != null) 'ratesArrears': ratesArrears,
    if (monthlyRent != null) 'monthlyRent': monthlyRent,
    if (leaseEndDate != null && leaseEndDate!.isNotEmpty)
      'leaseEndDate': leaseEndDate,
    if (estimatedRenoCost != null) 'estimatedRenoCost': estimatedRenoCost,
    if (coOwners != null && coOwners!.isNotEmpty) 'coOwners': coOwners,
    if (contactPhone != null && contactPhone!.isNotEmpty)
      'contactPhone': contactPhone,
    if (contactEmail != null && contactEmail!.isNotEmpty)
      'contactEmail': contactEmail,
    if (imageUrls.isNotEmpty) 'imageUrls': imageUrls,
    if (documents.isNotEmpty)
      'documentUrls': documents.map((d) => d.toJson()).toList(),
  };
}

class OwnerRepository {
  OwnerRepository(this._client);

  final TrpcClient _client;

  Future<List<SaleProposal>> myProposals() async {
    final data = await _client.query('getMySaleProposals');
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((e) => SaleProposal.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Uploads a file (base64, no data-URI prefix) and returns its public URL.
  Future<String> uploadFile({
    required String fileName,
    required String fileType,
    required String base64,
  }) async {
    final data = await _client.mutation(
      'uploadFile',
      input: {
        'fileName': fileName,
        'fileType': fileType,
        'fileBase64': base64,
      },
    );
    if (data is Map && data['publicUrl'] != null) {
      return data['publicUrl'].toString();
    }
    throw StateError('Upload failed. Please try again.');
  }

  Future<void> submit(SaleProposalInput input) async {
    await _client.mutation('submitSaleProposal', input: input.toInput());
  }

  Future<void> withdraw(int proposalId) async {
    await _client.mutation(
      'withdrawSaleProposal',
      input: {'proposalId': proposalId},
    );
  }

  Future<void> respondToCounterOffer({
    required int proposalId,
    required bool accept,
  }) async {
    await _client.mutation(
      'respondToCounterOffer',
      input: {
        'proposalId': proposalId,
        'action': accept ? 'ACCEPT' : 'REJECT',
      },
    );
  }
}

final ownerRepositoryProvider = Provider<OwnerRepository>((ref) {
  return OwnerRepository(ref.watch(trpcClientProvider));
});

final myProposalsProvider =
    FutureProvider.autoDispose<List<SaleProposal>>((ref) async {
  return ref.watch(ownerRepositoryProvider).myProposals();
});
