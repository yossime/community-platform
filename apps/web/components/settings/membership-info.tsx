'use client';

import { Badge } from '@platform/ui/src/components/badge';
import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Separator } from '@platform/ui/src/components/separator';

const TIER_INFO = {
  FREE: { label: 'חינם', price: '₪0', color: 'secondary' as const },
  PROFESSIONAL: { label: 'מקצועי', price: '₪49/חודש', color: 'default' as const },
  BUSINESS: { label: 'עסקי', price: '₪99/חודש', color: 'default' as const },
  ENTERPRISE: { label: 'ארגוני', price: 'מותאם אישית', color: 'default' as const },
} as const;

interface MembershipInfoProps {
  membership: {
    tier: string;
    status: string;
    currentPeriodEnd: Date | null;
    canAccessMarketplace: boolean;
    canAccessAllForums: boolean;
    hasAiTools: boolean;
    hasAnalytics: boolean;
    canCreateCourses: boolean;
    maxPortfolioItems: number;
    maxClassifieds: number;
    maxDailyMessages: number;
  } | null;
}

export function MembershipInfo({ membership }: MembershipInfoProps) {
  const tier = (membership?.tier ?? 'FREE') as keyof typeof TIER_INFO;
  const info = TIER_INFO[tier] ?? TIER_INFO.FREE;

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-rubik text-lg">המנוי שלך</CardTitle>
              <CardDescription>פרטי המנוי הנוכחי</CardDescription>
            </div>
            <Badge variant={info.color} className="text-sm">
              {info.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="font-rubik text-3xl font-bold">{info.price}</span>
            {membership?.currentPeriodEnd && (
              <span className="text-sm text-muted-foreground">
                מתחדש בתאריך{' '}
                {new Date(membership.currentPeriodEnd).toLocaleDateString('he-IL')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik text-lg">יכולות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <FeatureRow label="גישה לשוק פרילנסרים" enabled={membership?.canAccessMarketplace ?? false} />
            <Separator />
            <FeatureRow label="גישה לכל הפורומים" enabled={membership?.canAccessAllForums ?? false} />
            <Separator />
            <FeatureRow label="כלי AI" enabled={membership?.hasAiTools ?? false} />
            <Separator />
            <FeatureRow label="אנליטיקס" enabled={membership?.hasAnalytics ?? false} />
            <Separator />
            <FeatureRow label="יצירת קורסים" enabled={membership?.canCreateCourses ?? false} />
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">פריטי תיק עבודות</span>
              <span className="text-sm font-medium">{membership?.maxPortfolioItems ?? 3}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">מודעות בלוח</span>
              <span className="text-sm font-medium">{membership?.maxClassifieds ?? 2}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">הודעות ביום</span>
              <span className="text-sm font-medium">{membership?.maxDailyMessages ?? 5}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade CTA */}
      {tier === 'FREE' && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-6 text-center">
            <h3 className="font-rubik text-lg font-bold">שדרג את המנוי שלך</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              קבל גישה לשוק הפרילנסרים, כלי AI, אנליטיקס ועוד
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button>שדרג למקצועי - ₪49/חודש</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      {enabled ? (
        <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
    </div>
  );
}
