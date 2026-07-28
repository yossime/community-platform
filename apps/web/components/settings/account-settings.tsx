'use client';

import { useState } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Label } from '@platform/ui/src/components/label';
import { Separator } from '@platform/ui/src/components/separator';
import { Spinner } from '@platform/ui/src/components/spinner';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';

interface AccountSettingsProps {
  settings: {
    theme: string;
    emailNotifications: boolean;
    whatsappNotifications: boolean;
    pushNotifications: boolean;
    profileVisibility: string;
    showOnlineStatus: boolean;
  } | null;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
            checked ? '-translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function AccountSettings({ settings }: AccountSettingsProps) {
  const [theme, setTheme] = useState(settings?.theme ?? 'light');
  const [emailNotifs, setEmailNotifs] = useState(settings?.emailNotifications ?? true);
  const [whatsappNotifs, setWhatsappNotifs] = useState(settings?.whatsappNotifications ?? false);
  const [pushNotifs, setPushNotifs] = useState(settings?.pushNotifications ?? false);
  const [visibility, setVisibility] = useState(settings?.profileVisibility ?? 'PUBLIC');
  const [showOnline, setShowOnline] = useState(settings?.showOnlineStatus ?? true);

  const utils = trpc.useUtils();
  const updateSettings = trpc.user.updateSettings.useMutation({
    onSuccess: () => {
      utils.user.getMe.invalidate();
      toast({ title: 'ההגדרות עודכנו', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'שגיאה', description: 'לא ניתן לעדכן הגדרות', variant: 'destructive' });
    },
  });

  const handleSave = () => {
    updateSettings.mutate({
      theme: theme as 'light' | 'dark',
      emailNotifications: emailNotifs,
      whatsappNotifications: whatsappNotifs,
      pushNotifications: pushNotifs,
      profileVisibility: visibility as 'PUBLIC' | 'PRIVATE',
      showOnlineStatus: showOnline,
    });
  };

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik text-lg">מראה</CardTitle>
          <CardDescription>בחר את העיצוב המועדף</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex-1 rounded-md border p-4 text-center transition-colors ${
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input hover:bg-accent'
              }`}
            >
              <div className="mx-auto mb-2 h-8 w-8 rounded-full border-2 border-current bg-white" />
              <span className="text-sm font-medium">בהיר</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex-1 rounded-md border p-4 text-center transition-colors ${
                theme === 'dark'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input hover:bg-accent'
              }`}
            >
              <div className="mx-auto mb-2 h-8 w-8 rounded-full border-2 border-current bg-gray-800" />
              <span className="text-sm font-medium">כהה</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik text-lg">התראות</CardTitle>
          <CardDescription>בחר כיצד תרצה לקבל התראות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <ToggleRow
            label="אימייל"
            description="קבל התראות לכתובת האימייל"
            checked={emailNotifs}
            onChange={setEmailNotifs}
            disabled={updateSettings.isPending}
          />
          <Separator />
          <ToggleRow
            label="WhatsApp"
            description="קבל התראות ב-WhatsApp"
            checked={whatsappNotifs}
            onChange={setWhatsappNotifs}
            disabled={updateSettings.isPending}
          />
          <Separator />
          <ToggleRow
            label="התראות דחיפה"
            description="קבל התראות דחיפה בדפדפן"
            checked={pushNotifs}
            onChange={setPushNotifs}
            disabled={updateSettings.isPending}
          />
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik text-lg">פרטיות</CardTitle>
          <CardDescription>הגדרות פרטיות ונראות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between py-3">
            <div>
              <Label className="text-sm font-medium">נראות פרופיל</Label>
              <p className="text-xs text-muted-foreground">מי יכול לראות את הפרופיל שלך</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility('PUBLIC')}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  visibility === 'PUBLIC'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                ציבורי
              </button>
              <button
                type="button"
                onClick={() => setVisibility('PRIVATE')}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  visibility === 'PRIVATE'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                פרטי
              </button>
            </div>
          </div>
          <Separator />
          <ToggleRow
            label="הצג מצב מחובר"
            description="הצג למשתמשים אחרים שאתה מחובר"
            checked={showOnline}
            onChange={setShowOnline}
            disabled={updateSettings.isPending}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : 'שמור הגדרות'}
        </Button>
      </div>
    </div>
  );
}
