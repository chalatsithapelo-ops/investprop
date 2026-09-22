import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../auth/application/auth_controller.dart';
import '../data/owner_repository.dart';
import '../domain/sale_proposal.dart';

const _maxFileBytes = 5 * 1024 * 1024;

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

class _PickedImage {
  const _PickedImage({required this.name, required this.mime, required this.base64});
  final String name;
  final String mime;
  final String base64;
}

class _PickedDoc {
  _PickedDoc({required this.kind, required this.file});
  String kind;
  final _PickedImage file;
}

/// Owner Portal — submit a property or land for sale to Investprop.
/// Full parity with the web owner-portal submission form.
class OwnerPortalPage extends ConsumerStatefulWidget {
  const OwnerPortalPage({super.key});

  @override
  ConsumerState<OwnerPortalPage> createState() => _OwnerPortalPageState();
}

class _OwnerPortalPageState extends ConsumerState<OwnerPortalPage> {
  final _formKey = GlobalKey<FormState>();

  final _title = TextEditingController();
  final _description = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _askingPrice = TextEditingController();
  final _marketValue = TextEditingController();
  final _reason = TextEditingController();
  final _bedrooms = TextEditingController();
  final _bathrooms = TextEditingController();
  final _squareMeters = TextEditingController();
  final _erfSize = TextEditingController();
  final _titleDeedNumber = TextEditingController();
  final _erfNumber = TextEditingController();
  final _bondOutstanding = TextEditingController();
  final _bondBank = TextEditingController();
  final _ratesArrears = TextEditingController();
  final _monthlyRent = TextEditingController();
  final _estimatedRenoCost = TextEditingController();
  final _coOwners = TextEditingController();
  final _contactPhone = TextEditingController();
  final _contactEmail = TextEditingController();

  String _province = 'Gauteng';
  String _propertyType = 'HOUSE';
  String _saleType = 'CASH';
  String _urgency = 'STANDARD';
  String _engagement = 'OUTRIGHT_SALE';
  String _bondStatus = 'NONE';
  String _ratesStatus = 'CURRENT';
  String _tenancy = 'OWNER_OCCUPIED';
  String _condition = 'GOOD';
  DateTime? _leaseEndDate;
  bool _popiaConsent = false;
  bool _submitting = false;

  final List<_PickedImage> _images = [];
  final List<_PickedDoc> _documents = [];

