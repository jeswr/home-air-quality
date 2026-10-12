import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function sealSession(session, key) {
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),nonce);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final(),cipher.getAuthTag()]);
  return {version:1,nonce:nonce.toString('base64'),ciphertext:encrypted.toString('base64')};
}
export function openSession(envelope,key) {
  if(envelope?.version!==1)throw new Error('Amazon session has not been configured.');
  const encrypted=Buffer.from(envelope.ciphertext,'base64'),nonce=Buffer.from(envelope.nonce,'base64');
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),nonce);
  cipher.setAuthTag(encrypted.subarray(-16));
  return JSON.parse(Buffer.concat([cipher.update(encrypted.subarray(0,-16)),cipher.final()]).toString('utf8'));
}
