import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'קהילת אנשי מקצוע חרדים';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  // Load self-hosted Heebo font for Hebrew text rendering
  let heeboFont: ArrayBuffer | undefined;
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const fontResponse = await fetch(`${appUrl}/fonts/heebo-hebrew.woff2`);
    if (fontResponse.ok) {
      heeboFont = await fontResponse.arrayBuffer();
    }
  } catch {
    // Font loading may fail in edge runtime; fallback to system fonts
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e3a5f',
          position: 'relative',
          overflow: 'hidden',
          direction: 'rtl',
        }}
      >
        {/* Background decorative elements */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            right: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            backgroundColor: 'rgba(245, 240, 232, 0.06)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-120px',
            left: '-120px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            backgroundColor: 'rgba(245, 240, 232, 0.04)',
            display: 'flex',
          }}
        />

        {/* Top accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(to left, #f5f0e8, #d4c5a9, #f5f0e8)',
            display: 'flex',
          }}
        />

        {/* Main content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            padding: '40px',
          }}
        >
          {/* Logo icon placeholder */}
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              backgroundColor: '#f5f0e8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              color: '#1e3a5f',
              fontWeight: 700,
            }}
          >
            P
          </div>

          {/* Platform name in Hebrew */}
          <div
            style={{
              fontSize: '56px',
              fontWeight: 700,
              color: '#f5f0e8',
              textAlign: 'center',
              lineHeight: 1.3,
              fontFamily: heeboFont ? 'Heebo' : 'sans-serif',
              direction: 'rtl',
            }}
          >
            קהילת אנשי מקצוע חרדים
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '26px',
              fontWeight: 400,
              color: 'rgba(245, 240, 232, 0.8)',
              textAlign: 'center',
              lineHeight: 1.5,
              fontFamily: heeboFont ? 'Heebo' : 'sans-serif',
              maxWidth: '800px',
              direction: 'rtl',
            }}
          >
            פורומים מקצועיים | שוק פרילנסרים | קורסים | תיקי עבודות
          </div>
        </div>

        {/* Bottom accent bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(to left, #f5f0e8, #d4c5a9, #f5f0e8)',
            display: 'flex',
          }}
        />

        {/* Domain watermark */}
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '40px',
            fontSize: '18px',
            color: 'rgba(245, 240, 232, 0.5)',
            fontFamily: 'sans-serif',
            display: 'flex',
          }}
        >
          platform.co.il
        </div>
      </div>
    ),
    {
      ...size,
      ...(heeboFont
        ? {
            fonts: [
              {
                name: 'Heebo',
                data: heeboFont,
                style: 'normal' as const,
                weight: 400 as const,
              },
              {
                name: 'Heebo',
                data: heeboFont,
                style: 'normal' as const,
                weight: 700 as const,
              },
            ],
          }
        : {}),
    }
  );
}
