'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';

import { SidebarNav } from './sidebar-nav';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="תפריט"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 start-0 z-50 w-72 bg-background shadow-lg">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-rubik text-lg font-bold text-primary">
                קהילת אנשי מקצוע
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="סגור תפריט"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-4">
              <SidebarNav onItemClick={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
