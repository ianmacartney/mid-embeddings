import { Flipboard } from "@/components/Flipboard";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { useAuthActions } from "@convex-dev/auth/react";
import { isRateLimitError } from "@convex-dev/ratelimiter";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { RoundInfo } from "@convex/round";
import { createFileRoute } from "@tanstack/react-router";
import {
  Unauthenticated,
  useConvex,
  useConvexAuth,
  useQuery,
} from "convex/react";
import { ConvexError } from "convex/values";
import dayjs from "dayjs";
import {
  Coins,
  CornerDownRight,
  Earth,
  LetterText,
  Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Flipped, Flipper } from "react-flip-toolkit";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const round = useQuery(api.round.getActiveRound);
  if (round && !round.ok) {
    return <div>Error: {round.error}</div>;
  }
  return (
    <div className="flex flex-col items-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-center justify-center w-full max-w-4xl gap-8 px-6 py-8">
        <Round round={round?.value} />
        <Unauthenticated>
          <LogInAnonymouslyByDefault />
        </Unauthenticated>
      </main>
    </div>
  );
}

function LogInAnonymouslyByDefault() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      void signIn("anonymous").catch((e) => {
        if (isRateLimitError(e)) {
          toast({
            title: "Too many users being created.",
            description:
              "Log in with GitHub or retry " +
              dayjs(Date.now() + e.data.retryAfter).fromNow(),
          });
        }
      });
    }
  }, [isAuthenticated, isLoading, signIn]);
  return null;
}

