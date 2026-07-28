'use client';

import { useState } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';

interface ProfileFormProps {
  user: {
    id: string;
    displayName: string;
    username: string;
    email: string;
    bio: string | null;
    location: string | null;
    website: string | null;
    avatarUrl: string | null;
  };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio ?? '');
  const [location, setLocation] = useState(user.location ?? '');
  const [website, setWebsite] = useState(user.website ?? '');

  const utils = trpc.useUtils();
  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      utils.user.getMe.invalidate();
      toast({ title: 'הפרופיל עודכן', description: 'השינויים נשמרו בהצלחה', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'שגיאה', description: 'לא ניתן לעדכן את הפרופיל', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      displayName: displayName.trim(),
      bio: bio.trim() || undefined,
      location: location.trim() || undefined,
      website: website.trim() || undefined,
    });
  };

  const initials = displayName.slice(0, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-rubik">פרופיל</CardTitle>
        <CardDescription>עדכן את המידע האישי שלך</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar section */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.displayName}</p>
              <p className="text-sm text-muted-foreground" dir="ltr">@{user.username}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">שם תצוגה</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={updateProfile.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">מיקום</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ירושלים"
                disabled={updateProfile.isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">אודות</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="ספר על עצמך..."
              rows={4}
              maxLength={500}
              disabled={updateProfile.isPending}
            />
            <p className="text-xs text-muted-foreground">{bio.length}/500</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">אתר אינטרנט</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              dir="ltr"
              className="text-start"
              disabled={updateProfile.isPending}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : 'שמור שינויים'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
