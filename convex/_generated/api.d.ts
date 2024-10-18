/* prettier-ignore-start */

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as embed from "../embed.js";
import type * as functions from "../functions.js";
import type * as game from "../game.js";
import type * as http from "../http.js";
import type * as linearAlgebra from "../linearAlgebra.js";
import type * as llm from "../llm.js";
import type * as namespace from "../namespace.js";
import type * as scrap from "../scrap.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  embed: typeof embed;
  functions: typeof functions;
  game: typeof game;
  http: typeof http;
  linearAlgebra: typeof linearAlgebra;
  llm: typeof llm;
  namespace: typeof namespace;
  scrap: typeof scrap;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

/* prettier-ignore-end */
