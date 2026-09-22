import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/proposal.dart';

class GovernanceRepository {
  GovernanceRepository(this._client);

  final TrpcClient _client;

  Future<List<Proposal>> proposals({String? status, int? myInvestorId}) async {
    final data = await _client.query(
      'getProposals',
      input: {if (status != null) 'status': status},
    );
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => Proposal.fromJson(
              Map<String, dynamic>.from(e),
              myInvestorId: myInvestorId,
            ))
        .toList();
  }

  Future<void> castVote({required int proposalId, required String choice}) async {
    await _client.mutation(
      'castVote',
      input: {'proposalId': proposalId, 'voteChoice': choice},
    );
  }
}

final governanceRepositoryProvider = Provider<GovernanceRepository>((ref) {
  return GovernanceRepository(ref.watch(trpcClientProvider));
});

/// All proposals for properties, tagged with the signed-in investor's vote.
final proposalsProvider =
    FutureProvider.autoDispose<List<Proposal>>((ref) async {
  final userId = ref.watch(authControllerProvider).user?.id;
  return ref.watch(governanceRepositoryProvider).proposals(myInvestorId: userId);
});
