import type { FillDTO, PositionDTO } from '@solmarket/types';
import { apiClient } from '../client.axios';

class PortfolioApi {
    public async fetch_positions(): Promise<PositionDTO[]> {
        const { data } = await apiClient.get('/users/me/positions');
        return (data?.data as PositionDTO[]) ?? [];
    }

    public async fetch_fills(): Promise<FillDTO[]> {
        const { data } = await apiClient.get('/users/me/fills');
        return (data?.data as FillDTO[]) ?? [];
    }
}

const portfolio_api = new PortfolioApi();
export default portfolio_api;
