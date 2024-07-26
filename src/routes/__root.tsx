import { UserMenu } from "@/components/UserMenu";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Authenticated, Unauthenticated } from "convex/react";
import { ReactNode } from "react";

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-20 border-b bg-background/80 backdrop-blur">
        <nav className="container w-full justify-between flex flex-row items-center gap-6">
          <div className="flex items-center gap-6 md:gap-10">
            <a href="/">
              <h1 className="text-base font-semibold">Feelings Wheel</h1>
            </a>
            <div className="flex items-center gap-4 text-sm">
              <a
                href="https://docs.convex.dev"
                className="text-muted-foreground transition-colors hover:text-foreground"
                target="_blank"
              >
                Docs
              </a>
            </div>
          </div>
          <Unauthenticated>
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
      <main className="flex grow flex-col overflow-hidden">
        <Outlet />
      </main>
      <footer className="border-t hidden sm:block">
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
      <TanStackRouterDevtools />
    </div>
  ),
});

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