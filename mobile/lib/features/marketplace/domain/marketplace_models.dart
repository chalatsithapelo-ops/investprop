import '../../../core/format.dart';

class MarketShareClass {
  const MarketShareClass({
    required this.id,
    required this.name,
    required this.propertyId,
    required this.propertyTitle,
    required this.propertyCity,
    required this.propertyImageUrl,
    required this.totalShares,
    required this.availableShares,
    required this.pricePerShare,
    required this.bestBid,
    required this.bestAsk,
    required this.openBuyOrders,
    required this.openSellOrders,
    required this.totalInvestors,
  });

  final int id;
  final String name;
  final int propertyId;
  final String propertyTitle;
  final String propertyCity;
  final String? propertyImageUrl;
  final int totalShares;
  final int availableShares;
  final double pricePerShare;
  final double? bestBid;
  final double? bestAsk;
  final int openBuyOrders;
  final int openSellOrders;
  final int totalInvestors;

  factory MarketShareClass.fromJson(Map<String, dynamic> json) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    return MarketShareClass(
      id: asInt(json['id']),
      name: asString(json['name'], 'Shares'),
      propertyId: asInt(property['id']),
      propertyTitle: asString(property['title'], 'Property'),
      propertyCity: asString(property['city']),
      propertyImageUrl: property['imageUrl'] == null
          ? null
          : asString(property['imageUrl']),
      totalShares: asInt(json['totalShares']),
      availableShares: asInt(json['availableShares']),
      pricePerShare: asDouble(json['pricePerShare']),
      bestBid: json['bestBid'] == null ? null : asDouble(json['bestBid']),
      bestAsk: json['bestAsk'] == null ? null : asDouble(json['bestAsk']),
      openBuyOrders: asInt(json['openBuyOrders']),
      openSellOrders: asInt(json['openSellOrders']),
      totalInvestors: asInt(json['totalInvestors']),
    );
  }
}

class OrderLevel {
  const OrderLevel({
    required this.price,
    required this.quantity,
    required this.orders,
  });

  final double price;
  final int quantity;
  final int orders;

  factory OrderLevel.fromJson(Map<String, dynamic> json) => OrderLevel(
        price: asDouble(json['price']),
        quantity: asInt(json['quantity']),
        orders: asInt(json['orders']),
      );
}

class OrderBook {
  const OrderBook({
    required this.buyLevels,
    required this.sellLevels,
    required this.bestBid,
    required this.bestAsk,
    required this.spread,
  });

  final List<OrderLevel> buyLevels;
  final List<OrderLevel> sellLevels;
  final double? bestBid;
  final double? bestAsk;
  final double? spread;

  static List<OrderLevel> _levels(dynamic list) {
    if (list is! List) return const [];
    return list
        .whereType<Map>()
        .map((e) => OrderLevel.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  factory OrderBook.fromJson(Map<String, dynamic> json) => OrderBook(
        buyLevels: _levels(json['buyLevels']),
        sellLevels: _levels(json['sellLevels']),
        bestBid: json['bestBid'] == null ? null : asDouble(json['bestBid']),
        bestAsk: json['bestAsk'] == null ? null : asDouble(json['bestAsk']),
        spread: json['spread'] == null ? null : asDouble(json['spread']),
      );
}

class MyOrder {
  const MyOrder({
    required this.id,
    required this.side,
    required this.quantity,
    required this.filledQuantity,
    required this.pricePerShare,
    required this.status,
    required this.shareClassName,
    required this.propertyTitle,
    required this.createdAt,
  });

  final int id;
  final String side;
  final int quantity;
  final int filledQuantity;
  final double pricePerShare;
  final String status;
  final String shareClassName;
  final String propertyTitle;
  final DateTime? createdAt;

  int get remaining => quantity - filledQuantity;
  bool get isBuy => side == 'BUY';
  bool get canCancel => status == 'OPEN' || status == 'PARTIALLY_FILLED';

  String get statusLabel => status
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');

  factory MyOrder.fromJson(Map<String, dynamic> json) {
    final sc = json['shareClass'] is Map
        ? Map<String, dynamic>.from(json['shareClass'] as Map)
        : const <String, dynamic>{};
    final property = sc['property'] is Map
        ? Map<String, dynamic>.from(sc['property'] as Map)
        : const <String, dynamic>{};
    return MyOrder(
      id: asInt(json['id']),
      side: asString(json['side'], 'BUY'),
      quantity: asInt(json['quantity']),
      filledQuantity: asInt(json['filledQuantity']),
      pricePerShare: asDouble(json['pricePerShare']),
      status: asString(json['status'], 'OPEN'),
      shareClassName: asString(sc['name'], 'Shares'),
      propertyTitle: asString(property['title'], 'Property'),
      createdAt: asDate(json['createdAt']),
    );
  }
}
