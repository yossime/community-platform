# 14 — RTL & Cultural Requirements

> RTL-first implementation, Netfree compliance, Hebrew typography, and Haredi cultural considerations

---

## 1. RTL-First Design Principles

The platform is **RTL-first** — all layouts, components, and styles default to right-to-left. LTR content (English, code snippets) is handled as the exception.

### 1.1 Root Configuration

```tsx
// apps/web/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="font-heebo antialiased">
        {children}
      </body>
    </html>
  );
}
```

### 1.2 Tailwind Logical Properties

**Never use physical properties** (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`). Always use **logical properties**:

| Physical (DO NOT USE) | Logical (USE THIS) | Meaning in RTL |
|----------------------|-------------------|----------------|
| `ml-4` | `ms-4` | Margin inline-start (right in RTL) |
| `mr-4` | `me-4` | Margin inline-end (left in RTL) |
| `pl-4` | `ps-4` | Padding inline-start |
| `pr-4` | `pe-4` | Padding inline-end |
| `left-0` | `start-0` | Inset inline-start |
| `right-0` | `end-0` | Inset inline-end |
| `text-left` | `text-start` | Text align start |
| `text-right` | `text-end` | Text align end |
| `border-l` | `border-s` | Border inline-start |
| `border-r` | `border-e` | Border inline-end |
| `rounded-l` | `rounded-s` | Border radius start |
| `rounded-r` | `rounded-e` | Border radius end |
| `float-left` | `float-start` | Float inline-start |
| `float-right` | `float-end` | Float inline-end |
| `scroll-ml-4` | `scroll-ms-4` | Scroll margin start |

### 1.3 ESLint Rule for RTL

```javascript
// Custom ESLint rule to prevent physical properties
// .eslintrc.js
module.exports = {
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/\\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right|border-l|border-r|rounded-l|rounded-r|float-left|float-right)/]",
        message: "Use logical properties (ms-/me-/ps-/pe-/start-/end-) for RTL support.",
      },
    ],
  },
};
```

### 1.4 Flexbox & Grid Direction

Flexbox and Grid automatically respect `dir="rtl"`. No special handling needed:

```tsx
// This row will be RTL automatically:
<div className="flex items-center gap-3">
  <Avatar />         {/* Appears on the RIGHT */}
  <span>שם המשתמש</span>  {/* Appears to the LEFT of avatar */}
</div>
```

---

## 2. Icon Flipping

Directional icons must be flipped in RTL. Non-directional icons stay the same.

### 2.1 Icons That Must Flip

| Icon | Meaning | Flip? |
|------|---------|-------|
| `ArrowRight` | Forward/next | ✓ (becomes ArrowLeft in RTL) |
| `ArrowLeft` | Back/previous | ✓ (becomes ArrowRight in RTL) |
| `ChevronRight` | Expand/navigate | ✓ |
| `ChevronLeft` | Collapse/back | ✓ |
| `ExternalLink` | Open in new tab | ✓ |
| `Reply` | Reply to post | ✓ |
| `Undo` / `Redo` | Undo/redo | ✓ |

### 2.2 Icons That MUST NOT Flip

| Icon | Meaning | Flip? |
|------|---------|-------|
| `Search` | Search | ✗ |
| `Heart` | Like | ✗ |
| `Star` | Favorite | ✗ |
| `Check` | Confirm | ✗ |
| `X` | Close | ✗ |
| `Plus` | Add | ✗ |
| `Clock` | Time | ✗ |
| `Calendar` | Date | ✗ |

### 2.3 Implementation

```tsx
// packages/ui/src/components/rtl-icon.tsx
import { cn } from "../utils";

interface RtlIconProps {
  icon: React.FC<{ className?: string }>;
  flip?: boolean; // Whether this icon should flip in RTL
  className?: string;
}

export function RtlIcon({ icon: Icon, flip = false, className }: RtlIconProps) {
  return (
    <Icon
      className={cn(
        className,
        flip && "rtl:-scale-x-100", // Flip horizontally in RTL
      )}
    />
  );
}

