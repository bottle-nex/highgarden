import cors from "cors";
import express from "express";
import v1_router from "./routers/v1/router.v1";
import Env, { ENV } from "./config/config.env";
import Services from "./services/service.singleton";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { notFoundHandler } from "./middleware/not-found";

Env.parse_env();
export const services = new Services();
services.boot();

const app = express();
app.use(
  cors({
    origin: ENV.SERVER_WEB_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use("/api/v1", v1_router);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(ENV.SERVER_PORT, () => {
  console.log(`server up on :${ENV.SERVER_PORT}`);
});
