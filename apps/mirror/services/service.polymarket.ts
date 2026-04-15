import PolymarketPublisher from "./service.polymarket.publisher";
import PolymarketControlListener from "./service.polymarket.control";
import MarketSocket from "../socket/socket.market";
import UserSocket, { type UserMarketsProvider } from "../socket/socket.user";
import { has_polymarket_creds } from "./service.polymarket.auth";
import { services } from "..";

export default class PolymarketService {
    private publisher: PolymarketPublisher;
    private market!: MarketSocket;
    private user?: UserSocket;
    private control!: PolymarketControlListener;
    public redis = services.redis;

    constructor(
        private readonly load_user_markets: UserMarketsProvider,
    ) {
        this.publisher = new PolymarketPublisher(this.redis);
    }

    public async start(): Promise<void> {
        this.market = new MarketSocket(this.publisher);
        this.control = new PolymarketControlListener(this.market);

        // market socket connects lazily on the first subscribe — don't open it
        // here or Polymarket will drop the idle connection.
        await this.control.start();

        if (has_polymarket_creds()) {
            this.user = new UserSocket(this.publisher, this.load_user_markets);
            await this.user.connect();
        } else {
            console.warn("[poly] skipping user socket — no credentials");
        }
    }

    public async stop(): Promise<void> {
        await this.control?.stop();
        await this.market?.stop();
        await this.user?.stop();
    }
}
