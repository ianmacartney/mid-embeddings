import { useRef, useState } from "react";
import { Input, InputProps } from "./ui/input";
import { useConvex, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "./ui/button";
import { toast } from "./ui/use-toast";
import { RoundInfo } from "@convex/round";
import { ConvexError } from "convex/values";
import { CornerDownRight } from "lucide-react";

export const Game = (roundInfo: RoundInfo | undefined) => {
  // TODO: pull namespace from URL, with default
  const currentGame = useRef(roundInfo);
  if (!currentGame.current && roundInfo) {
    currentGame.current = roundInfo;
  }
  const roundId = currentGame.current?.roundId;
  if (!currentGame.current || !roundId) {
    return <div>Loading...</div>;
  }
  return (
    <div className="flex flex-col items-center justify-center">
      {roundInfo && currentGame.current.roundId !== roundInfo.roundId && (
        <div className="bg-accent">
          <span>There is a new round available to play</span>
          <Button
            onClick={() => {
              currentGame.current = roundInfo;
            }}
          >
            Play the latest round
          </Button>
        </div>
      )}
      <GuessInput {...currentGame.current} />
    </div>
  );
};
export default Game;

function GuessInput({
  roundId,
  left,
  right,
  ...props
}: {
  roundId: Id<"rounds">;
  left: string;
  right: string;
} & InputProps) {
  const convex = useConvex();
  const guesses = useQuery(api.round.listGuesses, { roundId }) || [];
  const [guess, setGuess] = useState("");
  const [guessing, setGuessing] = useState(false);
  const makeGuess = () => {
    const check = (word: string) => {
      if (guess.includes(word)) {
        toast({
          title: "Word cannot include target word",
          description: `Your guess ${guess} includes ${word}.`,
        });
        return true;
      }
    };
    setGuess("");
    if (check(left) || check(right)) {
      return;
    }
    for (const priorGuess of guesses) {
      if (guess.toLowerCase() === priorGuess.text) {
        toast({ title: `You've already guessed ${guess}` });
        return;
      }
    }
    setGuessing(true);
    convex
      .action(api.round.makeGuess, {
        roundId,
        text: guess.toLowerCase(),
      })
      .catch((e) => {
        setGuess((existing) => (existing === "" ? guess : existing));
        toast({
          title: "Error making guess",
          description: e instanceof ConvexError ? e.data : e.message,
        });
      })
      .finally(() => {
        setGuessing(false);
      });
  };
  return (
    <>
      <label htmlFor="guess-input" className="invisible">
        Enter a word whose meaning matches the other two words.
      </label>
      <Input
        id="guess-input"
        type="text"
        placeholder="???"
        value={guess}
        onChange={(e) => setGuess(e.target.value.replace(" ", ""))}
        disabled={guessing}
        title="Enter a word whose meaning matches the two words"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            makeGuess();
          }
        }}
        className="w-full h-[100px] rounded-md border-0 bg-background px-3 py-2 text-6xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-yellow-400"
        {...props}
      />
      <button
        className=" bg-white bg-opacity-10 text-4xl py-2 px-4 rounded-md w-full flex flex-row justify-center items-center gap-2"
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
