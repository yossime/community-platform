'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: 'Heebo, sans-serif', margin: 0, padding: 0 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#fafafa',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#333', margin: 0 }}>
            שגיאה בלתי צפויה
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#666', marginTop: '1rem' }}>
            אנחנו מצטערים, אירעה שגיאה. הצוות שלנו קיבל התראה.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
