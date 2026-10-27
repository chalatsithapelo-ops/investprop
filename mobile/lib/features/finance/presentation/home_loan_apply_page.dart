import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../data/finance_repository.dart';
import '../domain/home_loan.dart';

const _maxFileBytes = 5 * 1024 * 1024; // 5 MB, matches uploadFile constraint.

String _mimeForExtension(String path) {
  final dot = path.lastIndexOf('.');
  final ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : 'jpg';
  switch (ext) {
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

/// One-button multi-bank home-loan application (Phase 2). Collects the bond
/// amount, contact number, POPIA consent and supporting documents, then hands
/// off to a bond originator.
class HomeLoanApplyPage extends ConsumerStatefulWidget {
  const HomeLoanApplyPage({super.key, this.prefill});

  /// Optional prefill passed from the prequalification screen:
  /// {bondAmount, propertyPrice, deposit, grossIncome, instalment}.
  final Map<String, dynamic>? prefill;

  @override
  ConsumerState<HomeLoanApplyPage> createState() => _HomeLoanApplyPageState();
}

class _HomeLoanApplyPageState extends ConsumerState<HomeLoanApplyPage> {
  late final TextEditingController _bondAmount;
  final _phone = TextEditingController();

  HomeLoanDocType _docType = HomeLoanDocType.payslip;
  final List<PendingDoc> _docs = [];
  bool _consent = false;
  bool _submitting = false;

  double _d(String key) {
    final v = widget.prefill?[key];
    if (v is num) return v.toDouble();
    return 0;
  }

  @override
  void initState() {
    super.initState();
    final bond = _d('bondAmount');
    _bondAmount = TextEditingController(
      text: bond > 0 ? bond.toStringAsFixed(0) : '',
    );
  }

  @override
  void dispose() {
    _bondAmount.dispose();
    _phone.dispose();
    super.dispose();
  }

  double get _requestedBond =>
      double.tryParse(_bondAmount.text.trim().replaceAll(',', '')) ?? 0;

  Future<void> _pickDoc() async {
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
        _snack('That file is larger than 5 MB.', error: true);
        return;
      }
      // Lazy base64 to avoid blocking; encode on submit via repository.
      final b64 = _encode(bytes);
      setState(() {
        _docs.add(
          PendingDoc(
            docType: _docType,
            fileName: file.name,
            mime: _mimeForExtension(file.name),
            base64: b64,
          ),
        );
      });
    } catch (_) {
      _snack('Could not add that document.', error: true);
    }
  }

  String _encode(List<int> bytes) {
    // base64 without data-URI prefix (matches uploadFile contract).
    return base64Encode(bytes);
  }

  Future<void> _submit() async {
    if (_requestedBond <= 0) {
      _snack('Enter the bond amount you want to apply for.', error: true);
      return;
    }
    if (!_consent) {
      _snack('Please consent to sharing your application.', error: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      final repo = ref.read(financeRepositoryProvider);

      // Upload each document first, then attach its URL.
      final uploaded = <Map<String, String>>[];
      for (final doc in _docs) {
        final url = await repo.uploadFile(
          fileName: doc.fileName,
          fileType: doc.mime,
          base64: doc.base64,
        );
        uploaded.add({
          'docType': doc.docType.wire,
          'fileName': doc.fileName,
          'fileUrl': url,
        });
      }

      await repo.submitApplication(
        requestedBondAmount: _requestedBond,
        consentShareData: _consent,
        propertyPrice: _d('propertyPrice') > 0 ? _d('propertyPrice') : null,
        depositAmount: _d('deposit') > 0 ? _d('deposit') : null,
        grossMonthlyIncome: _d('grossIncome') > 0 ? _d('grossIncome') : null,
        estimatedInstalment: _d('instalment') > 0 ? _d('instalment') : null,
        applicantPhone: _phone.text.trim(),
        documents: uploaded,
      );

      if (!mounted) return;
      ref.invalidate(myHomeLoanApplicationsProvider);
      await _showSuccess();
      if (mounted) context.go('/profile/home-loan');
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (e) {
      _snack(e.toString().replaceFirst('Bad state: ', ''), error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showSuccess() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(
          Icons.check_circle,
          color: AppColors.success,
          size: 48,
        ),
        title: const Text('Application submitted'),
        content: const Text(
          'We have received your application and will hand it to our bond '
          'originator, who applies to all the major banks on your behalf. '
          'Track progress and compare offers under “My applications”.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
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
    return Scaffold(
      appBar: AppBar(title: const Text('Apply to all major banks')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'One application, submitted to Standard Bank, ABSA, FNB, Nedbank '
            'and Investec through our registered bond-originator partner. '
            "It's free — the winning bank pays the originator. You then pick "
            'the best offer.',
            style: TextStyle(color: AppColors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: 20),
          TextFormField(
            controller: _bondAmount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
            ],
            decoration: const InputDecoration(
              labelText: 'Bond amount to apply for',
              prefixText: 'R ',
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Contact number (optional)',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Supporting documents',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'The banks need your latest payslips and 3 months’ bank statements. '
            'Photograph or upload them here (max 5 MB each).',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<HomeLoanDocType>(
                  value: _docType,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Document type'),
                  items: HomeLoanDocType.values
                      .map(
                        (t) => DropdownMenuItem(
                          value: t,
                          child: Text(t.label, overflow: TextOverflow.ellipsis),
                        ),
                      )
                      .toList(),
                  onChanged: (v) =>
                      setState(() => _docType = v ?? HomeLoanDocType.other),
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                height: 56,
                child: OutlinedButton.icon(
                  onPressed: _submitting ? null : _pickDoc,
                  icon: const Icon(Icons.attach_file),
                  label: const Text('Add'),
                ),
              ),
            ],
          ),
          if (_docs.isNotEmpty) ...[
            const SizedBox(height: 12),
            ..._docs.asMap().entries.map((e) {
              final i = e.key;
              final doc = e.value;
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: const Icon(
                    Icons.description_outlined,
                    color: AppColors.navy,
                  ),
                  title: Text(
                    doc.docType.label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  subtitle: Text(
                    doc.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => setState(() => _docs.removeAt(i)),
                  ),
                ),
              );
            }),
          ],
          const SizedBox(height: 16),
          CheckboxListTile(
            value: _consent,
            onChanged: (v) => setState(() => _consent = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'I consent to InvestProp sharing my application and documents '
              'with a registered bond originator so they can apply to the '
              'banks on my behalf (POPIA).',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 8),
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
                : const Text('Submit application'),
          ),
          const SizedBox(height: 10),
          const Center(
            child: Text(
              'Indicative only — the banks make the final credit decision.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
