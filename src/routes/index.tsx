import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "@/SignInForm";
import { Authenticated, Unauthenticated } from "convex/react";

export const Route = createFileRoute("/")({
  component: () => (
    <>
      <Authenticated>hi</Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  ),
});
