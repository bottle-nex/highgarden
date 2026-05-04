import pino from "pino";
import { ENV } from "../config/env";

export type Logger = pino.Logger;

export default class LoggerFactory {
  private static root: Logger | null = null;

  public static get_root(): Logger {
    if (!this.root) {
      this.root = pino({
        level: ENV.HEDGER_LOG_LEVEL,
        base: { app: "hedger" },
        transport:
          process.env.NODE_ENV !== "production"
            ? {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  translateTime: "SYS:HH:MM:ss.l",
                  ignore: "pid,hostname,app",
                },
              }
            : undefined,
      });
    }
    return this.root;
  }

  public static for_category(category: string): Logger {
    return this.get_root().child({ category });
  }
}
