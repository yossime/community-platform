import type { Metadata } from 'next';

import { CourseManage } from '@/components/course-manage';

export const metadata: Metadata = {
  title: 'ניהול קורס',
};

export default function CourseManagePage({ params }: { params: { slug: string } }) {
  return <CourseManage slug={params.slug} />;
}
