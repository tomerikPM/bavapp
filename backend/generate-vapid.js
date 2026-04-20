#!/usr/bin/env node
/**
 * generate-vapid.js — Generer VAPID-nøkler for Web Push
 *
 * Kjør én gang:
 *   cd ~/...bavaria32/backend && node generate-vapid.js
 *
 * Kopier output inn i .env-filen.
 */
const { generateVAPIDKeys } = require('web-push');
const keys = generateVAPIDKeys();
console.log('\n✓ VAPID-nøkler generert — lim inn i .env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\nVAPID_SUBJECT=mailto:tom.erik.thorsen@gmail.com\n');
