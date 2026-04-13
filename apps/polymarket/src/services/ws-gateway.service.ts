import { MarketWsGateway } from "../gateways/market-ws.gateway";
import { simulator } from "./simulator.service";

export const wsGateway = new MarketWsGateway(simulator);
