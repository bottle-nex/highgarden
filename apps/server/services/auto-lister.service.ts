import { AutoLister } from "../queue/auto-lister";
import env from "../config/config.env";

export const autoLister = new AutoLister({
    intervalMs: env.AUTO_LISTER_INTERVAL_MS,
});
