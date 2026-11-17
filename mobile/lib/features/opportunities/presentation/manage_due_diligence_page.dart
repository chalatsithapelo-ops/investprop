import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../widgets/async_value_widget.dart';
import '../../auth/application/auth_controller.dart';
import '../data/due_diligence_management_repository.dart';

String _label(Object? value) => (value ?? '').toString().replaceAll('_', ' ');

class ManageDueDiligencePage extends ConsumerWidget {
  const ManageDueDiligencePage({super.key, required this.propertyId});
  final int propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    Widget body;
    if (!auth.isResolved) {
      body = const Center(child: CircularProgressIndicator());
    } else if (auth.user?.isManager != true) {
      body = const Center(
        child: Text('Staff access required to manage due diligence.'),
      );
    } else if (propertyId <= 0) {
      body = const Center(child: Text('Invalid property ID.'));
    } else {
      final provider = dueDiligenceManagementProvider(propertyId);
      body = AsyncValueView(
        value: ref.watch(provider),
        onRetry: () => ref.invalidate(provider),
        data: (data) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(provider);
            try {
              await ref.read(provider.future);
            } catch (_) {
              // AsyncValueView displays the failed refresh with a retry action.
            }
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Property #$propertyId',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const Text(
                'Professional appointments, statutory approvals and supporting documents.',
              ),
              _section(
                context,
                ref,
                'Professional appointments',
                _EditorKind.professional,
              ),
              if (data.professionals.isEmpty)
                const Text('No professionals recorded.'),
              for (final row in data.professionals)
                Card(
                  child: ListTile(
                    title: Text(_label(row['role'])),
                    subtitle: Text(
                      [
                        _label(row['status']),
                        if (row['firmName'] != null) '${row['firmName']}',
                        if (row['contactName'] != null) '${row['contactName']}',
                        if (row['contactEmail'] != null)
                          '${row['contactEmail']}',
                        'Fee: R${row['feeAmount'] ?? 0}',
                        row['isRequired'] == true ? 'Required' : 'Optional',
                      ].join('\n'),
                    ),
                    trailing: IconButton(
                      tooltip: 'Edit professional',
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () =>
                          _edit(context, ref, _EditorKind.professional, row),
                    ),
                  ),
                ),
              _section(
                context,
                ref,
                'Statutory approvals',
                _EditorKind.approval,
              ),
              if (data.approvals.isEmpty) const Text('No approvals recorded.'),
              for (final row in data.approvals)
                Card(
                  child: Column(
                    children: [
                      ListTile(
                        title: Text(_label(row['type'])),
                        subtitle: Text(
                          [
                            _label(row['status']),
                            if (row['authority'] != null) '${row['authority']}',
                            if (row['reference'] != null)
                              'Reference: ${row['reference']}',
                            row['isRequired'] == true ? 'Required' : 'Optional',
                          ].join('\n'),
                        ),
                        trailing: IconButton(
                          tooltip: 'Edit approval',
                          icon: const Icon(Icons.edit_outlined),
                          onPressed: () =>
                              _edit(context, ref, _EditorKind.approval, row),
                        ),
                      ),
                      if (DueDiligenceManagementRepository.isDocumentUrl(
                        '${row['documentUrl'] ?? ''}',
                      ))
                        TextButton.icon(
                          onPressed: () =>
                              _open(context, '${row['documentUrl']}'),
                          icon: const Icon(Icons.open_in_new),
                          label: const Text('Open approval document'),
                        ),
                    ],
                  ),
                ),
              _section(
                context,
                ref,
                'Supporting documents',
                _EditorKind.document,
              ),
              if (data.documents.isEmpty)
                const Text('No supporting documents added.'),
              for (final row in data.documents)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: Text('${row['label']}'),
                    subtitle: Text('${row['url']}'),
                    onTap: () => _open(context, '${row['url']}'),
                    trailing: IconButton(
                      tooltip: 'Remove document',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => _remove(context, ref, row),
                    ),
                  ),
                ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Manage due diligence')),
      body: body,
    );
  }

  Widget _section(
    BuildContext context,
    WidgetRef ref,
    String title,
    _EditorKind kind,
  ) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 8),
    child: Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        IconButton(
          tooltip: 'Add $title',
          onPressed: () => _edit(context, ref, kind),
          icon: const Icon(Icons.add),
        ),
      ],
    ),
  );

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    _EditorKind kind, [
    Map<String, dynamic>? row,
  ]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _DdEditor(propertyId: propertyId, kind: kind, row: row),
      ),
    );
    if (saved == true && context.mounted) {
      ref.invalidate(dueDiligenceManagementProvider(propertyId));
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Due diligence saved.')));
    }
  }

  Future<void> _open(BuildContext context, String url) async {
    try {
      if (!DueDiligenceManagementRepository.isDocumentUrl(url) ||
          !await launchUrl(
            Uri.parse(url),
            mode: LaunchMode.externalApplication,
          )) {
        throw const FormatException('Cannot open this document.');
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  Future<void> _remove(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> row,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove supporting document?'),
        content: Text(
          'Remove "${row['label']}" from this property pack? The uploaded file itself is not deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref
          .read(dueDiligenceManagementRepositoryProvider)
          .removeDocument(propertyId: propertyId, url: '${row['url']}');
      if (context.mounted) {
        ref.invalidate(dueDiligenceManagementProvider(propertyId));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }
}

enum _EditorKind { professional, approval, document }

class _DdEditor extends ConsumerStatefulWidget {
  const _DdEditor({required this.propertyId, required this.kind, this.row});
  final int propertyId;
  final _EditorKind kind;
  final Map<String, dynamic>? row;

  @override
  ConsumerState<_DdEditor> createState() => _DdEditorState();
}

class _DdEditorState extends ConsumerState<_DdEditor> {
  final _form = GlobalKey<FormState>();
  final _fields = <String, TextEditingController>{};
  late String _type;
  late String _status;
  late bool _required;
  bool _busy = false;
  String? _error;
  bool get _professional => widget.kind == _EditorKind.professional;
  bool get _document => widget.kind == _EditorKind.document;
  bool get _editing => widget.row != null;

  @override
  void initState() {
    super.initState();
    _type =
        '${widget.row?[_professional ? 'role' : 'type'] ?? (_professional ? ddProfessionalRoles.first : ddApprovalTypes.first)}';
    _status =
        '${widget.row?['status'] ?? (_professional ? ddAppointmentStatuses.first : ddApprovalStatuses.first)}';
    _required = widget.row?['isRequired'] != false;
    for (final key in [
      'firmName',
      'contactName',
      'contactEmail',
      'contactPhone',
      'registrationBody',
      'registrationNo',
      'feeAmount',
      'notes',
      'authority',
      'reference',
      'targetDate',
      'submittedAt',
      'decisionAt',
      'documentUrl',
      'label',
      'url',
    ]) {
      _fields[key] = TextEditingController(
        text: '${widget.row?[key] ?? (key == 'feeAmount' ? 0 : '')}',
      );
    }
  }

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String _text(String key) => _fields[key]!.text.trim();

  Widget _field(
    String key,
    String label, {
    TextInputType? keyboard,
    String? Function(String?)? validator,
    int lines = 1,
    String? helper,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      controller: _fields[key],
      enabled: !_busy,
      keyboardType: keyboard,
      maxLines: lines,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        border: const OutlineInputBorder(),
      ),
    ),
  );

  Widget _dropdown(
    String label,
    String selected,
    List<String> options,
    ValueChanged<String>? change,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: DropdownButtonFormField<String>(
      value: options.contains(selected) ? selected : null,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: options
          .map(
            (v) => DropdownMenuItem(
              value: v,
              child: Text(_label(v), overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: _busy || change == null
          ? null
          : (v) {
              if (v != null) change(v);
            },
      validator: (v) => v == null ? 'Choose a supported value.' : null,
    ),
  );

  String? _urlValidator(String? value) => value == null || value.trim().isEmpty
      ? (_document ? 'Enter a document URL or upload a photo.' : null)
      : DueDiligenceManagementRepository.isDocumentUrl(value)
      ? null
      : 'Enter an HTTP(S) URL.';

  Widget _date(String key, String label) => _field(
    key,
    label,
    helper: 'ISO date (YYYY-MM-DD). Existing dates cannot be cleared.',
    keyboard: TextInputType.datetime,
    validator: (v) {
      if (v == null || v.trim().isEmpty) {
        return widget.row?[key] != null
            ? 'The server cannot clear an existing date.'
            : null;
      }
      final text = v.trim();
      final parsed = DateTime.tryParse(text);
      if (!RegExp(r'^\d{4}-\d{2}-\d{2}(T.*)?$').hasMatch(text) ||
          parsed == null ||
          parsed.toIso8601String().substring(0, 10) != text.substring(0, 10)) {
        return 'Enter a valid ISO date.';
      }
      return null;
    },
  );

  @override
  Widget build(BuildContext context) {
    final staff = ref.watch(authControllerProvider).user?.isManager == true;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            '${_editing ? 'Edit' : 'Add'} ${_document
                ? 'supporting document'
                : _professional
                ? 'professional'
                : 'approval'}',
          ),
        ),
        body: !staff
            ? const Center(child: Text('Staff access required.'))
            : Form(
                key: _form,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (!_document) ...[
                      _dropdown(
                        _professional ? 'Professional role' : 'Approval type',
                        _type,
                        _professional ? ddProfessionalRoles : ddApprovalTypes,
                        _editing ? null : (v) => setState(() => _type = v),
                      ),
                      _dropdown(
                        'Status',
                        _status,
                        _professional
                            ? ddAppointmentStatuses
                            : ddApprovalStatuses,
                        (v) => setState(() => _status = v),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Required'),
                        value: _required,
                        subtitle: !_professional && _editing
                            ? const Text(
                                'Type and required flag are fixed by the server after creation.',
                              )
                            : null,
                        onChanged: _busy || (!_professional && _editing)
                            ? null
                            : (v) => setState(() => _required = v),
                      ),
                    ],
                    if (_professional) ...[
                      _field('firmName', 'Firm name'),
                      _field('contactName', 'Contact name'),
                      _field(
                        'contactEmail',
                        'Contact email',
                        keyboard: TextInputType.emailAddress,
                        helper: _editing
                            ? 'Leave blank to keep the current email; the server does not allow clearing it.'
                            : null,
                        validator: (v) =>
                            v == null ||
                                v.trim().isEmpty ||
                                RegExp(
                                  r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                                ).hasMatch(v.trim())
                            ? null
                            : 'Enter a valid email address.',
                      ),
                      _field(
                        'contactPhone',
                        'Contact phone',
                        keyboard: TextInputType.phone,
                      ),
                      _field('registrationBody', 'Registration body'),
                      _field('registrationNo', 'Registration number'),
                      _field(
                        'feeAmount',
                        'Fee amount (R)',
                        keyboard: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        validator: (v) {
                          final amount = double.tryParse((v ?? '').trim());
                          return amount == null ||
                                  !amount.isFinite ||
                                  amount < 0
                              ? 'Enter a finite, non-negative fee.'
                              : null;
                        },
                      ),
                      if (_editing)
                        _field('notes', 'Notes', lines: 3)
                      else
                        const Padding(
                          padding: EdgeInsets.only(bottom: 12),
                          child: Text(
                            'Notes can be added after creating the appointment.',
                          ),
                        ),
                    ] else if (!_document) ...[
                      _field('authority', 'Authority'),
                      _field('reference', 'Reference'),
                      _date('targetDate', 'Target date'),
                      if (_editing) ...[
                        _date('submittedAt', 'Submitted date'),
                        _date('decisionAt', 'Decision date'),
                      ],
                      _field('notes', 'Notes', lines: 3),
                    ],
                    if (_document)
                      _field(
                        'label',
                        'Document label',
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'Enter a document label.'
                            : null,
                      ),
                    if (!_professional) ...[
                      _field(
                        _document ? 'url' : 'documentUrl',
                        'Document URL',
                        keyboard: TextInputType.url,
                        validator: _urlValidator,
                      ),
                      const Text(
                        'Paste a PDF/office document link, or upload a photo (JPG, PNG, WebP or GIF; max 5 MB). Uploaded files are publicly accessible: do not include sensitive personal information.',
                      ),
                      Wrap(
                        spacing: 8,
                        children: [
                          TextButton.icon(
                            onPressed: _busy
                                ? null
                                : () => _photo(ImageSource.camera),
                            icon: const Icon(Icons.photo_camera_outlined),
                            label: const Text('Take photo'),
                          ),
                          TextButton.icon(
                            onPressed: _busy
                                ? null
                                : () => _photo(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library_outlined),
                            label: const Text('Choose photo'),
                          ),
                        ],
                      ),
                    ],
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _busy ? null : _save,
                      icon: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save_outlined),
                      label: Text(_busy ? 'Please wait…' : 'Save'),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Future<void> _photo(ImageSource source) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final photo = await ImagePicker().pickImage(
        source: source,
        maxWidth: 2400,
        imageQuality: 85,
      );
      if (photo == null || !mounted) return;
      final bytes = await photo.readAsBytes();
      if (!mounted) return;
      final url = await ref
          .read(dueDiligenceManagementRepositoryProvider)
          .uploadPhoto(fileName: photo.name, bytes: bytes);
      if (mounted) _fields[_document ? 'url' : 'documentUrl']!.text = url;
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    if (ref.read(authControllerProvider).user?.isManager != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(dueDiligenceManagementRepositoryProvider);
      final id = (widget.row?['id'] as num?)?.toInt();
      if (_professional) {
        await repo.saveProfessional(
          propertyId: widget.propertyId,
          professionalId: id,
          role: _type,
          status: _status,
          isRequired: _required,
          feeAmount: double.parse(_text('feeAmount')),
          firmName: _text('firmName'),
          contactName: _text('contactName'),
          contactEmail: _text('contactEmail'),
          contactPhone: _text('contactPhone'),
          registrationBody: _text('registrationBody'),
          registrationNo: _text('registrationNo'),
          notes: _text('notes'),
        );
      } else if (_document) {
        await repo.addDocument(
          propertyId: widget.propertyId,
          label: _text('label'),
          url: _text('url'),
        );
      } else {
        await repo.saveApproval(
          propertyId: widget.propertyId,
          approvalId: id,
          type: _type,
          status: _status,
          isRequired: _required,
          authority: _text('authority'),
          reference: _text('reference'),
          documentUrl: _text('documentUrl'),
          notes: _text('notes'),
          targetDate: DateTime.tryParse(_text('targetDate')),
          submittedAt: DateTime.tryParse(_text('submittedAt')),
          decisionAt: DateTime.tryParse(_text('decisionAt')),
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
