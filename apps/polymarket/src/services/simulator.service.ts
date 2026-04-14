import { BookSimulator } from "../book";
import env from "../config/config.env";

export const simulator = new BookSimulator(env.SIMULATOR_INTERVAL_MS);
