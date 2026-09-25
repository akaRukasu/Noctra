import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const start = server.indexOf('function normalizedJellyseerrDestination');
const end = server.indexOf('async function jellyseerrDestinations', start);
assert.ok(start >= 0 && end > start, 'Le normaliseur Jellyseerr doit être extractible.');
const source = server.slice(start, end);
const normalize = new Function(`${source}; return normalizedJellyseerrDestination;`)();

const repaired = normalize(
  { id: 2, name: 'Radarr principal', isDefault: true, activeProfileId: 999 },
  {
    server: { activeProfileId: 999, activeDirectory: '/media/ancien' },
    profiles: [{ id: 4, name: 'HD-1080p' }, { id: 7, name: 'UHD-2160p' }],
    rootFolders: [{ path: '/media/films', freeSpace: 1234 }]
  },
  'radarr'
);
assert.equal(repaired.defaultProfileId, 4, 'Un ancien profil supprimé doit retomber sur le premier profil réellement disponible.');
assert.equal(repaired.defaultRootFolder, '/media/films', 'Un ancien dossier supprimé doit retomber sur le premier dossier réellement disponible.');
assert.equal(repaired.ready, true);

const firstServer = normalize(
  { id: 0, name: 'Radarr principal', isDefault: true },
  {
    server: { activeProfileId: 4, activeDirectory: '/media/films' },
    profiles: [{ id: 4, name: 'HD-1080p' }],
    rootFolders: [{ path: '/media/films', freeSpace: 1234 }]
  },
  'radarr'
);
assert.equal(firstServer.id, 0, 'L’identifiant 0 de la première instance Jellyseerr doit rester valide.');
assert.equal(firstServer.ready, true);

const nested = normalize(
  { id: 3, name: 'Sonarr' },
  { server: { activeProfileId: 12, activeDirectory: '/series', profiles: [{ id: 12, name: 'Séries HD' }], rootFolders: [{ path: '/series' }] } },
  'sonarr'
);
assert.equal(nested.defaultProfileId, 12, 'Les réponses Jellyseerr imbriquées doivent aussi être acceptées.');
assert.equal(nested.ready, true);

const incomplete = normalize({ id: 4 }, { profiles: [], rootFolders: [] }, 'radarr');
assert.equal(incomplete.ready, false, 'Un serveur incomplet ne doit jamais recevoir une demande.');
assert.ok(server.includes('profileId: selectedServer.defaultProfileId') || server.includes(': selectedServer.defaultProfileId'), 'La route doit disposer d’un repli de profil validé.');
assert.ok(!server.includes('Le choix du rangement et des releases est réservé aux administrateurs.'), 'Le profil qualité ne doit plus être bloqué pour les comptes membre.');
const administratorRoutes = server.slice(server.indexOf('function administratorRoute'), server.indexOf('function normalizedIdentifier'));
assert.ok(!administratorRoutes.includes('/api/jellyseerr/destinations'), 'Les comptes membre doivent pouvoir charger la liste des profils qualité.');
assert.ok(server.includes('defaultRootFolderLabel'), 'Le dossier complet ne doit pas être exposé aux comptes membre.');
assert.ok(server.includes('server.id >= 0 && server.ready'), 'Jellyseerr doit accepter une première instance Radarr/Sonarr numérotée 0.');

console.log('Profils qualité Jellyseerr Noctra v88 : OK');
