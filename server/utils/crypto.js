// Encrypts / decrypts chat messages with AES-256-GCM.
// The database stores only { ciphertext, iv, auth_tag }, never the real text.
const crypto = require('crypto');
const config = require('../config');

const KEY = Buffer.from(config.chatKey, 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(12); // new random IV for every message
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    auth_tag: cipher.getAuthTag().toString('hex'),
  };
}

function decrypt({ ciphertext, iv, auth_tag }) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(auth_tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '[message could not be decrypted]';
  }
}

module.exports = { encrypt, decrypt };
