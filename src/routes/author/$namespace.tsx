import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { FunctionReturnType } from "convex/server";
import { ButtonIcon, TrashIcon } from "@radix-ui/react-icons";
import { chunk } from "@/lib/utils";

export const Route = createFileRoute("/author/$namespace")({
  component: Namespace,
});

function Namespace() {
  const { namespace } = Route.useParams();
  const { name, description } =
    useQuery(api.namespace.getNamespace, { namespace }) || {};
  const updateNamespace = useMutation(api.namespace.update);
  const addText = useAction(api.namespace.addText);
  const texts = usePaginatedQuery(
    api.namespace.paginateText,
    {
      namespace,
    },
    { initialNumItems: 10 },
  );
  const games =
    useQuery(api.namespace.listGamesByNamespace, { namespace }) ?? [];
  const midpoints = usePaginatedQuery(
    api.namespace.listMidpoints,
    { namespace },
    { initialNumItems: 10 },
  );
  const deleteMidpoint = useMutation(api.namespace.deleteMidpoint);
  const [words, setWords] = useState({ left: "", right: "", guess: "" });
  useEffect(() => {
    if (midpoints.results.length === 0) return;
    if (words.left || words.right) return;
    setWords({
      left: midpoints.results[0].left,
      right: midpoints.results[0].right,
      guess: "",
    });
  }, [words.left, words.right, midpoints.results[0]]);

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
                  console.log("ho");
                  updateNamespace({
                    namespace,
                    name: e.currentTarget.value,
                  }).then(() =>
                    toast({ title: "Name updated", description: "" }),
                  );
                }
              }}
              onBlur={(e) =>
                updateNamespace({
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
                updateNamespace({
                  namespace,
                  description: e.target.value,
                }).then(() => toast({ title: "Description updated" }))
              }
            />
          </div>
        </div>
        {texts.results.length === 0 ? (
          <Textarea
            placeholder="Add text"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                try {
                  const results = JSON.parse(e.currentTarget.value);
                  if (!Array.isArray(results)) {
                    throw new Error("Must be an array");
                  }
                  let titled;
                  if (typeof results[0] === "string") {
                    titled = results.map((text) => ({ title: text, text }));
                  } else {
                    if (!results[0].title && !results[0].text) {
                      throw new Error("Must have title and text");
                    }
                    titled = results as { title: string; text: string }[];
                  }
                  e.currentTarget.blur();
                  e.currentTarget.disabled = true;
                  toast({ title: "Adding text" });
                  Promise.all(
                    chunk(titled, 1000).map((chunk) =>
                      addText({ namespace, titled: chunk }),
                    ),
                  )
                    .then(() => {
                      toast({ title: "Text added" });
                    })
                    .catch((e) => {
                      e.target.disabled = false;
                      toast({
                        title: "Error adding text",
                        description: e.message,
                      });
                    });
                } catch (e) {
                  toast({
                    title: "Error adding text",
                    description: e as string,
                  });
                }
              }
            }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        ) : (
          <div className="flex flex-col items-center w-full gap-2">
            <div className="flex gap-4">
              <div className="flex flex-col items-center gap-2">
                <Input
                  type="text"
                  placeholder="Left"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const left = e.currentTarget.value;
                      e.preventDefault();
                      setWords((words) => ({ ...words, left }));
                    }
                  }}
                  className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <BasicSearch namespace={namespace} text={words.left} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <Input
                  type="text"
                  placeholder="Guess"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const guess = e.currentTarget.value;
                      setWords((words) => ({ ...words, guess }));
                    }
                  }}
                  className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="text-lg"> {words.guess}</div>
                <Midpoint
                  namespace={namespace}
                  left={words.left}
                  right={words.right}
                />
              </div>
              <div className="flex flex-col items-center gap-2">
                <Input
                  type="text"
                  placeholder="Right"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const right = e.currentTarget.value;
                      setWords((words) => ({ ...words, right }));
                    }
                  }}
                  className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <BasicSearch namespace={namespace} text={words.right} />
              </div>
            </div>

            <div className="flex justify-between gap-4">
              <div className="flex flex-col justify-center gap-2">
                <span className="text-3xl font-bold">Midpoints</span>
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
                        deleteMidpoint({
                          namespace,
                          midpointId: midpoint._id,
                        }).catch((e) =>
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
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl font-bold">Games</span>
                <div className="flex flex-col justify-center gap-2">
                  {games.map((game) => (
                    // <div className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground">
                    <Button
                      key={game._id}
                      onClick={() => {
                        console.log(game);
                        setWords((words) => ({
                          ...words,
                          left: game.left,
                          right: game.right,
                        }));
                      }}
                    >
                      {game.left} - {game.right} {game.active ? "⬅" : null}
                    </Button>
                    // </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 ">
              <span className="text-3xl font-bold">Words</span>
              {texts.results.map((text) => (
                <div key={text._id} className="flex items-center gap-4">
                  <div className="flex-1 text-sm font-medium">
                    {text.title}{" "}
                    {text.text === text.title ? null : `(${text.text})`}
                  </div>
                </div>
              ))}
              {texts.status === "CanLoadMore" && (
                <Button onClick={() => texts.loadMore(100)}>Load more</Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function BasicSearch({ namespace, text }: { namespace: string; text: string }) {
  const basicSearch = useAction(api.namespace.basicVectorSearch);
  const [basicResults, setBasicResults] = useState<
    FunctionReturnType<typeof api.namespace.basicVectorSearch>
  >([]);
  useEffect(() => {
    if (!text) return;
    basicSearch({ namespace, text }).then((results) => {
      setBasicResults(results);
    });
  }, [namespace, text]);
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
              {result.title} - {result.score}
            </div>
          ))}
      </div>
    </div>
  );
}

function Midpoint({
  namespace,
  left,
  right,
}: {
  namespace: string;
  right: string;
  left: string;
}) {
  const search = useAction(api.namespace.midpointSearch);
  const makeGame = useMutation(api.namespace.makeGame);
  const [midpoint, setMidpoint] =
    useState<FunctionReturnType<typeof api.namespace.midpointSearch>>();
  useEffect(() => {
    if (!left || !right) return;
    search({ namespace, left, right }).then((results) => {
      setMidpoint(results);
    });
  }, [namespace, left, right]);
  return (
    <div className="flex flex-col items-center w-full gap-2">
      <div className="text-lg">
        {left} - {right}
      </div>
      <div className="flex flex-col justify-center gap-2">
        {midpoint?.topMatches.slice(0, 10).map((result, i) => (
          <div
            key={result.title + i}
            className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground"
          >
            {result.title} - {result.score}
          </div>
        ))}
      </div>
      <Button
        onClick={() => {
          search({ namespace, left, right, skipCache: true }).then(
            (results) => {
              console.log(results.topMatches[0]);
              setMidpoint(results);
            },
          );
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
          makeGame({ namespace, midpointId: midpoint._id });
        }}
      >
        Create Game
      </Button>
    </div>
  );
}
