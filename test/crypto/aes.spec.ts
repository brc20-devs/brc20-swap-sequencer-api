import { expect } from "chai";
import { aesDecrypt, aesEncrypt } from "../../src/lib/crypto";

describe("aes", () => {
  before(async () => {});

  it("basic ", async () => {
    const orignStr = "hello";
    const key = "1234";
    const str = aesEncrypt(orignStr, key);
    const result = aesDecrypt(str, key);
    expect(result).to.eq(orignStr);
  });
});