// Usage:
<RtlIcon icon={ChevronRight} flip />  // Flips in RTL
<RtlIcon icon={Heart} />              // Never flips
```

---

## 3. Typography

### 3.1 Font Stack

```typescript
// packages/ui/tailwind.config.ts
export default {
  theme: {
    extend: {
      fontFamily: {
        heebo: ["Heebo", "sans-serif"],     // Primary Hebrew body
        rubik: ["Rubik", "sans-serif"],      // Headings
        noto: ["Noto Sans Hebrew", "sans-serif"], // Fallback
        mono: ["JetBrains Mono", "Fira Code", "monospace"], // Code
      },
    },
  },
};
```

### 3.2 Font Loading (Self-Hosted)

All fonts are self-hosted in `/public/fonts/` for Netfree compliance. No Google Fonts.

```css
/* apps/web/app/globals.css */
@font-face {
  font-family: "Heebo";
  src: url("/fonts/heebo/Heebo-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}

@font-face {
  font-family: "Rubik";
  src: url("/fonts/rubik/Rubik-Variable.woff2") format("woff2-variations");
  font-weight: 300 900;
  font-display: swap;
}

@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/jetbrains-mono/JetBrainsMono-Variable.woff2") format("woff2-variations");
  font-weight: 100 800;
  font-display: swap;
  unicode-range: U+0000-00FF;
}
```

### 3.3 Typography Scale

```css
/* Hebrew-optimized line heights (taller than Latin) */
.text-body   { font-size: 16px; line-height: 1.75; }
.text-sm     { font-size: 14px; line-height: 1.7; }
.text-lg     { font-size: 18px; line-height: 1.7; }
.text-h1     { font-size: 32px; line-height: 1.4; font-weight: 700; }
.text-h2     { font-size: 24px; line-height: 1.4; font-weight: 700; }
.text-h3     { font-size: 20px; line-height: 1.5; font-weight: 600; }
```

---

## 4. Rich Text Editor (Tiptap)

### 4.1 RTL Configuration

```typescript
// apps/web/components/forums/post-editor.tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextDirection from "@tiptap/extension-text-direction";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";

const editor = useEditor({
  extensions: [
    StarterKit,
    TextDirection.configure({
      types: ["heading", "paragraph"],
      defaultDirection: "rtl",
    }),
    Placeholder.configure({
      placeholder: "כתוב כאן...",
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer nofollow" },
    }),
    Image.configure({
      allowBase64: false, // Force upload, not inline base64
    }),
    CodeBlockLowlight, // Code blocks stay LTR
  ],
  editorProps: {
    attributes: {
      class: "prose prose-rtl max-w-none focus:outline-none min-h-[200px] p-4",
      dir: "rtl",
    },
  },
});
```

### 4.2 Mixed-Direction Content

Code blocks and URLs automatically switch to LTR:

```css
/* Code blocks are always LTR */
.ProseMirror pre,
.ProseMirror code {
  direction: ltr;
  text-align: left;
  font-family: "JetBrains Mono", monospace;
}

/* URLs in links are LTR */
.ProseMirror a[href] {
  unicode-bidi: embed;
}
```

---

## 5. Date & Number Formatting

### 5.1 Date Formatting

```typescript
// apps/web/lib/utils.ts

export function formatDate(date: Date | string, style: "full" | "short" | "relative" = "short"): string {
  const d = new Date(date);

  switch (style) {
    case "full":
      return new Intl.DateTimeFormat("he-IL", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
      // → "21 בפברואר 2026, 14:30"

    case "short":
      return new Intl.DateTimeFormat("he-IL", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
      // → "21 בפבר׳ 2026"

    case "relative":
      return formatRelativeTime(d);
      // → "לפני 3 שעות"
  }
}

function formatRelativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return rtf.format(-seconds, "second");
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 604800) return rtf.format(-Math.floor(seconds / 86400), "day");
  if (seconds < 2592000) return rtf.format(-Math.floor(seconds / 604800), "week");
  return formatDate(date, "short");
}
```

### 5.2 Number & Currency Formatting

```typescript
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("he-IL").format(n);
  // 1234567 → "1,234,567"
}

export function formatCurrency(agorot: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(agorot / 100);
  // 4900 → "₪49"
  // 9950 → "₪99.50"
}

export function formatCompactNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1000000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
  // 1500 → "1.5K", 15000 → "15K"
}
```

### 5.3 Hebrew Day/Month Names

Built into `Intl.DateTimeFormat("he-IL")`:
- Days: ראשון, שני, שלישי, רביעי, חמישי, שישי, שבת
- Months: ינואר, פברואר, מרץ, אפריל, מאי, יוני, יולי, אוגוסט, ספטמבר, אוקטובר, נובמבר, דצמבר

---

## 6. Netfree Compliance

### 6.1 What is Netfree?

Netfree is a content-filtering proxy used by ~80% of Haredi internet users (both home and mobile). It blocks external CDNs, social media, immodest content, and many third-party services. Websites that rely on external resources will appear broken or be completely blocked.

### 6.2 Compliance Checklist

| # | Rule | Status | Implementation |
|---|------|--------|---------------|
| 1 | No external CDN | ✓ | All assets served via Vercel edge on platform domain |
| 2 | No Google Fonts | ✓ | Self-hosted .woff2 in `/public/fonts/` |
| 3 | No external analytics | ✓ | PostHog self-hosted or Vercel Analytics (first-party) |
| 4 | No social media embeds | ✓ | No Twitter/YouTube/Facebook/Instagram embeds |
| 5 | No external images | ✓ | All images proxied through platform domain |
| 6 | No Google reCAPTCHA | ✓ | Custom rate limiting + phone OTP verification |
| 7 | No external chat widgets | ✓ | Built-in messaging system |
| 8 | No social OAuth | ✓ | Email/password + phone OTP only |
| 9 | Single-domain routing | ✓ | All resources from `platform.co.il` |
| 10 | No WebRTC to external | ✓ | WebSocket via platform's own WS server |
| 11 | No external video players | ✓ | Self-hosted HLS player for courses |
| 12 | No external maps | ✓ | Location as text fields, no Google Maps |

### 6.3 Testing Strategy

```bash
# Test site through Netfree proxy
# 1. Configure browser to use Netfree proxy
# 2. Load all pages and verify:
#    - No broken images
#    - No missing fonts
#    - No blocked scripts
#    - No external requests in Network tab
#    - All features functional

