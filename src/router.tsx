import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { AuthState } from "./hooks/use-auth";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {
      auth: {
        isAuthenticated: false,
        user: null,
        session: null,
        isLoading: true,
      } as AuthState,
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
