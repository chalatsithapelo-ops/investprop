/// Build identifier, stamped by scripts/build-mobile.ps1 at build time.
///
/// Format: `yyyyMMdd-HHmm` in SAST (e.g. `20261106-1230`). Shows `dev` when the
/// app is built without the script (plain `flutter build`/`flutter run`). The
/// build script also uses this exact string as its APK verify marker, so the
/// value shown in the app is guaranteed to match the installed binary.
const String kBuildId = 'dev';
