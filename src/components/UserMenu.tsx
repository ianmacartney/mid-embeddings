import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthActions } from "@convex-dev/auth/react";
import { PersonIcon } from "@radix-ui/react-icons";
import { api } from "@convex/_generated/api";
import { Unauthenticated, useConvexAuth, useQuery } from "convex/react";
import { SignInWithGitHub } from "@/SignInForm";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { isRateLimitError } from "@convex-dev/ratelimiter";
import { toast } from "./ui/use-toast";
import dayjs from "dayjs";

export function UserMenu() {
  const user = useQuery(api.users.viewer);
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <Unauthenticated>
        <LogInAnonymouslyByDefault />
      </Unauthenticated>
      {user && !user.isAnonymous && user.name}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="rounded-full">
            {!user?.isAnonymous && user?.image ? (
              <img className="rounded-full" src={user.image} />
            ) : (
              <PersonIcon className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user && !user.isAnonymous && (
            <>
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              <Link
                to="/author"
                className="p-2 transition-colors hover:text-muted-foreground [&.active]:text-muted-foreground"
              >
                Explore your own
              </Link>
            </>
          )}
          {user?.isAnonymous && <SignInWithGitHub />}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 py-0 font-normal">
            Theme
            <ThemeToggle />
          </DropdownMenuLabel>
          {user && !user?.isAnonymous && <SignOutButton />}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LogInAnonymouslyByDefault() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      void signIn("anonymous").catch((e) => {
        if (isRateLimitError(e)) {
          toast({
            title: "Too many users being created.",
            description:
              "Log in with GitHub or retry " +
              dayjs(Date.now() + e.data.retryAfter).fromNow(),
          });
        }
      });
    }
  }, [isAuthenticated, isLoading, signIn]);
  return null;
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  return (
    <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
  );
}
