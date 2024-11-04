import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import {
  Authenticated,
  useAction,
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { FunctionReturnType } from "convex/server";
import { TrashIcon } from "@radix-ui/react-icons";
import { chunk } from "@/lib/utils";
import type { Strategy } from "@convex/namespace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Doc, Id } from "@convex/_generated/dataModel";
import { MAX_MATCH_RANK } from "@convex/shared";

export const Route = createFileRoute("/author/$namespace")({
  component: () => (
    <Authenticated>
      <Category />
    </Authenticated>
  ),
});

const fn = api.namespace;

function Category() {
  const { namespace } = Route.useParams();
  const {
    name,
    description,
    isEmpty,
    public: isPublic,
  } = useQuery(fn.getNamespace, { namespace }) || {};
  const convex = useConvex();
  const updateNamespace = useMutation(fn.update);
  const rounds = useQuery(fn.listRoundsByNamespace, { namespace }) ?? [];
  const [roundId, setRoundId] = useState<Id<"rounds">>();
  const round = useQuery(
    fn.getRound,
    roundId ? { roundId, namespace } : "skip",
  );
  const [leftRandomText, setLeftRandomText] = useState("");
  const [rightRandomText, setRightRandomText] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      void convex
        .mutation(fn.randomTitle, { namespace })
        .then(setLeftRandomText);
      void convex
        .mutation(fn.randomTitle, { namespace })
        .then(setRightRandomText);
    }, 5000);
    return () => clearInterval(id);
  }, [namespace, convex]);
  const midpoints = usePaginatedQuery(
    fn.listMidpoints,
    { namespace },
    { initialNumItems: 10 },
  );
  const [words, setWords] = useState({ left: "", right: "", guess: "" });
  const firstResult = midpoints.results[0];
  useEffect(() => {
    if (firstResult === undefined) return;
    if (words.left || words.right) return;
    setWords({
      left: firstResult.left,
      right: firstResult.right,
      guess: "",
    });
  }, [words.left, words.right, firstResult]);

  const [guessResults, setGuessResults] = useState<
    FunctionReturnType<typeof fn.makeGuess>[]
  >([]);
  const [misc, setMisc] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("rank");

  return (
    <div className="flex flex-col items-center justify-center min-h-screen h-full overflow-scroll bg-background text-foreground">
      <main className="flex flex-col items-center justify-center w-full max-w-4xl gap-8 px-6 py-8">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <Input
              type="text"
              defaultValue={name}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void updateNamespace({
                    namespace,
                    name: e.currentTarget.value,
                  }).then(() =>
                    toast({ title: "Name updated", description: "" }),
                  );
                }
              }}
              onBlur={(e) =>
                void updateNamespace({
                  namespace,
                  name: e.target.value,
                }).then(() => toast({ title: "Name updated", description: "" }))
              }
              className="text-2xl font-bold"
            />
            <Textarea
              placeholder="Description"
              defaultValue={description}
              className="text-sm text-muted-foreground"
              onBlur={(e) =>
                void updateNamespace({
                  namespace,
                  description: e.target.value,
                }).then(() => toast({ title: "Description updated" }))
              }
            />
            {/* <div className="flex items-center gap-2"> */}
            <Select
              value={strategy}
              onValueChange={(v) => setStrategy(v as any)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Stragegy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rank">Reciprocal Rank Fusion</SelectItem>
                <SelectItem value="rankOverall">
                  Reciprocal Rank Fusion (Overall)
                </SelectItem>
                <SelectItem value="midpoint">Midpoint</SelectItem>
                <SelectItem value="lxr">
                  Left Distance * Right Distance
                </SelectItem>
              </SelectContent>
            </Select>
            {/* </div> */}
          </div>
        </div>
        {!isEmpty && (
          <div className="flex flex-col items-center w-full gap-2">
            <div className="flex gap-4">
              <Input
                type="text"
                placeholder={leftRandomText || "Left"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const left = e.currentTarget.value;
                    e.preventDefault();
                    setWords((words) => ({ ...words, left }));
                  }
                }}
                className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="flex flex-col items-center gap-2">
                <Input
                  type="text"
                  placeholder="Guess"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const guess = e.currentTarget.value;
                      e.currentTarget.value = "";
                      convex
                        .action(fn.makeGuess, {
                          ...words,
                          guess,
                          namespace,
                          strategy,
                        })
                        .then((results) =>
                          setGuessResults((arr) => [
                            ...arr.filter((g) => g.guess !== guess),
                            results,
                          ]),
                        )
                        .catch((e) => {
                          e.currentTarget.value = guess;
                          toast({
                            title: "Error making guess",
                            description: e.message,
                          });
                        });
                      setWords((words) => ({ ...words, guess }));
                    }
                  }}
                  className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                {[...guessResults]
                  .sort((a, b) =>
                    strategy === "lxr"
                      ? b.lxrScore - a.lxrScore
                      : b.score - a.score,
                  )
                  .slice(0, 10)
                  .map((guess, i) => (
                    <div
                      key={guess.guess + i}
                      className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground"
                    >
                      {f(guess.leftScore)} ⬅️ {guess.guess}: {guess.rank}(
                      {f(guess.score)}) ➡️ {f(guess.rightScore)}
                    </div>
                  ))}
              </div>
              <Input
                type="text"
                placeholder={rightRandomText || "Right"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const right = e.currentTarget.value;
                    setWords((words) => ({ ...words, right }));
                  }
                }}
                className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex gap-4 w-full">
              <BasicSearch namespace={namespace} text={words.left} />
              <Midpoint
                namespace={namespace}
                left={words.left}
                right={words.right}
                strategy={"plus"}
              />
              <Midpoint
                namespace={namespace}
                left={words.left}
                right={words.right}
                strategy={"rank"}
              />
              <Midpoint
                namespace={namespace}
                left={words.left}
                right={words.right}
                strategy={"rankOverall"}
              />
              <Midpoint
                namespace={namespace}
                left={words.left}
                right={words.right}
                strategy={"midpoint"}
              />
              <Midpoint
                namespace={namespace}
                left={words.left}
                right={words.right}
                strategy={"lxr"}
              />
              <BasicSearch namespace={namespace} text={words.right} />
            </div>
            <div className="flex items-center flex-col gap-4">
              <Input
                type="text"
                placeholder="Misc search"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setMisc(e.currentTarget.value);
                  }
                }}
                className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <BasicSearch namespace={namespace} text={misc} />
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl font-bold">Rounds</span>
                <div className="flex flex-wrap gap-2">
                  {[...rounds].reverse().map((round) => (
                    <div key={round._id} className="flex gap-2">
                      <Button
                        key={round._id}
                        variant="secondary"
                        onClick={() => {
                          setRoundId(round._id);
                        }}
                      >
                        {round.left} - {round.right}{" "}
                        {round.active ? "✅" : null}
                      </Button>
                      <Button
                        onClick={() => {
                          if (!isPublic) {
                            toast({
                              title: "Cannot activate private rounds",
                              description:
                                "Make the category public to activate rounds: " +
                                `npx convex run namespace:makeNamespacePublic '{"namespace": "${namespace}"}'`,
                            });
                            return;
                          }
                          convex
                            .mutation(fn.setRoundActive, {
                              namespace,
                              roundId: round._id,
                              active: !round.active,
                            })
                            .catch((e) =>
                              toast({
                                title: "Error deleting midpoint",
                                description: e.message,
                              }),
                            );
                        }}
                      >
                        {round.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  ))}
                </div>
                {round && (
                  <div>
                    <div className="font-bold">
                      Round: {round.left} - {round.right}
                    </div>
                    <div className="grid grid-flow-col auto-cols-fr gap-x-8 mt-2">
                      {chunk(round.matches, 20).map((column, colIndex) => (
                        <ol
                          key={colIndex}
                          className="list-decimal list-inside"
                          start={colIndex * 20 + 1}
                        >
                          {column.map((m) => (
                            <li key={m} className="pl-2">
                              {m}
                            </li>
                          ))}
                        </ol>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center gap-2">
                <span className="text-3xl font-bold">Midpoints</span>
                <div className="flex flex-wrap gap-2">
                  {midpoints.results.map((midpoint) => (
                    <div key={midpoint._id} className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setWords((words) => ({
                            ...words,
                            left: midpoint.left,
                            right: midpoint.right,
                          }));
                        }}
                      >
                        {midpoint.left} - {midpoint.right}
                      </Button>
                      <Button
                        onClick={() => {
                          convex
                            .mutation(fn.deleteMidpoint, {
                              namespace,
                              midpointId: midpoint._id,
                            })
                            .catch((e) =>
                              toast({
                                title: "Error deleting midpoint",
                                description: e.message,
                              }),
                            );
                        }}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  ))}
                </div>
                {midpoints.status === "CanLoadMore" && (
                  <Button onClick={() => midpoints.loadMore(10)}>
                    Load more
                  </Button>
                )}
              </div>
            </div>
            <Words namespace={namespace} />
          </div>
        )}
        <Textarea
          placeholder="Add text (skipping those already added) - enter JSON (array of strings or {title, text}) or line-delimited and hit enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const value = e.currentTarget.value.trim();
              const target = e.target as HTMLTextAreaElement;
              if (value.startsWith("https://")) {
                toast({ title: "Adding text" });
                convex
                  .action(fn.addText, { namespace, url: value })
                  .then(() => {
                    toast({ title: "Text added" });
                    target.value = "";
                  })
                  .catch((e) => {
                    toast({
                      title: "Error adding text",
                      description: e.message,
                    });
                  });
                return;
              }
              const titled = parseText(value);
              e.currentTarget.blur();
              e.currentTarget.disabled = true;
              toast({ title: "Adding text" });
              Promise.all(
                chunk(titled, 1000).map((chunk) =>
                  convex.action(fn.addText, { namespace, titled: chunk }),
                ),
              )
                .then(() => {
                  toast({ title: "Text added" });
                  target.value = "";
                })
                .catch((e) => {
                  toast({
                    title: "Error adding text",
                    description: e.message,
                  });
                })
                .finally(() => {
                  target.disabled = false;
                });
            }
          }}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </main>
    </div>
  );
}

