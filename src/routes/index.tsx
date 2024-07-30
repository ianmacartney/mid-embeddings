import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "@/SignInForm";
import { Authenticated, Unauthenticated } from "convex/react";
import Game from "@/components/Game";

export const Route = createFileRoute("/")({
  component: () => (
    <>
      <Authenticated>
        <div className="container">
          <Game />
        </div>
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  ),
});
