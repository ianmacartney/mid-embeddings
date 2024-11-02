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
      <main className="flex flex-col items-center justify-center w-full max-w-4xl px-6">
        {roundResult?.value &&
          currentRound &&
          currentRound.roundId !== roundResult?.value.roundId && (
            <div className="flex flex-row items-center justify-center p-8 mb-[-32px]">
              <Button
                variant={"default"}
                size={"lg"}
                className="text-4xl"
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
      <main className="flex flex-col items-start justify-center w-full max-w-5xl gap-4 px-6 py-8">
        <div className="flex items-start gap-4">
          <div className="flex flex-col">
            <div className="flex flex-col gap-1 pb-12 pt-4">
              <div className="text-3xl text-gray-400 uppercase">
                How to play
              </div>
              <div className="text-3xl">
                Guess the words that match the two target words. Try to find all{" "}
                {NUM_MATCHES} top words!
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-row gap-4 w-full">
          <div className="w-1/2 flex flex-col gap-4">
            {round && guesses?.submittedAt ? (
              <>
                <RoundLeaderboard round={round} />
                <GlobalLeaderboard />
                <GlobalStats />
              </>
            ) : (
              <div className="bg-card flex flex-col gap-6 py-6 px-4">
                <div className="text-2xl text-slate-600 uppercase">
                  Let's Play
                </div>
                {round?.category && (
                  <div className="text-5xl text-yellow-400 flex flex-row items-end gap-4 pb-4">
                    <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                      <LetterText size={36} strokeWidth={2} />
                    </span>{" "}
                    {round?.category}
                  </div>
                )}
                {round?.description && (
                  <div className="text-2xl text-slate-600 whitespace-pre-line">
                    {round?.description}
                  </div>
                )}
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
            )}
          </div>

          <div className="w-1/2 flex flex-col gap-4">
            {guesses ? (
              <>
                <RoundStats guesses={guesses} />
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
  const globalStats = useQuery(api.round.globalStats);
  return (
    <div className="bg-card flex flex-col gap-6 py-6 px-4 w-full">
      <div className="text-2xl text-slate-600 uppercase">Overall Stats</div>
      <div className="flex flex-row justify-start items-start">
        <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/2">
          <div className="flex flex-row items-end gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Earth size={36} strokeWidth={2} />
            </span>{" "}
            <div className="text-5xl font-bold-TOM">
              {globalStats?.totalGuesses ?? "0"}
            </div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-3xl text-card-foreground">total guesses</div>
          </div>
        </div>
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
            <div className="text-3xl text-card-foreground">your rank</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalLeaderboard() {
  const globalStats = useQuery(api.round.globalStats);
  return (
    // <div className="bg-card flex flex-col gap-6 py-6 px-6">
    //   <div className="flex flex-row gap-4 w-full">
    <>
      {/* </div>
      <div className="flex flex-row gap-4 w-full"> */}
      <div className="bg-card flex flex-col gap-6 py-6 px-4 w-full">
        <div className="text-2xl text-slate-600 uppercase">
          Global Leaderboard
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
                <Code>
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
function RoundLeaderboard({ round }: { round: RoundInfo }) {
  const globalStats = useQuery(api.round.globalStats);
  return (
    // <div className="bg-card flex flex-col gap-6 py-6 px-6">
    //   <div className="flex flex-row gap-4 w-full">
    <>
      {/* </div>
      <div className="flex flex-row gap-4 w-full"> */}
      <div className="bg-card flex flex-col gap-6 py-6 px-4 w-full">
        <div className="text-2xl text-slate-600 uppercase">Leaderboard</div>
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
                <Code>
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
    <div className="bg-card flex flex-col gap-6 py-6 px-4 w-full">
      <div className="text-2xl text-slate-600 uppercase">Stats</div>
      <div className="flex flex-row justify-start items-start">
        <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/2">
          <div className="flex flex-row items-end gap-4">
            <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
              <Award size={36} strokeWidth={2} />
            </span>{" "}
            <div className="text-5xl font-bold-TOM">#{myRank ?? "?"}</div>
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
            <div className="text-5xl font-bold-TOM">{guesses.score}</div>
          </div>
          <div className="flex flex-row place-self-start">
            <div className="text-3xl text-card-foreground">score</div>
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
  const viewer = useQuery(api.users.viewer);
  return (
    <div className="bg-card flex flex-col gap-6 py-6 px-6">
      <div className="text-2xl text-slate-600 uppercase">Your Guesses</div>
      {(!viewer || viewer.score < 10) && (
        <div className="font-bold-TOM text-slate-600">
          There are {NUM_MATCHES} target words to guess. If you guess the best
          word correctly, you get {NUM_MATCHES} points. If you guess the second
          word correctly, you get {NUM_MATCHES - 1} points. And so on.
        </div>
      )}
      <div className="flex flex-col gap-3 text-xl text-yellow-400">
        <div className="flex flex-row justify-between text-xl text-yellow-400 uppercase">
          <div>Word</div>
          <div>Points</div>
        </div>

        {ranked.map((result) => {
          //const [left, right] = getLR(result);
          return (
            <div
              key={result.title}
              className={cn(
                "flex flex-row justify-between text-primary",
                result.points > 0 && "text-green-500",
              )}
            >
              <Code>
                <span className="text-xl">{result.title}</span>
              </Code>
              <Code>
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
