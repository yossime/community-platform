export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'כניסה',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50 px-4">
      <div className="mb-8 text-center">
        <Link href="/" className="font-rubik text-2xl font-bold text-primary">
          קהילת אנשי מקצוע
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          הפלטפורמה המובילה לאנשי מקצוע בציבור החרדי
        </p>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
