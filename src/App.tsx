import { Layout } from "@/Layout";
import { SignInForm, SignInWithGitHub } from "@/SignInForm";
import { UserMenu } from "@/components/UserMenu";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";

export default function App() {
  return (
    <Layout
      menu={
        <Authenticated>
          <UserMenu />
        </Authenticated>
      }
    >
      <>
        <Authenticated>hi</Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </>
    </Layout>
  );
}
