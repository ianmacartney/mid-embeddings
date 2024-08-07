import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "@/SignInForm";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import Game from "@/components/Game";
import { api } from "@convex/_generated/api";

export const Route = createFileRoute("/")({
  component: () => {
    // TODO: get namespace from env variable, default to first namespace.
    const gameResult = useQuery(api.game.getDailyGame, {
      namespace: "MixedFeels",
    });
    if (gameResult && !gameResult.ok) {
      return <div>Error: {gameResult.error}</div>;
    }
    if (!gameResult) {
      return <div>Loading...</div>;
    }
    return (
      <>
        <Authenticated>
          <div className="container">
            <Game {...gameResult?.value} />
          </div>
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </>
    );
  },
});
