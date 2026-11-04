import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:investprop_mobile/core/api/trpc_client.dart';
import 'package:investprop_mobile/core/storage/token_storage.dart';
import 'package:investprop_mobile/features/office/data/office_repository.dart';
import 'package:investprop_mobile/features/office/data/office_voice_capture.dart';
import 'package:investprop_mobile/features/office/domain/office_models.dart';
import 'package:investprop_mobile/features/office/presentation/office_chat_tab.dart';
import 'package:record/record.dart';

import 'office_test.dart' show overviewJson;

Uint8List wavBytes() {
  final bytes = Uint8List(76);
  bytes.setRange(0, 4, ascii.encode('RIFF'));
  bytes.setRange(8, 12, ascii.encode('WAVE'));
  bytes.setRange(12, 16, ascii.encode('fmt '));
  final data = ByteData.sublistView(bytes);
  data.setUint32(4, 68, Endian.little);
  data.setUint32(16, 16, Endian.little);
  data.setUint16(20, 1, Endian.little);
  data.setUint16(22, 1, Endian.little);
  data.setUint32(24, 16000, Endian.little);
  data.setUint32(28, 32000, Endian.little);
  data.setUint16(32, 2, Endian.little);
  data.setUint16(34, 16, Endian.little);
  bytes.setRange(36, 40, ascii.encode('data'));
  data.setUint32(40, 32, Endian.little);
  return bytes;
}

class _Storage extends TokenStorage {}

class _Client extends TrpcClient {
  _Client() : super(_Storage());
  final calls = <({String name, Map<String, dynamic>? input, bool auth})>[];
  Object? failure;
  Completer<dynamic>? delayed;

  @override
  Future<dynamic> mutation(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) async {
    calls.add((name: procedure, input: input, auth: authenticated));
    if (failure != null) throw failure!;
    if (delayed != null) return delayed!.future;
    return reply();
  }

  Map<String, dynamic> reply() => {
    'conversationId': 'voice-conversation',
    'transcript': 'Explain my paid income',
    'message': {
      'id': 'voice-answer',
      'role': 'assistant',
      'content': 'Your paid income is supported by the ledger.',
      'evidence': [],
    },
    'speechError':
        'Spoken playback unavailable; your answer is available as text.',
  };
}

class _Capture implements OfficeVoiceCapture {
  int starts = 0, stops = 0, cancels = 0, disposals = 0;
  bool permission = true;
  bool stopFails = false;
  Completer<bool>? permissionResult;
  void Function()? interrupt;

  @override
  Future<bool> start({required void Function() onInterrupted}) async {
    starts++;
    interrupt = onInterrupted;
    return permissionResult?.future ?? permission;
  }

  @override
  Future<Uint8List> stop() async {
    stops++;
    if (stopFails) throw StateError('Recorder unavailable');
    return wavBytes();
  }

  @override
  Future<void> cancel() async {
    cancels++;
  }

  @override
  Future<void> dispose() async {
    disposals++;
  }
}

// Test the real file-owning capture service using an injectable recorder, not
// microphone hardware. Also verifies selected WAV config and cleanup failures.
class _Recorder implements AudioRecorder {
  String? path;
  RecordConfig? config;
  bool failStart = false, failStop = false;
  int starts = 0, cancellations = 0, disposals = 0;
  Completer<bool>? permission;

  @override
  Future<bool> hasPermission() async => permission?.future ?? true;
  @override
  Future<bool> isEncoderSupported(AudioEncoder encoder) async => true;
  @override
  Future<void> start(RecordConfig config, {required String path}) async {
    starts++;
    this.path = path;
    this.config = config;
    await File(path).writeAsBytes(wavBytes());
    if (failStart) throw StateError('Start failed after creating file');
  }

  @override
  Stream<RecordState> onStateChanged() => const Stream.empty();
  @override
  Future<String?> stop() async {
    if (failStop) throw StateError('Stop failed');
    return path;
  }

  @override
  Future<void> cancel() async {
    cancellations++;
  }

