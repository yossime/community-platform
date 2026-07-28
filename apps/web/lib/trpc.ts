import { type CreateTRPCReact, createTRPCReact } from '@trpc/react-query';

import { type AppRouter } from '@platform/api/src/root';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
