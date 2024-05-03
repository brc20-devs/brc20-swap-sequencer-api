import * as bitcoin from "bitcoinjs-lib";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  isSignVerify,
  verifySignatureOfBip322_P2PWPKH,
  verifySignatureOfBip322_P2TR,
} from "../src/domain/sign";

describe("Verify Signature", () => {
  before(() => {
    global.network = bitcoin.networks.bitcoin;
  });
  describe("verify signature of bip322", () => {
    it("P2PWPKH", async () => {
      expect(
        verifySignatureOfBip322_P2PWPKH(
          "bc1qj0anjmgqu5w0xhll8lk483rmaugxvpuamyk5cu",
          "hello",
          "AkgwRQIhAOUgALo37IBr2C/CUkvfnh3UwMgObe/ogQZ833iqCCPUAiB6+e7auQvffsKJvDSLW3UBy8NApClVaMG+BENkJPttgQEhAvIwdLxbnc0iSc2SqgqGvdJgbD5TC2tUyqLchZHOh+f0"
        )
      ).eq(true);
    });

    it("P2TR", async () => {
      expect(
        verifySignatureOfBip322_P2TR(
          "bc1p88rxsdkm6z6cy0dx278q6lfgvv8qeehu6x27l49zww4s0u3rpwzqvwkt67",
          "hello",
          "AUBMIUbl9Hi+vdehOuUPUZyay00YppVYjNhA4jvHIOSrPFm8o43wbGwNY2xXuoCHYPSKuYUS8RKgX10EdyuNyUfT"
        )
      ).eq(true);
    });
  });

  describe("isSignVerify", () => {
    it("P2WPKH", async () => {
      expect(
        isSignVerify(
          "bc1qj0anjmgqu5w0xhll8lk483rmaugxvpuamyk5cu",
          "hello",
          "AkgwRQIhAOUgALo37IBr2C/CUkvfnh3UwMgObe/ogQZ833iqCCPUAiB6+e7auQvffsKJvDSLW3UBy8NApClVaMG+BENkJPttgQEhAvIwdLxbnc0iSc2SqgqGvdJgbD5TC2tUyqLchZHOh+f0"
        )
      ).eq(true);
    });

    it("P2TR", async () => {
      expect(
        isSignVerify(
          "bc1p88rxsdkm6z6cy0dx278q6lfgvv8qeehu6x27l49zww4s0u3rpwzqvwkt67",
          "hello",
          "AUBMIUbl9Hi+vdehOuUPUZyay00YppVYjNhA4jvHIOSrPFm8o43wbGwNY2xXuoCHYPSKuYUS8RKgX10EdyuNyUfT"
        )
      ).eq(true);
    });
  });
});
