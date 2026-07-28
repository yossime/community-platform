import Link from 'next/link';

import { Button } from '@platform/ui/src/components/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="font-rubik text-6xl font-bold text-muted-foreground">404</h1>
      <h2 className="mt-4 font-rubik text-2xl font-semibold">הדף לא נמצא</h2>
      <p className="mt-2 text-muted-foreground">
        הדף שחיפשת אינו קיים או הועבר למקום אחר
      </p>
      <Button className="mt-8" asChild>
        <Link href="/forums">חזרה לעמוד הראשי</Link>
      </Button>
    </div>
  );
}
