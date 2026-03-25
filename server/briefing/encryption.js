import crypto from "crypto";

const ENCRYPTION_KEY = process.env.EA_ENCRYPTION_KEY;

export function encrypt(plaintext) {
  if (!ENCRYPTION_KEY) throw new Error("EA_ENCRYPTION_KEY not set");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv,
  );
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(ciphertext) {
  if (!ENCRYPTION_KEY) throw new Error("EA_ENCRYPTION_KEY not set");
  const [ivHex, encryptedHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    Buffer.from(ivHex, "hex"),
  );
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
