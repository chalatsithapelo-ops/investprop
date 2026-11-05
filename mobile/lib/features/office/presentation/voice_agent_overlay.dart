import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../config/theme.dart';
import '../data/voice_agent_repository.dart';

enum _VoiceState { idle, connecting, live, error }

/// Floating realtime voice-agent button, mounted app-wide. It appears for
/// signed-in, office-eligible members when the agent is configured on the
/// server. Pressing it opens a live LiveKit room, streams the member's mic and
/// plays the agent's audio. All office actions still run server-side under the
/// member's own token with the existing guard rails.
class VoiceAgentOverlay extends ConsumerStatefulWidget {
  const VoiceAgentOverlay({super.key});

  @override
  ConsumerState<VoiceAgentOverlay> createState() => _VoiceAgentOverlayState();
}

class _VoiceAgentOverlayState extends ConsumerState<VoiceAgentOverlay> {
  Room? _room;
  EventsListener<RoomEvent>? _listener;
  _VoiceState _state = _VoiceState.idle;
  String? _error;
  bool _agentSpeaking = false;

  @override
  void dispose() {
    unawaited(_teardown());
    super.dispose();
  }

  Future<void> _teardown() async {
    await _listener?.dispose();
    _listener = null;
    final room = _room;
    _room = null;
    if (room != null) {
      try {
        await room.disconnect();
      } catch (_) {
        /* already gone */
      }
      await room.dispose();
    }
    if (mounted) setState(() => _agentSpeaking = false);
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _state = _VoiceState.connecting;
    });

    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      setState(() {
        _error = 'Microphone permission is needed to talk to the office.';
        _state = _VoiceState.error;
      });
      return;
    }

    try {
      final session = await ref.read(voiceAgentRepositoryProvider).startSession();
      final room = Room(
        roomOptions: const RoomOptions(adaptiveStream: true, dynacast: true),
      );
      _room = room;
      final listener = room.createListener();
      _listener = listener;

      listener
        ..on<ActiveSpeakersChangedEvent>((event) {
          if (!mounted) return;
          setState(() {
            _agentSpeaking = event.speakers
                .any((speaker) => speaker.identity != session.identity);
          });
        })
        ..on<RoomDisconnectedEvent>((_) {
          if (!mounted) return;
          setState(() => _state = _VoiceState.idle);
          unawaited(_teardown());
        });

      await room.connect(
        session.url,
        session.token,
      );
      await room.localParticipant?.setMicrophoneEnabled(true);
      if (!mounted) return;
      setState(() => _state = _VoiceState.live);
    } catch (caught) {
      setState(() {
        _error = 'Could not start the voice session. Please try again.';
        _state = _VoiceState.error;
      });
      await _teardown();
    }
  }

  Future<void> _stop() async {
    setState(() => _state = _VoiceState.idle);
    await _teardown();
  }

  @override
  Widget build(BuildContext context) {
    final available = ref.watch(voiceAgentAvailableProvider).value ?? false;
    if (!available) return const SizedBox.shrink();

    final live = _state == _VoiceState.live;
    final connecting = _state == _VoiceState.connecting;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Positioned(
      right: 16,
      bottom: 96 + bottomInset,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (live || connecting || _state == _VoiceState.error)
            Container(
              width: 240,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 16,
                    offset: Offset(0, 6),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'AI Property Office',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    connecting
                        ? 'Connecting your voice session…'
                        : live
                            ? (_agentSpeaking ? 'Speaking…' : 'Listening…')
                            : (_error ?? 'Could not start voice'),
                    style: TextStyle(
                      fontSize: 12,
                      color: _state == _VoiceState.error
                          ? Colors.red.shade700
                          : Colors.black54,
                    ),
                  ),
                  if (live) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _agentSpeaking
                                ? Colors.green
                                : AppColors.gold,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Speak naturally — I can answer and prepare tasks.',
                            style: TextStyle(fontSize: 11, color: Colors.black54),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          FloatingActionButton(
            heroTag: 'office-voice-agent',
            backgroundColor: live ? Colors.red.shade600 : AppColors.navy,
            onPressed: connecting ? null : (live ? _stop : _start),
            child: connecting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : Icon(live ? Icons.call_end : Icons.mic, color: Colors.white),
          ),
        ],
      ),
    );
  }
}
