import { View, type RefreshControlProps } from 'react-native';

import { AppScreen } from '@/src/components/app-shell';
import { EmptyState } from '@/src/components/ui';

export function MobileScreen({
  kicker: _kicker,
  title,
  subtitle,
  children,
  refreshControl,
  showBack = true,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  showBack?: boolean;
}) {
  return (
    <AppScreen title={title} subtitle={subtitle} topLevel={!showBack} refreshControl={refreshControl}>
      <View style={{ gap: 20 }}>{children}</View>
    </AppScreen>
  );
}

export function StateMessage({ title, detail }: { title: string; detail?: string }) {
  return <EmptyState title={title} detail={detail} />;
}
