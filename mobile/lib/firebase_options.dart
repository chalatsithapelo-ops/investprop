import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Firebase configuration generated from `mobile/android/app/google-services.json`.
/// Regenerate with `flutterfire configure` if the Firebase project changes.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'Web push uses VAPID, not FirebaseOptions. Configure via the web app.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        throw UnsupportedError(
          'FirebaseOptions are not configured for $defaultTargetPlatform. '
          'Run `flutterfire configure` to add this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyB7ZzJUOgi1m-Q6e6VTREB7RlvR8j8VZlI',
    appId: '1:724990596103:android:662f67cdc471ed920186a2',
    messagingSenderId: '724990596103',
    projectId: 'investprop-a9271',
    storageBucket: 'investprop-a9271.firebasestorage.app',
  );
}
