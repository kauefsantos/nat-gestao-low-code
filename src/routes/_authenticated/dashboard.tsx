import { createFileRoute } from "@tanstack/react-router";
import { NatApp } from "@/app/NatApp";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: NatApp,
});