# Automated check: verify no external domains in HTML output
curl -s https://platform.co.il | grep -oP 'https?://[^/"]+' | sort -u
# Should only show platform.co.il and *.platform.co.il
```

---

## 7. Cultural Considerations

### 7.1 Gender Sensitivity

| Feature | Implementation |
|---------|---------------|
| Gender during registration | Required field (MALE/FEMALE) for access control |
| Women-only forums | `genderRestriction: "FEMALE"` with women moderators |
| Profile photos | Men: optional. Women: not expected (many prefer no photo) |
| Display name | Can use initials or nickname (privacy-conscious community) |
| Image moderation | Zero-tolerance for images of women/girls (see 08-AI-SERVICES) |

### 7.2 Religious Calendar Awareness

```typescript
// Shabbat/Holiday detection for notification scheduling
// Do NOT send WhatsApp/push notifications during Shabbat/Chagim

import { HebrewCalendar, Location } from "@hebcal/core";

const JERUSALEM = new Location(31.7683, 35.2137, true, "Asia/Jerusalem", "Jerusalem", "IL");

export function isShabbatOrChag(): boolean {
  const now = new Date();
  const events = HebrewCalendar.calendar({
    start: now,
    end: now,
    location: JERUSALEM,
    candlelighting: true,
  });

  // Check if current time is between candle lighting and havdalah
  for (const event of events) {
    if (event.desc === "Candle lighting" && now >= event.eventTime) return true;
    if (event.desc === "Havdalah" && now <= event.eventTime) return false;
  }

  // Fallback: Friday 15:00 to Saturday 21:00 (Israel time)
  const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const day = israelTime.getDay();
  const hour = israelTime.getHours();

  if (day === 5 && hour >= 15) return true; // Friday afternoon
  if (day === 6) return true; // Saturday
  return false;
}

// Used in notification worker:
if (channels.includes("WHATSAPP") && !isShabbatOrChag()) {
  await sendWhatsAppNotification(...);
}
```

### 7.3 Content Guidelines

| Topic | Policy |
|-------|--------|
| Halacha discussions | Allowed with respect; no mocking religious practice |
| Political content | Allowed in designated forums only |
| Lashon Hara (gossip) | Strictly moderated; personal attacks = immediate removal |
| Commercial content | Allowed in marketplace/classifieds only, not in forums |
| Hebrew language | Primary language; English technical terms acceptable |
| Yiddish | Supported in content; UI remains Hebrew |

### 7.4 Community Trust Model

The reputation system reflects community values:

| Score Component | Weight | How Earned |
|----------------|--------|------------|
| Forum participation | 30% | Posts, helpful answers, discussions |
| Marketplace reliability | 25% | Completed projects, on-time delivery, reviews |
| Portfolio quality | 15% | Likes, comments, featured work |
| Education contribution | 15% | Courses created, reviews, certifications |
| Community trust | 15% | No moderation issues, verified account, tenure |

Badge progression: נטע חדש (Newcomer) → תורם (Contributor) → פעיל (Active) → מהימן (Trusted) → מומחה (Expert) → אגדה (Legend)

---

## 8. Accessibility (a11y)

### 8.1 RTL-Specific Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Screen reader direction | `dir="rtl"` on `<html>` — screen readers announce RTL |
| Keyboard navigation | Tab order follows visual RTL flow |
| ARIA labels | Hebrew text for all ARIA attributes |
| Focus indicators | Visible focus ring, positioned correctly in RTL |
| Skip links | "דלג לתוכן" (Skip to content) as first focusable element |

### 8.2 General Accessibility

| Standard | Target |
|----------|--------|
| WCAG | 2.1 Level AA |
| Keyboard navigation | Full site navigable via keyboard |
| Screen reader | Compatible with NVDA, JAWS, VoiceOver |
| Color contrast | Minimum 4.5:1 for body text, 3:1 for large text |
| Motion | `prefers-reduced-motion` respected |
| Font size | Minimum 16px body, scalable via browser zoom |