function Words({ namespace }: { namespace: string }) {
  const texts = usePaginatedQuery(
    fn.paginateText,
    {
      namespace,
    },
    { initialNumItems: 10 },
  );
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-3xl font-bold">Words</span>
      <div className="flex flex-wrap gap-4 justify-center">
        {texts.results.map((text) => (
          <div key={text._id} className="flex items-center p-2 border rounded">
            <div className="text-sm font-medium">
              {text.title} {text.text === text.title ? null : `(${text.text})`}
            </div>
          </div>
        ))}
      </div>
      {texts.status === "CanLoadMore" && (
        <Button onClick={() => texts.loadMore(100)}>Load more</Button>
      )}
    </div>
  );
}

function checkString(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("Must be a string");
  }
  return input;
}

function checkObject(input: unknown): { title: string; text: string } {
  if (!input || typeof input !== "object") {
    throw new Error(`Must be an object: ${input as any}`);
  }
  if ("title" in input && "text" in input) {
    return { title: checkString(input.title), text: checkString(input.text) };
  }
  throw new Error(`Must have title and text: ${JSON.stringify(input)}`);
}

function parseText(input: string): { title: string; text: string }[] {
  try {
    const results = JSON.parse(input);
    if (!Array.isArray(results)) {
      throw new Error("Must be an array");
    }
    if (typeof results[0] === "string") {
      return results.map(checkString).map((text) => ({ title: text, text }));
    } else {
      return results.map(checkObject);
    }
  } catch (e) {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      toast({
        title: "Error adding text",
        description:
          (e as string) +
          `You can add a JSON array of strings or objects like {"title": "foo", "text": "bar"}[] or lines of text separated by newlines`,
      });
      throw e;
    }
  }
  const lines = input
    .split("\n")
    .map((line) => {
      let ret = line;
      if (ret.startsWith('"')) ret = ret.slice(1);
      if (ret.endsWith(",")) ret = ret.slice(0, -1);
      if (ret.endsWith('"')) ret = ret.slice(0, -1);
      return ret;
    })
    .filter(Boolean);
  if (lines.length < 2) {
    toast({
      title: "Error adding text",
      description: "No lines found in input",
    });
    throw new Error("No lines found");
  }
  return lines.map((text) => ({ title: text, text }));
}

