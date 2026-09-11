import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn, getGlobalStartContext } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";

const getCspNonce = createIsomorphicFn()
  .server(() => {
    const context = getGlobalStartContext() as { cspNonce?: string } | undefined;
    return context?.cspNonce;
  })
  .client(() => undefined);

export const getRouter = () => createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  ssr: { nonce: getCspNonce() },
});

declare module "@tanstack/react-router" { interface Register { router: ReturnType<typeof getRouter>; } }
