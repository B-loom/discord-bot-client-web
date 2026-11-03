import { API_BASE, CDN_BASE } from './constants.js';

/** Erreur HTTP de l API Discord, avec le corps de reponse decode. */
export class ApiError extends Error {
  constructor(status, body, path) {
    super(ApiError.describe(status, body, path));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.path = path;
  }

  static describe(status, body, path) {
    const detail = body && typeof body === 'object' && body.message ? body.message : '';
    switch (status) {
      case 401:
        return 'Token invalide ou revoque. Recupere un nouveau token dans le Developer Portal.';
      case 403:
        return `Acces refuse par Discord${detail ? ` : ${detail}` : ''}.`;
      case 404:
        return `Ressource introuvable (${path}).`;
      case 429:
        return 'Rate limit Discord atteint. Reessaie dans un instant.';
      default:
        return `Discord a repondu ${status}${detail ? ` : ${detail}` : ''} (${path}).`;
    }
  }
}

/**
 * Client REST minimal.
 *
 * L API REST de Discord renvoie les en-tetes CORS en reflechissant l Origin et
 * autorise l en-tete Authorization : les appels partent donc directement du
 * navigateur, sans extension ni proxy.
 */
export class DiscordApi {
  #token;

  constructor(token) {
    this.#token = token;
  }

  /** Requete authentifiee, avec une seule reprise automatique sur 429. */
  async request(path, { method = 'GET', body, retry = true } = {}) {
    const headers = { Authorization: `Bot ${this.#token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429 && retry) {
      const payload = await res.json().catch(() => ({}));
      const waitMs = Math.min((payload.retry_after ?? 1) * 1000, 10_000);
      await new Promise((r) => setTimeout(r, waitMs));
      return this.request(path, { method, body, retry: false });
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new ApiError(res.status, payload, path);
    }

    return res.status === 204 ? null : res.json();
  }

  /** Le bot lui-meme. Sert aussi a valider le token. */
  me() {
    return this.request('/users/@me');
  }

  /** L application : nom, proprietaire, et flags des intents privilegies. */
  application() {
    return this.request('/oauth2/applications/@me');
  }

  /** URL du Gateway + nombre de shards recommande + quota de sessions. */
  gatewayBot() {
    return this.request('/gateway/bot');
  }

  /** Serveurs du bot (repli quand l intent Guilds n est pas actif). */
  guilds() {
    return this.request('/users/@me/guilds?limit=200');
  }

  /** Salons d un serveur. */
  guildChannels(guildId) {
    return this.request(`/guilds/${guildId}/channels`);
  }
}

/* ------------------------------ URLs du CDN ------------------------------ */

export function userAvatarUrl(user, size = 64) {
  if (!user) return null;
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `${CDN_BASE}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
  }
  // Avatar par defaut : discriminator pour les comptes legacy, sinon l ID.
  const index = user.discriminator && user.discriminator !== '0'
    ? Number(user.discriminator) % 5
    : Number((BigInt(user.id) >> 22n) % 6n);
  return `${CDN_BASE}/embed/avatars/${index}.png`;
}

export function guildIconUrl(guild, size = 64) {
  if (!guild?.icon) return null;
  const ext = guild.icon.startsWith('a_') ? 'gif' : 'png';
  return `${CDN_BASE}/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}
