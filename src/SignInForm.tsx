import { SignInMethodDivider } from "@/components/SignInMethodDivider";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { toast } from "./components/ui/use-toast";
import dayjs from "dayjs";
import { ComponentProps } from "react";
import { isRateLimitError } from "@convex-dev/ratelimiter";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";

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
  const convex = useConvex();
  return (
    <Button
      variant="outline"
      type="button"
      onClick={() =>
        void (async () => {
          const loginUrl = new URL(window.location.href);
          const anonymousId = await convex.query(api.users.getAnonymousId);
          if (anonymousId) {
            loginUrl.searchParams.set("anonymousId", anonymousId);
          }
          await signIn("github", { redirectTo: loginUrl.toString() });
        })()
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
