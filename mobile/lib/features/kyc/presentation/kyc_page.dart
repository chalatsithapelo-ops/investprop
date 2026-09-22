import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/kyc_repository.dart';
import '../domain/kyc_models.dart';

const _saProvinces = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
];

const _maxFileBytes = 5 * 1024 * 1024; // 5 MB, matches uploadFile constraint.

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

/// FICA / KYC verification: personal details + document upload
/// (`uploadFile` + `submitKYCProfile`).
class KycPage extends ConsumerWidget {
  const KycPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(kycProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('FICA verification')),
      body: AsyncValueView(
        value: profile,
        onRetry: () => ref.invalidate(kycProfileProvider),
        data: (p) => _KycForm(profile: p),
      ),
    );
  }
}

class _KycForm extends ConsumerStatefulWidget {
  const _KycForm({required this.profile});

  final KycProfile profile;

  @override
  ConsumerState<_KycForm> createState() => _KycFormState();
}

class _KycFormState extends ConsumerState<_KycForm> {
  final _formKey = GlobalKey<FormState>();

  late final _fullName = TextEditingController(text: widget.profile.fullName ?? '');
  late final _idNumber = TextEditingController(text: widget.profile.idNumber ?? '');
  late final _phone = TextEditingController(text: widget.profile.phoneNumber ?? '');
  late final _address =
      TextEditingController(text: widget.profile.residentialAddress ?? '');
  late final _city = TextEditingController(text: widget.profile.city ?? '');
  late final _postalCode =
      TextEditingController(text: widget.profile.postalCode ?? '');
  final _taxNumber = TextEditingController();

