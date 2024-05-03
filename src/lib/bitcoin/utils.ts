import { ECPair, ECPairInterface, bitcoin, ecc } from "./core";

export function scriptpkToAddress(script_pk: string) {
  const address = bitcoin.address.fromOutputScript(
    Buffer.from(script_pk, "hex"),
    network
  );
  return address;
}

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

export function tweakPrivkeyWithRootHash(
  signer: ECPairInterface,
  rootHash: Buffer
) {
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), rootHash)
  );
  const newSigner = ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network,
  });
  return newSigner;
}

export function tweakOrderPrivkeyWithTag(signer: ECPairInterface, tag: string) {
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), Buffer.from(tag))
  );
  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network,
  });
}

export function tweakSigner(
  signer: bitcoin.Signer,
  opts: any = {}
): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array = signer.privateKey;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

export function printPsbt(psbt: bitcoin.Psbt) {
  let totalInput = 0;
  let totalOutput = 0;
  let str = "\nPSBT:\n";
  str += `Inputs:(${psbt.txInputs.length})\n`;
  psbt.txInputs.forEach((input, index) => {
    const inputData = psbt.data.inputs[index];
    str += `#${index} ${scriptpkToAddress(
      inputData.witnessUtxo.script.toString("hex")
    )} ${inputData.witnessUtxo.value}\n`;
    str += `   ${Buffer.from(input.hash).reverse().toString("hex")} [${
      input.index
    }]\n`;
    totalInput += inputData.witnessUtxo.value;
  });

  str += `Outputs:(${psbt.txOutputs.length} )\n`;
  psbt.txOutputs.forEach((output, index) => {
    str += `#${index} ${output.address} ${output.value}\n`;
    totalOutput += output.value;
  });

  str += `Left: ${totalInput - totalOutput}\n`;
  try {
    const fee = psbt.getFee();
    const feeRate = psbt.getFeeRate();
    const virtualSize = psbt.extractTransaction(true).virtualSize();
    str += `Fee: ${fee}\n`;
    str += `FeeRate: ${feeRate}\n`;
    str += `VirtualSize: ${virtualSize}\n`;
  } catch (e) {
    // todo
  }

  str += "\n";
  console.log(str);
}

export function ignoreVerifySig(enable: boolean) {
  bitcoin.Psbt.ignoreVerifySig = enable;
}
