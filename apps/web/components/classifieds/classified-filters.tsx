'use client';

import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@platform/ui/src/components/select';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';

const CLASSIFIED_TYPES = [
  { value: 'SELLING', label: 'למכירה' },
  { value: 'BUYING', label: 'קנייה' },
  { value: 'JOB_OFFER', label: 'דרושים' },
  { value: 'JOB_SEEKING', label: 'מחפש עבודה' },
  { value: 'REAL_ESTATE', label: 'נדל"ן' },
  { value: 'SERVICE', label: 'שירותים' },
  { value: 'EVENT', label: 'אירועים' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'חדש ביותר' },
  { value: 'price_low', label: 'מחיר: נמוך לגבוה' },
  { value: 'price_high', label: 'מחיר: גבוה לנמוך' },
  { value: 'popular', label: 'פופולרי' },
] as const;

export interface ClassifiedFilters {
  type?: string;
  categorySlug?: string;
  location?: string;
  priceMin?: number;
  priceMax?: number;
  sortBy: 'newest' | 'price_low' | 'price_high' | 'popular';
}

interface ClassifiedFiltersProps {
  filters: ClassifiedFilters;
  onChange: (filters: ClassifiedFilters) => void;
}

export function ClassifiedFiltersPanel({ filters, onChange }: ClassifiedFiltersProps) {
  const [location, setLocation] = useState(filters.location ?? '');
  const [priceMinInput, setPriceMinInput] = useState(
    filters.priceMin ? String(filters.priceMin / 100) : '',
  );
  const [priceMaxInput, setPriceMaxInput] = useState(
    filters.priceMax ? String(filters.priceMax / 100) : '',
  );

  const { data: categories, isLoading: categoriesLoading } =
    trpc.classified.listCategories.useQuery();

  const hasActiveFilters =
    filters.type ||
    filters.categorySlug ||
    filters.location ||
    filters.priceMin ||
    filters.priceMax;

  const handleTypeChange = (type: string) => {
    onChange({
      ...filters,
      type: type === filters.type ? undefined : type,
    });
  };

  const handleCategoryChange = (value: string) => {
    onChange({
      ...filters,
      categorySlug: value === 'all' ? undefined : value,
    });
  };

  const handleSortChange = (value: string) => {
    onChange({
      ...filters,
      sortBy: value as ClassifiedFilters['sortBy'],
    });
  };

  const handleLocationSearch = () => {
    onChange({
      ...filters,
      location: location.trim() || undefined,
    });
  };

  const handlePriceApply = () => {
    const minIls = parseFloat(priceMinInput);
    const maxIls = parseFloat(priceMaxInput);
    onChange({
      ...filters,
      priceMin: !isNaN(minIls) && minIls > 0 ? Math.round(minIls * 100) : undefined,
      priceMax: !isNaN(maxIls) && maxIls > 0 ? Math.round(maxIls * 100) : undefined,
    });
  };

  const handleClearFilters = () => {
    setLocation('');
    setPriceMinInput('');
    setPriceMaxInput('');
    onChange({
      sortBy: 'newest',
    });
  };

  return (
    <div className="space-y-6">
      {/* Type Filter Buttons */}
      <div>
        <Label className="mb-2 block text-sm font-medium">סוג מודעה</Label>
        <div className="flex flex-wrap gap-2">
          {CLASSIFIED_TYPES.map((type) => (
            <Button
              key={type.value}
              variant={filters.type === type.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleTypeChange(type.value)}
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Category Dropdown */}
      <div>
        <Label className="mb-2 block text-sm font-medium">קטגוריה</Label>
        {categoriesLoading ? (
          <div className="flex items-center justify-center py-2">
            <Spinner size="sm" />
          </div>
        ) : (
          <Select
            value={filters.categorySlug ?? 'all'}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="כל הקטגוריות" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הקטגוריות</SelectItem>
              {categories?.map((category) => (
                <SelectItem key={category.id} value={category.slug}>
                  {category.name} ({category._count.listings})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Location Input */}
      <div>
        <Label className="mb-2 block text-sm font-medium">מיקום</Label>
        <div className="flex gap-2">
          <Input
            placeholder="חפש לפי מיקום..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLocationSearch();
            }}
          />
          <Button variant="outline" size="icon" onClick={handleLocationSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Price Range */}
      <div>
        <Label className="mb-2 block text-sm font-medium">טווח מחירים</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="מינימום"
            value={priceMinInput}
            onChange={(e) => setPriceMinInput(e.target.value)}
            min={0}
          />
          <span className="text-sm text-muted-foreground">&ndash;</span>
          <Input
            type="number"
            placeholder="מקסימום"
            value={priceMaxInput}
            onChange={(e) => setPriceMaxInput(e.target.value)}
            min={0}
          />
          <Button variant="outline" size="sm" onClick={handlePriceApply}>
            <Filter className="me-1 h-3 w-3" />
            סנן
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">המחירים בש&quot;ח</p>
      </div>

      {/* Sort */}
      <div>
        <Label className="mb-2 block text-sm font-medium">מיין לפי</Label>
        <Select value={filters.sortBy} onValueChange={handleSortChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={handleClearFilters}
        >
          <X className="me-2 h-4 w-4" />
          נקה מסננים
        </Button>
      )}
    </div>
  );
}
