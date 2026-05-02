import { apiClient } from '@/lib/client.axios';

export interface WalletSnapshot {
    publicKey: string;
    usdcBalance: { uiAmount: number; uiAmountString: string; decimals: number };
    usdcMint: string;
    network: string;
}

export async function fetch_user_wallet(): Promise<WalletSnapshot> {
    const { data } = await apiClient.get('/users/me/wallet');
    if (!data?.success) {
        throw new Error(data?.message ?? 'wallet fetch failed');
    }
    return data.data as WalletSnapshot;
}
