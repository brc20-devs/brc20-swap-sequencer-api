import fs from "fs";
import path from "path";
import { ContractValidator } from "./validator/src/contract-validator";

global.buffer = { Buffer };
const root = path.join(__dirname, "./validator/data");
const decimal = require(root + "/decimal.json");
const events = require(root + "/events.json");

const validator = new ContractValidator();
validator.handleEvents(events, decimal);

const realResult = validator.genResult();
fs.writeFileSync(
  path.join(__dirname, "./validator/data/real-result.json"),
  JSON.stringify(realResult)
);

console.log("print real result success");