  @override
  Future<void> dispose() async {
    disposals++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _mountChat(
  WidgetTester tester,
  _Client client,
  _Capture capture, {
  bool voice = true,
  bool tabbed = false,
}) async {
  final json = overviewJson();
  json['capabilities']['voice'] = voice;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        officeRepositoryProvider.overrideWith(
          (ref) => OfficeRepository(client),
        ),
        officeOverviewProvider.overrideWith(
          (ref) async => OfficeOverview.fromJson(json),
        ),
        officeConversationsProvider.overrideWith((ref) async => []),
        officeVoiceCaptureFactoryProvider.overrideWithValue(() => capture),
      ],
      child: MaterialApp(
        home: tabbed
            ? DefaultTabController(
                length: 3,
                initialIndex: 1,
                child: Scaffold(
                  appBar: AppBar(
                    bottom: const TabBar(
                      tabs: [
                        Tab(text: 'Overview'),
                        Tab(text: 'Chat'),
                        Tab(text: 'Tasks'),
                      ],
                    ),
                  ),
                  body: const TabBarView(
                    children: [SizedBox(), OfficeChatTab(), SizedBox()],
                  ),
                ),
              )
            : const Scaffold(body: OfficeChatTab()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
}

final consent = find.byKey(const ValueKey('office-voice-consent'));
final record = find.byKey(const ValueKey('office-voice-record'));

void main() {
  test(
    'Voice wire contract is authenticated, exact and never calls tasks',
    () async {
      final client = _Client();
      final repo = OfficeRepository(client);
      for (final persona in OfficePersona.values) {
        final result = await repo.voiceTurn(
          persona: persona,
          speechConsent: true,
          wav: wavBytes(),
        );
        expect(client.calls.last.name, 'officeVoiceTurn');
        expect(client.calls.last.auth, true);
        expect(client.calls.last.input, <String, dynamic>{
          'persona': persona.wire,
          'speechConsent': true,
          'audioBase64': base64Encode(wavBytes()),
          'mimeType': 'audio/wav',
        });
        expect(result.transcript, 'Explain my paid income');
        expect(result.message.content, contains('supported by the ledger'));
        expect(result.speechError, contains('available as text'));
      }
      await repo.voiceTurn(
        conversationId: 'existing',
        persona: OfficePersona.tax,
        speechConsent: true,
        wav: wavBytes(),
      );
      expect(client.calls.last.input?['conversationId'], 'existing');
      expect(
        client.calls.every((call) => call.name == 'officeVoiceTurn'),
        isTrue,
      );
      final json = client.reply()..remove('speechError');
      json['audioBase64'] = 'optional playback';
      json['audioMimeType'] = 'audio/mpeg';
      expect(OfficeVoiceReply.fromJson(json).message.content, isNotEmpty);
    },
  );

  test(
    'Repository fails closed on missing consent, invalid magic and size',
    () async {
      final client = _Client();
      final repo = OfficeRepository(client);
      await expectLater(
        repo.voiceTurn(
          persona: OfficePersona.admin,
          speechConsent: false,
          wav: wavBytes(),
        ),
        throwsStateError,
      );
      for (final bytes in [
        Uint8List(0),
        Uint8List(80),
        Uint8List(2 * 1024 * 1024 + 1),
      ]) {
        await expectLater(
          repo.voiceTurn(
            persona: OfficePersona.admin,
            speechConsent: true,
            wav: bytes,
          ),
          throwsFormatException,
        );
      }
      expect(client.calls, isEmpty);
    },
  );

  test(
    'Real capture deletes WAV on success, cancel, dispose and native errors',
    () async {
      for (final mode in [
        'success',
        'cancel',
        'dispose',
        'startError',
        'stopError',
        'oversize',
      ]) {
        final recorder = _Recorder()
          ..failStart = mode == 'startError'
          ..failStop = mode == 'stopError';
        final capture = RecordedOfficeVoiceCapture(recorder: recorder);
        if (mode == 'startError') {
          await expectLater(
            capture.start(onInterrupted: () {}),
            throwsStateError,
          );
        } else {
          expect(await capture.start(onInterrupted: () {}), isTrue);
          expect(recorder.config!.encoder, AudioEncoder.wav);
          expect(recorder.config!.sampleRate, 16000);
          expect(recorder.config!.numChannels, 1);
          if (mode == 'oversize') {
            await File(
              recorder.path!,
            ).writeAsBytes(Uint8List(2 * 1024 * 1024 + 1));
          }
          switch (mode) {
            case 'success':
              expect(await capture.stop(), wavBytes());
            case 'cancel':
              await capture.cancel();
            case 'dispose':
              await capture.dispose();
            default:
              await expectLater(capture.stop(), throwsStateError);
          }
        }
        expect(await File(recorder.path!).exists(), isFalse, reason: mode);
        expect(
          await File(recorder.path!).parent.exists(),
          isFalse,
          reason: mode,
        );
        if (mode != 'dispose') await capture.dispose();
        expect(recorder.disposals, 1);
      }
    },
  );

  test(
    'Cancel during permission request prevents native capture from starting',
    () async {
      final permission = Completer<bool>();
      final recorder = _Recorder()..permission = permission;
      final capture = RecordedOfficeVoiceCapture(recorder: recorder);
      final start = capture.start(onInterrupted: () {});
      await Future<void>.delayed(Duration.zero);
      final cancel = capture.cancel();
      permission.complete(true);
      expect(await start, isFalse);
      await cancel;
      expect(recorder.starts, 0);
      await capture.dispose();
    },
  );

  testWidgets('No permission prompt without explicit consent or capability', (
    tester,
  ) async {
    final client = _Client();
    final capture = _Capture();
    await _mountChat(tester, client, capture);
    expect(tester.widget<OutlinedButton>(record).onPressed, isNull);
    expect(capture.starts, 0);
    expect(tester.widget<CheckboxListTile>(consent).value, isFalse);
    expect(find.textContaining('OpenAI, a third-party'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await _mountChat(tester, client, capture, voice: false);
    expect(tester.widget<CheckboxListTile>(consent).onChanged, isNull);
    expect(tester.widget<OutlinedButton>(record).onPressed, isNull);
    expect(capture.starts, 0);
    expect(client.calls, isEmpty);
  });

  testWidgets('Permission denial is graceful and preserves the text draft', (
    tester,
  ) async {
    final client = _Client();
    final capture = _Capture()..permission = false;
    await _mountChat(tester, client, capture);
    await tester.enterText(find.byType(TextField), 'Keep this draft');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tapVisible(tester, consent);
    await tapVisible(tester, record);
    expect(
      find.textContaining('Microphone permission was denied'),
      findsOneWidget,
    );
    expect(find.text('Keep this draft'), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(consent).value, isFalse);
    expect(client.calls, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'Voice appends transcript and answer, retains draft on synthesis failure',
    (tester) async {
      final client = _Client();
      final capture = _Capture();
      await _mountChat(tester, client, capture);
      await tester.enterText(find.byType(TextField), 'Keep this draft');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tapVisible(tester, consent);
      await tapVisible(tester, record);
      expect(capture.starts, 1);
      await tapVisible(tester, find.text('Stop & send voice'));
      expect(capture.stops, 1);
      expect(client.calls.single.name, 'officeVoiceTurn');
      expect(
        find.text('Voice transcript: Explain my paid income'),
        findsOneWidget,
      );
      expect(
        find.text('Your paid income is supported by the ledger.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Spoken playback unavailable'),
        findsOneWidget,
      );
      expect(find.text('Keep this draft'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      expect(capture.disposals, 1);
    },
  );

  for (final action in [
    'cancel',
    'consent',
    'background',
    'interrupt',
    'timeout',
    'tab',
    'dispose',
  ]) {
    testWidgets('$action discards capture, resets consent and never sends', (
      tester,
    ) async {
      final client = _Client();
      final capture = _Capture();
      await _mountChat(tester, client, capture, tabbed: action == 'tab');
      await tapVisible(tester, consent);
      await tapVisible(tester, record);
      switch (action) {
        case 'cancel':
          await tapVisible(tester, find.text('Cancel voice'));
        case 'consent':
          await tapVisible(tester, consent);
        case 'background':
          for (final state in const [
            AppLifecycleState.inactive,
            AppLifecycleState.hidden,
            AppLifecycleState.paused,
          ]) {
            tester.binding.handleAppLifecycleStateChanged(state);
          }
          await tester.pumpAndSettle();
          for (final state in const [
            AppLifecycleState.hidden,
            AppLifecycleState.inactive,
            AppLifecycleState.resumed,
          ]) {
            tester.binding.handleAppLifecycleStateChanged(state);
          }
        case 'interrupt':
          capture.interrupt!();
          await tester.pumpAndSettle();
        case 'timeout':
          await tester.pump(const Duration(seconds: 50));
          await tester.pumpAndSettle();
        case 'tab':
          await tester.tap(find.text('Overview'));
          await tester.pumpAndSettle();
        case 'dispose':
          await tester.pumpWidget(const SizedBox());
      }
      expect(client.calls, isEmpty);
      if (action == 'dispose') {
        expect(capture.disposals, 1);
      } else {
        expect(capture.cancels, greaterThan(0));
        if (action != 'tab') {
          expect(tester.widget<CheckboxListTile>(consent).value, isFalse);
        }
        await tester.pumpWidget(const SizedBox());
      }
    });
  }

  for (final nativeFailure in [true, false]) {
    testWidgets(
      'Voice ${nativeFailure ? 'capture' : 'transport'} failure preserves draft and text sending',
      (tester) async {
        final client = _Client();
        if (!nativeFailure) client.failure = StateError('Provider disabled');
        final capture = _Capture()..stopFails = nativeFailure;
        await _mountChat(tester, client, capture);
        await tester.enterText(find.byType(TextField), 'Keep this draft');
        FocusManager.instance.primaryFocus?.unfocus();
        await tester.pumpAndSettle();
        await tapVisible(tester, consent);
        await tapVisible(tester, record);
        await tapVisible(tester, find.text('Stop & send voice'));
        expect(find.text('Keep this draft'), findsOneWidget);
        expect(find.textContaining('Voice turn not confirmed'), findsOneWidget);
        final send = find.ancestor(
          of: find.text('Send to Accountant'),
          matching: find.byWidgetPredicate((w) => w is FilledButton),
        );
        expect(tester.widget<FilledButton>(send).onPressed, isNotNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'Cancel pending server response does not append stale messages or execute tasks',
    (tester) async {
      final client = _Client()..delayed = Completer<dynamic>();
      final capture = _Capture();
      await _mountChat(tester, client, capture);
      await tapVisible(tester, consent);
      await tapVisible(tester, record);
      await tapVisible(tester, find.text('Stop & send voice'));
      await tapVisible(tester, find.text('Cancel voice'));
      client.delayed!.complete(client.reply());
      await tester.pumpAndSettle();
      expect(
        find.text('Voice transcript: Explain my paid income'),
        findsNothing,
      );
      expect(client.calls.single.name, 'officeVoiceTurn');
      await tester.pumpWidget(const SizedBox());
    },
  );
}
