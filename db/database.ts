import { env } from "cloudflare:workers";
import { configuredStore } from './store.mjs';
export function database(){return configuredStore(env)}
