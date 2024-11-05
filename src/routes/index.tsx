import { Code } from "@/components/Code";
import { GuessInput } from "@/components/GuessInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import { Doc } from "@convex/_generated/dataModel";
import { RoundInfo } from "@convex/round";
import { MAX_ATTEMPTS, NUM_MATCHES } from "@convex/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Award, Earth, Gem, LetterText, Trophy } from "lucide-react";
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
  let round = currentRound;
  if (
    roundResult?.value &&
    (!currentRound ||
      (currentRound.roundId === roundResult.value.roundId &&
        currentRound !== roundResult.value))
  ) {
    setCurrentRound(roundResult.value);
    round = roundResult.value;
  }
  return (
    <div className="flex flex-col items-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-center justify-center w-full max-w-4xl px-3 md:px-6">
        {roundResult?.value &&
          currentRound &&
          currentRound.roundId !== roundResult?.value.roundId && (
            <div className="flex flex-row items-center justify-center p-4 md:p-8 mb-[-16px] md:mb-[-32px]">
              <Button
                variant={"default"}
                size={"lg"}
                className="text-2xl md:text-4xl"
                onClick={() => {
                  setCurrentRound(roundResult.value);
                }}
              >
                New round released! Click here to play it.
              </Button>
            </div>
          )}
        <Round round={round} />
      </main>
    </div>
  );
}

