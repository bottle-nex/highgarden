import { Router } from "express";
import SignInController from "../../controllers/auth/controller.sign-in";
import OtpVerifyController from "../../controllers/auth/controller.otp-verify";
import OtpRequestController from "../../controllers/auth/controller.otp-request";
import { rate_limiters as rl } from "../../middleware/middleware.rate-limit";

const auth_router: Router = Router();

// auth_strict (5/min IP+email) catches password spraying; auth_burst
// (20/hr IP) catches slow brute force across multiple accounts.
auth_router.post("/sign-in", rl.auth_strict, rl.auth_burst, SignInController.process);
auth_router.post("/otp/verify", rl.auth_strict, rl.auth_burst, OtpVerifyController.process);
auth_router.post("/otp/request", rl.auth_strict, rl.auth_burst, OtpRequestController.process);

export default auth_router;
