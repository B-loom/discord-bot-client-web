# PAS ENCORE FINI NE PAS UTILISER ! ⚠️

# Discord Bot Client Web

**En ligne : <https://b-loom.github.io/discord-bot-client-web/>**

Un client Discord pour **bot**, qui tourne entierement dans le navigateur.
Tu colles le token de ton bot, et tu te connectes au Gateway Discord : serveurs,
salons, evenements en direct.

Pas de serveur a heberger, pas d extension a installer, pas de build.
Du HTML, du CSS et du JavaScript natif (modules ES).

> Inspire de [ChrisEric1/ChrisEric1.GitHub.io](https://github.com/ChrisEric1/ChrisEric1.GitHub.io),
> mais sans l extension de navigateur : l API REST de Discord renvoie
> aujourd'hui les en-tetes CORS necessaires, donc le site suffit.

---

## Version 1.0.0 : la connexion

Cette premiere version se concentre sur **se connecter et le prouver**.

Ce qui marche :

- Connexion avec un token de bot, validee via `GET /users/@me`
- Choix des intents du Gateway, avec detection automatique des intents
  privilegies reellement autorises par ton application
- Connexion au Gateway v10 : `HELLO`, `IDENTIFY`, heartbeat, `READY`
- Reprise de session (`RESUME`) et reconnexion automatique avec backoff
  exponentiel, detection des connexions mortes (pas de `HEARTBEAT_ACK`)
- Messages d'erreur explicites sur les codes de fermeture
  (4004 token refuse, 4014 intents non autorises, etc.)
- Liste des serveurs et des salons textuels
- Messages recus **en direct** dans le salon ouvert
- Journal de tous les evenements du Gateway, filtrable
- Panneau de diagnostic : session ID, sequence, latence du heartbeat,
  intervalle de heartbeat, shard, intents actifs

Ce qui n'est **pas** dans la 1.0.0 :

- envoyer des messages
- charger l'historique d'un salon
- membres, roles, salons vocaux
- sharding (seul le shard `0` est ouvert)

---

## Lancer en local

Les modules ES exigent un vrai serveur HTTP : ouvrir `index.html` par
`file://` ne marchera pas.

```bash
npm run dev
```

Puis <http://localhost:5173>.

N'importe quel serveur statique fait l'affaire :

```bash
python -m http.server 5173
```

## Deployer

Le depot est un site statique, deja publie par GitHub Pages depuis `main`
a la racine (`.nojekyll` est present). Chaque push sur `main` redeploie.

---

## Recuperer un token de bot

1. [Discord Developer Portal](https://discord.com/developers/applications) >
   `New Application`
2. Onglet `Bot` > `Reset Token` > copie le token
3. Dans `Privileged Gateway Intents`, active ce dont tu as besoin :
   - **Message Content** pour lire le texte des messages
   - **Server Members** pour les evenements de membres
   - **Presence** pour les statuts
4. Onglet `OAuth2` > `URL Generator` > scope `bot` > invite le bot sur un serveur

Le client lit les flags de ton application et **retire tout seul** les intents
privilegies que tu n'as pas actives, pour eviter une fermeture `4014`.

---

## Le token

- Il reste dans ton navigateur. Les seules requetes partent vers
  `discord.com` et `cdn.discordapp.com`.
- La case « Garder le token dans ce navigateur » l'ecrit dans `localStorage`.
  Sans elle, il disparait au rechargement de la page.
- `Se deconnecter` efface le token stocke.
- Un token de bot donne le **controle total** du bot. Ne le partage pas, ne le
  commite pas. S'il fuite : `Reset Token` dans le Developer Portal.

---

## Comment c'est construit

```
index.html              ecran de connexion + coquille du client
assets/css/style.css    theme sombre
assets/js/constants.js   opcodes, intents, flags, codes de fermeture
assets/js/api.js         client REST (fetch + erreurs + URLs du CDN)
assets/js/gateway.js     client WebSocket du Gateway
assets/js/store.js       etat en memoire + stockage du token
assets/js/ui.js          rendu du DOM
assets/js/app.js         orchestration
```

### Pourquoi ca marche sans extension

- Le **Gateway** est un WebSocket : le CORS ne s'y applique pas.
- L'**API REST** de Discord renvoie `access-control-allow-origin` en
  reflechissant l'`Origin` de la page et autorise l'en-tete `Authorization`.
  Un site statique peut donc l'appeler directement.

## Licence

MIT, voir [LICENSE](LICENSE).
