import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/author/$namespace")({
  component: () => {
    const { namespace } = Route.useParams();
    const games = useQuery(api.game.listGamesByNamespace, { namespace });


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between w-full max-w-4xl px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-full">
            <svg viewBox="0 0 100 100" className="w-6 h-6 text-primary-foreground">
              <path d="M50,20c-16.5,0-30,13.5-30,30s13.5,30,30,30s30-13.5,30-30S66.5,20,50,20z M35,50c0-8.3,6.7-15,15-15s15,6.7,15,15 s-6.7,15-15,15S35,58.3,35,50z M65,65c-5,5-15,10-15,10s-10-5-15-10c-5-5,5-15,15-15S70,60,65,65z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <Input type="text" defaultValue="Word Guessing Game" className="text-2xl font-bold" />
            <Textarea placeholder="Guess the words and create new ones!" className="text-sm text-muted-foreground" />
          </div>
        </div>
      </header>
      <main className="flex flex-col items-center justify-center w-full max-w-4xl gap-8 px-6 py-8">
        <div className="flex flex-col items-center w-full gap-2">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Add a new word"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                }
              }}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button>Add</Button>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold">WORD</div>
              <Input
                type="text"
                placeholder="Enter your guess"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                  }
                }}
                className="flex-1 max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="text-3xl font-bold">WORD</div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <div className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground">WORD</div>
              <div className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground">WORD</div>
              <div className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground">WORD</div>
              <div className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground">WORD</div>
              <div className="px-3 py-1 text-sm font-medium rounded-md bg-muted text-muted-foreground">WORD</div>
            </div>
          </div>
        </div>
      </main>
    </div>



    </>;
  )
  },
});
