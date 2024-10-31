import { Flipboard } from "@/components/Flipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { RoundInfo } from "@convex/round";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  Coins,
  CornerDownRight,
  Earth,
  LetterText,
  Trophy,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const roundResult = useQuery(api.round.getActiveRound);
  const [currentRound, setCurrentRound] = useState(roundResult?.value);
  if (roundResult && !roundResult.ok) {
    return <div>Error: {roundResult.error}</div>;
  }
  if (roundResult?.value && !currentRound) {
    setCurrentRound(roundResult.value);
  }
  return (
    <div className="flex flex-col items-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      {roundResult?.value &&
        currentRound &&
        currentRound.roundId !== roundResult?.value.roundId && (
          <div className="flex flex-row items-center justify-center gap-4 p-4">
            <span>There is a new round available to play</span>
            <Button
              variant={"secondary"}
              onClick={() => {
                setCurrentRound(roundResult.value);
              }}
            >
              Play the latest round
            </Button>
          </div>
        )}
      <main className="flex flex-col items-center justify-center w-full max-w-4xl gap-8 px-6 py-8">
        <Round round={currentRound ?? roundResult?.value} />
      </main>
    </div>
  );
}

function GuessInput({ round }: { round?: RoundInfo }) {
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
        (r) => r.text.toLowerCase().trim() === guess.toLowerCase().trim(),
      )
    ) {
      toast({ title: "Guess already made" });
      return;
    }
    const check = (word: string) => {
      if (guess.includes(word)) {
        toast({
          title: "Word cannot include target word",
          description: `Your guess ${guess} includes ${word}.`,
        });
        return true;
      }
    };
    if (check(round.left) || check(round.right)) {
      return;
    }
    setGuessing(true);
    convex
      .action(api.round.makeGuess, {
        roundId: round.roundId,
        text: guess.trim(),
      })
      .catch((e) => {
        setGuess((existing) => (existing === "" ? guess : existing));
        const description =
          e instanceof ConvexError
            ? e.data
            : "Something went wrong. Try refreshing your browser.";
        toast({
          title: "Error making guess",
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
      <label htmlFor="guess-input" className="invisible">
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

function Round({ round }: { round: RoundInfo | undefined }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-start justify-center w-full max-w-5xl gap-4 px-6 py-8">
        <div className="flex items-start gap-4">
          <div className="flex flex-col">
            <div className="flex flex-col gap-1 py-12">
              <div className="text-3xl text-gray-400 uppercase">
                How to play
              </div>
              <div className="text-3xl">
                Guess the word that best matches the two words, according to AI
                embeddings. Bonus points for finding all 5 target words.
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-row gap-4 w-full">
          <div className="w-1/2">
            <div className="bg-card flex flex-col gap-6 py-6 px-4">
              <div className="text-2xl text-slate-600 uppercase">
                Let's Play
              </div>
              <div className="text-5xl text-yellow-400 flex flex-row items-end gap-4 pb-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <Coins size={36} strokeWidth={2} />
                </span>{" "}
                Round #1
              </div>
              <div className="flex flex-col items-start w-full gap-2 font-bold">
                <div className="flex flex-col items-start gap-4">
                  <div className="text-5xl">{round?.left}</div>
                  <div className="text-5xl opacity-30">+</div>
                  <div className="text-5xl">{round?.right}</div>
                  <div className="text-5xl opacity-30">=</div>

                  <GuessInput round={round} />
                </div>
              </div>
            </div>
          </div>

          <div className="w-1/2 flex flex-col gap-4">
            <div className="bg-card flex flex-col gap-6 py-6 px-6">
              <div className="text-2xl text-slate-600 uppercase">
                Matching Words
              </div>
              <div className="text-5xl font-bold-TOM text-yellow-400 flex flex-row items-end gap-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <Trophy size={36} strokeWidth={2} />
                </span>{" "}
                TOP 10
              </div>
              <div className="flex flex-col gap-3 text-xl text-yellow-400">
                <div className="flex flex-row gap-3 text-xl text-yellow-400">
                  <div className="w-[45px]">RANK</div>
                  <div className="w-[350px]">WORD</div>
                </div>

                {round && <Guesses roundId={round.roundId} randomize={false} />}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-row gap-4 w-full">
          <div className="bg-card flex flex-col gap-6 py-6 px-4 w-3/4">
            <div className="text-2xl text-slate-600 uppercase">Your stats</div>
            <div className="flex flex-row justify-start items-start">
              <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/3">
                <div className="flex flex-row items-end gap-4">
                  <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                    <Earth size={36} strokeWidth={2} />
                  </span>{" "}
                  <div className="text-5xl font-bold-TOM">#1</div>
                </div>
                <div className="flex flex-row place-self-start">
                  <div className="text-3xl text-card-foreground">your rank</div>
                </div>
              </div>
              <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/3">
                <div className="flex flex-row items-start justify-start gap-4">
                  <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                    <Coins size={36} strokeWidth={2} />
                  </span>{" "}
                  <div className="text-5xl font-bold-TOM">100</div>
                </div>
                <div className="flex flex-row place-self-start">
                  <div className="text-3xl text-card-foreground">coins</div>
                </div>
              </div>
              <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/3">
                <div className="flex flex-row items-end gap-4">
                  <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                    <LetterText size={36} strokeWidth={2} />
                  </span>{" "}
                  <div className="text-5xl font-bold-TOM">0</div>
                </div>
                <div className="flex flex-row place-self-start">
                  <div className="text-3xl text-card-foreground">words</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Guesses({
  roundId,
  randomize,
}: {
  roundId: Id<"rounds">;
  randomize: boolean;
}) {
  const guesses = useQuery(api.round.listGuesses, { roundId });

  return (
    <>
      {guesses?.attempts.slice(0, 10).map((result, i) => {
        //const [left, right] = getLR(result);
        return (
          <Flipboard
            key={result.text + i}
            rank={i + 1}
            value={result.text}
            points={i * 10}
            obfuscate={false}
            randomize={randomize}
          />
        );
      })}
    </>
  );
}
