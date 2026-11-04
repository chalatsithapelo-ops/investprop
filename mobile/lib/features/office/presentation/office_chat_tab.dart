import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../data/office_repository.dart';
import '../data/office_voice_capture.dart';
import '../domain/office_models.dart';
import 'office_page.dart';

class OfficeChatTab extends ConsumerStatefulWidget {
  const OfficeChatTab({super.key});

  @override
  ConsumerState<OfficeChatTab> createState() => _OfficeChatTabState();
}

class _OfficeChatTabState extends ConsumerState<OfficeChatTab>
    with WidgetsBindingObserver {
  final _draft = TextEditingController();
  OfficePersona _persona = OfficePersona.accountant;
  String? _conversationId;
  String? _error;
  String _title = 'New conversation';
  final List<OfficeMessage> _messages = [];
  bool _busy = false;
  bool _speechConsent = false;
  bool _recording = false;
  bool _voiceActive = false;
  bool _foreground = true;
  int _voiceGeneration = 0;
  Timer? _voiceLimit;
  OfficeVoiceCapture? _capture;
  TabController? _tabs;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final state = WidgetsBinding.instance.lifecycleState;
    _foreground = state == null || state == AppLifecycleState.resumed;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final tabs = DefaultTabController.maybeOf(context);
    if (tabs != _tabs) {
      _tabs?.removeListener(_tabChanged);
      _tabs = tabs;
      _tabs?.addListener(_tabChanged);
    }
  }

  void _tabChanged() {
    if (_tabs?.index != 1 && (_voiceActive || _speechConsent)) {
      _cancelVoice('Voice session ended when leaving Chat.');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground && (_voiceActive || _speechConsent)) {
      _cancelVoice('Voice session cancelled when the app left the foreground.');
    }
  }

  Future<void> _cleanup(Future<void> cleanup) async {
    try {
      await cleanup;
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Microphone cleanup failed. Close the office before recording again.',
        );
      }
    }
  }

  void _cancelVoice(String notice) {
    ++_voiceGeneration;
    _voiceLimit?.cancel();
    if (_capture != null) unawaited(_cleanup(_capture!.cancel()));
    if (!mounted) return;
    setState(() {
      if (_voiceActive) _busy = false;
      _voiceActive = false;
      _recording = false;
      _speechConsent = false;
      _error = notice;
    });
  }

  bool get _voiceAllowed =>
      _foreground &&
      _speechConsent &&
      (_tabs == null || _tabs!.index == 1) &&
      ref.read(officeOverviewProvider).asData?.value.voice == true;

  Future<void> _startVoice() async {
    if (_busy || !_voiceAllowed) return;
    final generation = ++_voiceGeneration;
    final capture = _capture ??= ref.read(officeVoiceCaptureFactoryProvider)();
    setState(() {
      _busy = true;
      _voiceActive = true;
      _error = null;
    });
    try {
      final granted = await capture.start(
        onInterrupted: () {
          if (mounted && generation == _voiceGeneration) {
            _cancelVoice(
              'Recording interrupted or reached 50 seconds; discarded. Use text or record a shorter question.',
            );
          }
        },
      );
      if (!mounted || generation != _voiceGeneration) return;
      if (!granted || !_voiceAllowed) {
        _cancelVoice(
          'Microphone permission was denied or recording was cancelled. Enable microphone access in Settings, or use text chat.',
        );
        return;
      }
      setState(() => _recording = true);
      _voiceLimit = Timer(const Duration(seconds: 50), () {
        if (mounted) {
          _cancelVoice(
            '50-second recording limit reached. Recording discarded; try a shorter question.',
          );
        }
      });
    } catch (_) {
      if (mounted && generation == _voiceGeneration) {
        _cancelVoice(
          'Recording unavailable. Your text draft is preserved; use text chat.',
        );
      }
    }
  }

  Future<void> _sendVoice() async {
    if (!_recording || !_voiceAllowed) return;
    final generation = _voiceGeneration;
    final repository = ref.read(officeRepositoryProvider);
    final persona = _persona;
    final conversationId = _conversationId;
    _voiceLimit?.cancel();
    setState(() => _recording = false);
    try {
      // stop() deletes the local file before any network request starts.
      final wav = await _capture!.stop();
      if (!mounted || generation != _voiceGeneration || !_voiceAllowed) return;
      final reply = await repository.voiceTurn(
        conversationId: conversationId,
        persona: persona,
        speechConsent: _speechConsent,
        wav: wav,
      );
      if (!mounted) return;
      ref.invalidate(officeConversationsProvider);
      if (generation != _voiceGeneration) return;
      setState(() {
        _conversationId = reply.conversationId;
        _messages.add(
          OfficeMessage.fromJson({
            'id': 'voice-${DateTime.now().microsecondsSinceEpoch}',
            'role': 'user',
            'content': 'Voice transcript: ${reply.transcript}',
            'createdAt': DateTime.now(),
          }),
        );
        _messages.add(reply.message);
        _error =
            reply.speechError ??
            'Voice answer shown as text. Audio playback is not enabled on this device.';
      });
    } catch (_) {
      if (mounted && generation == _voiceGeneration) {
        setState(
          () => _error =
              'Voice turn not confirmed. Your text draft is preserved. Check saved history before retrying; use text if speech is unavailable.',
        );
      }
    } finally {
      if (mounted && generation == _voiceGeneration) {
        setState(() {
          _busy = false;
          _voiceActive = false;
        });
      }
    }
  }

  @override
  void dispose() {
    ++_voiceGeneration;
    _voiceLimit?.cancel();
    _tabs?.removeListener(_tabChanged);
    WidgetsBinding.instance.removeObserver(this);
    if (_capture != null) unawaited(_cleanup(_capture!.dispose()));
    _draft.dispose();
    super.dispose();
  }

  Future<void> _load(OfficeConversation conversation) async {
    if (_busy) return;
    final repository = ref.read(officeRepositoryProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final detail = await repository.conversation(conversation.id);
      if (!mounted) return;
      setState(() {
        _conversationId = detail.id;
        _title = detail.title;
        _messages
          ..clear()
          ..addAll(detail.messages);
      });
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    final message = _draft.text.trim();
    if (_busy ||
        message.isEmpty ||
        ref.read(officeOverviewProvider).asData?.value.textAI != true) {
      return;
    }
    final repository = ref.read(officeRepositoryProvider);
    final persona = _persona;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final reply = await repository.chat(
        conversationId: _conversationId,
        message: message,
        persona: persona,
      );
      if (!mounted) return;
      setState(() {
        _conversationId = reply.conversationId;
        _messages.add(
          OfficeMessage.fromJson({
            'id': 'local-${DateTime.now().microsecondsSinceEpoch}',
            'role': 'user',
            'content': message,
            'evidence': null,
            'createdAt': DateTime.now(),
          }),
        );
        _messages.add(reply.message);
        _draft.clear();
      });
      ref.invalidate(officeConversationsProvider);
    } catch (error) {
      // Keep the draft; do not present transport failures as AI responses.
      if (mounted) {
        setState(
          () => _error =
              'Message not confirmed. $error\nYour draft is preserved. Check saved history before retrying to avoid duplicates.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(officeOverviewProvider);
    ref.listen(officeOverviewProvider, (previous, next) {
      if (next.asData?.value.voice != true &&
          (_voiceActive || _speechConsent)) {
        _cancelVoice('Voice is unavailable. Use text chat.');
      }
    });
    final history = ref.watch(officeConversationsProvider);
    final textEnabled = overview.asData?.value.textAI == true;
    final voiceEnabled = overview.asData?.value.voice == true;
    return OfficeContent(
      children: [
        OfficeSection(
          title: 'Choose your research mode',
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final persona in OfficePersona.values)
                  ChoiceChip(
                    label: Text(persona.label),
                    selected: _persona == persona,
                    onSelected: _busy
                        ? null
                        : (_) => setState(() => _persona = persona),
                  ),
              ],
            ),
            OfficeNotice(_persona.description),
            const Text(
              'AI research only — not a licensed professional. No financial or legal execution.',
            ),
            if (!textEnabled)
              const OfficeNotice(
                'Text AI is unavailable or capabilities have not loaded. Sending is disabled.',
              ),
            if (overview.hasError)
              OutlinedButton(
                onPressed: () => ref.invalidate(officeOverviewProvider),
                child: const Text('Retry capabilities'),
              ),
            CheckboxListTile(
              key: const ValueKey('office-voice-consent'),
              contentPadding: EdgeInsets.zero,
              value: _speechConsent,
              onChanged: !voiceEnabled || (_busy && !_voiceActive)
                  ? null
                  : (value) {
                      if (value != true) {
                        _cancelVoice(
                          'Voice consent withdrawn; recording discarded.',
                        );
                      } else {
                        setState(() => _speechConsent = true);
                      }
                    },
              title: const Text('Allow recorded voice for this session'),
              subtitle: const Text(
                'Your recording and answer text are sent to OpenAI, a third-party processor, for transcription and speech. The server does not retain raw recordings. Local temporary audio is deleted; transcript and answer remain in saved history. Voice cannot execute tasks. Maximum 50 seconds / 2 MiB. Consent resets when leaving Chat or backgrounding the app.',
              ),
            ),
            if (!voiceEnabled)
              const OfficeNotice(
                'Voice is unavailable or capabilities have not loaded. Text chat remains available when enabled.',
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  key: const ValueKey('office-voice-record'),
                  onPressed: !voiceEnabled || !_speechConsent || _busy
                      ? null
                      : _startVoice,
                  icon: const Icon(Icons.mic_outlined),
                  label: const Text('Record question'),
                ),
                if (_recording)
                  FilledButton.icon(
                    onPressed: _sendVoice,
                    icon: const Icon(Icons.stop),
                    label: const Text('Stop & send voice'),
                  ),
                if (_voiceActive)
                  TextButton(
                    onPressed: () => _cancelVoice(
                      'Recording cancelled. If already sent, check saved history; server processing cannot be recalled.',
                    ),
                    child: const Text('Cancel voice'),
                  ),
              ],
            ),
            if (_recording)
              const OfficeNotice(
                'Microphone recording — stop and send before 50 seconds, or cancel to discard.',
              ),
          ],
        ),
        OfficeSection(
          title: 'Saved conversations',
          children: [
            history.when(
              loading: () => const LinearProgressIndicator(),
              error: (error, _) => OfficeError(
                error: error,
                onRetry: () => ref.invalidate(officeConversationsProvider),
              ),
              data: (items) => items.isEmpty
                  ? const Text('No saved conversations yet.')
                  : ExpansionTile(
                      title: const Text('Open conversation history'),
                      children: [
                        for (final item in items)
                          ListTile(
                            title: Text(item.title),
                            subtitle: Text(
                              Fmt.dateTime(item.createdAt?.toLocal()),
                            ),
                            selected: item.id == _conversationId,
                            enabled: !_busy,
                            onTap: () => _load(item),
                          ),
                      ],
                    ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                        _conversationId = null;
                        _title = 'New conversation';
                        _messages.clear();
                        _error = null;
                        _speechConsent = false;
                      }),
                icon: const Icon(Icons.add_comment_outlined),
                label: const Text('New conversation'),
              ),
            ),
          ],
        ),
        OfficeSection(
          title: _title,
          children: [
            if (_messages.isEmpty)
              const OfficeNotice(
                'Ask about your holdings, paid income, missing evidence or owner paperwork. Avoid sharing passwords or unnecessary sensitive information.',
              ),
            for (final message in _messages) _MessageCard(message),
            if (_busy && !_recording)
              Semantics(
                liveRegion: true,
                label: 'Office request in progress',
                child: const LinearProgressIndicator(),
              ),
            if (_error != null) OfficeNotice(_error!),
            const SizedBox(height: 12),
            TextField(
              controller: _draft,
              enabled: !_busy,
              minLines: 2,
              maxLines: 6,
              maxLength: 8000,
              decoration: const InputDecoration(
                labelText: 'Message to your AI office',
                hintText: 'What evidence supports my paid income?',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: _busy || !textEnabled ? null : _send,
                icon: const Icon(Icons.send_outlined),
                label: Text(
                  _busy ? 'Please wait…' : 'Send to ${_persona.label}',
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard(this.message);
  final OfficeMessage message;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role.toLowerCase() == 'user';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isUser ? AppColors.background : const Color(0xFFF0F4FA),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${isUser ? 'You' : 'AI office • ${message.role}'} • ${Fmt.dateTime(message.createdAt?.toLocal())}',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          SelectableText(message.content, style: const TextStyle(height: 1.5)),
          if (!isUser && message.evidence == null)
            const OfficeNotice(
              'No source evidence supplied with this response.',
            ),
          if (message.evidence != null)
            ExpansionTile(
              title: const Text('Source evidence (server data)'),
              children: [
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: SelectableText(officeJson(message.evidence)),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
