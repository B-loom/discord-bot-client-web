/**
 * Constantes de l'API Discord utilisees par le client.
 * Reference : https://discord.com/developers/docs
 */

export const API_VERSION = 10;
export const API_BASE = `https://discord.com/api/v${API_VERSION}`;
export const GATEWAY_VERSION = API_VERSION;
export const CDN_BASE = 'https://cdn.discordapp.com';

/** Opcodes du Gateway. */
export const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

/**
 * Intents proposes a la connexion.
 * `privileged` : doit etre active dans le Developer Portal, sinon Discord
 * ferme la connexion avec le code 4014.
 */
export const INTENTS = [
  { key: 'GUILDS', bit: 1 << 0, label: 'Guilds', default: true },
  { key: 'GUILD_MEMBERS', bit: 1 << 1, label: 'Server Members', privileged: true },
  { key: 'GUILD_MODERATION', bit: 1 << 2, label: 'Moderation' },
  { key: 'GUILD_VOICE_STATES', bit: 1 << 7, label: 'Voice States' },
  { key: 'GUILD_PRESENCES', bit: 1 << 8, label: 'Presences', privileged: true },
  { key: 'GUILD_MESSAGES', bit: 1 << 9, label: 'Guild Messages', default: true },
  { key: 'GUILD_MESSAGE_REACTIONS', bit: 1 << 10, label: 'Reactions', default: true },
  { key: 'DIRECT_MESSAGES', bit: 1 << 12, label: 'Direct Messages', default: true },
  { key: 'MESSAGE_CONTENT', bit: 1 << 15, label: 'Message Content', privileged: true, default: true },
];

/**
 * Flags d'application qui disent quels intents privilegies sont reellement
 * autorises. Le flag « LIMITED » est celui d'un bot sous les 100 serveurs :
 * il compte comme autorise.
 */
export const APP_FLAGS = {
  GATEWAY_PRESENCE: 1 << 12,
  GATEWAY_PRESENCE_LIMITED: 1 << 13,
  GATEWAY_GUILD_MEMBERS: 1 << 14,
  GATEWAY_GUILD_MEMBERS_LIMITED: 1 << 15,
  GATEWAY_MESSAGE_CONTENT: 1 << 18,
  GATEWAY_MESSAGE_CONTENT_LIMITED: 1 << 19,
};

/** Intent privilegie -> paire de flags qui l'autorise. */
export const PRIVILEGED_FLAGS = {
  GUILD_PRESENCES: [APP_FLAGS.GATEWAY_PRESENCE, APP_FLAGS.GATEWAY_PRESENCE_LIMITED],
  GUILD_MEMBERS: [APP_FLAGS.GATEWAY_GUILD_MEMBERS, APP_FLAGS.GATEWAY_GUILD_MEMBERS_LIMITED],
  MESSAGE_CONTENT: [APP_FLAGS.GATEWAY_MESSAGE_CONTENT, APP_FLAGS.GATEWAY_MESSAGE_CONTENT_LIMITED],
};

/**
 * Codes de fermeture du Gateway.
 * `fatal` : inutile de retenter, il faut corriger quelque chose.
 */
export const CLOSE_CODES = {
  4000: { fatal: false, text: 'Erreur inconnue du Gateway.' },
  4001: { fatal: true, text: 'Opcode invalide envoye au Gateway.' },
  4002: { fatal: true, text: 'Payload invalide envoye au Gateway.' },
  4003: { fatal: true, text: 'Payload envoye avant l identification.' },
  4004: { fatal: true, text: 'Token refuse par Discord. Verifie le token du bot (Developer Portal > Bot > Reset Token).' },
  4005: { fatal: false, text: 'Deja identifie sur cette connexion.' },
  4007: { fatal: false, text: 'Sequence de reprise invalide, nouvelle session.' },
  4008: { fatal: false, text: 'Rate limit du Gateway atteint.' },
  4009: { fatal: false, text: 'Session expiree, nouvelle session.' },
  4010: { fatal: true, text: 'Shard invalide.' },
  4011: { fatal: true, text: 'Le bot est sur trop de serveurs : le sharding est obligatoire.' },
  4012: { fatal: true, text: 'Version d API du Gateway invalide.' },
  4013: { fatal: true, text: 'Intents invalides.' },
  4014: { fatal: true, text: 'Intents non autorises. Active les intents privilegies dans le Developer Portal > Bot > Privileged Gateway Intents.' },
};

/** Types de salons (sous-ensemble utile a l affichage). */
export const CHANNEL_TYPES = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_DIRECTORY: 14,
  GUILD_FORUM: 15,
  GUILD_MEDIA: 16,
};

/** Salons dans lesquels on peut lire des messages. */
export const TEXT_CHANNEL_TYPES = new Set([
  CHANNEL_TYPES.GUILD_TEXT,
  CHANNEL_TYPES.GUILD_ANNOUNCEMENT,
  CHANNEL_TYPES.PUBLIC_THREAD,
  CHANNEL_TYPES.PRIVATE_THREAD,
  CHANNEL_TYPES.ANNOUNCEMENT_THREAD,
]);

/** Calcule le masque d intents a partir d une liste de cles. */
export function intentMask(keys) {
  return INTENTS
    .filter((i) => keys.includes(i.key))
    .reduce((mask, i) => mask | i.bit, 0);
}

/** Retrouve les cles d intents contenues dans un masque. */
export function intentKeys(mask) {
  return INTENTS.filter((i) => (mask & i.bit) !== 0).map((i) => i.key);
}
