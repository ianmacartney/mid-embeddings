import { useRef, useState } from "react";
import { Input, InputProps } from "./ui/input";
import { useAction, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "./ui/button";
import { toast } from "./ui/use-toast";
import { GameInfo } from "@convex/game";

export const Game = (gameInfo: GameInfo | undefined) => {
  // TODO: pull namespace from URL, with default
  const currentGame = useRef(gameInfo);
  if (!currentGame.current && gameInfo) {
    currentGame.current = gameInfo;
  }
  const gameId = currentGame.current?.gameId;
  if (!currentGame.current || !gameId) {
    return <div>Loading...</div>;
  }
  const { left, right, name, description } = currentGame.current;
  const [mainDescription, ...subDescriptions] = description.split("\n");
  return (
    <div className="flex flex-col items-center justify-center">
      <h1>{name}</h1>
      <span className="text-xl">{mainDescription}</span>
      {subDescriptions.map((description, i) => (
        <span
          key={`${name}-description-${i}`}
          className="text-md text-secondary-foreground"
        >
          {description}
        </span>
      ))}
      {gameInfo && currentGame.current.gameId !== gameInfo.gameId && (
        <div className="bg-accent">
          <span>There is a new game available to play</span>
          <Button
            onClick={() => {
              currentGame.current = gameInfo;
            }}
          >
            Play the latest game
          </Button>
        </div>
      )}
      <Guesses {...{ gameId, left, right }} />
    </div>
  );
};
export default Game;

function Guesses({
  gameId,
  left,
  right,
  ...props
}: {
  gameId: Id<"games">;
  left: string;
  right: string;
} & InputProps) {
  const guesses = useQuery(api.game.listGuesses, { gameId }) || [];
  const [guess, setGuess] = useState("");
  const [guessing, setGuessing] = useState(false);
  const makeGuess = useAction(api.game.makeGuess);
  return (
    <>
      <div className="flex flex-row gap-4">
        <span>{left}</span>
        <label htmlFor="guess-input" className="invisible">
          Enter a word whose meaning matches the other two words.
        </label>
        <Input
          id="guess-input"
          type="text"
          placeholder="Enter a word"
          value={guess}
          onChange={(e) => setGuess(e.target.value.replace(" ", ""))}
          disabled={guessing}
          title="Enter a word whose meaning is between the two words"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              console.log("hi");
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
              makeGuess({ gameId, text: guess.toLowerCase() })
                .catch((e) => {
                  setGuess((existing) => (existing === "" ? guess : existing));
                  toast({
                    title: "Error",
                    description: e.data,
                  });
                })
                .finally(() => {
                  setGuessing(false);
                });
            }
          }}
          {...props}
        />
        <span>{right}</span>
      </div>
      {guesses &&
        guesses.map((guess) => (
          <div key={guess._id}>
            {f(guess.leftDistance)} ⬅️ {guess.text}: {guess.rank}(
            {f(guess.score)}) ➡️ {f(guess.rightDistance)}
          </div>
        ))}
    </>
  );
}

function f(num: number) {
  return num.toPrecision(3);
}
