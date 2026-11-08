// Build identifier, stamped by scripts/build-mobile.ps1 at build time.
// Format: yyyyMMdd-HHmm in SAST (e.g. 20261106-1230). Shows 'dev' when built
// without the script. The build script also uses this exact string as its APK
// verify marker, so the value shown in the app matches the installed binary.
const String kBuildId = '20261108-1114';
