import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:record/record.dart';

abstract class OfficeVoiceCapture {
  Future<bool> start({required void Function() onInterrupted});
  Future<Uint8List> stop();
  Future<void> cancel();
  Future<void> dispose();
}

// A factory keeps recorder ownership with the visible chat session and makes
// permission/lifecycle tests independent of native microphone hardware.
final officeVoiceCaptureFactoryProvider =
    Provider<OfficeVoiceCapture Function()>(
      (ref) =>
          () => RecordedOfficeVoiceCapture(),
    );

class RecordedOfficeVoiceCapture implements OfficeVoiceCapture {
  RecordedOfficeVoiceCapture({AudioRecorder? recorder}) : _recorder = recorder;

  AudioRecorder? _recorder;
  Directory? _directory;
  File? _file;
  StreamSubscription<RecordState>? _states;
  Timer? _limit;
  Future<void> _pending = Future.value();
  int _generation = 0;
  bool _disposed = false;

  // Serialize native operations: cancellation during a permission dialog or
  // recorder startup must finish cleaning up before another capture can start.
  Future<T> _run<T>(Future<T> Function() action) {
    final result = _pending.then((_) => action());
    _pending = result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  @override
  Future<bool> start({required void Function() onInterrupted}) {
    final generation = ++_generation;
    return _run(() async {
      if (_disposed || generation != _generation) return false;
      final recorder = _recorder ??= AudioRecorder();
      try {
        if (!await recorder.hasPermission()) return false;
        if (_disposed || generation != _generation) return false;
        if (!await recorder.isEncoderSupported(AudioEncoder.wav)) {
          throw StateError('WAV recording is unavailable. Use text chat.');
        }
        if (_disposed || generation != _generation) return false;
        _directory = await Directory.systemTemp.createTemp('office-voice-');
        _file = File('${_directory!.path}/turn.wav');
        if (_disposed || generation != _generation) {
          await _delete();
          return false;
        }
        await recorder.start(
          const RecordConfig(
            encoder: AudioEncoder.wav,
            sampleRate: 16000,
            numChannels: 1,
            // Never resume capture automatically after an audio interruption.
            audioInterruption: AudioInterruptionMode.pause,
          ),
          path: _file!.path,
        );
        if (_disposed || generation != _generation) {
          await _discard();
          return false;
        }
        _states = recorder.onStateChanged().listen((state) {
          if (state == RecordState.pause) onInterrupted();
        }, onError: (Object _) => onInterrupted());
        // A second, native-service-side guard also stops capture when UI work
        // is interrupted. 16 kHz mono PCM at 50 s is ~1.6 MiB, below 2 MiB.
        _limit = Timer(const Duration(seconds: 50), () {
          onInterrupted();
          unawaited(cancel());
        });
        return true;
      } catch (_) {
        await _discard();
        rethrow;
      }
    });
  }

  @override
  Future<Uint8List> stop() {
    final generation = _generation;
    return _run(() async {
      try {
        _limit?.cancel();
        await _states?.cancel();
        _states = null;
        if (_disposed || generation != _generation || _file == null) {
          throw StateError('Recording cancelled.');
        }
        await _recorder!.stop();
        final file = _file!;
        final size = await file.length();
        if (size <= 44 || size > 2 * 1024 * 1024) {
          throw StateError('Recording is empty or over 2 MiB. Use text.');
        }
        return await file.readAsBytes();
      } finally {
        await _discard();
      }
    });
  }

  Future<void> _delete() async {
    final directory = _directory;
    if (directory != null && await directory.exists()) {
      await directory.delete(recursive: true);
    }
    _directory = null;
    _file = null;
  }

  Future<void> _discard() async {
    _limit?.cancel();
    await _states?.cancel();
    _states = null;
    try {
      await _recorder?.cancel();
    } finally {
      await _delete();
    }
  }

  @override
  Future<void> cancel() {
    ++_generation;
    return _run(_discard);
  }

  @override
  Future<void> dispose() {
    _disposed = true;
    ++_generation;
    return _run(() async {
      try {
        await _discard();
      } finally {
        await _recorder?.dispose();
      }
    });
  }
}
