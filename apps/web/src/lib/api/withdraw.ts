import { apiClient } from '../client.axios';

export interface WithdrawalIntent {
    id: string;
    destination: string;
    uiAmount: number;
    status: string;
    txSignature: string | null;
    expiresAt: string;
    resendAt: string;
    failure: string | null;
}

export type WithdrawErrorReason =
    | 'USER_NO_WALLET'
    | 'INVALID_DESTINATION'
    | 'INSUFFICIENT_BALANCE'
    | 'AMOUNT_TOO_SMALL'
    | 'AMOUNT_INVALID'
    | 'SELF_TRANSFER'
    | 'NO_USDC_ACCOUNT'
    | 'NOT_AUTHORIZED'
    | 'RPC_FAILED'
    | 'WITHDRAW_FAILED'
    | 'NETWORK'
    | 'UNKNOWN';

export class WithdrawError extends Error {
    public readonly reason: WithdrawErrorReason;
    public readonly user_message: string;

    constructor(reason: WithdrawErrorReason, technical_message: string, user_message: string) {
        super(technical_message);
        this.reason = reason;
        this.user_message = user_message;
        this.name = 'WithdrawError';
    }
}

class WithdrawApi {
    public async request(destination: string, uiAmount: number): Promise<WithdrawalIntent> {
        return this.call('/users/me/withdraw/request', { destination, uiAmount });
    }

    public async confirm(intentId: string, code: string): Promise<WithdrawalIntent> {
        return this.call('/users/me/withdraw', { intentId, code });
    }

    public async status(intentId: string): Promise<WithdrawalIntent> {
        try {
            const { data } = await apiClient.get(
                `/users/me/withdraw/${encodeURIComponent(intentId)}`,
            );
            return data.data;
        } catch (err) {
            throw this.translate_error(err);
        }
    }

    private async call(path: string, body: object): Promise<WithdrawalIntent> {
        try {
            const { data } = await apiClient.post(path, body);
            if (!data?.success) throw new Error(data?.message ?? 'Withdrawal request failed');
            return data.data;
        } catch (err) {
            throw this.translate_error(err);
        }
    }

    private translate_error(err: unknown): WithdrawError {
        const code = this.extract_code(err);
        const raw = this.extract_message(err);
        return this.classify(code, raw);
    }

    private classify(code: string, raw: string): WithdrawError {
        switch (code) {
            case 'USER_NO_WALLET':
                return new WithdrawError(
                    'USER_NO_WALLET',
                    raw,
                    'Your custodial wallet is not set up yet. Refresh and try again.',
                );
            case 'INVALID_DESTINATION':
                return new WithdrawError(
                    'INVALID_DESTINATION',
                    raw,
                    'That is not a valid Solana address.',
                );
            case 'INSUFFICIENT_BALANCE':
                return new WithdrawError(
                    'INSUFFICIENT_BALANCE',
                    raw,
                    'Amount exceeds your available USDC balance.',
                );
            case 'AMOUNT_TOO_SMALL':
                return new WithdrawError('AMOUNT_TOO_SMALL', raw, 'Minimum withdrawal is 1 USDC.');
            case 'AMOUNT_INVALID':
                return new WithdrawError('AMOUNT_INVALID', raw, 'Enter a positive amount.');
            case 'SELF_TRANSFER':
                return new WithdrawError(
                    'SELF_TRANSFER',
                    raw,
                    'You cannot withdraw to your own deposit address.',
                );
            case 'NO_USDC_ACCOUNT':
                return new WithdrawError(
                    'NO_USDC_ACCOUNT',
                    raw,
                    'You have no USDC balance to withdraw.',
                );
            case 'NOT_AUTHORIZED':
                return new WithdrawError('NOT_AUTHORIZED', raw, 'Please sign in to withdraw.');
            case 'RPC_FAILED':
                return new WithdrawError(
                    'RPC_FAILED',
                    raw,
                    'Withdrawal couldn’t be confirmed on chain. Please try again.',
                );
            case 'WITHDRAW_FAILED':
                return new WithdrawError(
                    'WITHDRAW_FAILED',
                    raw,
                    'Withdrawal failed. Please try again.',
                );
            case 'NETWORK':
                return new WithdrawError(
                    'NETWORK',
                    raw,
                    'Network issue. Check your connection and try again.',
                );
            default:
                return new WithdrawError('UNKNOWN', raw, 'Something went wrong. Please try again.');
        }
    }

    private extract_code(err: unknown): string {
        if (this.is_axios_error(err)) {
            return err.response?.data?.error?.code ?? 'UNKNOWN';
        }
        return 'NETWORK';
    }

    private extract_message(err: unknown): string {
        if (this.is_axios_error(err)) {
            return err.response?.data?.message ?? err.message ?? 'Unknown error';
        }
        if (err instanceof Error) return err.message;
        return 'Unknown error';
    }

    private is_axios_error(err: unknown): err is {
        response?: { data?: { message?: string; error?: { code?: string } } };
        message?: string;
    } {
        return typeof err === 'object' && err !== null && 'response' in err;
    }
}

const withdraw_api = new WithdrawApi();
export default withdraw_api;
