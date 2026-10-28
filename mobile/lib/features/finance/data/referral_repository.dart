import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';

/// A partner service an investor can request a warm introduction to.
/// Values must match the backend `partnerTypeEnum`.
enum PartnerType {
  bondOriginator('BOND_ORIGINATOR', 'Bond originator', 'Compare home-loan offers across the major banks'),
  conveyancer('CONVEYANCER', 'Conveyancer', 'Transfer & registration attorneys for your purchase'),
  auctionHouse('AUCTION_HOUSE', 'Auction house', 'Access distressed & on-auction property stock'),
  insurance('INSURANCE', 'Insurance', 'Buildings, homeowner and landlord cover'),
  other('OTHER', 'Other service', 'Tell us what you need and we will connect you');

  const PartnerType(this.wire, this.label, this.blurb);
  final String wire;
  final String label;
  final String blurb;
}

class ReferralRepository {
  ReferralRepository(this._client);

  final TrpcClient _client;

  /// Requests a warm introduction to an active partner of [type].
  Future<void> requestIntro({
    required PartnerType type,
    int? listingId,
    String? note,
  }) async {
    await _client.mutation(
      'requestReferralIntro',
      input: {
        'partnerType': type.wire,
        if (listingId != null) 'listingId': listingId,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
  }
}

final referralRepositoryProvider = Provider<ReferralRepository>((ref) {
  return ReferralRepository(ref.watch(trpcClientProvider));
});