function BasicSearch({ namespace, text }: { namespace: string; text: string }) {
  const basicSearch = useAction(fn.basicVectorSearch);
  const [basicResults, setBasicResults] = useState<
    FunctionReturnType<typeof fn.basicVectorSearch>
  >([]);
  useEffect(() => {
    if (!text) return;
    void basicSearch({ namespace, text }).then((results) => {
      setBasicResults(results);
    });
  }, [namespace, text, basicSearch]);
  return (
    <div className="flex flex-col items-center w-full gap-2">
      <div className="text-lg"> {text}</div>
      <div className="flex flex-col justify-center gap-2">
        {!!text.length &&
          basicResults.map((result, i) => (
            <div
              key={result.title + i}
              className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground"
            >
              {result.title} - {f(result.score)}
            </div>
          ))}
      </div>
    </div>
  );
}

function f(num: number | undefined) {
  if (num === undefined) return "???";
  return num.toPrecision(2);
}

function Midpoint({
  namespace,
  left,
  right,
  strategy,
}: {
  namespace: string;
  right: string;
  left: string;
  strategy: Strategy;
}) {
  const search = useAction(fn.midpointSearch);
  const makeRound = useMutation(fn.makeRound);
  const [midpoint, setMidpoint] = useState<Doc<"midpoints">>();
  const getScore = useCallback(
    (match: Doc<"midpoints">["topMatches"][0]): number => {
      switch (strategy) {
        case "plus":
          return match.plusScore;
        case "lxr":
          return match.lxrScore;
        case "midpoint":
          return match.score;
        case "rank":
          return match.rrfScore;
        case "rankOverall":
          return match.rrfOverallScore;
      }
    },
    [strategy],
  );
  const getLR = (
    match: Doc<"midpoints">["topMatches"][0],
  ): [number, number] => {
    switch (strategy) {
      case "plus":
      case "lxr":
      case "midpoint":
        return [match.leftScore, match.rightScore];
      case "rank":
        return [match.leftRank, match.rightRank];
      case "rankOverall":
        return [match.leftOverallRank, match.rightOverallRank];
    }
  };

  const sorted = useMemo(() => {
    if (!midpoint) return [];
    return [...midpoint.topMatches].sort((a, b) => getScore(b) - getScore(a));
  }, [midpoint, getScore]);
  useEffect(() => {
    if (!left || !right) return;
    void search({ namespace, left, right }).then((results) => {
      setMidpoint(results);
    });
  }, [namespace, left, right, search]);
  return (
    <div className="flex flex-col items-center w-full gap-2">
      <div className="text-lg">{strategy}</div>
      <div className="flex flex-col justify-center gap-2">
        {sorted.slice(0, 10).map((result, i) => {
          const [left, right] = getLR(result);
          return (
            <div
              key={result.title + i}
              className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground"
            >
              {result.title}:{f(getScore(result))}
              <div>
                {f(left)} ↔️ {f(right)}
              </div>
            </div>
          );
        })}
      </div>
      <Button
        onClick={() => {
          void search({ namespace, left, right }).then((results) => {
            setMidpoint(results);
          });
        }}
      >
        Refresh
      </Button>
      <Button
        onClick={() => {
          if (!midpoint) {
            toast({ title: "No midpoint selected" });
            return;
          }
          void makeRound({
            namespace,
            left: midpoint.left,
            right: midpoint.right,
            titles: sorted
              .filter((r) => getScore(r) > -Infinity)
              .slice(0, MAX_MATCH_RANK)
              .map((r) => r.title),
          });
        }}
      >
        Create Round
      </Button>
    </div>
  );
}
