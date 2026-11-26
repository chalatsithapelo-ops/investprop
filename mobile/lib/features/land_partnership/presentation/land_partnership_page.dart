import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../core/rental_financials.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/rental_financials_section.dart';
import '../data/land_partnership_repository.dart';
import '../domain/land_partnership.dart';

const _maxFileBytes = 5 * 1024 * 1024;

/// Supporting document kinds owners can attach to a land-partnership submission.
const _landDocKinds = <String, String>{
  'TITLE_DEED': 'Title deed',
  'ID': 'ID / passport',
  'RATES_ACCOUNT': 'Rates account',
  'BOND_STATEMENT': 'Bond statement',
  'SURVEY_DIAGRAM': 'Survey diagram',
  'ZONING_CERTIFICATE': 'Zoning certificate',
  'BUILDING_PLANS': 'Building plans',
  'INCOME_STATEMENT': 'Income / expense statement',
  'RENT_ROLL': 'Rent roll / tenant schedule',
  'MANAGEMENT_ACCOUNTS': 'Management accounts',
  'MUNICIPAL_ACCOUNTS': 'Municipal accounts',
  'UTILITY_ACCOUNTS': 'Utility accounts',
  'INSURANCE_SCHEDULE': 'Insurance schedule',
  'OTHER': 'Other',
};

String _mimeForExtension(String? ext) {
  switch ((ext ?? '').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

String _extensionOf(String path) {
  final dot = path.lastIndexOf('.');
  return dot >= 0 ? path.substring(dot + 1) : 'jpg';
}

class _PickedFile {
  const _PickedFile({
    required this.name,
    required this.mime,
    required this.base64,
  });
  final String name;
  final String mime;
  final String base64;
}

class _PickedDoc {
  _PickedDoc({required this.kind, required this.file});
  String kind;
  final _PickedFile file;
}

/// "Partner My Property" — owners contribute their property or land into a
/// ring-fenced SPV in exchange for 20% equity, review and e-sign the
/// partnership agreement, and track the lifecycle. The platform funds and
/// delivers everything (develop, renovate or flip).
class LandPartnershipPage extends ConsumerWidget {
  const LandPartnershipPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(myLandPartnershipsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Partner My Property'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Submit my property',
            onPressed: () => _openSubmit(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myLandPartnershipsProvider.future),
        child: AsyncValueView(
          value: items,
          onRetry: () => ref.invalidate(myLandPartnershipsProvider),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const SizedBox(height: 24),
                  const _HowItWorksCard(),
                  const SizedBox(height: 24),
                  const EmptyState(
                    icon: Icons.landscape_outlined,
                    title: 'No property submitted yet',
                    subtitle:
                        'Contribute your property or land into a development, '
                        'renovation or flip — you keep 20% equity and we fund '
                        'and do everything.',
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: FilledButton.icon(
                      onPressed: () => _openSubmit(context, ref),
                      icon: const Icon(Icons.add),
                      label: const Text('Submit my property'),
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length + 1,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) {
                if (i == 0) return const _HowItWorksCard();
                return _LandCard(partnership: list[i - 1]);
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _openSubmit(BuildContext context, WidgetRef ref) async {
    final ok = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const _SubmitLandPage()));
    if (ok == true) ref.invalidate(myLandPartnershipsProvider);
  }
}

class _HowItWorksCard extends StatelessWidget {
  const _HowItWorksCard();

  @override
  Widget build(BuildContext context) {
    Widget row(IconData icon, String title, String body) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.gold, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  body,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'How it works',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 12),
            row(
              Icons.landscape,
              'You bring the property',
              'Contribute only your property or land. No cash required.',
            ),
            row(
              Icons.apartment,
              'We do everything',
              'Funding, approvals, design, build/renovation and sales.',
            ),
            row(
              Icons.verified_user,
              'You keep 20% equity',
              'Your property goes into a ring-fenced SPV you hold 20% of.',
            ),
          ],
        ),
      ),
    );
  }
}

class _LandCard extends ConsumerStatefulWidget {
  const _LandCard({required this.partnership});

  final LandPartnership partnership;

  @override
  ConsumerState<_LandCard> createState() => _LandCardState();
}

class _LandCardState extends ConsumerState<_LandCard> {
  bool _busy = false;

  Color get _statusColor => switch (widget.partnership.status) {
    LandPartnershipStatus.active ||
    LandPartnershipStatus.countersigned ||
    LandPartnershipStatus.approved ||
    LandPartnershipStatus.spvFormed => AppColors.success,
    LandPartnershipStatus.rejected => AppColors.danger,
    LandPartnershipStatus.withdrawn => AppColors.textSecondary,
    LandPartnershipStatus.agreementReady ||
    LandPartnershipStatus.signed => AppColors.gold,
    _ => AppColors.navyLight,
  };

