import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../core/format.dart';
import '../data/office_repository.dart';
import '../domain/office_models.dart';
import 'office_page.dart';
import 'office_pack_pdf.dart';

class OfficeTasksTab extends ConsumerStatefulWidget {
  const OfficeTasksTab({super.key});

  @override
  ConsumerState<OfficeTasksTab> createState() => _OfficeTasksTabState();
}

class _OfficeTasksTabState extends ConsumerState<OfficeTasksTab> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _notes = TextEditingController();
  final _taxYear = TextEditingController();
  final _proposalId = TextEditingController();
  OfficeTaskKind _kind = OfficeTaskKind.reminder;
  DateTime? _dueAt;
  OfficeTask? _preview;
  bool _accepted = false;
  bool _busy = false;
  String? _notice;

  @override
  void initState() {
    super.initState();
    // SA tax year N ends in February of year N. Default to the most recently
    // completed one so an accountant pack prepares without an extra prompt.
    final now = DateTime.now();
    _taxYear.text = (now.month >= 3 ? now.year : now.year - 1).toString();
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    _taxYear.dispose();
    _proposalId.dispose();
    super.dispose();
  }

  Future<void> _chooseDueDate() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _dueAt?.isAfter(now) == true ? _dueAt! : now,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 10),
    );
    if (!mounted || date == null) return;
    final time = await showTimePicker(
      context: context,
      initialTime: _dueAt == null
          ? TimeOfDay.now()
          : TimeOfDay.fromDateTime(_dueAt!),
    );
    if (!mounted || time == null) return;
    setState(
      () => _dueAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      ),
    );
  }

  Future<void> _prepare() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (_kind == OfficeTaskKind.reminder &&
        (_dueAt == null || !_dueAt!.isAfter(DateTime.now()))) {
      setState(() => _notice = 'Choose a future reminder date and time.');
      return;
    }
    final repository = ref.read(officeRepositoryProvider);
    setState(() {
      _busy = true;
      _accepted = false;
      _preview = null;
      _notice = null;
    });
    try {
      final task = await repository.prepare(
        kind: _kind,
        title: _title.text.trim(),
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        dueAt: _kind == OfficeTaskKind.reminder
            ? _dueAt!.toUtc().toIso8601String()
            : null,
        taxYear:
            _kind == OfficeTaskKind.accountantPack &&
                _taxYear.text.trim().isNotEmpty
            ? int.parse(_taxYear.text.trim())
            : null,
        proposalId:
            _kind == OfficeTaskKind.ownerChecklist &&
                _proposalId.text.trim().isNotEmpty
            ? int.parse(_proposalId.text.trim())
            : null,
      );
      if (!mounted) return;
      setState(() {
        _preview = task;
        _notice =
            'Prepared only. Review the exact server parameters, output and digest below.';
      });
      ref.invalidate(officeTasksProvider);
    } catch (error) {
      if (mounted) {
        setState(
          () => _notice =
              'Preparation not confirmed. $error\nRefresh the inbox before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve() async {
    final task = _preview;
    if (_busy || !_accepted || task == null) return;
    if (!task.canApproveAt(DateTime.now())) {
      setState(() {
        _accepted = false;
        _notice =
            'Approval unavailable: expired, incomplete or not prepared. Refresh the inbox.';
      });
      return;
    }
    final repository = ref.read(officeRepositoryProvider);
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      await repository.approve(task);
      if (!mounted) return;
      setState(() {
        _preview = null;
        _accepted = false;
        _notice =
            'Approval submitted for this office task only. Check the refreshed server status below; no financial or legal action was authorised.';
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          // Require a fresh server preview after an ambiguous mutation failure.
          _preview = null;
          _accepted = false;
          _notice =
              'Approval not confirmed. $error\nRefresh and review the server task before retrying.';
        });
      }
    } finally {
      if (mounted) {
        ref.invalidate(officeTasksProvider);
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _cancel(OfficeTask task) async {
    if (_busy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel office task?'),
        content: Text(task.title),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep task'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel task'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true || _busy) return;
    final repository = ref.read(officeRepositoryProvider);
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      await repository.cancel(task.id);
      if (!mounted) return;
      setState(
        () => _notice =
            'Cancellation submitted. Check the refreshed server status.',
      );
    } catch (error) {
      if (mounted) {
        setState(() => _notice = 'Cancellation not confirmed. $error');
      }
    } finally {
      if (mounted) {
        setState(() {
          _preview = null;
          _accepted = false;
          _busy = false;
        });
        ref.invalidate(officeTasksProvider);
      }
    }
  }

  Future<void> _downloadPack(OfficeTask task) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      final doc = await buildOfficePackPdf(task);
      final bytes = await doc.save();
      final safe = task.id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
      await Printing.sharePdf(bytes: bytes, filename: 'office-pack-$safe.pdf');
    } catch (error) {
      if (mounted) {
        setState(() => _notice = 'Could not generate the pack PDF. $error');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _requiredPositiveInt(String? value) {
    if (value == null || value.trim().isEmpty) return 'Required.';
    final number = int.tryParse(value.trim());
    return number == null || number <= 0
        ? 'Enter a positive whole number.'
        : null;
  }

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(officeTasksProvider);
    final preview = _preview;
    final canApprove = preview?.canApproveAt(DateTime.now()) == true;
    return OfficeContent(
      children: [
        OfficeSection(
          title: 'Prepare a limited office task',
          children: [
            const OfficeNotice(
              'Only reminders, research accountant packs and owner checklists. Preparing does not approve. No transfers, investments, filings, contracts or certified PDFs.',
            ),
            Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final kind in OfficeTaskKind.values)
                        ChoiceChip(
                          label: Text(kind.label),
                          selected: kind == _kind,
                          onSelected: _busy
                              ? null
                              : (_) => setState(() {
                                  _kind = kind;
                                  _preview = null;
                                  _accepted = false;
                                }),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _title,
                    enabled: !_busy,
                    maxLength: 200,
                    decoration: const InputDecoration(labelText: 'Task title'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Enter a title.'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _notes,
                    enabled: !_busy,
                    minLines: 2,
                    maxLines: 5,
                    maxLength: 4000,
                    decoration: const InputDecoration(
                      labelText: 'Notes (optional)',
                      alignLabelWithHint: true,
                    ),
                  ),
                  if (_kind == OfficeTaskKind.reminder) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Due (device local time): ${_dueAt == null ? 'Not selected' : Fmt.dateTime(_dueAt)}',
                    ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : _chooseDueDate,
                        icon: const Icon(Icons.event_outlined),
                        label: const Text('Choose date & time'),
                      ),
                    ),
                  ],
                  if (_kind == OfficeTaskKind.accountantPack) ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _taxYear,
                      enabled: !_busy,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Tax year',
                        helperText: 'SA tax year ending February of that year.',
                      ),
                      validator: _requiredPositiveInt,
                    ),
                  ],
                  if (_kind == OfficeTaskKind.ownerChecklist) ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _proposalId,
                      enabled: !_busy,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Proposal ID',
                        helperText: 'Numeric owner proposal ID from Overview.',
                      ),
                      validator: _requiredPositiveInt,
                    ),
                  ],
                  const SizedBox(height: 16),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _prepare,
                      icon: const Icon(Icons.preview_outlined),
                      label: const Text('Prepare for review'),
                    ),
                  ),
                ],
              ),
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_notice != null) OfficeNotice(_notice!),
          ],
        ),
        if (preview != null)
          OfficeSection(
            title: 'Exact server preview • ${preview.title}',
            children: [
              _TaskDetails(preview),
              const OfficeNotice('Server approval digest (sent unchanged):'),
              SelectableText(
                preview.approvalDigest ?? 'Missing — approval disabled',
              ),
              if (!canApprove)
                const OfficeNotice(
                  'Approval disabled: task must be an allowed kind, PREPARED, have parameters, a digest and a future expiry.',
                ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _accepted,
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: _busy || !canApprove
                    ? null
                    : (value) => setState(() => _accepted = value == true),
                title: const Text(
                  'I reviewed these exact parameters, output and digest. I approve only this office task, not financial or legal actions.',
                ),
              ),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    onPressed: _busy || !_accepted || !canApprove
                        ? null
                        : _approve,
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('Approve exact task'),
                  ),
                  OutlinedButton(
                    onPressed: _busy || preview.status != 'PREPARED'
                        ? null
                        : () => _cancel(preview),
                    child: const Text('Cancel task'),
                  ),
                ],
              ),
            ],
          ),
        OfficeSection(
          title: 'Task inbox',
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _busy
                    ? null
                    : () {
                        setState(() {
                          _preview = null;
                          _accepted = false;
                        });
                        ref.invalidate(officeTasksProvider);
                      },
                icon: const Icon(Icons.refresh),
                label: const Text('Refresh server status'),
              ),
            ),
            tasks.when(
              loading: () => const LinearProgressIndicator(),
              error: (error, _) => OfficeError(
                error: error,
                onRetry: () => ref.invalidate(officeTasksProvider),
              ),
              data: (items) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (items.isEmpty) const Text('No office tasks yet.'),
                  for (final task in items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            task.title,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          OfficeNotice(
                            '${task.kind} • ${task.status}\nCreated: ${Fmt.dateTime(task.createdAt?.toLocal())}',
                          ),
                          ExpansionTile(
                            title: const Text('Parameters & output'),
                            children: [_TaskDetails(task)],
                          ),
                          Wrap(
                            spacing: 12,
                            runSpacing: 8,
                            children: [
                              if (task.status == 'PREPARED') ...[
                                OutlinedButton(
                                  onPressed: _busy
                                      ? null
                                      : () => setState(() {
                                          _preview = task;
                                          _accepted = false;
                                          _notice = null;
                                        }),
                                  child: const Text('Review preview & digest'),
                                ),
                                TextButton(
                                  onPressed: _busy ? null : () => _cancel(task),
                                  child: const Text('Cancel task'),
                                ),
                              ],
                              if (task.status == 'COMPLETED' &&
                                  task.result != null)
                                OutlinedButton.icon(
                                  onPressed: _busy
                                      ? null
                                      : () => _downloadPack(task),
                                  icon: const Icon(Icons.picture_as_pdf_outlined),
                                  label: const Text('Download pack (PDF)'),
                                ),
                              if (task.status == 'COMPLETED' &&
                                  task.result != null)
                                OutlinedButton.icon(
                                  onPressed: _busy
                                      ? null
                                      : () async {
                                          await Clipboard.setData(
                                            ClipboardData(
                                              text: officeJson({
                                                'taskId': task.id,
                                                'title': task.title,
                                                'kind': task.kind,
                                                'status': task.status,
                                                'parameters': task.parameters,
                                                'result': task.result,
                                                'createdAt': task.createdAt
                                                    ?.toIso8601String(),
                                                'notice':
                                                    'Research output only. Not a certified PDF or professional advice.',
                                              }),
                                            ),
                                          );
                                          if (!context.mounted) return;
                                          ScaffoldMessenger.of(
                                            context,
                                          ).showSnackBar(
                                            const SnackBar(
                                              content: Text(
                                                'Research JSON copied. It may contain private data; share only with a trusted recipient.',
                                              ),
                                            ),
                                          );
                                        },
                                  icon: const Icon(Icons.copy_outlined),
                                  label: const Text(
                                    'Copy research output (JSON)',
                                  ),
                                ),
                            ],
                          ),
                          const Divider(),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _TaskDetails extends StatelessWidget {
  const _TaskDetails(this.task);
  final OfficeTask task;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SelectableText(
          'ID: ${task.id}\nKind: ${task.kind}\nStatus: ${task.status}\nCreated: ${Fmt.dateTime(task.createdAt?.toLocal())}\nApproval expires: ${task.expiresAt == null ? 'Missing or invalid' : Fmt.dateTime(task.expiresAt!.toLocal())}',
        ),
        const OfficeNotice('Exact parameters (server JSON):'),
        SelectableText(officeJson(task.parameters)),
        const OfficeNotice(
          'Server output / preview (not a certified document):',
        ),
        SelectableText(officeJson(task.result)),
      ],
    ),
  );
}
