import { AxiosError } from "axios";
import { FastifyInstance } from "fastify";
import { exceeding_slippage } from "../contract/contract";
import {
  CodeEnum,
  internal_server_error,
  server_error,
  unauthorized_operation,
} from "../domain/error";
import { fixTickCaseSensitive } from "../domain/utils";

export function wrap(fastify: FastifyInstance) {
  fastify.addHook("preHandler", (req, res, done) => {
    const params = req.method == "POST" ? req.body : req.query;
    fixTickCaseSensitive(params);
    done();
  });
  fastify.addHook("preSerialization", (req, res, payload: any, done) => {
    const record = {
      route: req.routeOptions.url,
      params: req.method == "POST" ? req.body : req.query,
      ip: req.ip,
      payload: null,
    };
    (req as any).record = record;

    let data = null;

    if (!!payload?.code && !!payload?.msg) {
      data = payload;
    } else if (payload.openapi) {
      data = payload;
    } else if (res.statusCode == 200) {
      data = { code: 0, msg: "ok", data: payload };

      record.payload = payload;
      logger.route(record);
    } else {
      data = {
        code: res.statusCode,
        msg: payload.message,
        data: null,
      };
    }

    done(null, data);
  });
  fastify.setErrorHandler(function (err: any, req, res) {
    let code = err.code || -1;
    if (err.message == exceeding_slippage) {
      code = CodeEnum.exceeding_slippage;
    }

    let msg = (err.message || "") as string;
    if (msg.includes(server_error)) {
      msg = unauthorized_operation;
    }
    if (msg.includes("Cannot read properties of undefined")) {
      msg = internal_server_error;
    }
    const data = {
      code,
      msg,
      data: null,
    };

    // skip schema
    void res.serializer((payload) => {
      void res.header("Content-Type", "application/json");
      return JSON.stringify(payload);
    });

    void res.send(data);

    const record = (req as any).record;

    record.message = msg;
    if (err instanceof AxiosError) {
      record.url = err.config.url;
    } else {
      record.stack = err.stack;
    }
    const filter = "quote";
    if (req.url.includes(filter)) {
      logger.info(record);
    } else {
      logger.error(record);
    }
  });
}