  Future<void> _withdraw() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw submission?'),
        content: const Text('This will withdraw your property submission.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(landPartnershipRepositoryProvider)
          .withdraw(widget.partnership.id);
      ref.invalidate(myLandPartnershipsProvider);
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sign() async {
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => _SignDialog(partnership: widget.partnership),
    );
    if (result == true) ref.invalidate(myLandPartnershipsProvider);
  }

  void _viewAgreement() {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppBar(
              title: Text('Agreement — ${widget.partnership.referenceCode}'),
              automaticallyImplyLeading: false,
              actions: [
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: SelectableText(
                  widget.partnership.agreementContent ?? '',
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 11,
                    height: 1.4,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.partnership;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    p.landTitle,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: _statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    p.status.label,
                    style: TextStyle(
                      color: _statusColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              p.referenceCode,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(
                  Icons.place_outlined,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${p.address}, ${p.city}, ${p.province}',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                _stat(
                  'Land value',
                  p.estimatedLandValue == null
                      ? '—'
                      : Fmt.money(p.estimatedLandValue!),
                ),
                _stat('Your equity', '${p.ownerEquityPct.toStringAsFixed(0)}%'),
                if (p.spvName != null) _stat('SPV', p.spvName!),
              ],
            ),
            if (p.reviewNotes != null && p.reviewNotes!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Notes: ${p.reviewNotes}',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ],
            if (p.status == LandPartnershipStatus.rejected &&
                p.rejectedReason != null &&
                p.rejectedReason!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Reason: ${p.rejectedReason}',
                style: const TextStyle(color: AppColors.danger),
              ),
            ],
            if (p.financials != null && p.financials!.hasData) ...[
              const SizedBox(height: 12),
              RentalProjectionsCard(
                projections: computeRentalProjections(
                  p.financials!,
                  p.estimatedLandValue ?? 0,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (p.status == LandPartnershipStatus.agreementReady)
                  FilledButton.icon(
                    onPressed: _busy ? null : _sign,
                    icon: const Icon(Icons.edit_document, size: 18),
                    label: const Text('Review & Sign'),
                  ),
                if (p.agreementContent != null &&
                    p.agreementContent!.isNotEmpty)
                  OutlinedButton.icon(
                    onPressed: _viewAgreement,
                    icon: const Icon(Icons.visibility_outlined, size: 18),
                    label: const Text('View'),
                  ),
                if (p.status.canWithdraw)
                  TextButton.icon(
                    onPressed: _busy ? null : _withdraw,
                    icon: const Icon(Icons.block, size: 18),
                    label: const Text('Withdraw'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
      ),
      Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
    ],
  );
}

/* ─── Sign dialog ─── */
class _SignDialog extends ConsumerStatefulWidget {
  const _SignDialog({required this.partnership});

  final LandPartnership partnership;

  @override
  ConsumerState<_SignDialog> createState() => _SignDialogState();
}

class _SignDialogState extends ConsumerState<_SignDialog> {
  final _name = TextEditingController();
  final _idNo = TextEditingController();
  bool _accept = false;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _idNo.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().length < 3) {
      _toast('Please type your full legal name to sign.');
      return;
    }
    if (!_accept) {
      _toast('Please accept the agreement terms.');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref
          .read(landPartnershipRepositoryProvider)
          .sign(
            id: widget.partnership.id,
            signatureName: _name.text.trim(),
            signatureId: _idNo.text.trim(),
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 640),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppBar(
              title: Text('Sign — ${widget.partnership.referenceCode}'),
              automaticallyImplyLeading: false,
              actions: [
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context, false),
                ),
              ],
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: SelectableText(
                  widget.partnership.agreementContent ?? '',
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 10.5,
                    height: 1.4,
                  ),
                ),
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _name,
                    decoration: const InputDecoration(
                      labelText: 'Type your full legal name to sign *',
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _idNo,
                    decoration: const InputDecoration(labelText: 'ID number'),
                  ),
                  const SizedBox(height: 4),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _accept,
                    onChanged: (v) => setState(() => _accept = v ?? false),
                    controlAffinity: ListTileControlAffinity.leading,
                    title: const Text(
                      'I have read and understood this agreement and by typing '
                      'my name I am signing it electronically and agreeing to '
                      'be bound by its terms.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _busy ? null : _submit,
                      icon: _busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.edit),
                      label: const Text('Sign Agreement'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* ─── Submit form page ─── */
class _SubmitLandPage extends ConsumerStatefulWidget {
  const _SubmitLandPage();

  @override
  ConsumerState<_SubmitLandPage> createState() => _SubmitLandPageState();
}

class _SubmitLandPageState extends ConsumerState<_SubmitLandPage> {
  final _form = GlobalKey<FormState>();
  final _ownerName = TextEditingController();
  final _ownerId = TextEditingController();
  final _ownerPhone = TextEditingController();
  final _ownerEmail = TextEditingController();
  final _landTitle = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _landDescription = TextEditingController();
  final _erfSize = TextEditingController();
  final _estLandValue = TextEditingController();
  final _estGdv = TextEditingController();
  final _bondOutstanding = TextEditingController();
  final _ratesArrears = TextEditingController();

  String _province = 'Gauteng';
  String _bondStatus = 'NONE';
  String _ratesStatus = 'CURRENT';
  String _strategy = 'DEVELOP';
  bool _popia = false;
  bool _busy = false;

  final List<_PickedFile> _images = [];
  final List<_PickedDoc> _documents = [];
  final _financials = RentalFinancialsController();

  static const _provinces = [
    'Gauteng',
    'Western Cape',
    'KwaZulu-Natal',
    'Eastern Cape',
    'Free State',
    'Limpopo',
    'Mpumalanga',
    'North West',
    'Northern Cape',
  ];

  @override
  void dispose() {
    for (final c in [
      _ownerName,
      _ownerId,
      _ownerPhone,
      _ownerEmail,
      _landTitle,
      _address,
      _city,
      _landDescription,
      _erfSize,
      _estLandValue,
      _estGdv,
      _bondOutstanding,
      _ratesArrears,
    ]) {
      c.dispose();
    }
    _financials.dispose();
    super.dispose();
  }

  double? _num(TextEditingController c) =>
      c.text.trim().isEmpty ? null : double.tryParse(c.text.trim());

  Future<_PickedFile?> _pickImage() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return null;
    try {
      final file = await ImagePicker().pickImage(
        source: source,
        maxWidth: 2400,
        imageQuality: 85,
      );
      if (file == null) return null;
      final bytes = await file.readAsBytes();
      if (bytes.length > _maxFileBytes) {
        _toast('Files must be 5 MB or smaller.');
        return null;
      }
      final ext = _extensionOf(file.name);
      return _PickedFile(
        name: file.name,
        mime: file.mimeType ?? _mimeForExtension(ext),
        base64: base64Encode(bytes),
      );
    } catch (_) {
      _toast('Could not capture the image. Please try again.');
      return null;
    }
  }

  Future<void> _addImage() async {
    final img = await _pickImage();
    if (img != null) setState(() => _images.add(img));
  }

  Future<void> _addDocument() async {
    final img = await _pickImage();
    if (img != null) {
      setState(() => _documents.add(_PickedDoc(kind: 'TITLE_DEED', file: img)));
    }
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    if (!_popia) {
      _toast('Please consent to POPIA processing to continue.');
      return;
    }
    setState(() => _busy = true);
    try {
      final repo = ref.read(landPartnershipRepositoryProvider);
      // Upload any attached photos and documents first.
      final imageUrls = <String>[];
      for (final img in _images) {
        final url = await repo.uploadFile(
          fileName: img.name,
          fileType: img.mime,
          base64: img.base64,
        );
        imageUrls.add(url);
      }
      final documentUrls = <Map<String, String>>[];
      for (final d in _documents) {
        final url = await repo.uploadFile(
          fileName: d.file.name,
          fileType: d.file.mime,
          base64: d.file.base64,
        );
        documentUrls.add({'kind': d.kind, 'url': url, 'name': d.file.name});
      }

      await repo.submit(
        LandPartnershipInput(
          ownerFullName: _ownerName.text.trim(),
          ownerIdNumber: _ownerId.text.trim(),
          ownerPhone: _ownerPhone.text.trim(),
          ownerEmail: _ownerEmail.text.trim(),
          landTitle: _landTitle.text.trim(),
          landDescription: _landDescription.text.trim(),
          address: _address.text.trim(),
          city: _city.text.trim(),
          province: _province,
          bondStatus: _bondStatus,
          ratesStatus: _ratesStatus,
          intendedStrategy: _strategy,
          erfSize: _num(_erfSize),
          estimatedLandValue: _num(_estLandValue),
          estimatedGdv: _num(_estGdv),
          bondOutstanding: _bondStatus == 'EXISTING'
              ? _num(_bondOutstanding)
              : null,
          ratesArrears: _ratesStatus == 'ARREARS'
              ? _num(_ratesArrears)
              : null,
          popiaConsent: true,
          imageUrls: imageUrls.isEmpty ? null : imageUrls,
          documentUrls: documentUrls.isEmpty ? null : documentUrls,
          financials: _financials.toInput(),
        ),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Your property has been submitted for a partnership.',
            ),
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Submit my property')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _section('Your details'),
            _field(_ownerName, 'Full name *', required: true),
            _field(_ownerId, 'ID number'),
            _field(_ownerPhone, 'Phone', keyboard: TextInputType.phone),
            _field(_ownerEmail, 'Email', keyboard: TextInputType.emailAddress),
            _section('The property'),
            _field(_landTitle, 'Short title *', required: true),
            _field(_address, 'Street address *', required: true),
            _field(_city, 'City / town *', required: true),
            _dropdown(
              'Province',
              _province,
              _provinces,
              (v) => setState(() => _province = v!),
            ),
            _field(_erfSize, 'Erf size (m²)', keyboard: TextInputType.number),
            _field(
              _estLandValue,
              'Estimated property value (R)',
              keyboard: TextInputType.number,
            ),
            _field(
              _landDescription,
              'Describe the property *',
              required: true,
              maxLines: 3,
            ),
            _section('Bond & rates'),
            _dropdown(
              'Bond status',
              _bondStatus,
              const ['NONE', 'EXISTING'],
              (v) => setState(() => _bondStatus = v!),
              labels: const {
                'NONE': 'No bond (paid off)',
                'EXISTING': 'Existing bond',
              },
            ),
            if (_bondStatus == 'EXISTING')
              _field(
                _bondOutstanding,
                'Bond outstanding (R)',
                keyboard: TextInputType.number,
              ),
            _dropdown(
              'Rates status',
              _ratesStatus,
              const ['CURRENT', 'ARREARS'],
              (v) => setState(() => _ratesStatus = v!),
              labels: const {'CURRENT': 'Up to date', 'ARREARS': 'In arrears'},
            ),
            if (_ratesStatus == 'ARREARS')
              _field(
                _ratesArrears,
                'Rates arrears (R)',
                keyboard: TextInputType.number,
              ),
            _section('Proposed project (optional)'),
            _dropdown(
              'Intended strategy',
              _strategy,
              const ['DEVELOP', 'FLIP', 'HOLD'],
              (v) => setState(() => _strategy = v!),
              labels: const {
                'DEVELOP': 'Develop',
                'FLIP': 'Flip / renovate',
                'HOLD': 'Hold / rent',
              },
            ),
            _field(
              _estGdv,
              'Estimated end value / GDV (R)',
              keyboard: TextInputType.number,
            ),
            RentalFinancialsSection(
              controller: _financials,
              baseValue: _num(_estLandValue) ?? 0,
            ),
            _section('Photos'),
            const Text(
              'Add photos of the property / land to support your submission.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var i = 0; i < _images.length; i++)
                  Chip(
                    label: Text(
                      _images[i].name,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onDeleted: () => setState(() => _images.removeAt(i)),
                  ),
                ActionChip(
                  avatar: const Icon(Icons.add_a_photo_outlined, size: 18),
                  label: const Text('Add photo'),
                  onPressed: _busy ? null : _addImage,
                ),
              ],
            ),
            _section('Supporting documents'),
            const Text(
              'Attach the title deed, ID, rates account, bond statement, survey '
              'diagram, zoning certificate or building plans.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < _documents.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _documents[i].kind,
                        isDense: true,
                        decoration: const InputDecoration(
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        items: _landDocKinds.entries
                            .map(
                              (e) => DropdownMenuItem(
                                value: e.key,
                                child: Text(e.value),
                              ),
                            )
                            .toList(),
                        onChanged: (v) => setState(
                          () => _documents[i].kind = v ?? _documents[i].kind,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _documents[i].file.name,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () =>
                          setState(() => _documents.removeAt(i)),
                    ),
                  ],
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: _busy ? null : _addDocument,
                icon: const Icon(Icons.attach_file, size: 18),
                label: const Text('Add document'),
              ),
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _popia,
              onChanged: (v) => setState(() => _popia = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text(
                'I consent, in terms of POPIA, to Investprop processing this '
                'information to assess and structure a development partnership, '
                'and confirm I am (or represent) the registered owner.',
                style: TextStyle(fontSize: 13),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _busy ? null : _submit,
              icon: _busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.add),
              label: const Text('Submit my property'),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _section(String title) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 8),
    child: Text(
      title.toUpperCase(),
      style: const TextStyle(
        color: AppColors.textSecondary,
        fontWeight: FontWeight.w700,
        fontSize: 12,
        letterSpacing: 1,
      ),
    ),
  );

  Widget _field(
    TextEditingController c,
    String label, {
    bool required = false,
    int maxLines = 1,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextFormField(
      controller: c,
      maxLines: maxLines,
      keyboardType: keyboard,
      decoration: InputDecoration(labelText: label),
      validator: required
          ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
          : null,
    ),
  );

  Widget _dropdown(
    String label,
    String value,
    List<String> options,
    ValueChanged<String?> onChanged, {
    Map<String, String>? labels,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: DropdownButtonFormField<String>(
      value: value,
      decoration: InputDecoration(labelText: label),
      items: options
          .map((o) => DropdownMenuItem(value: o, child: Text(labels?[o] ?? o)))
          .toList(),
      onChanged: onChanged,
    ),
  );
}
