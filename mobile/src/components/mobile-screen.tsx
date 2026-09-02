import { EmptyState } from '@/src/components/ui';

export function StateMessage({ title, detail }: { title: string; detail?: string }) {
  return <EmptyState title={title} detail={detail} />;
}
