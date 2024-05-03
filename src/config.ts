import { Config } from "./types/domain";

export enum LoggerLevel {
  debug = 0,
  info,
  warn,
  error,
}

export const config = require("../conf/config.json").config as Config;
