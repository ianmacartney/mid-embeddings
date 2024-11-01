import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { api } from "@convex/_generated/api";
import { RoundInfo } from "@convex/round";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { CornerDownRight } from "lucide-react";
import { useState } from "react";

export function GuessInput({ round }: { round?: RoundInfo }) {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const guesses = useQuery(
    api.round.listGuesses,
    round?.roundId ? { roundId: round.roundId } : "skip",
  );
  const [guess, setGuess] = useState("");
  const [guessing, setGuessing] = useState(false);
  const makeGuess = () => {
    if (!round) {
      toast({
        title: "Error submitting guess",
        description: "Round not found",
      });
      return;
    }
    if (!isAuthenticated) {
      toast({
        title: "Error submitting guess",
        description: "Not logged in.",
      });
      return;
    }
    setGuess("");
    if (
      guesses?.attempts.some(
        (r) => r.title.toLowerCase().trim() === guess.toLowerCase().trim(),
      )
    ) {
      toast({ title: "Guess already made" });
      return;
    }
    setGuessing(true);
    convex
      .action(api.round.makeGuess, {
        roundId: round.roundId,
        title: guess.trim(),
      })
      .catch((e) => {
        setGuess((existing) => (existing === "" ? guess : existing));
        const description =
          e instanceof ConvexError
            ? e.data
            : "Something went wrong. Try refreshing your browser.";
        toast({
          title: "Error submitting guess",
          description,
        });
      })
      .finally(() => {
        setGuessing(false);
      });
  };
  const hint = "Enter a word whose meaning matches the other two words.";
  return (
    <>
      <label htmlFor="guess-input" className="invisible hidden">
        {hint}
      </label>
      <Input
        id="guess-input"
        type="text"
        title={hint}
        placeholder="???"
        disabled={guessing || !isAuthenticated}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            makeGuess();
          }
        }}
        value={guess}
        onChange={(e) => setGuess(e.target.value.replace(" ", ""))}
        className="w-full h-[100px] rounded-md border-0 bg-background px-3 py-2 text-6xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-yellow-400"
      />
      <button
        className=" bg-white bg-opacity-10 text-4xl py-2 px-4 rounded-md w-full flex flex-row justify-center items-center gap-2"
        disabled={!isAuthenticated}
        onClick={() => {
          makeGuess();
        }}
      >
        <span className="text-yellow-400">
          <CornerDownRight size={36} strokeWidth={2} />
        </span>{" "}
        Place Your Guess
      </button>
    </>
  );
}
