import { Code } from "@/components/Code";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { SignInForm } from "@/SignInForm";
import { api } from "@convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

export const Route = createFileRoute("/author/")({
  component: Author,
  errorComponent: () => <SignInForm />,
});

function Author() {
  const namespaces = useQuery(api.namespace.listNamespaces) || [];
  const upsertNamespace = useMutation(api.namespace.upsertNamespace);
  return (
    <div className="flex flex-col gap-2 items-center min-h-full overflow-scroll bg-background text-foreground">
      <h2>Categories</h2>
      <div className="grid grid-cols-6 gap-4 w-full max-w-7xl px-4">
        {namespaces.map((namespace) => (
          <Link
            key={namespace._id}
            to={`/author/${namespace.slug}`}
            className="block"
          >
            <div className="h-full p-4 rounded-lg border border-border hover:border-primary transition-colors bg-card">
              <h3 className="font-semibold truncate">{namespace.name}</h3>
              <p className="text-muted-foreground truncate">
                <Code className="text-xs">/{namespace.slug}</Code>
              </p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {namespace.description}
              </p>
              <div className="mt-2">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    namespace.public
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {namespace.public ? "Public" : "Private"}
                </span>
              </div>
            </div>
          </Link>
        ))}

        <div className="block">
          <div className="h-full p-4 rounded-lg border border-dashed border-border hover:border-primary transition-colors bg-card/50 flex flex-col items-center justify-center gap-4 cursor-pointer group">
            <span className="text-5xl text-muted-foreground group-hover:text-primary">
              +
            </span>
            <Input
              type="text"
              placeholder="Create new category"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = e.currentTarget.value;
                  const slug = name.toLowerCase().replace(/\s/g, "-");
                  e.preventDefault();
                  e.currentTarget.value = "";
                  upsertNamespace({
                    name,
                    slug,
                    description: "",
                    public: false,
                  }).catch((err) => {
                    console.log(e);
                    toast({
                      title: "Failed to create namespace",
                      description: err.message,
                    });
                    if (!(e.target as HTMLInputElement).value)
                      (e.target as HTMLInputElement).value = name;
                  });
                }
              }}
              className="max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
