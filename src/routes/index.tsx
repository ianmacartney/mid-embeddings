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
import { Award, Earth, Gem, Trophy } from "lucide-react";
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
            <div className="flex flex-col gap-1 py-12">
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
                {/* <div className="text-5xl text-yellow-400 flex flex-row items-end gap-4 pb-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <LetterText size={36} strokeWidth={2} />
                </span>{" "}
                Round #1
              </div> */}
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
              <Guesses guesses={guesses} />
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
                  <span className="text-xl">{user.score || "-"}</span>
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
                  <span className="text-xl">{user.score || "-"}</span>
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

function Guesses({ guesses }: { guesses: Doc<"guesses"> }) {
  const ranked = (guesses?.attempts ?? [])
    .slice(0, MAX_ATTEMPTS)
    .map((r, i) => ({
      ...r,
      score: r.rank === undefined ? 0 : NUM_MATCHES - r.rank,
      index: i,
    }))
    .sort((a, b) =>
      a.score !== b.score ? b.score - a.score : a.index - b.index,
    );
  const myRank = useQuery(api.round.myRank, { roundId: guesses.roundId });
  return (
    <>
      <div className="bg-card flex flex-col gap-6 py-6 px-4 w-full">
        <div className="text-2xl text-slate-600 uppercase">Stats</div>
        <div className="flex flex-row justify-start items-start">
          {guesses.submittedAt ? (
            <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/2">
              <div className="flex flex-row items-end gap-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <Award size={36} strokeWidth={2} />
                </span>{" "}
                <div className="text-5xl font-bold-TOM">#{myRank ?? "?"}</div>
              </div>
              <div className="flex flex-row place-self-start">
                <div className="text-3xl text-card-foreground">your rank</div>
              </div>
            </div>
          ) : (
            <div className="text-5xl  text-yellow-400 flex flex-col items-start gap-1 w-1/2">
              <div className="flex flex-row items-end gap-4">
                <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
                  <Hash size={36} strokeWidth={2} />
                </span>{" "}
                <div className="text-5xl font-bold-TOM">
                  {MAX_ATTEMPTS - ranked.length}
                </div>
              </div>
              <div className="flex flex-row place-self-start">
                <div className="text-3xl text-card-foreground">
                  {ranked.length === MAX_ATTEMPTS - 1
                    ? "guess left"
                    : "guesses left"}
                </div>
              </div>
            </div>
          )}
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
      <div className="bg-card flex flex-col gap-6 py-6 px-6">
        <div className="text-2xl text-slate-600 uppercase">Your Guesses</div>
        {/* <div className="text-5xl font-bold-TOM text-yellow-400 flex flex-row items-end gap-4 ">
          <span className="rounded-sm text-slate-900 bg-yellow-400 p-1">
            {showLeaderboard ? (
              <Trophy size={36} strokeWidth={2} />
            ) : (
              <Coins size={36} strokeWidth={2} />
            )}
          </span>{" "}
          {showLeaderboard ? "Top 10" : `Score: `}
        </div> */}
        <div className="flex flex-col gap-3 text-xl text-yellow-400">
          <div className="flex flex-row justify-between text-xl text-yellow-400 uppercase">
            <div>Word</div>
            <div>Score</div>
          </div>

          {ranked.map((result) => {
            //const [left, right] = getLR(result);
            return (
              <div
                key={result.title}
                className="flex flex-row justify-between text-primary"
              >
                <Code>
                  <span className="text-xl">{result.title}</span>
                </Code>
                <Code>
                  <span className="text-xl">{result.score || "-"}</span>
                </Code>
              </div>
            );
          })}
          {/* <div className="flex flex-row justify-between text-xl text-yellow-400 uppercase">
            <div>
              {guesses.submittedAt
                ? `Submitted at ${dayjs(guesses.submittedAt).format("h:mm A")}`
                : `Guesses Left: ${MAX_ATTEMPTS - guesses.attempts.length}`}
            </div>
          </div> */}
          {/* {Array.from({
          length: MAX_ATTEMPTS - (guesses?.attempts.length || 0),
        }).map((_, i) => (
          <div key={i} className="flex flex-row justify-between">
            <Code>
              <span className="text-xl">{"-"}</span>
            </Code>
          </div>
        ))} */}
          {/* {!!guesses?.score && (
          <div className="flex self-end flex-col">
            <div className="text-xl">TOTAL</div>
            <div className="flex self-end">
              <Code>
                <span className="text-xl">{guesses?.score || "-"}</span>
              </Code>
            </div>
          </div>
        )} */}
        </div>
      </div>
    </>
  );
}
