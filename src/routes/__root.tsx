import { Toaster } from "@/components/ui/toaster";
import { UserMenu } from "@/components/UserMenu";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import {
  createRootRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { lazy, ReactNode, Suspense, useEffect, useState } from "react";
import { Flipped, Flipper } from "react-flip-toolkit";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
  { verbose: true },
);

export const Route = createRootRoute({
  component: App,
  validateSearch: (search) => {
    return {
      anonymousId: search.anonymousId,
    } as { anonymousId?: string };
  },
});

function App() {
  const router = useRouter();
  return (
    <ConvexAuthProvider
      client={convex}
      replaceURL={(to) => router.navigate({ to, replace: true })}
    >
      <CaptureSession />
      <Content />
    </ConvexAuthProvider>
  );
}

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
const TanStackRouterDevtools =
  process.env.NODE_ENV === "production"
    ? () => null // Render nothing in production
    : lazy(() =>
        // Lazy load in development
        import("@tanstack/router-devtools").then((res) => ({
          default: res.TanStackRouterDevtools,
          // For Embedded Mode
          // default: res.TanStackRouterDevtoolsPanel
        })),
      );
function Content() {
  const [data, setData] = useState(titles[0]);
  const [circleSwap, setCircleSwap] = useState(false);

  useEffect(() => {
    const circleInterval = setInterval(
      () => setCircleSwap((circleSwap) => !circleSwap),
      5000,
    );
    const titleInterval = setInterval(() => {
      setData(titles[Math.floor(Math.random() * titles.length)]);
    }, 7000);
    return () => {
      clearInterval(circleInterval);
      clearInterval(titleInterval);
    };
  }, []);
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-20 border-b bg-background/80 backdrop-blur">
        <nav className="container w-full justify-between flex flex-row items-center gap-6">
          <div className="flex items-center gap-6 md:gap-10">
            <Link className="flex items-center" to="/">
              <Flipper flipKey={circleSwap}>
                <div className="relative w-20 h-16">
                  <Flipped flipId="circle1">
                    <div
                      className="absolute w-12 h-12 rounded-full bg-blue-500 opacity-50 transition-all duration-500 ease-in-out"
                      style={{
                        left: circleSwap ? "0" : "20px",
                        top: "4px",
                      }}
                    ></div>
                  </Flipped>
                  <Flipped flipId="circle2">
                    <div
                      className="absolute w-12 h-12 rounded-full bg-red-500 opacity-50 transition-all duration-500 ease-in-out"
                      style={{
                        left: circleSwap ? "20px" : "0px",
                        top: "4px",
                      }}
                    ></div>
                  </Flipped>
                </div>
              </Flipper>
              <h1 className="text-yellow-400 text-xl font-semibold">
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
              </h1>
            </Link>
          </div>
          <UserMenu />
        </nav>
      </header>
      <main className="flex grow flex-col">
        <Outlet />
        <Toaster />
      </main>
      <footer className="border-t hidden grow-0 sm:block">
        <div className="flex">
          <div className="container py-4 text-sm leading-loose">
            Built with ❤️ at{" "}
            <FooterLink href="https://www.convex.dev/">Convex</FooterLink>.
          </div>
        </div>
      </footer>
      <Suspense>
        <TanStackRouterDevtools position="bottom-right" />
      </Suspense>
    </div>
  );
}
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="underline underline-offset-4 hover:no-underline"
      target="_blank"
    >
      {children}
    </a>
  );
}

function CaptureSession() {
  const { anonymousId } = useSearch({ from: Route.id });
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate({ from: Route.fullPath });
  useEffect(() => {
    if (anonymousId && isAuthenticated) {
      void convex.mutation(api.users.captureSession, { anonymousId });
      // clear the search param
      void navigate({ search: ({ anonymousId: _, ...prev }) => ({ ...prev }) });
    }
  }, [anonymousId, isAuthenticated, navigate]);
  return null;
}
