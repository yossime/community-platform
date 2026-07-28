import { Spinner } from '@platform/ui/src/components/spinner';

export default function AuthLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
