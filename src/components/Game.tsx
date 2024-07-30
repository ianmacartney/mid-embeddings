import React, { useRef, useState } from "react";
import { Input, InputProps } from "./ui/input";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "./ui/button";
import { toast } from "./ui/use-toast";

export const Game = () => {
  // TODO: pull namespace from URL, with default
  const gameResult = useQuery(api.game.getDailyGame, { namespace: "feelings" });
  const currentGame = useRef(gameResult?.value);
  if (!currentGame.current && gameResult?.value) {
    currentGame.current = gameResult.value;
  }
  const gameId = currentGame.current?.gameId;
  const guesses = useQuery(api.game.listGuesses, gameId ? { gameId } : "skip");
  if (!currentGame.current || !gameId) {
    return <div>Loading...</div>;
  }
  if (gameResult && !gameResult.ok) {
    return <div>Error: {gameResult.error}</div>;
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
      {gameResult && currentGame.current.gameId !== gameResult.value.gameId && (
        <div className="bg-accent">
          <span>There is a new game available to play</span>
          <Button
            onClick={() => {
              currentGame.current = gameResult.value;
            }}
          >
            Play the latest game
          </Button>
        </div>
      )}
      <div className="flex flex-row gap-4">
        <span>{left}</span>
        <GuessInput gameId={gameId} />
        <span>{right}</span>
      </div>
      {guesses &&
        guesses.map((guess) => (
          <div key={guess._id}>
            {guess.leftDistance} - {guess.text}: {guess.rank}({guess.score}) -{" "}
            {guess.rightDistance}
          </div>
        ))}
    </div>
  );
};
export default Game;

function GuessInput({
  gameId,
  ...props
}: {
  gameId: Id<"games">;
} & InputProps) {
  const [guess, setGuess] = useState("");
  const [guessing, setGuessing] = useState(false);
  const makeGuess = useAction(api.game.makeGuess);
  return (
    <>
      <label htmlFor="guess-input" className="invisible">
        Guess the mid-word
      </label>
      <Input
        id="guess-input"
        type="text"
        placeholder="Enter a word"
        value={guess}
        onChange={(e) => setGuess(e.target.value.replace(" ", ""))}
        disabled={guessing}
        title={
          guess.includes(" ")
            ? "No spaces allowed"
            : "Enter a word whose meaning is between the two words"
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            console.log("hi");
            setGuess("");
            setGuessing(true);
            makeGuess({ gameId, text: guess })
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
    </>
  );
}
