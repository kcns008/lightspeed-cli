#!/usr/bin/env node
/**
 * CLI entry point for OpenShift Lightspeed CLI.
 * Based on pi-mono coding agent, rebranded for OLS.
 */
process.title = "ols";
process.env.OLS_CLI = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { main } from "./main.js";

setGlobalDispatcher(new EnvHttpProxyAgent());

main(process.argv.slice(2));