function Round({ round }: { round: RoundInfo | undefined }) {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const guesses = useQuery(
    api.round.listGuesses,
    round?.roundId ? { roundId: round.roundId } : "skip",
  );
  const [guess, setGuess] = useState("");

  const titles = [
    "Matching Madness",
    "Mixed Matches",
    "Mashed Meanings",
    "Word Fusion Frenzy",
    "Semantic Shuffle",
    "Lexical Labyrinth",
    "Verbal Vortex",
    "Synonym Symphony",
    "Wordplay Wizardry",
    "Linguistic Limbo",
    "Phrasal Fusion",
    "Vocabulary Vortex",
    "Diction Dimension",
    "Terminology Tango",
    "Etymological Enigma",
  ];
  const [data, setData] = useState(titles[0]);
  const shuffleList = () => {
    setData(titles[Math.floor(Math.random() * titles.length)]);
  };
  const [circleSwap, setCircleSwap] = useState(false);
  const [randomize, setRandomize] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setCircleSwap(!circleSwap), 5000);
    return () => clearTimeout(timer);
  }, [circleSwap]);

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
    if (guesses?.attempts.some((r) => r.text === guess)) {
      toast({ title: "Guess already made" });
      return;
    }
    convex
      .action(api.round.makeGuess, {
        roundId: round.roundId,
        text: guess,
      })
      .catch((e) => {
        setGuess(guess);
        const description =
          e instanceof ConvexError
            ? e.data
            : "Something went wrong. Try refreshing your browser.";
        toast({
          title: "Error making guess",
          description,
        });
      });
    setGuess("");

    setRandomize(false);

    setTimeout(() => setRandomize(true), 3000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-start justify-center w-full max-w-5xl gap-4 px-6 py-8">
        <div className="flex items-start gap-4">
          <div className="flex flex-col">
            <button onClick={shuffleList}>shuffle</button>
            <div className="text-6xl text-yellow-400">
              <Flipper flipKey={data}>
                {data.split("").map((char, i) => {
                  if (char === " ") {
                    return <span key={char + i}>&nbsp;</span>;
                  }
                  return (
                    <Flipped key={char + i} flipId={char}>
                      <div className="text-yellow-400 inline-block">
                        {char || ` `}
                      </div>
                    </Flipped>
                  );
                })}
              </Flipper>
            </div>
            <div className="text-4xl">
              A game of mixed emotions For people who like venn diagrams
            </div>
            <div className="absolute top-32 left-3/4">
              <Flipper flipKey={circleSwap}>
                <div className="relative w-64 h-32 mt-4">
                  <Flipped flipId="circle1">
                    <div
                      className="absolute w-24 h-24 rounded-full bg-blue-500 opacity-50 transition-all duration-500 ease-in-out"
                      style={{
                        left: circleSwap ? "0" : "40px",
                        top: "4px",
                      }}
                    ></div>
                  </Flipped>
                  <Flipped flipId="circle2">
                    <div
                      className="absolute w-24 h-24 rounded-full bg-red-500 opacity-50 transition-all duration-500 ease-in-out"
                      style={{
                        left: circleSwap ? "40px" : "0px",
                        top: "4px",
                      }}
                    ></div>
                  </Flipped>
                </div>
              </Flipper>
            </div>
            <div className="flex flex-col gap-1 py-12">
              <div className="text-3xl text-gray-400 uppercase">
                How to play
              </div>
              <div className="text-3xl">
                Guess the word that best represents the combination of two
                words. How many words can you guess before you run out of coins?
              </div>
            </div>
          </div>
        </div>
        <div className="text-3xl text-yellow-400 uppercase w-full">
          <div className="flex flex-row items-center gap-2 justify-between">
            <span>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}{" "}
            </span>
            <span className="text-gray-700">
              new round starts in{" "}
              {(() => {
                const now = new Date();
                const midnight = new Date(
                  now.getFullYear(),
                  now.getMonth(),
                  now.getDate() + 1,
                );
                const diff = midnight.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor(
                  (diff % (1000 * 60 * 60)) / (1000 * 60),
                );
                return `${hours} hours and ${minutes} minutes`;
              })()}
            </span>
          </div>
        </div>
        <div className="flex flex-row gap-4 w-full">
          <div className="bg-slate-900 flex flex-col gap-6 py-6 px-4 w-3/4">
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
                  <div className="text-3xl text-white">your rank</div>
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
                  <div className="text-3xl text-white">coins</div>
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
                  <div className="text-3xl text-white">words</div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-900 flex flex-row py-6 px-4 w-1/4">
            <div className="flex flex-col gap-6">
              <div className="text-2xl text-slate-600 uppercase">Level</div>
              <div className="flex flex-row justify-start items-start">
                <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1">
                  <div className="flex flex-row items-end gap-4">
                    <svg width="140" height="75" viewBox="0 0 140 75">
                      <circle
                        cx="40"
                        cy="35"
                        r="35"
                        fill="#FFD700"
                        fillOpacity="1"
                      />
                      <circle
                        cx="80"
                        cy="35"
                        r="35"
                        fill="#4169E1"
                        fillOpacity="0.7"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-row place-self-start">
                    <div className="text-3xl text-white">Beginner</div>
                  </div>
                </div>
              </div>
            </div>
            {/* <div className="flex flex-col gap-6 w-full justify-center items-center">
              <div className="flex flex-col items-center justify-between w-full h-4/5">
                <svg width="40" height="25" viewBox="0 0 40 25">
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#FFD700"
                    fillOpacity="1"
                  />
                  <circle
                    cx="28"
                    cy="12"
                    r="12"
                    fill="#4169E1"
                    fillOpacity="0.7"
                  />
                </svg>
                <svg width="36" height="25" viewBox="0 0 36 25">
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#FFD700"
                    fillOpacity="1"
                  />
                  <circle
                    cx="24"
                    cy="12"
                    r="12"
                    fill="#4169E1"
                    fillOpacity="0.7"
                  />
                </svg>
                <svg width="30" height="25" viewBox="0 0 30 25">
                  <circle
                    cx="12"
                    cy="12"
                    r="12"
                    fill="#FFD700"
                    fillOpacity="1"
                  />
                  <circle
                    cx="18"
                    cy="12"
                    r="12"
                    fill="#4169E1"
                    fillOpacity="0.7"
                  />
                </svg>
              </div>
            </div> */}
          </div>
        </div>

        <div className="flex flex-row gap-4 w-full">
          <div className="w-1/2">
            <div className="bg-slate-900 flex flex-col gap-6 py-6 px-4">
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

                  <Input
                    type="text"
                    placeholder="???"
                    disabled={!isAuthenticated}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        makeGuess();
                      }
                    }}
                    value={guess}
                    onChange={(e) => setGuess(e.currentTarget.value)}
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
                </div>
              </div>
            </div>
          </div>

          <div className="w-1/2 flex flex-col gap-4">
            <div className="bg-slate-900 flex flex-col gap-6 py-6 px-6">
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
                  <div className="w-[263px]">WORD</div>
                  <div className="w-[87px]">PRICE</div>
                </div>

                {round && (
                  <Guesses roundId={round.roundId} randomize={randomize} />
                )}
              </div>

              <div className="flex flex-row gap-2 mt-4">
                <button className="bg-white bg-opacity-10 py-2 px-4 rounded-md text-xl">
                  Hint (10 coins)
                </button>
                <button className="bg-white bg-opacity-10 py-2 px-4 rounded-md text-xl">
                  Reveal & Skip (25 coins)
                </button>
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
