import fs from "fs";
import path from "path";
import { ContractValidator } from "./validator/src/contract-validator";

global.buffer = { Buffer };
const root = path.join(__dirname, "./validator/data");
const decimalData = require(root + "/decimal.json");
const eventsData = require(root + "/events.json");
const resultData = require(root + "/result.json");

const validator = new ContractValidator();
validator.handleEvents(eventsData, decimalData);

// print each step
fs.writeFileSync(
  path.join(root, "./results.ignore.json"),
  JSON.stringify(validator.results, null, 2)
);

if (validator.verify(resultData)) {
  console.log("verify success");
} else {
  console.log("verify fail");
}
