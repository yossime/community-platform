import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@platform/api/src/root';
import { createTRPCContext } from '@platform/api/src/trpc';
import { prisma } from '@platform/db';

import { createSupabaseServerClient } from '@/lib/supabase-server';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let userId: string | null = null;
      let userRole: string | null = null;

      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { supabaseAuthId: user.id },
          select: { id: true, role: true },
        });
        userId = dbUser?.id ?? null;
        userRole = dbUser?.role ?? null;
      }

      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

      return createTRPCContext({
        prisma,
        supabase,
        userId,
        userRole,
        clientIp,
      });
    },
  });

export { handler as GET, handler as POST };
