/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _legacyContent from "../_legacyContent.js";
import type * as _relatedLinks from "../_relatedLinks.js";
import type * as _releaseIntegrity from "../_releaseIntegrity.js";
import type * as _releaseLookups from "../_releaseLookups.js";
import type * as _releaseManifest from "../_releaseManifest.js";
import type * as _storedPayload from "../_storedPayload.js";
import type * as content from "../content.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as manifest from "../manifest.js";
import type * as queries from "../queries.js";
import type * as rateLimit from "../rateLimit.js";
import type * as related from "../related.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _legacyContent: typeof _legacyContent;
  _relatedLinks: typeof _relatedLinks;
  _releaseIntegrity: typeof _releaseIntegrity;
  _releaseLookups: typeof _releaseLookups;
  _releaseManifest: typeof _releaseManifest;
  _storedPayload: typeof _storedPayload;
  content: typeof content;
  http: typeof http;
  ingest: typeof ingest;
  lib: typeof lib;
  maintenance: typeof maintenance;
  manifest: typeof manifest;
  queries: typeof queries;
  rateLimit: typeof rateLimit;
  related: typeof related;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
