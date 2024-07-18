import { createLazyFileRoute, Navigate } from "@tanstack/react-router";
import { SignInForm } from "@/SignInForm";
import { Authenticated, Unauthenticated } from "convex/react";

export const Route = createLazyFileRoute("/login")({
  component: () => {
    return (
      <>
        <Authenticated>
          <Navigate to="/" />
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </>
    );
  },
});
