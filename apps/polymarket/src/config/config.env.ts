class Env {
    readonly POLYMARKET_MOCK_PORT: number = Number(process.env.POLYMARKET_MOCK_PORT ?? 4000);
    readonly SIMULATOR_INTERVAL_MS: number = Number(
        process.env.POLYMARKET_SIMULATOR_INTERVAL_MS ?? 2000,
    );
}

const env = new Env();

export default env;
