'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Newspaper } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';
import { toast } from '@platform/ui/src/hooks/use-toast';

const CLASSIFIED_TYPES = [
  { value: 'SELLING', label: 'למכירה' },
  { value: 'BUYING', label: 'קנייה' },
  { value: 'JOB_OFFER', label: 'דרושים' },
  { value: 'JOB_SEEKING', label: 'מחפש עבודה' },
  { value: 'REAL_ESTATE', label: 'נדל"ן' },
  { value: 'SERVICE', label: 'שירותים' },
  { value: 'EVENT', label: 'אירועים' },
] as const;

interface FormErrors {
  title?: string;
  description?: string;
  type?: string;
  categoryId?: string;
  location?: string;
  price?: string;
  contactPhone?: string;
  contactEmail?: string;
  images?: string;
}

export function CreateClassifiedForm() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceIls, setPriceIls] = useState('');
  const [priceLabel, setPriceLabel] = useState('');
  const [location, setLocation] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [images, setImages] = useState<string[]>(['']);
  const [errors, setErrors] = useState<FormErrors>({});

  const { data: categories, isLoading: categoriesLoading } =
    trpc.classified.listCategories.useQuery();

  const createListing = trpc.classified.create.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'המודעה נוצרה בהצלחה',
        description: 'המודעה ממתינה לאישור מנהל',
        variant: 'success',
      });
      router.push(`/classifieds/${data.slug}`);
    },
    onError: (error) => {
      toast({
        title: 'שגיאה',
        description: error.message || 'לא ניתן ליצור את המודעה. נסה שוב.',
        variant: 'destructive',
      });
    },
  });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!title || title.length < 5) {
      newErrors.title = 'הכותרת חייבת להכיל לפחות 5 תווים';
    }
    if (title.length > 200) {
      newErrors.title = 'הכותרת חייבת להכיל עד 200 תווים';
    }
    if (!description || description.length < 20) {
      newErrors.description = 'התיאור חייב להכיל לפחות 20 תווים';
    }
    if (description.length > 5000) {
      newErrors.description = 'התיאור חייב להכיל עד 5000 תווים';
    }
    if (!type) {
      newErrors.type = 'יש לבחור סוג מודעה';
    }
    if (!categoryId) {
      newErrors.categoryId = 'יש לבחור קטגוריה';
    }
    if (!location || location.length < 2) {
      newErrors.location = 'יש להזין מיקום (לפחות 2 תווים)';
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      newErrors.contactEmail = 'כתובת אימייל לא תקינה';
    }

    const validImages = images.filter((url) => url.trim() !== '');
    if (validImages.length > 10) {
      newErrors.images = 'ניתן להעלות עד 10 תמונות';
    }
    for (const url of validImages) {
      try {
        new URL(url);
      } catch {
        newErrors.images = 'כתובת תמונה לא תקינה';
        break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const priceValue = parseFloat(priceIls);
    const validImages = images.filter((url) => url.trim() !== '');

    createListing.mutate({
      title: title.trim(),
      description: description.trim(),
      type: type as
        | 'SELLING'
        | 'BUYING'
        | 'JOB_OFFER'
        | 'JOB_SEEKING'
        | 'REAL_ESTATE'
        | 'SERVICE'
        | 'EVENT',
      categoryId,
      priceAgorot:
        !isNaN(priceValue) && priceValue > 0
          ? Math.round(priceValue * 100)
          : undefined,
      priceLabel: priceLabel.trim() || undefined,
      location: location.trim(),
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      images: validImages,
    });
  };

  const addImageSlot = () => {
    if (images.length >= 10) return;
    setImages([...images, '']);
  };

  const removeImageSlot = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const updateImage = (index: number, value: string) => {
    const newImages = [...images];
    newImages[index] = value;
    setImages(newImages);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Newspaper className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="font-rubik text-xl">פרסם מודעה חדשה</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              מלא את הפרטים הבאים כדי לפרסם מודעה בלוח
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">כותרת *</Label>
            <Input
              id="title"
              placeholder="כותרת המודעה"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={createListing.isPending}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {title.length}/200 תווים
            </p>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">סוג מודעה *</Label>
            <Select value={type} onValueChange={setType} disabled={createListing.isPending}>
              <SelectTrigger id="type">
                <SelectValue placeholder="בחר סוג מודעה" />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFIED_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-xs text-destructive">{errors.type}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">קטגוריה *</Label>
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-2">
                <Spinner size="sm" />
              </div>
            ) : (
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={createListing.isPending}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.categoryId && (
              <p className="text-xs text-destructive">{errors.categoryId}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">תיאור *</Label>
            <Textarea
              id="description"
              placeholder="תאר את המודעה בפירוט..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={5000}
              disabled={createListing.isPending}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {description.length}/5000 תווים
            </p>
          </div>

          {/* Price */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">מחיר (ש&quot;ח)</Label>
              <Input
                id="price"
                type="number"
                placeholder="0"
                value={priceIls}
                onChange={(e) => setPriceIls(e.target.value)}
                min={0}
                step="0.01"
                disabled={createListing.isPending}
              />
              {errors.price && (
                <p className="text-xs text-destructive">{errors.price}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceLabel">תיאור מחיר (אופציונלי)</Label>
              <Input
                id="priceLabel"
                placeholder='לדוגמא: "ניתן למשא ומתן"'
                value={priceLabel}
                onChange={(e) => setPriceLabel(e.target.value)}
                maxLength={50}
                disabled={createListing.isPending}
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">מיקום *</Label>
            <Input
              id="location"
              placeholder="עיר או אזור"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              disabled={createListing.isPending}
            />
            {errors.location && (
              <p className="text-xs text-destructive">{errors.location}</p>
            )}
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactPhone">טלפון ליצירת קשר</Label>
              <Input
                id="contactPhone"
                type="tel"
                placeholder="050-0000000"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                dir="ltr"
                disabled={createListing.isPending}
              />
              {errors.contactPhone && (
                <p className="text-xs text-destructive">{errors.contactPhone}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">אימייל ליצירת קשר</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="email@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                dir="ltr"
                disabled={createListing.isPending}
              />
              {errors.contactEmail && (
                <p className="text-xs text-destructive">{errors.contactEmail}</p>
              )}
            </div>
          </div>

          {/* Images */}
          <div className="space-y-3">
            <Label>תמונות (עד 10)</Label>
            {images.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="הכנס קישור לתמונה (URL)"
                  value={url}
                  onChange={(e) => updateImage(index, e.target.value)}
                  dir="ltr"
                  disabled={createListing.isPending}
                />
                {images.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeImageSlot(index)}
                    disabled={createListing.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {errors.images && (
              <p className="text-xs text-destructive">{errors.images}</p>
            )}
            {images.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addImageSlot}
                disabled={createListing.isPending}
              >
                <Plus className="me-2 h-4 w-4" />
                הוסף תמונה
              </Button>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={createListing.isPending}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={createListing.isPending}>
              {createListing.isPending ? (
                <Spinner size="sm" className="text-primary-foreground" />
              ) : (
                'פרסם מודעה'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
