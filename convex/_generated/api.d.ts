/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _commandConventions from "../_commandConventions.js";
import type * as _derivedEncoding from "../_derivedEncoding.js";
import type * as _derivedInputs from "../_derivedInputs.js";
import type * as _derivedModel from "../_derivedModel.js";
import type * as _destructive from "../_destructive.js";
import type * as _explainBounds from "../_explainBounds.js";
import type * as _flagSearch from "../_flagSearch.js";
import type * as _generatedLayer from "../_generatedLayer.js";
import type * as _indexPolicy from "../_indexPolicy.js";
import type * as _ingestErrors from "../_ingestErrors.js";
import type * as _legacyContent from "../_legacyContent.js";
import type * as _locales from "../_locales.js";
import type * as _manifestStorage from "../_manifestStorage.js";
import type * as _optionFlags from "../_optionFlags.js";
import type * as _providers from "../_providers.js";
import type * as _relatedLinks from "../_relatedLinks.js";
import type * as _releaseChildren from "../_releaseChildren.js";
import type * as _releaseIntegrity from "../_releaseIntegrity.js";
import type * as _releaseLookups from "../_releaseLookups.js";
import type * as _releaseManifest from "../_releaseManifest.js";
import type * as _searchTypos from "../_searchTypos.js";
import type * as _shellGrammar from "../_shellGrammar.js";
import type * as _shellParser from "../_shellParser.js";
import type * as _shellWrappers from "../_shellWrappers.js";
import type * as _storedPayload from "../_storedPayload.js";
import type * as _symbols from "../_symbols.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as derived from "../derived.js";
import type * as derivedSignatures from "../derivedSignatures.js";
import type * as explain from "../explain.js";
import type * as generated from "../generated.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as ingestContract from "../ingestContract.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as manifest from "../manifest.js";
import type * as packages from "../packages.js";
import type * as portability from "../portability.js";
import type * as queries from "../queries.js";
import type * as rateLimit from "../rateLimit.js";
import type * as related from "../related.js";
import type * as taskPhrases from "../taskPhrases.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _commandConventions: typeof _commandConventions;
  _derivedEncoding: typeof _derivedEncoding;
  _derivedInputs: typeof _derivedInputs;
  _derivedModel: typeof _derivedModel;
  _destructive: typeof _destructive;
  _explainBounds: typeof _explainBounds;
  _flagSearch: typeof _flagSearch;
  _generatedLayer: typeof _generatedLayer;
  _indexPolicy: typeof _indexPolicy;
  _ingestErrors: typeof _ingestErrors;
  _legacyContent: typeof _legacyContent;
  _locales: typeof _locales;
  _manifestStorage: typeof _manifestStorage;
  _optionFlags: typeof _optionFlags;
  _providers: typeof _providers;
  _relatedLinks: typeof _relatedLinks;
  _releaseChildren: typeof _releaseChildren;
  _releaseIntegrity: typeof _releaseIntegrity;
  _releaseLookups: typeof _releaseLookups;
  _releaseManifest: typeof _releaseManifest;
  _searchTypos: typeof _searchTypos;
  _shellGrammar: typeof _shellGrammar;
  _shellParser: typeof _shellParser;
  _shellWrappers: typeof _shellWrappers;
  _storedPayload: typeof _storedPayload;
  _symbols: typeof _symbols;
  content: typeof content;
  crons: typeof crons;
  derived: typeof derived;
  derivedSignatures: typeof derivedSignatures;
  explain: typeof explain;
  generated: typeof generated;
  http: typeof http;
  ingest: typeof ingest;
  ingestContract: typeof ingestContract;
  lib: typeof lib;
  maintenance: typeof maintenance;
  manifest: typeof manifest;
  packages: typeof packages;
  portability: typeof portability;
  queries: typeof queries;
  rateLimit: typeof rateLimit;
  related: typeof related;
  taskPhrases: typeof taskPhrases;
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
