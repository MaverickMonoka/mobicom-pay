import { createHash } from "node:crypto";

export function phpUrlEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*~]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

export function md5(value) {
  return createHash('md5').update(value).digest('hex');
}

export function orderedSignature(entries, passphrase = null) {
  const pairs = entries.filter(([,v]) => v !== '').map(([k,v]) => `${k}=${phpUrlEncode(String(v).trim())}`);
  if (passphrase) pairs.push(`passphrase=${phpUrlEncode(String(passphrase).trim())}`);
  return md5(pairs.join('&'));
}

export function itnParamString(entries) {
  const out = [];
  for (const [k,v] of entries) {
    if (k === 'signature') break;
    out.push(`${k}=${phpUrlEncode(v)}`);
  }
  return out.join('&');
}

export function itnSignature(entries, passphrase = null) {
  const base = itnParamString(entries);
  const full = passphrase ? `${base}&passphrase=${phpUrlEncode(String(passphrase))}` : base;
  return md5(full);
}
