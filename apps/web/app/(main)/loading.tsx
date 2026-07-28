import { Spinner } from '@platform/ui/src/components/spinner';

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size="lg" />
    </div>
  );
}
