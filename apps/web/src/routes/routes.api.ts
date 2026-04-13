const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export const API_URL = BACKEND_URL + "/api/v1";

export const SIGNIN_URL = API_URL + "/auth/sign-in";
export const SEND_OTP_URL = API_URL + "/auth/otp/request";
export const VERIFY_OTP_URL = API_URL + "/auth/otp/verify";
