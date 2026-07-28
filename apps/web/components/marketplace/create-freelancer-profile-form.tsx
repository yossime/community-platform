'use client';

import { useState } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@platform/ui/src/components/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';

interface CreateFreelancerProfileFormProps {
  /** If provided, the form is in edit mode with prefilled data */
  existingProfile?: {
    headline: string | null;
    description: string | null;
    hourlyRateAgorot: number | null;
    skills: string[];
    availability: string;
  };
  onSuccess?: () => void;
}

export function CreateFreelancerProfileForm({
  existingProfile,
  onSuccess,
}: CreateFreelancerProfileFormProps) {
  const isEdit = !!existingProfile;

  const [headline, setHeadline] = useState(existingProfile?.headline ?? '');
  const [description, setDescription] = useState(existingProfile?.description ?? '');
  const [hourlyRateILS, setHourlyRateILS] = useState(
    existingProfile?.hourlyRateAgorot
      ? (existingProfile.hourlyRateAgorot / 100).toString()
      : '',
  );
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>(existingProfile?.skills ?? []);
  const [availability, setAvailability] = useState(
    existingProfile?.availability ?? 'AVAILABLE',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();

  const createProfile = trpc.marketplace.createFreelancerProfile.useMutation({
    onSuccess: () => {
      utils.marketplace.myFreelancerProfile.invalidate();
      toast({
        title: 'פרופיל נוצר',
        description: 'פרופיל הפרילנסר שלך נוצר בהצלחה',
        variant: 'success',
      });
      onSuccess?.();
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message ?? 'לא ניתן ליצור פרופיל. נסה שוב',
        variant: 'destructive',
      });
    },
  });

  const updateProfile = trpc.marketplace.updateFreelancerProfile.useMutation({
    onSuccess: () => {
      utils.marketplace.myFreelancerProfile.invalidate();
      toast({
        title: 'הפרופיל עודכן',
        description: 'השינויים נשמרו בהצלחה',
        variant: 'success',
      });
      onSuccess?.();
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message ?? 'לא ניתן לעדכן את הפרופיל',
        variant: 'destructive',
      });
    },
  });

  const isPending = createProfile.isPending || updateProfile.isPending;

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 20) {
      setSkills([...skills, trimmed]);
      setSkillInput('');
      setErrors((prev) => ({ ...prev, skills: '' }));
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (headline.trim().length < 10) {
      newErrors.headline = 'הכותרת חייבת להכיל לפחות 10 תווים';
    }
    if (description.trim().length < 50) {
      newErrors.description = 'התיאור חייב להכיל לפחות 50 תווים';
    }
    if (skills.length < 1) {
      newErrors.skills = 'יש להוסיף לפחות מיומנות אחת';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const rate = parseFloat(hourlyRateILS);
    const hourlyRateAgorot =
      !isNaN(rate) && rate > 0 ? Math.round(rate * 100) : undefined;

    const data = {
      headline: headline.trim(),
      description: description.trim(),
      hourlyRateAgorot,
      skills,
      availability: availability as 'AVAILABLE' | 'BUSY' | 'NOT_AVAILABLE',
    };

    if (isEdit) {
      updateProfile.mutate(data);
    } else {
      createProfile.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-rubik">
          {isEdit ? 'עריכת פרופיל פרילנסר' : 'יצירת פרופיל פרילנסר'}
        </CardTitle>
        <CardDescription>
          {isEdit
            ? 'עדכן את הפרטים שלך כדי למשוך לקוחות חדשים'
            : 'צור פרופיל פרילנסר כדי להתחיל לקבל הצעות עבודה'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Headline */}
          <div className="space-y-2">
            <Label htmlFor="headline">כותרת מקצועית</Label>
            <Input
              id="headline"
              placeholder="למשל: מפתח Full-Stack עם 5 שנות ניסיון"
              value={headline}
              onChange={(e) => {
                setHeadline(e.target.value);
                setErrors((prev) => ({ ...prev, headline: '' }));
              }}
              maxLength={200}
              disabled={isPending}
            />
            {errors.headline && (
              <p className="text-sm text-destructive">{errors.headline}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">תיאור</Label>
            <Textarea
              id="description"
              placeholder="תאר את הניסיון, ההתמחויות, והערך שאתה מביא ללקוחות..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrors((prev) => ({ ...prev, description: '' }));
              }}
              rows={6}
              maxLength={3000}
              disabled={isPending}
            />
            <div className="flex items-center justify-between">
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description}</p>
              )}
              <p className="text-xs text-muted-foreground ms-auto">
                {description.length}/3000
              </p>
            </div>
          </div>

          {/* Hourly Rate + Availability */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">תעריף לשעה (₪) — אופציונלי</Label>
              <Input
                id="hourlyRate"
                type="number"
                placeholder="0"
                value={hourlyRateILS}
                onChange={(e) => setHourlyRateILS(e.target.value)}
                min={0}
                step={1}
                dir="ltr"
                className="text-start"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability">זמינות</Label>
              <Select
                value={availability}
                onValueChange={(v) => setAvailability(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">זמין לעבודה</SelectItem>
                  <SelectItem value="BUSY">עמוס חלקית</SelectItem>
                  <SelectItem value="NOT_AVAILABLE">לא זמין כרגע</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Skills */}
          <div className="space-y-2">
            <Label htmlFor="skillInput">מיומנויות</Label>
            <div className="flex gap-2">
              <Input
                id="skillInput"
                placeholder="הוסף מיומנות (למשל: React)"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={handleSkillKeyDown}
                disabled={isPending || skills.length >= 20}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddSkill}
                disabled={isPending || !skillInput.trim() || skills.length >= 20}
              >
                הוסף
              </Button>
            </div>
            {errors.skills && (
              <p className="text-sm text-destructive">{errors.skills}</p>
            )}
            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20"
                    onClick={() => !isPending && handleRemoveSkill(skill)}
                  >
                    {skill} &times;
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {skills.length}/20 מיומנויות. לחץ על מיומנות כדי להסיר.
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Spinner size="sm" className="text-primary-foreground" />
              ) : isEdit ? (
                'שמור שינויים'
              ) : (
                'צור פרופיל'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
