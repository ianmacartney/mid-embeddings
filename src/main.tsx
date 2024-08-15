import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { router } from "./router";
dayjs.extend(relativeTime);

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Render the app
const rootElement = document.getElementById("root")!;
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class">
      <ConvexAuthProvider
        client={convex}
        replaceURL={(to) => router.navigate({ to, replace: true })}
      >
        <RouterProvider router={router} />
      </ConvexAuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
