import { Toaster } from "@/components/ui/toaster";
import { UserMenu } from "@/components/UserMenu";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  createRootRoute,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import {
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";
import { ReactNode, useEffect, useState } from "react";
import { Flipped, Flipper } from "react-flip-toolkit";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
  { verbose: true },
);

export const Route = createRootRoute({
  component: App,
});

function App() {
  const router = useRouter();
  return (
    <ConvexAuthProvider
      client={convex}
      replaceURL={(to) => router.navigate({ to, replace: true })}
    >
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
          <Unauthenticated>
            {/* TODO: make login a popover */}
            <Link
              to="/login"
              className="text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"
            >
              Log In
            </Link>
          </Unauthenticated>
          <Authenticated>
            <UserMenu />
          </Authenticated>
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
            Powered by Convex,{" "}
            <FooterLink href="https://vitejs.dev">Vite</FooterLink>,{" "}
            <FooterLink href="https://react.dev/">React</FooterLink> and{" "}
            <FooterLink href="https://ui.shadcn.com/">shadcn/ui</FooterLink>.
            <Link
              to="/author"
              className="p-2 text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"
            >
              Author your own
            </Link>
          </div>
        </div>
      </footer>
      <TanStackRouterDevtools position="bottom-right" />
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
