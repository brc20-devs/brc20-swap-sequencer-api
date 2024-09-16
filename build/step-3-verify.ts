import { ContractValidator } from "./validator/src/contract-validator";

global.buffer = { Buffer };
const decimal = require("./validator/data/decimal.json");
const events = require("./validator/data/events.json");
const expectResult = require("./validator/data/expect-result.json");

const validator = new ContractValidator();
validator.handleEvents(events, decimal);

console.log("verify: ", validator.verify(expectResult));
