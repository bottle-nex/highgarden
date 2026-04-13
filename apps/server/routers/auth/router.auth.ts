import { Router } from "express";
import SignInController from "../../controllers/auth/controller.sign-in";
import OtpVerifyController from "../../controllers/auth/controller.otp-verify";
import OtpRequestController from "../../controllers/auth/controller.otp-request";

const auth_router: Router = Router();

auth_router.post("/sign-in", SignInController.process);
auth_router.post("/otp/verify", OtpVerifyController.process);
auth_router.post("/otp/request", OtpRequestController.process);

export default auth_router;
