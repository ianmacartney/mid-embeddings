import { Toaster } from "@/components/ui/toaster";
import { UserMenu } from "@/components/UserMenu";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import {
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
  { verbose: true },
);

export const Route = createRootRoute({
  component: App,
});

function App() {
  return (
    <ConvexAuthProvider client={convex}>
      <Content />
    </ConvexAuthProvider>
  );
}

function Content() {
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-20 border-b bg-background/80 backdrop-blur">
        <nav className="container w-full justify-between flex flex-row items-center gap-6">
          <div className="flex items-center gap-6 md:gap-10">
            <a href="/">
              <h1 className="text-base font-semibold">Mid</h1>
            </a>
            <div className="flex items-center gap-4 text-sm">
              <Link
                to="/author"
                className="text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"
              >
                Author
              </Link>
            </div>
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
