/// Runtime configuration. The API base URL defaults to production but can be
/// overridden at build/run time for local development, e.g.:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
///
/// (10.0.2.2 is the host machine as seen from the Android emulator.)
class Env {
  const Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://investprop.io',
  );

  /// Base path for all tRPC procedure calls.
  static String get trpcBaseUrl => '$apiBaseUrl/trpc';
}
