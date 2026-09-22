import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../auth/application/auth_controller.dart';
import '../notifications/data/notifications_repository.dart';

/// Bottom-navigation scaffold that hosts the main tabs. The
/// [StatefulNavigationShell] preserves each tab's navigation state. Labels
/// adapt to the signed-in user's role (investor vs property owner).
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider);
    final isOwner =
        ref.watch(authControllerProvider).user?.isPropertyOwner == true;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        indicatorColor: AppColors.gold.withValues(alpha: 0.25),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(isOwner ? Icons.sell_outlined : Icons.explore_outlined),
            selectedIcon: Icon(isOwner ? Icons.sell : Icons.explore),
            label: isOwner ? 'Sell' : 'Invest',
          ),
          NavigationDestination(
            icon: Icon(
                isOwner ? Icons.receipt_long_outlined : Icons.pie_chart_outline),
            selectedIcon:
                Icon(isOwner ? Icons.receipt_long : Icons.pie_chart),
            label: isOwner ? 'My deals' : 'Portfolio',
          ),
          NavigationDestination(
            icon: _NotificationIcon(unread: unread, filled: false),
            selectedIcon: _NotificationIcon(unread: unread, filled: true),
            label: 'Alerts',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

class _NotificationIcon extends StatelessWidget {
  const _NotificationIcon({required this.unread, required this.filled});

  final int unread;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final icon = Icon(
      filled ? Icons.notifications : Icons.notifications_outlined,
    );
    if (unread <= 0) return icon;
    return Badge(
      label: Text(unread > 99 ? '99+' : '$unread'),
      backgroundColor: AppColors.danger,
      child: icon,
    );
  }
}
