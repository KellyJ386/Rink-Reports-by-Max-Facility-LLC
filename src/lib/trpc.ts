"use client";

import { createTRPCReact } from "@trpc/react-query";

import type { AppRouter } from "@/server/trpc/routers";

/**
 * The single tRPC react client. Import `trpc` everywhere on the
 * client side; never call routes through plain fetch.
 */
export const trpc = createTRPCReact<AppRouter>();
