import { Mutex, MutexInterface } from "async-mutex";
import { AxiosError } from "axios";
import Joi from "joi";
import _, { Dictionary } from "lodash";
import moment from "moment-timezone";
import { bn, decimalCal } from "../contract/bn";

export function schema(
  _req: Joi.Schema,
  method: "post" | "get",
  _res?: Joi.Schema,
  info?: { summary: string; apiDoc: boolean }
) {
  const convert = require("joi-to-json");

  const getInfo = () => {
    if (info?.apiDoc) {
      return { ...info, tags: ["BRC20-Swap"] };
    } else {
      {
      }
    }
  };

  const getRequest = () => {
    if (method == "post") {
      return {
        body: convert(_req, "open-api"),
      };
    } else {
      return {
        query: convert(_req, "open-api"),
      };
    }
  };

  const getResponse = () => {
    if (_res && config.isLocalTest) {
      return {
        response: {
          200: {
            type: "object",
            properties: {
              code: { type: "number" },
              msg: { type: "string" },
              data: {
                ...convert(_res, "open-api"),
              },
            },
            required: ["msg", "code", "data"],
          },
        },
      };
    } else {
    }
  };

  return {
    schema: {
      explode: true,
      style: "deepObject",
      ...getInfo(),
      ...getRequest(),
      ...getResponse(),
    },
    validatorCompiler: () => {
      return (data) => _req.validate(data);
    },
  };
}

export function remove<T>(arr: T[], e: T) {
  return arr.filter((a) => {
    return a !== e;
  });
}

export function lastItem<T>(arr: T[]) {
  return arr[arr.length - 1];
}

export function removeUndefined<T extends Dictionary<any>>(o: T): T {
  return _.omitBy(o, _.isUndefined) as T;
}

export function sha256(msg: string) {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  hash.update(msg);
  const data = hash.digest("hex");
  return data;
}

export function getCurDate() {
  return moment().tz("Asia/Hong_Kong").format("YYYY-MM-DD");
}

export function getDate(timestamp: number) {
  return moment(timestamp).tz("Asia/Hong_Kong").format("YYYY-MM-DD HH:mm:ss");
}

export function getTodayMidnightSec() {
  const moment = require("moment-timezone");
  const todayMidnight = moment().tz("Asia/Hong_Kong").startOf("day");
  const todayMidnightSec = todayMidnight.unix();
  return todayMidnightSec;
}

export function printErr(tag: string, err) {
  if (err instanceof AxiosError) {
    logger.error({
      tag,
      message: err.message,
      url: err.config.url,
    });
  } else {
    logger.error({
      tag,
      message: err.message,
      stack: err.stack,
    });
  }
}

export function isNetWorkError(err) {
  return err instanceof AxiosError;
}

export async function queue<T>(mutex: Mutex, func: () => T) {
  let release: MutexInterface.Releaser;
  try {
    release = await mutex.acquire();
    return await func();
  } finally {
    release();
  }
}

export function normalizeNumberStr(str: string) {
  if (!bn(str).isNaN()) {
    return bn(str).toString();
  } else {
    return str;
  }
}

export function isProportional(amount0: string, amount1: string) {
  const result0 = decimalCal([amount0, "div", amount1]);
  const result1 = decimalCal([amount1, "div", amount0]);
  if (bn(result0).gt("0") && bn(result1).gt("0")) {
    if (bn(result0).isInteger() || bn(result1).isInteger()) {
      return true;
    }
  }
  return false;
}
