import { createFileRoute } from "@tanstack/react-router";
import { NatApp } from "@/components/nat/NatApp";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: NatApp,
});