  String? _province;
  DateTime? _dateOfBirth;
  final Map<KycDocType, _PickedFile> _picked = {};
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (_saProvinces.contains(widget.profile.province)) {
      _province = widget.profile.province;
    }
  }

  @override
  void dispose() {
    _fullName.dispose();
    _idNumber.dispose();
    _phone.dispose();
    _address.dispose();
    _city.dispose();
    _postalCode.dispose();
    _taxNumber.dispose();
    super.dispose();
  }

  bool get _isVerified => widget.profile.ficaVerified;

  Future<void> _pickFile(KycDocType type) async {
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
    if (source == null) return;
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(
        source: source,
        maxWidth: 2400,
        imageQuality: 85,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.length > _maxFileBytes) {
        _snack('Images must be 5 MB or smaller.', error: true);
        return;
      }
      final ext = _extensionOf(file.name);
      setState(() {
        _picked[type] = _PickedFile(
          name: file.name,
          mime: file.mimeType ?? _mimeForExtension(ext),
          base64: base64Encode(bytes),
        );
      });
    } catch (_) {
      _snack('Could not capture the image. Please try again.', error: true);
    }
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_province == null) {
      _snack('Please select your province.', error: true);
      return;
    }
    if (_dateOfBirth == null) {
      _snack('Please select your date of birth.', error: true);
      return;
    }
    // Required documents must be freshly attached for submission.
    final missing = [
      for (final t in KycDocType.values)
        if (t.required && !_picked.containsKey(t)) t.label,
    ];
    if (missing.isNotEmpty) {
      _snack('Please attach: ${missing.join(', ')}.', error: true);
      return;
    }

    setState(() => _submitting = true);
    try {
      final repo = ref.read(kycRepositoryProvider);
      final uploads = <KycUpload>[];
      for (final entry in _picked.entries) {
        final url = await repo.uploadFile(
          fileName: entry.value.name,
          fileType: entry.value.mime,
          base64: entry.value.base64,
        );
        uploads.add(KycUpload(
          type: entry.key,
          documentUrl: url,
          fileName: entry.value.name,
        ));
      }
      await repo.submitProfile(
        details: KycDetails(
          fullName: _fullName.text.trim(),
          idNumber: _idNumber.text.trim(),
          dateOfBirth: _dateOfBirth!.toIso8601String(),
          phoneNumber: _phone.text.trim(),
          residentialAddress: _address.text.trim(),
          city: _city.text.trim(),
          province: _province!,
          postalCode: _postalCode.text.trim(),
          taxNumber: _taxNumber.text.trim(),
        ),
        documents: uploads,
      );
      if (!mounted) return;
      ref.invalidate(kycProfileProvider);
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.verified_user,
              color: AppColors.success, size: 48),
          title: const Text('Documents submitted'),
          content: const Text(
            'Your FICA documents are now under review. We will notify you once '
            'they have been verified.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Something went wrong. Please try again.', error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : AppColors.success,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _StatusBanner(profile: p),
          if (_isVerified) ...[
            const SizedBox(height: 20),
            const Text(
              'Your identity is verified. You can invest any amount without '
              'further checks.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.5),
            ),
          ] else ...[
            const SizedBox(height: 20),
            const Text(
              'FICA verification is required by law before you can invest '
              'R20,000 or more. Complete it once and it applies to all future '
              'investments.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.5),
            ),
            const SizedBox(height: 24),
            const _SectionTitle('Personal details'),
            const SizedBox(height: 12),
            _field(_fullName, 'Full legal name',
                validator: _min(2, 'Enter your full name')),
            _field(_idNumber, 'SA ID / passport number',
                validator: _min(6, 'Enter a valid ID or passport number')),
            _DateField(
              value: _dateOfBirth,
              onPick: (d) => setState(() => _dateOfBirth = d),
            ),
            _field(_phone, 'Contact number',
                keyboardType: TextInputType.phone,
                validator: _min(9, 'Enter a valid contact number')),
            const SizedBox(height: 16),
            const _SectionTitle('Residential address'),
            const SizedBox(height: 12),
            _field(_address, 'Street address',
                validator: _min(5, 'Enter your address')),
            _field(_city, 'City / town',
                validator: _min(2, 'Enter your city')),
            DropdownButtonFormField<String>(
              value: _province,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Province'),
              items: _saProvinces
                  .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                  .toList(),
              onChanged: (v) => setState(() => _province = v),
              validator: (v) => v == null ? 'Select your province' : null,
            ),
            const SizedBox(height: 16),
            _field(_postalCode, 'Postal code',
                keyboardType: TextInputType.number,
                validator: _min(4, 'Enter a valid postal code')),
            _field(_taxNumber, 'SARS tax number (optional)',
                required: false),
            const SizedBox(height: 24),
            const _SectionTitle('Documents'),
            const SizedBox(height: 4),
            const Text(
              'Photograph or upload a clear image · max 5 MB each',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            ...KycDocType.values.map(
              (t) => _DocTile(
                type: t,
                picked: _picked[t],
                existing: p.documentFor(t),
                onPick: () => _pickFile(t),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(p.isSubmitted ? 'Resubmit documents' : 'Submit for verification'),
            ),
            const SizedBox(height: 40),
          ],
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    TextInputType? keyboardType,
    String? Function(String?)? validator,
    bool required = true,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboardType,
        decoration: InputDecoration(labelText: label),
        validator: required ? validator : null,
      ),
    );
  }

  String? Function(String?) _min(int n, String message) =>
      (v) => (v ?? '').trim().length < n ? message : null;
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.profile});

  final KycProfile profile;

  @override
  Widget build(BuildContext context) {
    late final Color color;
    late final IconData icon;
    late final String title;
    late final String body;

    if (profile.ficaVerified) {
      color = AppColors.success;
      icon = Icons.verified_user;
      title = 'FICA verified';
      body = 'Cleared for all investment amounts.';
    } else if (profile.ficaRejectedReason != null &&
        profile.ficaRejectedReason!.isNotEmpty) {
      color = AppColors.danger;
      icon = Icons.error_outline;
      title = 'Verification declined';
      body = profile.ficaRejectedReason!;
    } else if (profile.isSubmitted) {
      color = AppColors.warning;
      icon = Icons.hourglass_top;
      title = 'Under review';
      body = 'Your documents are being reviewed. This usually takes 1–2 days.';
    } else {
      color = AppColors.navy;
      icon = Icons.badge_outlined;
      title = 'Not yet verified';
      body = 'Submit your details and documents below to get verified.';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(fontWeight: FontWeight.w700, color: color)),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textPrimary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.value, required this.onPick});

  final DateTime? value;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: () async {
          final now = DateTime.now();
          final picked = await showDatePicker(
            context: context,
            initialDate: value ?? DateTime(now.year - 30),
            firstDate: DateTime(1920),
            lastDate: DateTime(now.year - 18, now.month, now.day),
          );
          if (picked != null) onPick(picked);
        },
        child: InputDecorator(
          decoration: const InputDecoration(labelText: 'Date of birth'),
          child: Text(
            value == null ? 'Select a date' : Fmt.date(value),
            style: TextStyle(
              color: value == null
                  ? AppColors.textSecondary
                  : AppColors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}

class _DocTile extends StatelessWidget {
  const _DocTile({
    required this.type,
    required this.picked,
    required this.existing,
    required this.onPick,
  });

  final KycDocType type;
  final _PickedFile? picked;
  final KycDocument? existing;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final subtitle = picked != null
        ? picked!.name
        : existing != null
            ? _existingLabel(existing!)
            : type.description;
    final subtitleColor = picked != null
        ? AppColors.success
        : existing?.isRejected == true
            ? AppColors.danger
            : AppColors.textSecondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(
            picked != null ? Icons.check_circle : Icons.upload_file,
            color: picked != null ? AppColors.success : AppColors.textSecondary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        type.label,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    if (type.required)
                      const Text(' *', style: TextStyle(color: AppColors.danger)),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: subtitleColor),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: onPick,
            child: Text(picked != null || existing != null ? 'Replace' : 'Attach'),
          ),
        ],
      ),
    );
  }

  String _existingLabel(KycDocument doc) {
    return switch (doc.status) {
      'APPROVED' => 'Approved',
      'REJECTED' => doc.reviewNotes?.isNotEmpty == true
          ? 'Declined: ${doc.reviewNotes}'
          : 'Declined — please re-upload',
      _ => 'Uploaded — pending review',
    };
  }
}
