import CryptoJS from "crypto-js";

export function aesEncrypt(data: string, key: string): string {
  return CryptoJS.AES.encrypt(data, key).toString();
}

export function aesDecrypt(data: string, key: string): string {
  let _res = CryptoJS.AES.decrypt(data, key).toString(CryptoJS.enc.Utf8);
  if (!_res) throw `decode failed ${data}`;
  return _res;
}