function Round({ round }: { round: RoundInfo | undefined }) {
  const guesses = useQuery(
    api.round.listGuesses,
    round ? { roundId: round.roundId } : "skip",
  );
  return (
    <div className="flex flex-col items-center justify-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-start justify-center w-full max-w-5xl gap-2 md:gap-4 px-3 md:px-6 py-4 md:py-8">
        <div className="flex items-start gap-2 md:gap-4">
          <div className="flex flex-col">
            <div className="flex flex-col gap-1 pb-6 md:pb-12 pt-2 md:pt-4">
              <div className="text-3xl text-gray-400 uppercase">
                How to play
              </div>
              <div className="text-3xl">
                Guess the words that best match the meaning of the two words
                provided, guessing one word at a time. There are {NUM_MATCHES}{" "}
                target words to guess. If you guess the best word correctly, you
                get {NUM_MATCHES} points. If you guess the second word
                correctly, you get {NUM_MATCHES - 1} points. And so on. You get{" "}
                {MAX_ATTEMPTS} guesses.
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2 md:gap-4 w-full">
          <div className="w-full md:w-1/2 flex flex-col gap-2 md:gap-4">
            {round && guesses?.submittedAt ? (
              <>
                <GlobalStats />
                <GlobalLeaderboard />
              </>
            ) : (
              <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
                <div className="text-xl md:text-2xl text-slate-600 uppercase">
                  Let's Play
                </div>
                {round?.category && (
                  <div className="text-3xl md:text-5xl text-yellow-400 flex flex-row items-center gap-1 md:gap-4 pb-1 md:pb-4">
                    <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                      <LetterText size={36} strokeWidth={2} />
                    </span>{" "}
                    {round?.category}
                  </div>
                )}
                {round?.description && (
                  <div className="text-lg md:text-2xl text-muted-foreground whitespace-pre-line">
                    {round?.description}
                  </div>
                )}
                <div className="flex flex-col items-start w-full gap-1 font-bold">
                  <div className="flex flex-col items-start md:gap-2">
                    <div className="text-3xl md:text-5xl">{round?.left}</div>
                    <div className="text-3xl md:text-5xl opacity-30">+</div>
                    <div className="text-3xl md:text-5xl">{round?.right}</div>
                    <div className="text-3xl md:text-5xl opacity-30">=</div>

                    <GuessInput round={round} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-1/2 flex flex-col gap-2 md:gap-4">
            {guesses ? (
              <>
                <RoundStats guesses={guesses} />
                {round && guesses.submittedAt && (
                  <RoundLeaderboard round={round} />
                )}
                <Guesses guesses={guesses} />
              </>
            ) : (
              <>
                <GlobalStats />
                <GlobalLeaderboard />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function GlobalStats() {
  const overallStats = useQuery(api.users.overallStats);
  return (
    <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
      <div className="text-xl md:text-2xl text-slate-600 uppercase">
        Overall Stats
      </div>
      <div className="flex flex-row justify-start items-start">
        <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/2">
          <div className="flex flex-row items-end gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Award size={36} strokeWidth={2} />
            </span>{" "}
            <div className="text-5xl font-bold-TOM">
              #{overallStats?.rank ?? "?"}
            </div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-3xl text-card-foreground">rank</div>
          </div>
        </div>
        <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/2">
          <div className="flex flex-row items-end gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Gem size={36} strokeWidth={2} />
            </span>{" "}
            <div className="text-5xl font-bold-TOM">
              {overallStats?.score ?? "?"}
            </div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-3xl text-card-foreground">score</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalLeaderboard() {
  const viewer = useQuery(api.users.viewer);
  const globalStats = useQuery(api.round.globalStats);
  return (
    // <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
    //   <div className="flex flex-row gap-4 w-full">
    <>
      {/* </div>
      <div className="flex flex-row gap-4 w-full"> */}
      <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
        <div className="text-xl md:text-2xl text-slate-600 uppercase">
          Overall Leaderboard
        </div>
        {/* <div className="text-5xl font-bold-TOM text-yellow-400 flex flex-row items-end gap-4 ">
          <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
            <Trophy size={36} strokeWidth={2} />
          </span>{" "}
          Top 10
        </div> */}
        <div className="flex flex-col gap-3 text-xl text-yellow-400">
          <div className="flex flex-row justify-start gap-2 text-xl text-yellow-400 uppercase">
            <div className="w-10">Rank</div>
            <div>User</div>
            <div className="ml-auto">Score</div>
          </div>

          {globalStats?.leaders.map((user, i) => {
            //const [left, right] = getLR(result);
            return (
              <div
                key={user.id}
                className="flex flex-row justify-start gap-2 text-primary"
              >
                <Code className="w-10">
                  <span className="text-xl">{i + 1}</span>
                </Code>
                <Code
                  className={cn(viewer?._id === user.id && "text-yellow-400")}
                >
                  <span className="text-xl">{user.name}</span>
                </Code>
                <Code className="ml-auto">
                  <span className="text-xl">{user.score}</span>
                </Code>
              </div>
            );
          })}
        </div>
        <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1">
          <div className="flex flex-row items-end gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Earth size={36} strokeWidth={2} />
            </span>{" "}
            <div className="text-5xl font-bold-TOM">
              {globalStats?.totalGuesses ?? "0"}
            </div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-3xl text-card-foreground">guesses</div>
          </div>
        </div>
      </div>

      {/* </div> */}
      {/* </div> */}
    </>
  );
}
function RoundLeaderboard({ round }: { round: RoundInfo }) {
  const viewer = useQuery(api.users.viewer);
  const roundStats = useQuery(api.round.roundStats, { roundId: round.roundId });
  return (
    // <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
    //   <div className="flex flex-row gap-4 w-full">
    <>
      {/* </div>
      <div className="flex flex-row gap-4 w-full"> */}
      <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
        <div className="text-xl md:text-2xl text-slate-600 uppercase">
          Round Leaderboard
        </div>
        <div className="text-4xl font-bold-TOM text-yellow-400 flex flex-row items-center gap-4">
          <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
            <Trophy size={36} strokeWidth={2} />
          </span>{" "}
          {round.left} + {round.right}
        </div>
        <div className="flex flex-col gap-3 text-xl text-yellow-400">
          <div className="flex flex-row justify-start gap-2 text-xl text-yellow-400 uppercase">
            <div className="w-10">Rank</div>
            <div>User</div>
            <div className="ml-auto">Score</div>
          </div>

          {roundStats?.leaders.map((user, i) => {
            //const [left, right] = getLR(result);
            return (
              <div
                key={user.id}
                className="flex flex-row justify-start gap-2 text-primary"
              >
                <Code className="w-10">
                  <span className="text-xl">{i + 1}</span>
                </Code>
                <Code
                  className={cn(viewer?._id === user.id && "text-yellow-400")}
                >
                  <span className="text-xl">{user.name}</span>
                </Code>
                <Code className="ml-auto">
                  <span className="text-xl">{user.score}</span>
                </Code>
              </div>
            );
          })}
        </div>
      </div>
      {/* </div> */}
      {/* </div> */}
    </>
  );
}

function RoundStats({ guesses }: { guesses: Doc<"guesses"> }) {
  const myRank = useQuery(api.round.myRank, { roundId: guesses.roundId });
  return (
    <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
      <div className="text-xl md:text-2xl text-slate-600 uppercase">
        Round Stats
      </div>
      <div className="flex flex-row justify-start items-start">
        <div className="text-3xl md:text-5xl text-yellow-400 flex flex-col items-start gap-1 w-1/2">
          <div className="flex flex-row items-end gap-2 md:gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Award size={36} strokeWidth={2} className="md:w-9 md:h-9" />
            </span>{" "}
            <div className="text-3xl md:text-5xl font-bold-TOM">
              #{myRank ?? "?"}
            </div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-xl md:text-3xl text-card-foreground">rank</div>
          </div>
        </div>
        <div className="text-3xl md:text-5xl text-yellow-400 flex flex-col items-start gap-1 w-1/2">
          <div className="flex flex-row items-end gap-2 md:gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Gem size={36} strokeWidth={2} className="md:w-9 md:h-9" />
            </span>{" "}
            <div className="text-3xl md:text-5xl font-bold-TOM">
              {guesses.score}
            </div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-xl md:text-3xl text-card-foreground">
              score
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Guesses({ guesses }: { guesses: Doc<"guesses"> }) {
  const ranked = (guesses?.attempts ?? [])
    .slice(0, MAX_ATTEMPTS)
    .map((r, i) => ({
      ...r,
      points: r.points ?? 0,
      index: i,
    }))
    .sort((a, b) =>
      a.points !== b.points ? b.points - a.points : a.index - b.index,
    );
  return (
    <div className="bg-card flex flex-col gap-2 md:gap-6 py-4 md:py-6 px-3 md:px-4 w-full">
      <div className="text-xl md:text-2xl text-slate-600 uppercase">
        Your Guesses
      </div>
      <div className="flex flex-col gap-3 text-xl text-yellow-400">
        <div className="flex flex-row justify-between text-xl text-yellow-400 uppercase">
          <div>Word</div>
          <div>Points</div>
        </div>

        {ranked.map((result) => {
          //const [left, right] = getLR(result);
          const [css, heat] =
            result.rank === undefined
              ? ["", "🥶"]
              : result.rank < NUM_MATCHES
                ? ["text-green-500", "🔥"]
                : result.rank < 25
                  ? ["", "☀️"]
                  : result.rank < 50
                    ? ["", "🌤️"]
                    : result.rank < 75
                      ? ["", "☁️"]
                      : ["", "🌧️"];
          return (
            <div
              key={result.title}
              className={cn(
                "flex flex-row items-center justify-start gap-2 text-primary",
                css,
              )}
            >
              <Code>
                <span className="text-xl">{result.title}</span>
              </Code>
              {/* {result.rank && result.rank > NUM_MATCHES && ( */}
              <span className="text-xl uppercase ">{heat}</span>
              {/* )} */}
              <Code className="ml-auto">
                <span className="text-xl">{result.points}</span>
              </Code>
            </div>
          );
        })}
        {!guesses.submittedAt && (
          <div className="flex flex-row justify-between text-xl text-yellow-400 uppercase">
            <div>
              {ranked.length === MAX_ATTEMPTS - 1
                ? "Guess left"
                : "Guesses left"}
              : {MAX_ATTEMPTS - guesses.attempts.length}
            </div>
          </div>
        )}
        {/* {Array.from({
          length: MAX_ATTEMPTS - (guesses?.attempts.length || 0),
        }).map((_, i) => (
          <div key={i} className="flex flex-row justify-between">
            <Code>
              <span className="text-xl">{"-"}</span>
            </Code>
          </div>
        ))} */}
      </div>
    </div>
  );
}
