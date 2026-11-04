import 'package:intl/intl.dart';

/// Safe JSON coercion helpers — superjson can send numbers as int or double,
/// and fields may be null.
double asDouble(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int asInt(dynamic v) {
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

String asString(dynamic v, [String fallback = '']) =>
    v == null ? fallback : v.toString();

DateTime? asDate(dynamic v) {
  if (v == null) return null;
  if (v is String) return DateTime.tryParse(v);
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  return null;
}

/// Display formatters (South African Rand, percentages, dates).
class Fmt {
  const Fmt._();

  static final _currency = NumberFormat.currency(
    locale: 'en_ZA',
    symbol: 'R',
    decimalDigits: 0,
  );
  static final _currencyDetailed = NumberFormat.currency(
    locale: 'en_ZA',
    symbol: 'R',
    decimalDigits: 2,
  );
  static final _compact = NumberFormat.compactCurrency(
    locale: 'en_ZA',
    symbol: 'R',
    decimalDigits: 1,
  );
  static final _date = DateFormat('d MMM yyyy');
  static final _dateTime = DateFormat('d MMM yyyy, HH:mm');

  /// Coerces NaN / ±Infinity to 0 so downstream formatters (which call
  /// toStringAsFixed) never throw and blank the screen. A divide-by-zero in the
  /// financial engine (e.g. ROI on a zero-cost record) otherwise produces a
  /// non-finite value that crashes the whole page.
  static num _finite(num value) => value.isFinite ? value : 0;

  static String money(num value, {bool detailed = false}) =>
      (detailed ? _currencyDetailed : _currency).format(_finite(value));

  static String compactMoney(num value) => _compact.format(_finite(value));

  static String percent(num value, {int decimals = 1}) =>
      '${_finite(value).toStringAsFixed(decimals)}%';

  /// Fixed-decimal number formatter that is safe for non-finite inputs (e.g. a
  /// DSCR or multiple computed from a zero denominator).
  static String fixed(num value, {int decimals = 2}) =>
      _finite(value).toStringAsFixed(decimals);

  static String date(DateTime? value) =>
      value == null ? '—' : _date.format(value);

  static String dateTime(DateTime? value) =>
      value == null ? '—' : _dateTime.format(value);

  static String relative(DateTime? value) {
    if (value == null) return '';
    final diff = DateTime.now().difference(value);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return _date.format(value);
  }
}
