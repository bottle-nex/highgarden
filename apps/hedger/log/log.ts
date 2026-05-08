import pino from "pino";
import { ENV } from "../envs/env";

/**
 * The single root pino logger for the v2 hedger. Configured once at
 * module load with the level pulled from env. Direct use of this is
 * discouraged — call {@link logger_for} instead so every log line is
 * tagged with a category.
 */
const root = pino({ level: ENV.HEDGER_LOG_LEVEL });

/**
 * Returns a child logger tagged with the given category. Each top-level
 * service uses one category (`boot`, `cursor`, `listener`, `poller`,
 * `ingest`, `hedger`, `processor`, `queue`, `resolver`, `reconciler`,
 * `health`, `init`) so log streams are easy to filter downstream.
 *
 * The returned child is a `pino.Logger`; consumers call `.info`,
 * `.error`, etc. with the standard `(obj, msg)` form.
 */
export function logger_for(category: string): pino.Logger {
    return root.child({ category });
}
