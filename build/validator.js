(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('lodash'), require('bignumber.js')) :
  typeof define === 'function' && define.amd ? define(['exports', 'lodash', 'bignumber.js'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Validator = {}, global._, global.BigNumber));
})(this, (function (exports, _, BigNumber) { 'use strict';

  const LP_DECIMAL = "18";
  const DEFAULT_DECIMAL = "18";

  function sortTickParams(_params) {
      const params = _params;
      if (!params.tick0 || !params.tick1) {
          return params;
      }
      if (params.tick0 < params.tick1) {
          return params;
      }
      else {
          const ret = Object.assign(Object.assign({}, params), { tick0: params.tick1, tick1: params.tick0, amount0: params.amount1, amount1: params.amount0 });
          return ret;
      }
  }
  function getPairStr(tick0, tick1) {
      const params = sortTickParams({ tick0, tick1 });
      return `${params.tick0}/${params.tick1}`;
  }
  function need(condition, message) {
      if (!condition) {
          throw new Error(message || "server error");
      }
  }
  const invalid_amount = "invalid amount";
  const invalid_slippage = "invalid slippage";
  function checkGtZero(amount) {
      need(bn(amount).gt("0") && bnIsInteger(amount), invalid_amount);
  }
  function checkGteZero(amount) {
      need(bn(amount).gte("0") && bnIsInteger(amount), invalid_amount);
  }
  function checkSlippage(slippage) {
      need(bn(slippage).gte("0"), invalid_slippage);
      need(bn(slippage).lte("1000"), invalid_slippage);
      need(bnIsInteger(slippage), invalid_slippage);
      need(slippage == bn(slippage).toString(), invalid_amount);
  }

  const bn = BigNumber;
  bn.config({
      EXPONENTIAL_AT: 1e9,
      DECIMAL_PLACES: 0,
      ROUNDING_MODE: bn.ROUND_DOWN,
  });
  function bnUint(value, decimal) {
      return uintCal([value, "mul", uintCal(["10", "pow", decimal])]);
  }
  function bnIsInteger(value) {
      return bn(value).isInteger() && value.toString().indexOf(".") == -1;
  }
  function bnDecimal(value, decimal) {
      const _bn = bn.clone({
          EXPONENTIAL_AT: 1e9,
          DECIMAL_PLACES: 18,
          ROUNDING_MODE: bn.ROUND_DOWN,
      });
      return _bn(value)
          .div(_bn("10").pow(decimal))
          .decimalPlaces(parseInt(decimal))
          .toString();
  }
  function _bnCal(items, decimalPlaces) {
      const _bn = bn.clone();
      _bn.config({
          EXPONENTIAL_AT: 1e9,
          DECIMAL_PLACES: parseInt(decimalPlaces),
          ROUNDING_MODE: bn.ROUND_DOWN,
      });
      let ret = _bn(items[0]);
      need(!_bn(items[0]).isNaN());
      need(_bn(items[1]).isNaN());
      for (let i = 1; i < items.length; i++) {
          const cur = items[i];
          const next = items[i + 1];
          if (cur == "add") {
              need(_bn(next).gte("0"), invalid_amount);
              ret = ret.plus(next);
              i++;
          }
          else if (cur == "sub") {
              need(_bn(ret).gte(next), invalid_amount);
              ret = ret.minus(next);
              i++;
          }
          else if (cur == "mul") {
              need(_bn(next).gte("0"), invalid_amount);
              ret = ret.times(next);
              i++;
          }
          else if (cur == "div") {
              need(_bn(next).gt("0"), invalid_amount);
              ret = ret.div(next);
              i++;
          }
          else if (cur == "pow") {
              need(_bn(next).gte("0"), invalid_amount);
              ret = ret.pow(next);
              i++;
          }
          else if (cur == "sqrt") {
              ret = ret.sqrt();
          }
          else if (!_bn(cur).isNaN()) {
              need(_bn(next).isNaN());
          }
      }
      if (decimalPlaces) {
          return ret.decimalPlaces(parseInt(decimalPlaces)).toString();
      }
      else {
          return ret.toString();
      }
  }
  function uintCal(items) {
      return _bnCal(items, "0");
  }
  function decimalCal(items, decimalPlaces) {
      return _bnCal(items, decimalPlaces || DEFAULT_DECIMAL);
  }

  class Brc20 {
      constructor(balance, tick) {
          this.balance = {};
          this.balance = balance;
          this.tick = tick;
          this._supply = "0";
          for (const address in this.balance) {
              this._supply = uintCal([this._supply, "add", this.balance[address]]);
          }
      }
      get supply() {
          return this._supply;
      }
      balanceOf(address) {
          return this.balance[address] || "0";
      }
      transfer(from, to, amount) {
          this.checkAmount(amount);
          this.checkAddress(from, amount);
          this.balance[from] = uintCal([this.balance[from], "sub", amount]);
          this.balance[to] = uintCal([this.balance[to] || "0", "add", amount]);
          this.checkAddress(from);
          this.checkAddress(to);
      }
      mint(address, amount) {
          this.checkAmount(amount);
          this.balance[address] = uintCal([
              this.balance[address] || "0",
              "add",
              amount,
          ]);
          this._supply = uintCal([this._supply, "add", amount]);
          this.checkAddress(address);
      }
      burn(address, amount) {
          this.checkAmount(amount);
          this.checkAddress(address, amount);
          this.balance[address] = uintCal([
              this.balance[address] || "0",
              "sub",
              amount,
          ]);
          this._supply = uintCal([this._supply, "sub", amount]);
          this.checkAddress(address);
      }
      checkAmount(amount) {
          need(bn(amount).gt("0"), "invalid amount: " + this.tick);
      }
      checkAddress(address, value = "0") {
          need(bn(this.balance[address]).gte(value), "insufficient amount: " + this.tick);
      }
  }

  class Assets {
      constructor(map) {
          this.map = {};
          for (const assetType in map) {
              for (const tick in map[assetType]) {
                  const brc20 = new Brc20(map[assetType][tick].balance, map[assetType][tick].tick);
                  map[assetType][tick] = brc20;
              }
          }
          this.map = map;
      }
      getAvaiableAssets(address) {
          let set = new Set();
          for (const assetType in this.map) {
              for (const tick in this.map[assetType]) {
                  if (bn(this.getBalance(address, tick, assetType)).gt("0")) {
                      set.add(tick);
                  }
              }
          }
          return Array.from(set);
      }
      tryCreate(tick) {
          for (let assetType in this.map) {
              if (!this.map[assetType][tick]) {
                  this.map[assetType][tick] = new Brc20({}, tick);
              }
          }
      }
      isExist(tick) {
          return !!this.map["swap"][tick];
      }
      get(tick, assetType = "swap") {
          return this.map[assetType][tick];
      }
      getBalance(address, tick, assetType = "swap") {
          try {
              need(!!this.map[assetType][tick]);
              return this.map[assetType][tick].balanceOf(address);
          }
          catch (err) {
              return "0";
          }
      }
      getAggregateBalance(address, tick, assetTypes) {
          let ret = "0";
          assetTypes.forEach((assetType) => {
              ret = uintCal([ret, "add", this.getBalance(address, tick, assetType)]);
          });
          return ret;
      }
      mint(address, tick, amount, assetType = "swap") {
          this.tryCreate(tick);
          this.map[assetType][tick].mint(address, amount);
      }
      burn(address, tick, amount, assetType = "swap") {
          this.map[assetType][tick].burn(address, amount);
      }
      convert(address, tick, amount, fromAssetType, toAssetType) {
          this.map[fromAssetType][tick].burn(address, amount);
          this.map[toAssetType][tick].mint(address, amount);
      }
      transfer(tick, from, to, amount, fromAssetType, toAssetType) {
          this.map[fromAssetType][tick].burn(from, amount);
          this.map[toAssetType][tick].mint(to, amount);
      }
      swap(address, tickIn, tickOut, amountIn, amountOut, assetType = "swap") {
          const pair = getPairStr(tickIn, tickOut);
          this.map[assetType][tickIn].transfer(address, pair, amountIn);
          this.map[assetType][tickOut].transfer(pair, address, amountOut);
      }
      dataRefer() {
          return this.map;
      }
  }

  var EventType;
  (function (EventType) {
      EventType["inscribeModule"] = "inscribe-module";
      EventType["transfer"] = "transfer";
      EventType["inscribeApprove"] = "inscribe-approve";
      EventType["inscribeConditionalApprove"] = "inscribe-conditional-approve";
      EventType["approve"] = "approve";
      EventType["conditionalApprove"] = "conditional-approve";
      EventType["commit"] = "commit";
  })(EventType || (EventType = {}));

  var ExactType;
  (function (ExactType) {
      ExactType["exactIn"] = "exactIn";
      ExactType["exactOut"] = "exactOut";
  })(ExactType || (ExactType = {}));
  var FuncType;
  (function (FuncType) {
      FuncType["deployPool"] = "deployPool";
      FuncType["addLiq"] = "addLiq";
      FuncType["swap"] = "swap";
      FuncType["removeLiq"] = "removeLiq";
      FuncType["decreaseApproval"] = "decreaseApproval";
  })(FuncType || (FuncType = {}));

  var OpType;
  (function (OpType) {
      OpType["deploy"] = "deploy";
      OpType["transfer"] = "transfer";
      OpType["commit"] = "commit";
      OpType["approve"] = "approve";
      OpType["conditionalApprove"] = "conditional-approve";
  })(OpType || (OpType = {}));

  const exceeding_slippage = "exceeding slippage";
  const duplicate_tick = "duplicate tick";
  const insufficient_liquidity = "insufficient liquidity for this trade";
  const pool_existed = "pool existed";
  const pool_not_found = "pool not found";
  const feeRate = "6";
  class Contract {
      constructor(assets, status, config) {
          this.assets = assets;
          this.status = status;
          this.config = config;
      }
      deployPool(params) {
          need(params.tick0 !== params.tick1, duplicate_tick);
          const pair = getPairStr(params.tick0, params.tick1);
          need(!this.assets.isExist(pair), pool_existed);
          this.assets.tryCreate(pair);
          return {};
      }
      addLiq(params) {
          const { tick0, tick1, amount0, amount1, expect, slippage1000 } = sortTickParams(params);
          checkGtZero(amount0);
          checkGtZero(amount1);
          checkGteZero(expect);
          checkSlippage(slippage1000);
          const pair = getPairStr(tick0, tick1);
          const { address } = params;
          need(!!this.assets.isExist(pair), pool_not_found);
          this.mintFee({
              tick0,
              tick1,
          });
          if (this.assets.get(pair).supply == "0") {
              const lp = uintCal([amount0, "mul", amount1, "sqrt"]);
              const firstLP = uintCal([lp, "sub", "1000"]);
              this.assets.get(pair).mint(address, firstLP);
              this.assets.get(pair).mint("0", "1000");
              this.assets.get(tick0).transfer(address, pair, amount0);
              this.assets.get(tick1).transfer(address, pair, amount1);
              checkGtZero(firstLP);
              need(bn(firstLP).gte(uintCal([
                  expect,
                  "mul",
                  uintCal(["1000", "sub", slippage1000]),
                  "div",
                  "1000",
              ])), exceeding_slippage);
              {
                  this.status.kLast[pair] = uintCal([
                      this.assets.get(tick0).balanceOf(pair),
                      "mul",
                      this.assets.get(tick1).balanceOf(pair),
                  ]);
              }
              return { lp: firstLP, amount0, amount1 };
          }
          else {
              let amount0Adjust;
              let amount1Adjust;
              const poolLp = this.assets.get(pair).supply;
              const poolAmount0 = this.assets.get(tick0).balanceOf(pair);
              const poolAmount1 = this.assets.get(tick1).balanceOf(pair);
              amount1Adjust = uintCal([
                  amount0,
                  "mul",
                  poolAmount1,
                  "div",
                  poolAmount0,
              ]);
              if (bn(amount1Adjust).lte(amount1)) {
                  amount0Adjust = amount0;
              }
              else {
                  amount0Adjust = uintCal([
                      amount1,
                      "mul",
                      poolAmount0,
                      "div",
                      poolAmount1,
                  ]);
                  amount1Adjust = amount1;
              }
              const lp0 = uintCal([amount0Adjust, "mul", poolLp, "div", poolAmount0]);
              const lp1 = uintCal([amount1Adjust, "mul", poolLp, "div", poolAmount1]);
              const lp = bn(lp0).lt(lp1) ? lp0 : lp1;
              this.assets.get(pair).mint(address, lp);
              this.assets.get(tick0).transfer(address, pair, amount0Adjust);
              this.assets.get(tick1).transfer(address, pair, amount1Adjust);
              checkGtZero(lp);
              need(bn(lp).gte(uintCal([
                  expect,
                  "mul",
                  uintCal(["1000", "sub", slippage1000]),
                  "div",
                  "1000",
              ])), exceeding_slippage);
              need(amount1Adjust == amount1 || amount0Adjust == amount0);
              {
                  this.status.kLast[pair] = uintCal([
                      this.assets.get(tick0).balanceOf(pair),
                      "mul",
                      this.assets.get(tick1).balanceOf(pair),
                  ]);
              }
              return { lp, amount0: amount0Adjust, amount1: amount1Adjust };
          }
      }
      removeLiq(params) {
          const { address, lp, tick0, tick1, amount0, amount1, slippage1000 } = sortTickParams(params);
          checkGtZero(lp);
          checkGteZero(amount0);
          checkGteZero(amount1);
          checkSlippage(slippage1000);
          this.mintFee({
              tick0,
              tick1,
          });
          const pair = getPairStr(tick0, tick1);
          need(!!this.assets.isExist(pair), pool_not_found);
          const poolLp = this.assets.get(pair).supply;
          const reserve0 = this.assets.get(tick0).balanceOf(pair);
          const reserve1 = this.assets.get(tick1).balanceOf(pair);
          const acquire0 = uintCal([lp, "mul", reserve0, "div", poolLp]);
          const acquire1 = uintCal([lp, "mul", reserve1, "div", poolLp]);
          this.assets.get(pair).burn(address, lp);
          this.assets.get(tick0).transfer(pair, address, acquire0);
          this.assets.get(tick1).transfer(pair, address, acquire1);
          need(bn(acquire0).gte(uintCal([
              amount0,
              "mul",
              uintCal(["1000", "sub", slippage1000]),
              "div",
              "1000",
          ])), exceeding_slippage);
          need(bn(acquire1).gte(uintCal([
              amount1,
              "mul",
              uintCal(["1000", "sub", slippage1000]),
              "div",
              "1000",
          ])), exceeding_slippage);
          {
              this.status.kLast[pair] = uintCal([
                  this.assets.get(tick0).balanceOf(pair),
                  "mul",
                  this.assets.get(tick1).balanceOf(pair),
              ]);
          }
          return { tick0, tick1, amount0: acquire0, amount1: acquire1 };
      }
      swap(params) {
          const { tickIn, tickOut, address, exactType, expect, slippage1000, amount, } = params;
          checkGtZero(amount);
          checkGteZero(expect);
          checkSlippage(slippage1000);
          const pair = getPairStr(tickIn, tickOut);
          const reserveIn = this.assets.get(tickIn).balanceOf(pair);
          const reserveOut = this.assets.get(tickOut).balanceOf(pair);
          let amountIn;
          let amountOut;
          let ret;
          if (exactType == ExactType.exactIn) {
              amountIn = amount;
              amountOut = this.getAmountOut({
                  amountIn,
                  reserveIn,
                  reserveOut,
              });
              const amountOutMin = uintCal([
                  expect,
                  "mul",
                  "1000",
                  "div",
                  uintCal(["1000", "add", slippage1000]),
              ]);
              need(bn(amountOut).gte(amountOutMin), exceeding_slippage);
              ret = amountOut;
          }
          else {
              amountOut = amount;
              amountIn = this.getAmountIn({
                  amountOut,
                  reserveIn,
                  reserveOut,
              });
              const amountInMax = uintCal([
                  expect,
                  "mul",
                  uintCal(["1000", "add", slippage1000]),
                  "div",
                  "1000",
              ]);
              need(bn(amountIn).lte(amountInMax), exceeding_slippage);
              ret = amountIn;
          }
          this.assets.swap(address, tickIn, tickOut, amountIn, amountOut);
          return { amount: ret };
      }
      getAmountOut(params) {
          const { amountIn, reserveIn, reserveOut } = params;
          checkGtZero(amountIn);
          need(bn(reserveIn).gt("0") && bn(reserveOut).gt("0"), insufficient_liquidity);
          const amountInWithFee = uintCal([
              amountIn,
              "mul",
              uintCal(["1000", "sub", this.config.swapFeeRate1000]),
          ]);
          const numerator = uintCal([amountInWithFee, "mul", reserveOut]);
          const denominator = uintCal([
              reserveIn,
              "mul",
              "1000",
              "add",
              amountInWithFee,
          ]);
          return uintCal([numerator, "div", denominator]);
      }
      getAmountIn(params) {
          const { amountOut, reserveIn, reserveOut } = params;
          checkGtZero(amountOut);
          need(bn(reserveIn).gt("0") && bn(reserveOut).gt("0"), insufficient_liquidity);
          const numerator = uintCal([reserveIn, "mul", amountOut, "mul", "1000"]);
          const denominator = uintCal([
              reserveOut,
              "sub",
              amountOut,
              "mul",
              uintCal(["1000", "sub", this.config.swapFeeRate1000]),
          ]);
          return uintCal([numerator, "div", denominator, "add", "1"]);
      }
      send(params) {
          const { from, to, tick, amount } = params;
          checkGtZero(amount);
          this.assets.get(tick).transfer(from, to, amount);
          return {};
      }
      getFeeLp(params) {
          const { tick0, tick1 } = params;
          const pair = getPairStr(tick0, tick1);
          const reserve0 = this.assets.get(tick0).balanceOf(pair);
          const reserve1 = this.assets.get(tick1).balanceOf(pair);
          {
              if (bn(this.status.kLast[pair]).gt("0")) {
                  const rootK = uintCal([reserve0, "mul", reserve1, "sqrt"]);
                  const rootKLast = uintCal([this.status.kLast[pair], "sqrt"]);
                  if (bn(rootK).gt(rootKLast)) {
                      const numerator = uintCal([
                          this.assets.get(pair).supply,
                          "mul",
                          uintCal([rootK, "sub", rootKLast]),
                      ]);
                      const scale = uintCal([feeRate, "sub", "1"]);
                      const denominator = uintCal([rootK, "mul", scale, "add", rootKLast]);
                      const liquidity = uintCal([numerator, "div", denominator]);
                      return liquidity;
                  }
              }
          }
          return "0";
      }
      mintFee(params) {
          const { tick0, tick1 } = params;
          const pair = getPairStr(tick0, tick1);
          {
              const liquidity = this.getFeeLp(params);
              if (bn(liquidity).gt("0")) {
                  this.assets.get(pair).mint(this.config.feeTo, liquidity);
              }
          }
      }
  }

  class Decimal {
      constructor(map) {
          this.map = map;
      }
      getRealTick(tick) {
          for (let k in this.map) {
              if (k.toLowerCase() == tick.toLowerCase()) {
                  return k;
              }
          }
          return tick;
      }
      get(tick) {
          let ret = this.map[tick];
          if (!ret) {
              for (let k in this.map) {
                  if (k.toLowerCase() == tick.toLowerCase()) {
                      ret = this.map[k];
                      break;
                  }
              }
          }
          return ret;
      }
      set(tick, decimal) {
          this.map[tick] = decimal;
      }
  }

  class ContractValidator {
      get Contract() {
          return this.contract;
      }
      to1000(amount) {
          return (parseInt(amount) * 1000).toString();
      }
      getFuncInternalLength(func) {
          return buffer.Buffer.from(JSON.stringify(func)).length;
      }
      getPairStruct(pair) {
          const tick0 = buffer.Buffer.from(pair).subarray(0, 4).toString();
          const tick1 = buffer.Buffer.from(pair).subarray(5).toString();
          need(sortTickParams({ tick0, tick1 }).tick0 == tick0);
          return { tick0, tick1 };
      }
      convertFuncInscription2Internal(index, op) {
          const target = op.data[index];
          const address = target.addr;
          let lastFunc;
          for (let i = 0; i <= index; i++) {
              lastFunc = op.data[i];
              if (lastFunc.addr == address) {
                  ({
                      module: op.module,
                      parent: op.parent,
                      quit: op.quit,
                      gas_price: op.gas_price,
                      addr: lastFunc.addr,
                      func: lastFunc.func,
                      params: lastFunc.params,
                      ts: lastFunc.ts,
                  });
              }
          }
          const id = "x".repeat(64);
          const prevs = [];
          if (lastFunc.func == FuncType.deployPool) {
              const params = lastFunc.params;
              return {
                  id,
                  func: lastFunc.func,
                  params: {
                      address: lastFunc.addr,
                      tick0: params[0],
                      tick1: params[1],
                  },
                  prevs,
                  ts: lastFunc.ts,
                  sig: lastFunc.sig,
              };
          }
          else if (lastFunc.func == FuncType.addLiq) {
              const params = lastFunc.params;
              const pair = this.getPairStruct(params[0]);
              const decimal0 = this.decimal.get(pair.tick0);
              const decimal1 = this.decimal.get(pair.tick1);
              return {
                  id,
                  func: lastFunc.func,
                  params: {
                      address: lastFunc.addr,
                      tick0: pair.tick0,
                      tick1: pair.tick1,
                      amount0: bnUint(params[1], decimal0),
                      amount1: bnUint(params[2], decimal1),
                      expect: bnUint(params[3], LP_DECIMAL),
                      slippage1000: bnUint(params[4], "3"),
                  },
                  prevs,
                  ts: lastFunc.ts,
                  sig: lastFunc.sig,
              };
          }
          else if (lastFunc.func == FuncType.swap) {
              const params = lastFunc.params;
              const pair = this.getPairStruct(params[0]);
              const decimal0 = this.decimal.get(pair.tick0);
              const decimal1 = this.decimal.get(pair.tick1);
              const expectDecimal = params[1] == pair.tick0 ? decimal1 : decimal0;
              const exactType = params[3];
              const tick = params[1];
              const tickOther = params[1] == pair.tick0 ? pair.tick1 : pair.tick0;
              return {
                  id,
                  func: lastFunc.func,
                  params: {
                      address: lastFunc.addr,
                      tickIn: exactType == ExactType.exactIn ? tick : tickOther,
                      tickOut: exactType == ExactType.exactOut ? tick : tickOther,
                      amount: bnUint(params[2], this.decimal.get(params[1])),
                      exactType,
                      expect: bnUint(params[4], expectDecimal),
                      slippage1000: bnUint(params[5], "3"),
                  },
                  prevs,
                  ts: lastFunc.ts,
                  sig: lastFunc.sig,
              };
          }
          else if (lastFunc.func == FuncType.removeLiq) {
              const params = lastFunc.params;
              const pair = this.getPairStruct(params[0]);
              const decimal0 = this.decimal.get(pair.tick0);
              const decimal1 = this.decimal.get(pair.tick1);
              return {
                  id,
                  func: lastFunc.func,
                  params: {
                      address: lastFunc.addr,
                      tick0: pair.tick0,
                      tick1: pair.tick1,
                      lp: bnUint(params[1], LP_DECIMAL),
                      amount0: bnUint(params[2], decimal0),
                      amount1: bnUint(params[3], decimal1),
                      slippage1000: bnUint(params[4], "3"),
                  },
                  prevs,
                  ts: lastFunc.ts,
                  sig: lastFunc.sig,
              };
          }
          else if (lastFunc.func == FuncType.decreaseApproval) {
              const params = lastFunc.params;
              const tick = params[0];
              const amount = params[1];
              return {
                  id,
                  func: lastFunc.func,
                  params: {
                      address: lastFunc.addr,
                      tick,
                      amount: bnUint(amount, this.decimal.get(tick)),
                  },
                  prevs,
                  ts: lastFunc.ts,
                  sig: lastFunc.sig,
              };
          }
      }
      convertFuncInternal2Inscription(func) {
          if (func.func == FuncType.deployPool) {
              const params = sortTickParams(func.params);
              return {
                  id: func.id,
                  func: func.func,
                  params: [params.tick0, params.tick1],
                  addr: params.address,
                  ts: func.ts,
                  sig: func.sig,
              };
          }
          else if (func.func == FuncType.addLiq) {
              const params = sortTickParams(func.params);
              return {
                  id: func.id,
                  func: func.func,
                  params: [
                      getPairStr(params.tick0, params.tick1),
                      bnDecimal(params.amount0, this.decimal.get(params.tick0)),
                      bnDecimal(params.amount1, this.decimal.get(params.tick1)),
                      bnDecimal(params.expect, LP_DECIMAL),
                      bnDecimal(params.slippage1000, "3"),
                  ],
                  addr: params.address,
                  ts: func.ts,
                  sig: func.sig,
              };
          }
          else if (func.func == FuncType.swap) {
              const params = func.params;
              const expectDecimal = params.exactType == ExactType.exactIn
                  ? this.decimal.get(params.tickOut)
                  : this.decimal.get(params.tickIn);
              const tick = params.exactType == ExactType.exactIn ? params.tickIn : params.tickOut;
              return {
                  id: func.id,
                  func: func.func,
                  params: [
                      getPairStr(params.tickIn, params.tickOut),
                      tick,
                      bnDecimal(params.amount, this.decimal.get(tick)),
                      params.exactType,
                      bnDecimal(params.expect, expectDecimal),
                      bnDecimal(params.slippage1000, "3"),
                  ],
                  addr: params.address,
                  ts: func.ts,
                  sig: func.sig,
              };
          }
          else if (func.func == FuncType.removeLiq) {
              const params = sortTickParams(func.params);
              return {
                  id: func.id,
                  func: func.func,
                  params: [
                      getPairStr(params.tick0, params.tick1),
                      bnDecimal(params.lp, LP_DECIMAL),
                      bnDecimal(params.amount0, this.decimal.get(params.tick0)),
                      bnDecimal(params.amount1, this.decimal.get(params.tick1)),
                      bnDecimal(params.slippage1000, "3"),
                  ],
                  addr: params.address,
                  ts: func.ts,
                  sig: func.sig,
              };
          }
          else if (func.func == FuncType.decreaseApproval) {
              const params = func.params;
              return {
                  id: func.id,
                  func: func.func,
                  params: [
                      params.tick,
                      bnDecimal(params.amount, this.decimal.get(params.tick)),
                  ],
                  addr: params.address,
                  ts: func.ts,
                  sig: func.sig,
              };
          }
      }
      calculateServerFee(gasPrice, funcLength) {
          return decimalCal([gasPrice, "mul", funcLength], this.decimal.get(this.moduleInitParams.gas_tick));
      }
      constructor() {
          this.results = [];
      }
      handleEvents(eventsData, decimalData) {
          this.decimal = new Decimal(decimalData);
          for (let i = 0; i < eventsData.detail.length; i++) {
              const item = eventsData.detail[i];
              if (!item.valid) {
                  continue;
              }
              const event = {
                  event: item.type,
                  height: item.height,
                  from: item.from,
                  to: item.to,
                  inscriptionId: item.inscriptionId,
                  inscriptionNumber: item.inscriptionNumber,
                  op: JSON.parse(item.contentBody),
                  blocktime: item.blocktime,
                  txid: item.txid,
                  data: item.data,
              };
              if (event.op.tick) {
                  event.op.tick = this.decimal.getRealTick(event.op.tick);
              }
              need([
                  OpType.approve,
                  OpType.commit,
                  OpType.conditionalApprove,
                  OpType.deploy,
                  OpType.transfer,
              ].includes(event.op.op));
              if (event.op.op == OpType.deploy) {
                  need(!!event.op.init.sequencer);
                  need(!!event.op.init.fee_to);
                  need(!!event.op.init.gas_to);
                  need(!!event.op.init.gas_tick);
                  this.moduleInitParams = event.op.init;
                  this.gas_to = event.op.init.gas_to;
                  this.contract = new Contract(new Assets({
                      swap: {},
                      pendingSwap: {},
                      available: {},
                      pendingAvailable: {},
                      approve: {},
                      conditionalApprove: {},
                  }), {
                      kLast: {},
                  }, {
                      feeTo: this.moduleInitParams.fee_to,
                      swapFeeRate1000: event.op.init.swap_fee_rate
                          ? decimalCal([event.op.init.swap_fee_rate, "mul", 1000])
                          : "0",
                  });
              }
              else if (event.op.op == OpType.transfer) {
                  this.contract.assets.mint(event.from, event.op.tick, bnUint(event.op.amt, this.decimal.get(event.op.tick)), "swap");
              }
              else if (event.op.op == OpType.commit) {
                  for (let j = 0; j < event.op.data.length; j++) {
                      try {
                          const func = this.convertFuncInscription2Internal(j, event.op);
                          this.aggregate(func, parseFloat(event.op.gas_price), event.inscriptionId, j);
                      }
                      catch (err) {
                          console.log(event.op.data[j]);
                          console.log("func error: ", err.message, "\nsubsequent signatures with the same address will be invalid.\n");
                          throw err;
                      }
                  }
              }
              else if (event.event == EventType.approve) {
                  const op = event.op;
                  const amountInt = bnUint(event.data.amount, this.decimal.get(op.tick));
                  this.contract.assets.mint(event.to, op.tick, amountInt, "swap");
              }
              else if (event.event == EventType.conditionalApprove) {
                  const op = event.op;
                  if (bn(event.data.amount).gt("0")) {
                      const amountInt = bnUint(event.data.amount, this.decimal.get(op.tick));
                      this.contract.assets.mint(event.to, op.tick, amountInt, "swap");
                  }
              }
          }
      }
      aggregate(func, gasPrice, commit, index) {
          const funcLength = this.getFuncInternalLength(this.convertFuncInternal2Inscription(func));
          const gasTick = this.moduleInitParams.gas_tick;
          const amount = this.calculateServerFee(gasPrice, funcLength);
          const sendParams = {
              from: func.params.address,
              to: this.gas_to,
              amount: bnUint(amount, this.decimal.get(gasTick)),
              tick: gasTick,
          };
          if (gasPrice > 0) {
              this.contract.send(sendParams);
          }
          if (func.func == FuncType.deployPool) {
              this.contract.deployPool(func.params);
          }
          else if (func.func == FuncType.addLiq) {
              this.contract.addLiq(func.params);
          }
          else if (func.func == FuncType.swap) {
              this.contract.swap(func.params);
          }
          else if (func.func == FuncType.removeLiq) {
              this.contract.removeLiq(func.params);
          }
          else if (func.func == FuncType.decreaseApproval) {
              const { address, tick, amount } = func.params;
              this.contract.assets.convert(address, tick, amount, "swap", "pendingAvailable");
              ({ id: func.id });
          }
          this.results.push(this.genResult({ commit, function: index }));
      }
      isLp(tick) {
          return buffer.Buffer.from(tick).length == 9 && tick[4] == "/";
      }
      genResult(params) {
          const assets = this.contract.assets;
          const map = this.contract.assets.dataRefer();
          const data = {
              users: [],
              pools: [],
          };
          for (let tick in map["swap"]) {
              const brc20 = map["swap"][tick];
              if (this.isLp(tick)) {
                  const pair = tick;
                  const { tick0, tick1 } = this.getPairStruct(pair);
                  let reserve1 = "0";
                  let reserve0 = "0";
                  try {
                      reserve0 = bnDecimal(assets.get(tick0).balanceOf(pair), this.decimal.get(tick0));
                  }
                  catch (err) { }
                  try {
                      reserve1 = bnDecimal(assets.get(tick1).balanceOf(pair), this.decimal.get(tick1));
                  }
                  catch (err) { }
                  data.pools.push({
                      pair: tick,
                      reserve0,
                      reserve1,
                      lp: bnDecimal(assets.get(pair).supply, LP_DECIMAL),
                  });
              }
              for (let key in brc20.balance) {
                  if (!this.isLp(key)) {
                      const address = key;
                      data.users.push({
                          address,
                          tick,
                          balance: !this.isLp(tick)
                              ? bnDecimal(assets.get(tick).balanceOf(address), this.decimal.get(tick))
                              : bnDecimal(assets.get(tick).balanceOf(address), "18"),
                      });
                  }
              }
          }
          if (params) {
              data["commit"] = params.commit;
              data["function"] = params.function;
          }
          return data;
      }
      verify(finalResultData) {
          return _.isEqual(this.genResult(), finalResultData);
      }
  }

  exports.ContractValidator = ContractValidator;

}));
