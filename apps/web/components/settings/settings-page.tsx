'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@platform/ui/src/components/tabs';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { ProfileForm } from './profile-form';
import { AccountSettings } from './account-settings';
import { MembershipInfo } from './membership-info';

export function SettingsPage() {
  const { user } = useAuth();
  const { data: me, isLoading } = trpc.user.getMe.useQuery(undefined, {
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
        לא ניתן לטעון את הפרופיל. נסה לרענן את הדף.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">הגדרות</h1>
        <p className="mt-2 text-muted-foreground">נהל את הפרופיל וההגדרות שלך</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">פרופיל</TabsTrigger>
          <TabsTrigger value="account">חשבון</TabsTrigger>
          <TabsTrigger value="membership">מנוי</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm user={me} />
        </TabsContent>

        <TabsContent value="account">
          <AccountSettings settings={me.settings} />
        </TabsContent>

        <TabsContent value="membership">
          <MembershipInfo membership={me.membership} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
