const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export const API_URL = BACKEND_URL + '/api/v1';

export const SIGNIN_URL = API_URL + '/auth/sign-in';
export const SEND_OTP_URL = API_URL + '/auth/otp/request';
export const VERIFY_OTP_URL = API_URL + '/auth/otp/verify';

export const MARKETS_URL = API_URL + '/markets';

export const ADMIN_LISTINGS_URL = API_URL + '/admin/listings';
export const ADMIN_PENDING_URL = API_URL + '/admin/pending';
export const ADMIN_RUN_LISTER_URL = API_URL + '/admin/lister/run';
export const adminApproveUrl = (marketId: string) => `${API_URL}/admin/approve/${marketId}`;
export const adminRejectUrl = (marketId: string) => `${API_URL}/admin/reject/${marketId}`;
