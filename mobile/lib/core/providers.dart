import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/trpc_client.dart';
import 'storage/token_storage.dart';

/// Secure token storage (single instance for the app lifetime).
final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

/// The tRPC HTTP client used by every repository.
final trpcClientProvider = Provider<TrpcClient>((ref) {
  return TrpcClient(ref.watch(tokenStorageProvider));
});
