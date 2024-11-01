import { SignInMethodDivider } from "@/components/SignInMethodDivider";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { toast } from "./components/ui/use-toast";
import dayjs from "dayjs";
import { ComponentProps } from "react";
import { isRateLimitError } from "@convex-dev/ratelimiter";

export function SignInForm() {
  return (
    <div className="container my-auto">
      <div className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">
        <>
          <h2 className="font-semibold text-2xl tracking-tight">
            Sign in or create an account
          </h2>
          <SignInWithGitHub className="flex-1" />
          <SignInMethodDivider />
          <SignInAnonymously />
        </>
      </div>
    </div>
  );
}

export function SignInWithGitHub(props: ComponentProps<"button">) {
  const { signIn } = useAuthActions();
  return (
    <Button
      variant="outline"
      type="button"
      onClick={() =>
        void signIn("github", { redirectTo: window.location.href })
      }
      {...props}
    >
      <GitHubLogoIcon className="mr-2 h-4 w-4" /> Sign in with GitHub
    </Button>
  );
}

function SignInAnonymously() {
  const { signIn } = useAuthActions();
  return (
    <Button
      className="flex-1"
      variant="outline"
      type="button"
      onClick={() =>
        void signIn("anonymous").catch((e) => {
          if (isRateLimitError(e)) {
            toast({
              title: "Too many users being created.",
              description:
                "Log in with GitHub or retry " +
                dayjs(Date.now() + e.data.retryAfter).fromNow(),
            });
          }
        })
      }
    >
      Continue as a guest
    </Button>
  );
}
