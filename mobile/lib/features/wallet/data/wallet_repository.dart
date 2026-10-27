import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/wallet_models.dart';

class WalletRepository {
  WalletRepository(this._client);

  final TrpcClient _client;

  Future<Wallet> myWallet() async {
    final data = await _client.query('getMyWallet', input: {});
    return Wallet.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<DepositInit> initiateDeposit({
    required double amountRands,
    String? callbackUrl,
  }) async {
    final data = await _client.mutation(
      'initiateWalletDeposit',
      input: {
        'amountRands': amountRands,
        if (callbackUrl != null) 'callbackUrl': callbackUrl,
      },
    );
    final map = data is Map ? Map<String, dynamic>.from(data) : const {};
    return DepositInit(
      authorizationUrl: (map['authorizationUrl'] ?? '').toString(),
      reference: (map['reference'] ?? '').toString(),
    );
  }

  /// Returns true once the deposit is confirmed and credited.
  Future<bool> verifyDeposit(String reference) async {
    final data = await _client.mutation(
      'verifyWalletDeposit',
      input: {'reference': reference},
    );
    return data is Map && data['confirmed'] == true;
  }

  Future<void> requestWithdrawal({
    required double amountRands,
    required String bankName,
    required String accountNumber,
    required String accountName,
    String? branchCode,
  }) async {
    await _client.mutation(
      'requestWithdrawal',
      input: {
        'amountRands': amountRands,
        'bankName': bankName,
        'accountNumber': accountNumber,
        'accountName': accountName,
        if (branchCode != null && branchCode.isNotEmpty)
          'branchCode': branchCode,
      },
    );
  }

  Future<List<MyWithdrawal>> myWithdrawals() async {
    final data = await _client.query('getMyWithdrawals', input: {});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => MyWithdrawal.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<List<PendingWithdrawal>> pendingWithdrawals() async {
    final data = await _client.query('getPendingWithdrawals', input: {});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => PendingWithdrawal.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> reviewWithdrawal({
    required int withdrawalId,
    required String action, // MARK_PAID | REJECT
    String? reviewNotes,
  }) async {
    await _client.mutation(
      'reviewWithdrawal',
      input: {
        'withdrawalId': withdrawalId,
        'action': action,
        if (reviewNotes != null && reviewNotes.isNotEmpty)
          'reviewNotes': reviewNotes,
      },
    );
  }
}

final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository(ref.watch(trpcClientProvider));
});

final myWalletProvider = FutureProvider.autoDispose<Wallet>((ref) async {
  return ref.watch(walletRepositoryProvider).myWallet();
});

final myWithdrawalsProvider = FutureProvider.autoDispose<List<MyWithdrawal>>((
  ref,
) async {
  return ref.watch(walletRepositoryProvider).myWithdrawals();
});

final pendingWithdrawalsProvider =
    FutureProvider.autoDispose<List<PendingWithdrawal>>((ref) async {
      return ref.watch(walletRepositoryProvider).pendingWithdrawals();
    });
