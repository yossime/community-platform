'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

export default function NewProjectPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetMinILS, setBudgetMinILS] = useState('');
  const [budgetMaxILS, setBudgetMaxILS] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createProject = trpc.marketplace.createProject.useMutation({
    onSuccess: () => {
      toast({
        title: 'הפרויקט נוצר',
        description: 'הפרויקט ממתין לאישור מנהל',
        variant: 'success',
      });
      router.push('/marketplace');
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message ?? 'לא ניתן ליצור פרויקט. נסה שוב',
        variant: 'destructive',
      });
    },
  });

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 10) {
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

    if (title.trim().length < 5) {
      newErrors.title = 'הכותרת חייבת להכיל לפחות 5 תווים';
    }
    if (description.trim().length < 50) {
      newErrors.description = 'התיאור חייב להכיל לפחות 50 תווים';
    }

    const minBudget = parseFloat(budgetMinILS);
    const maxBudget = parseFloat(budgetMaxILS);
    if (isNaN(minBudget) || minBudget <= 0) {
      newErrors.budgetMin = 'יש להזין תקציב מינימום תקין';
    }
    if (isNaN(maxBudget) || maxBudget <= 0) {
      newErrors.budgetMax = 'יש להזין תקציב מקסימום תקין';
    }
    if (!isNaN(minBudget) && !isNaN(maxBudget) && minBudget > maxBudget) {
      newErrors.budgetMax = 'תקציב מקסימום חייב להיות גבוה מתקציב מינימום';
    }

    if (skills.length < 1) {
      newErrors.skills = 'יש להוסיף לפחות מיומנות אחת';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    createProject.mutate({
      title: title.trim(),
      description: description.trim(),
      budgetMinAgorot: Math.round(minBudget * 100),
      budgetMaxAgorot: Math.round(maxBudget * 100),
      skills,
      deadline: deadline ? new Date(deadline) : undefined,
      isUrgent,
    });
  };

  // Loading auth state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-rubik text-lg font-semibold">
              יש להתחבר כדי לפרסם פרויקט
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              התחבר או הירשם כדי לפרסם פרויקט בשוק הפרילנסרים
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button asChild>
                <Link href="/login">התחבר</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/register">הירשם</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">
          שוק פרילנסרים
        </Link>
        <span>/</span>
        <span>פרויקט חדש</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-rubik">פרסם פרויקט חדש</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">כותרת הפרויקט</Label>
              <Input
                id="title"
                placeholder="למשל: בניית אתר תדמית לעסק"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrors((prev) => ({ ...prev, title: '' }));
                }}
                maxLength={200}
                disabled={createProject.isPending}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">תיאור הפרויקט</Label>
              <Textarea
                id="description"
                placeholder="תאר בפירוט את הפרויקט, מה נדרש, מה המטרות, ומה הציפיות..."
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setErrors((prev) => ({ ...prev, description: '' }));
                }}
                rows={8}
                maxLength={5000}
                disabled={createProject.isPending}
              />
              <div className="flex items-center justify-between">
                {errors.description && (
                  <p className="text-sm text-destructive">
                    {errors.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground ms-auto">
                  {description.length}/5000
                </p>
              </div>
            </div>

            {/* Budget */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budgetMin">תקציב מינימום (₪)</Label>
                <Input
                  id="budgetMin"
                  type="number"
                  placeholder="500"
                  value={budgetMinILS}
                  onChange={(e) => {
                    setBudgetMinILS(e.target.value);
                    setErrors((prev) => ({ ...prev, budgetMin: '' }));
                  }}
                  min={1}
                  step={1}
                  dir="ltr"
                  className="text-start"
                  disabled={createProject.isPending}
                />
                {errors.budgetMin && (
                  <p className="text-sm text-destructive">
                    {errors.budgetMin}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="budgetMax">תקציב מקסימום (₪)</Label>
                <Input
                  id="budgetMax"
                  type="number"
                  placeholder="5000"
                  value={budgetMaxILS}
                  onChange={(e) => {
                    setBudgetMaxILS(e.target.value);
                    setErrors((prev) => ({ ...prev, budgetMax: '' }));
                  }}
                  min={1}
                  step={1}
                  dir="ltr"
                  className="text-start"
                  disabled={createProject.isPending}
                />
                {errors.budgetMax && (
                  <p className="text-sm text-destructive">
                    {errors.budgetMax}
                  </p>
                )}
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-2">
              <Label htmlFor="skillInput">מיומנויות נדרשות</Label>
              <div className="flex gap-2">
                <Input
                  id="skillInput"
                  placeholder="הוסף מיומנות (למשל: React, Node.js)"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  disabled={createProject.isPending || skills.length >= 10}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddSkill}
                  disabled={
                    createProject.isPending ||
                    !skillInput.trim() ||
                    skills.length >= 10
                  }
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
                      onClick={() =>
                        !createProject.isPending && handleRemoveSkill(skill)
                      }
                    >
                      {skill} &times;
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {skills.length}/10 מיומנויות. לחץ על מיומנות כדי להסיר.
              </p>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label htmlFor="deadline">דד-ליין (אופציונלי)</Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                dir="ltr"
                className="text-start"
                disabled={createProject.isPending}
              />
            </div>

            {/* Urgent */}
            <div className="flex items-center gap-3">
              <input
                id="isUrgent"
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={createProject.isPending}
              />
              <Label htmlFor="isUrgent" className="cursor-pointer">
                פרויקט דחוף — דרוש ביצוע מהיר
              </Label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                הפרויקט יפורסם לאחר אישור מנהל
              </p>
              <div className="flex gap-3">
                <Button variant="outline" type="button" asChild>
                  <Link href="/marketplace">ביטול</Link>
                </Button>
                <Button type="submit" disabled={createProject.isPending}>
                  {createProject.isPending ? (
                    <Spinner
                      size="sm"
                      className="text-primary-foreground"
                    />
                  ) : (
                    'פרסם פרויקט'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