  @override
  void dispose() {
    for (final c in [
      _title,
      _description,
      _address,
      _city,
      _askingPrice,
      _marketValue,
      _reason,
      _bedrooms,
      _bathrooms,
      _squareMeters,
      _erfSize,
      _titleDeedNumber,
      _erfNumber,
      _bondOutstanding,
      _bondBank,
      _ratesArrears,
      _monthlyRent,
      _estimatedRenoCost,
      _coOwners,
      _contactPhone,
      _contactEmail,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }

  double? _num(TextEditingController c) {
    final t = c.text.trim();
    if (t.isEmpty) return null;
    return double.tryParse(t);
  }

  int? _int(TextEditingController c) {
    final t = c.text.trim();
    if (t.isEmpty) return null;
    return int.tryParse(t);
  }

  Future<_PickedImage?> _pickImage() async {
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
      final file = await ImagePicker()
          .pickImage(source: source, maxWidth: 2400, imageQuality: 85);
      if (file == null) return null;
      final bytes = await file.readAsBytes();
      if (bytes.length > _maxFileBytes) {
        _snack('Images must be 5 MB or smaller.', error: true);
        return null;
      }
      final ext = _extensionOf(file.name);
      return _PickedImage(
        name: file.name,
        mime: file.mimeType ?? _mimeForExtension(ext),
        base64: base64Encode(bytes),
      );
    } catch (_) {
      _snack('Could not capture the image. Please try again.', error: true);
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
    if (!(_formKey.currentState?.validate() ?? false)) {
      _snack('Please complete the required fields.', error: true);
      return;
    }
    if (!_popiaConsent) {
      _snack('You must consent to POPIA processing to submit.', error: true);
      return;
    }
    final asking = _num(_askingPrice);
    if (asking == null || asking <= 0) {
      _snack('Please enter a valid asking price.', error: true);
      return;
    }
    if (_bondStatus == 'EXISTING' && (_num(_bondOutstanding) ?? 0) <= 0) {
      _snack('Please provide the outstanding bond balance.', error: true);
      return;
    }
    if (_ratesStatus == 'ARREARS' && (_num(_ratesArrears) ?? 0) <= 0) {
      _snack('Please provide the rates arrears amount.', error: true);
      return;
    }
    if (_tenancy == 'TENANTED' && (_num(_monthlyRent) ?? 0) <= 0) {
      _snack('Please provide the monthly rent for the tenanted property.',
          error: true);
      return;
    }

    setState(() => _submitting = true);
    final repo = ref.read(ownerRepositoryProvider);
    try {
      // Upload images then documents.
      final imageUrls = <String>[];
      for (final img in _images) {
        final url = await repo.uploadFile(
          fileName: img.name,
          fileType: img.mime,
          base64: img.base64,
        );
        imageUrls.add(url);
      }
      final docs = <ProposalDocument>[];
      for (final d in _documents) {
        final url = await repo.uploadFile(
          fileName: d.file.name,
          fileType: d.file.mime,
          base64: d.file.base64,
        );
        docs.add(ProposalDocument(kind: d.kind, url: url, name: d.file.name));
      }

      final input = SaleProposalInput(
        title: _title.text.trim(),
        description: _description.text.trim(),
        address: _address.text.trim(),
        city: _city.text.trim(),
        province: _province,
        propertyType: _propertyType,
        askingPrice: asking,
        saleType: _saleType,
        urgencyLevel: _urgency,
        engagementType: _engagement,
        bondStatus: _bondStatus,
        ratesStatus: _ratesStatus,
        tenancyStatus: _tenancy,
        conditionRating: _condition,
        popiaConsent: true,
        marketValue: _num(_marketValue),
        reason: _reason.text.trim(),
        bedrooms: _int(_bedrooms),
        bathrooms: _int(_bathrooms),
        squareMeters: _int(_squareMeters),
        erfSize: _num(_erfSize),
        titleDeedNumber: _titleDeedNumber.text.trim(),
        erfNumber: _erfNumber.text.trim(),
        bondOutstanding: _bondStatus == 'EXISTING' ? _num(_bondOutstanding) : null,
        bondBank: _bondStatus == 'EXISTING' ? _bondBank.text.trim() : null,
        ratesArrears: _ratesStatus == 'ARREARS' ? _num(_ratesArrears) : null,
        monthlyRent: _tenancy == 'TENANTED' ? _num(_monthlyRent) : null,
        leaseEndDate: _leaseEndDate?.toIso8601String(),
        estimatedRenoCost: _num(_estimatedRenoCost),
        coOwners: _coOwners.text.trim(),
        contactPhone: _contactPhone.text.trim(),
        contactEmail: _contactEmail.text.trim(),
        imageUrls: imageUrls,
        documents: docs,
      );

      await repo.submit(input);
      ref.invalidate(myProposalsProvider);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Proposal submitted'),
          content: const Text(
            'Your property has been submitted and is pending review by the '
            'Investprop team. You can track its progress under "My deals".',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Done'),
            ),
          ],
        ),
      );
      if (mounted) context.go('/portfolio');
    } catch (e) {
      _snack('$e', error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    return Scaffold(
      appBar: AppBar(title: const Text('Submit your property')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
          children: [
            if (user != null)
              Text(
                'Welcome ${user.name}. List a property or land you want to sell '
                'to Investprop — cash, joint venture or development partnership.',
                style: const TextStyle(color: AppColors.textSecondary),
              ),
            const SizedBox(height: 16),
            _section('Property details', [
              _text(_title, 'Listing title *', minLen: 3),
              _text(_description, 'Description *', minLen: 10, lines: 3),
              _text(_address, 'Street address *', minLen: 3),
              _text(_city, 'City / town *', minLen: 2),
              _dropdown('Province', _province, OwnerOptions.provinces,
                  (v) => setState(() => _province = v)),
              _dropdown(
                'Property type',
                _propertyType,
                OwnerOptions.propertyTypes,
                (v) => setState(() => _propertyType = v),
                labeler: OwnerOptions.label,
              ),
              Row(
                children: [
                  Expanded(child: _num1(_bedrooms, 'Bedrooms')),
                  const SizedBox(width: 12),
                  Expanded(child: _num1(_bathrooms, 'Bathrooms')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: _num1(_squareMeters, 'Floor size (m²)')),
                  const SizedBox(width: 12),
                  Expanded(child: _num1(_erfSize, 'Erf size (m²)')),
                ],
              ),
              _dropdown(
                'Condition',
                _condition,
                OwnerOptions.conditionRatings,
                (v) => setState(() => _condition = v),
                labeler: OwnerOptions.label,
              ),
              _num1(_estimatedRenoCost, 'Estimated renovation cost (R)'),
            ]),
            _section('Pricing & terms', [
              _num1(_askingPrice, 'Asking price (R) *'),
              _num1(_marketValue, 'Estimated market value (R)'),
              _dropdown('Sale terms', _saleType, OwnerOptions.saleTypes,
                  (v) => setState(() => _saleType = v),
                  labeler: OwnerOptions.label),
              _dropdown('Urgency', _urgency, OwnerOptions.urgencyLevels,
                  (v) => setState(() => _urgency = v),
                  labeler: OwnerOptions.label),
              _dropdown(
                'Engagement type',
                _engagement,
                OwnerOptions.engagementTypes,
                (v) => setState(() => _engagement = v),
                labeler: OwnerOptions.label,
              ),
              _text(_reason, 'Reason for selling (optional)', lines: 2),
            ]),
            _section('Legal & title', [
              _text(_titleDeedNumber, 'Title deed number (optional)'),
              _text(_erfNumber, 'Erf number (optional)'),
              _text(_coOwners, 'Additional registered owners (optional)'),
            ]),
            _section('Bond & rates', [
              _dropdown('Bond status', _bondStatus, OwnerOptions.bondStatuses,
                  (v) => setState(() => _bondStatus = v),
                  labeler: OwnerOptions.label),
              if (_bondStatus == 'EXISTING') ...[
                _num1(_bondOutstanding, 'Outstanding bond balance (R) *'),
                _text(_bondBank, 'Bond bank (optional)'),
              ],
              _dropdown('Rates status', _ratesStatus, OwnerOptions.ratesStatuses,
                  (v) => setState(() => _ratesStatus = v),
                  labeler: OwnerOptions.label),
              if (_ratesStatus == 'ARREARS')
                _num1(_ratesArrears, 'Rates arrears (R) *'),
            ]),
            _section('Tenancy', [
              _dropdown(
                'Tenancy status',
                _tenancy,
                OwnerOptions.tenancyStatuses,
                (v) => setState(() => _tenancy = v),
                labeler: OwnerOptions.label,
              ),
              if (_tenancy == 'TENANTED') ...[
                _num1(_monthlyRent, 'Monthly rent (R) *'),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Lease end date'),
                  subtitle: Text(
                    _leaseEndDate == null ? 'Not set' : Fmt.date(_leaseEndDate),
                  ),
                  trailing: const Icon(Icons.calendar_today, size: 18),
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: now,
                      firstDate: now.subtract(const Duration(days: 365)),
                      lastDate: now.add(const Duration(days: 365 * 10)),
                    );
                    if (picked != null) setState(() => _leaseEndDate = picked);
                  },
                ),
              ],
            ]),
            _section('Photos', [
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
                    onPressed: _addImage,
                  ),
                ],
              ),
            ]),
            _section('Supporting documents', [
              const Text(
                'Attach title deed, ID, rates account, bond statement or lease.',
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
                          items: OwnerOptions.documentKinds
                              .map((k) => DropdownMenuItem(
                                    value: k,
                                    child: Text(OwnerOptions.label(k)),
                                  ))
                              .toList(),
                          onChanged: (v) => setState(
                              () => _documents[i].kind = v ?? _documents[i].kind),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => setState(() => _documents.removeAt(i)),
                      ),
                    ],
                  ),
                ),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: _addDocument,
                  icon: const Icon(Icons.attach_file, size: 18),
                  label: const Text('Add document'),
                ),
              ),
            ]),
            _section('Contact & consent', [
              _text(_contactPhone, 'Contact phone (optional)'),
              _text(_contactEmail, 'Contact email (optional)'),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _popiaConsent,
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (v) => setState(() => _popiaConsent = v ?? false),
                title: const Text(
                  'I consent to Investprop processing my information under POPIA '
                  'to evaluate this property. *',
                  style: TextStyle(fontSize: 13),
                ),
              ),
            ]),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              child: _submitting
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Submit property'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _text(
    TextEditingController c,
    String label, {
    int minLen = 0,
    int lines = 1,
  }) {
    final required = label.contains('*');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextFormField(
        controller: c,
        maxLines: lines,
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
        validator: (v) {
          final t = (v ?? '').trim();
          if (required && t.isEmpty) return 'Required';
          if (minLen > 0 && t.isNotEmpty && t.length < minLen) {
            return 'At least $minLen characters';
          }
          return null;
        },
      ),
    );
  }

  Widget _num1(TextEditingController c, String label) {
    final required = label.contains('*');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextFormField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
        validator: (v) {
          final t = (v ?? '').trim();
          if (required && t.isEmpty) return 'Required';
          if (t.isNotEmpty && double.tryParse(t) == null) return 'Invalid number';
          return null;
        },
      ),
    );
  }

  Widget _dropdown(
    String label,
    String value,
    List<String> options,
    void Function(String) onChanged, {
    String Function(String)? labeler,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: DropdownButtonFormField<String>(
        value: value,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
        items: options
            .map((o) => DropdownMenuItem(
                  value: o,
                  child: Text(labeler != null ? labeler(o) : o),
                ))
            .toList(),
        onChanged: (v) {
          if (v != null) onChanged(v);
        },
      ),
    );
  }
}
