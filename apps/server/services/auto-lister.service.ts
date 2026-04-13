import { AutoLister } from "../queue/auto-lister";

export const autoLister = new AutoLister({
    intervalMs: Number(process.env.AUTO_LISTER_INTERVAL_MS ?? 60_000),
});
