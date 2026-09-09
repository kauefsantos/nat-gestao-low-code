import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});