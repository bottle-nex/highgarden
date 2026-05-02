import { apiClient } from '@/lib/client.axios';
import { MARKETS_URL, API_URL } from '@/routes/routes.api';
import type { CommentDTO, PolymarketCommentDTO } from '@solmarket/types';

interface ListResponse<T> {
    data: { eventId: string | null; comments: T[] };
}

interface CreateResponse {
    data: CommentDTO;
}

interface ReportResponse {
    data: { reported: boolean; alreadyReported: boolean };
}

export async function fetch_native_comments(
    market_id: string,
    params: { limit: number; offset: number },
): Promise<{ event_id: string | null; comments: CommentDTO[] }> {
    const res = await apiClient.get<ListResponse<CommentDTO>>(
        `${MARKETS_URL}/${market_id}/comments`,
        { params },
    );
    return {
        event_id: res.data.data.eventId,
        comments: res.data.data.comments,
    };
}

export async function fetch_polymarket_comments(
    market_id: string,
    params: { limit: number; offset: number; holders_only: boolean },
): Promise<{ event_id: string | null; comments: PolymarketCommentDTO[] }> {
    const res = await apiClient.get<ListResponse<PolymarketCommentDTO>>(
        `${MARKETS_URL}/${market_id}/polymarket-comments`,
        { params },
    );
    return {
        event_id: res.data.data.eventId,
        comments: res.data.data.comments,
    };
}

export async function post_native_comment(
    market_id: string,
    body: string,
): Promise<CommentDTO> {
    const res = await apiClient.post<CreateResponse>(
        `${MARKETS_URL}/${market_id}/comments`,
        { body },
    );
    return res.data.data;
}

export async function report_comment(comment_id: string): Promise<{
    already_reported: boolean;
}> {
    const res = await apiClient.post<ReportResponse>(
        `${API_URL}/comments/${comment_id}/report`,
    );
    return { already_reported: res.data.data.alreadyReported };
}
