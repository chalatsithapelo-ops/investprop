import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../config/theme.dart';
import '../../../routing/app_router.dart';
import '../data/voice_agent_repository.dart';

enum _VoiceState { idle, connecting, live, error }

/// Maps the agent's canonical page names (see NAV_PAGES in the worker) to the
/// mobile app's go_router paths. `$id` is substituted for id-scoped screens.
/// Keep in sync with the web overlay's WEB_NAV map.
String? _navPath(String page, int? id) {
  final i = id?.toString() ?? '';
  switch (page) {
    case 'dashboard':
      return '/';
    case 'opportunities':
      return '/opportunities';
    case 'property':
      return id == null ? null : '/opportunities/$i';
    case 'invest':
      return id == null ? null : '/opportunities/$i/invest';
    case 'portfolio':
      return '/portfolio';
    case 'wallet':
    case 'deposit':
    case 'transactions':
      return '/portfolio/wallet';
    case 'withdraw':
      return '/portfolio/wallet/withdraw';
    case 'distributions':
      return '/portfolio/distributions';
    case 'contributions':
      return '/portfolio/contributions';
    case 'payments':
      return '/portfolio/payments';
    case 'marketplace':
      return '/portfolio/marketplace';
    case 'ledger':
      return '/portfolio/ledger';
    case 'shareIntegrity':
      return '/portfolio/share-integrity';
    case 'metrics':
      return '/portfolio/metrics';
    case 'documents':
      return '/profile/documents';
    case 'taxCertificates':
      return '/profile/tax-certificates';
    case 'certificates':
      return '/profile/certificates';
    case 'statements':
      return '/profile/statement';
    case 'trackRecord':
      return '/profile/track-record';
    case 'kyc':
      return '/profile/kyc';
    case 'distressedDeals':
    case 'distressedFinder':
      return '/profile/distressed';
    case 'distressedAlerts':
      return '/profile/deal-alerts';
    case 'landPartnership':
      return '/land-partnership';
    case 'resaleMarket':
      return '/resale-market';
    case 'saleProposals':
      return '/portfolio';
    case 'subscription':
    case 'pricing':
      return '/profile/subscription';
    case 'preferences':
      return '/profile/preferences';
    case 'prequalify':
      return '/profile/prequalify';
    case 'homeLoan':
      return '/profile/home-loan';
    case 'services':
      return '/profile/services';
    case 'notifications':
      return '/notifications';
    case 'profile':
      return '/profile';
    case 'aiOffice':
      return '/ai-office';
    default:
      return null;
  }
}


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

class _VoiceAgentOverlayState extends ConsumerState<VoiceAgentOverlay>
    with SingleTickerProviderStateMixin {
  Room? _room;
  EventsListener<RoomEvent>? _listener;
  _VoiceState _state = _VoiceState.idle;
  String? _error;
  bool _agentSpeaking = false;
  late final AnimationController _bars;

  @override
  void initState() {
    super.initState();
    _bars = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void dispose() {
    _bars.dispose();
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
        ..on<DataReceivedEvent>((event) {
          _handleData(event);
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

  /// The agent drives the member's screen by sending UI-control packets over
  /// the room data channel. Parse a navigate packet and route to the page.
  void _handleData(DataReceivedEvent event) {
    if (!mounted) return;
    final topic = event.topic;
    if (topic != null && topic.isNotEmpty && topic != 'office-agent-ui') return;
    try {
      final decoded = jsonDecode(utf8.decode(event.data));
      if (decoded is! Map) return;
      if (decoded['type'] != 'navigate') return;
      final page = decoded['page'];
      if (page is! String) return;
      final rawId = decoded['id'];
      final id = rawId is int
          ? rawId
          : (rawId is num ? rawId.toInt() : int.tryParse('${rawId ?? ''}'));
      final path = _navPath(page, id);
      if (path == null) return;
      // Use the router instance directly: this overlay is mounted in
      // MaterialApp.router's builder (above the router scope), so
      // GoRouter.of(context) is not reliably available here.
      ref.read(routerProvider).go(path);
    } catch (_) {
      /* ignore malformed packets */
    }
  }

  @override
  Widget build(BuildContext context) {
    final available = ref.watch(voiceAgentAvailableProvider).value ?? false;
    if (!available) return const SizedBox.shrink();

    final live = _state == _VoiceState.live;
    final connecting = _state == _VoiceState.connecting;
    final isError = _state == _VoiceState.error;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    final accent = _agentSpeaking ? AppColors.success : AppColors.gold;
    final statusText = connecting
        ? 'Connecting…'
        : live
            ? (_agentSpeaking ? 'Speaking' : 'Listening')
            : (_error ?? 'Could not start voice');

    return Positioned(
      right: 16,
      bottom: 96 + bottomInset,
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
          if (live || connecting || isError)
            Container(
              width: 264,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.border),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x1A0B2545),
                    blurRadius: 24,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: isError
                              ? AppColors.danger.withValues(alpha: 0.10)
                              : accent.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          isError ? Icons.error_outline : Icons.graphic_eq,
                          size: 20,
                          color: isError ? AppColors.danger : accent,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text(
                              'AI Property Office',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              statusText,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: isError
                                    ? AppColors.danger
                                    : AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (live) _Equalizer(animation: _bars, color: accent),
                    ],
                  ),
                  if (live) ...[
                    const SizedBox(height: 12),
                    const Text(
                      'Speak naturally — ask about any listing, your portfolio, tax or payments.',
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.35,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          FloatingActionButton(
            heroTag: 'office-voice-agent',
            backgroundColor: live ? AppColors.danger : AppColors.gold,
            foregroundColor: Colors.white,
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
      ),
    );
  }
}

/// Four-bar audio equalizer that animates while the session is live.
class _Equalizer extends StatelessWidget {
  const _Equalizer({required this.animation, required this.color});

  final Animation<double> animation;
  final Color color;

  @override
  Widget build(BuildContext context) {
    const phases = [0.0, 0.25, 0.5, 0.75];
    return SizedBox(
      width: 26,
      height: 22,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: phases.map((phase) {
              final t = (animation.value + phase) % 1.0;
              final scale = 0.35 + 0.65 * (0.5 - (t - 0.5).abs()) * 2;
              return Container(
                width: 4,
                height: 20 * scale,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(2),
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}
