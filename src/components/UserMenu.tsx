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
import { GitHubLogoIcon, PersonIcon } from "@radix-ui/react-icons";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

export function UserMenu() {
  const user = useQuery(api.users.viewer);
  const { signIn } = useAuthActions();
  if (!user || user.isAnonymous)
    return (
      <Button
        variant="outline"
        type="button"
        onClick={() => void signIn("github")}
      >
        <GitHubLogoIcon className="mr-2 h-4 w-4" /> Sign in with GitHub
      </Button>
    );
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      {user.name}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="rounded-full">
            {user.image ? (
              <img className="rounded-full" src={user.image} />
            ) : (
              <PersonIcon className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 py-0 font-normal">
            Theme
            <ThemeToggle />
          </DropdownMenuLabel>
          <SignOutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  return (
    <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
  );
}
