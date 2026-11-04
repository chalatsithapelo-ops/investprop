import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/theme.dart';
import 'core/push/push_service.dart';
import 'features/auth/application/auth_controller.dart';
import 'features/office/presentation/voice_agent_overlay.dart';
import 'routing/app_router.dart';

class InvestPropApp extends ConsumerWidget {
  const InvestPropApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final push = ref.watch(pushServiceProvider);
    push.onOpenRoute = (route) => router.go(route);

    // Register/unregister push whenever auth state changes.
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next.status == AuthStatus.authenticated) {
        push.initialise().then((_) => push.registerToken());
      } else if (next.status == AuthStatus.unauthenticated) {
        push.unregisterToken();
      }
    });

    return MaterialApp.router(
      title: 'InvestProp',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
      // Mount the floating voice-agent button above every routed screen.
      builder: (context, child) => Stack(
        children: [
          if (child != null) child,
          const VoiceAgentOverlay(),
        ],
      ),
    );
  }
}
