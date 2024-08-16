import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import "./index.css";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { router } from "./router";
dayjs.extend(relativeTime);

// Render the app
const rootElement = document.getElementById("root")!;
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class">
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
);
