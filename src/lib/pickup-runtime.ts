import * as Crypto from "expo-crypto";
import { createDemoPickup } from "./trip-demo";

export const pickupDemo = createDemoPickup({
  async randomToken() {
    const bytes = await Crypto.getRandomBytesAsync(16);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  },
  hash: (token) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token),
});
