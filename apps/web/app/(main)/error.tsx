'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent } from '@platform/ui/src/components/card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="mt-4 font-rubik text-xl font-bold">אופס! משהו השתבש</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          אירעה שגיאה בלתי צפויה. נסה לטעון מחדש את הדף.
        </p>
        <Button onClick={reset} className="mt-6">
          נסה שוב
        </Button>
      </CardContent>
    </Card>
  );
}
