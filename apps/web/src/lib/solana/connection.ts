import { Connection } from '@solana/web3.js';
import { SOLANA_RPC_URL } from './network';

let cached_connection: Connection | null = null;

export function get_connection(): Connection {
    if (!cached_connection) {
        cached_connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    }
    return cached_connection;
}
