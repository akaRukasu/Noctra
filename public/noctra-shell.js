(() => {
  'use strict';

  function installJellyfinHlsCompatibility() {
    const proto = window.XMLHttpRequest?.prototype;
    if (!proto?.open || proto.open.__noctraJellyfinHlsCompatibility) return;

    const originalOpen = proto.open;
    const compatibleOpen = function (method, rawUrl, ...rest) {
      let requestUrl = rawUrl;
      try {
        const url = new URL(String(rawUrl), window.location.href);
        const isJellyfinVodManifest = /\/jellyfin\/videos\/[^/]+\/master\.m3u8$/i.test(url.pathname);
        if (isJellyfinVodManifest) {
          // Chromium can advertise HEVC/AV1 support while its HLS/MSE path still
          // fails before the first frame. AVC is the reliable Jellyfin fallback.
          url.searchParams.set('VideoCodec', 'h264');
          url.searchParams.set('RequireAvc', 'true');
          requestUrl = url.toString();
        }
      } catch {}
      return originalOpen.call(this, method, requestUrl, ...rest);
    };

    compatibleOpen.__noctraJellyfinHlsCompatibility = true;
    compatibleOpen.__noctraOriginalOpen = originalOpen;
    proto.open = compatibleOpen;
  }

  installJellyfinHlsCompatibility();

  const icons = {
    home: '<svg viewBox="0 0 24 24"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>',
    library: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
    request: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg>',
    tv: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="13" rx="2.5"/><path d="m8 2 4 3 4-3M8 21h8"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16"/></svg>',
    tools: '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    view: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/></svg>',
    sort: '<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h7M4 17h4M17 5v14M14 16l3 3 3-3"/></svg>',
    filter: '<svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.4A4.6 4.6 0 0 1 8.1 13h1.8a4.6 4.6 0 0 1 4.6 4.6V19M15 5.5a3 3 0 0 1 0 5.8M17 13.2a4.6 4.6 0 0 1 3.5 4.4V19"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="m15.5 5-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m8.5 5 7 7-7 7"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.35 5.65"/><path d="M20 4v7h-7"/></svg>',
    announce: '<svg viewBox="0 0 24 24"><path d="m3 11 18-5v12L3 14z"/><path d="m11.6 16.1 1.4 4.9H7l-1.4-6.2"/></svg>',
    verify: '<svg viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    install: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="14" height="14" rx="3"/><path d="M8 8.5v4.8M8 8.5l5 4.8V8.5"/><circle cx="18" cy="18" r="3.25"/><path d="M18 16.5v3M16.5 18h3"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5h6l2 2h10v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>',
    relink: '<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10H3z"/><path d="M8 14a3 3 0 0 1 3-3h2M16 12l2 2-2 2M16 17a3 3 0 0 1-3 3h-2M8 19l-2-2 2-2"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/><path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9zM5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10z"/><path d="m13.5 7 3.5 3.5"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="m5 14 7-7 7 7"/><path d="M12 7v13"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="m10 11 4 5m0-5-4 5"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.35 5.65"/><path d="M20 4v7h-7"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    live: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    cast: '<svg viewBox="0 0 24 24"><path d="M4 17.5a2.5 2.5 0 0 1 2.5 2.5M4 13a7 7 0 0 1 7 7M4 8.5A11.5 11.5 0 0 1 15.5 20"/><path d="M8 4h10a2 2 0 0 1 2 2v10"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1"/></svg>',
    theater: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9v6M17 9v6M10 12h4"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>',
    film: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="m18 14 4 4-4 4M18 2l4 4-4 4M2 18h2.5a6 6 0 0 0 5-2.7l5-7.6A6 6 0 0 1 19.5 5H22M2 6h2.5a6 6 0 0 1 5 2.7M14.5 15.3a6 6 0 0 0 5 2.7H22"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M5 9V4m0 0h5M5 4l3.2 3.1A7.5 7.5 0 1 1 5 13"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    account: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
    lightning: '<svg viewBox="0 0 24 24"><path d="m13 2-8 12h7l-1 8 8-12h-7z"/></svg>',
    display: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    captions: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 10a2.5 2.5 0 1 0 0 4M17 10a2.5 2.5 0 1 0 0 4"/></svg>',
    gamepad: '<svg viewBox="0 0 24 24"><path d="M7 7h10a4 4 0 0 1 3.8 5.2l-1.3 4A2.6 2.6 0 0 1 15 17l-1.2-1.5h-3.6L9 17a2.6 2.6 0 0 1-4.5-.8l-1.3-4A4 4 0 0 1 7 7z"/><path d="M7 12h4M9 10v4M16.5 10.5h.01M18.5 12.5h.01"/></svg>',
    metadata: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5M14 8l4 4-4 4M9 12h9"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 5.8a5 5 0 0 0-7.1 0L12 7.5l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-8.1a5 5 0 0 0 0-7.1z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M5 10v4h4l5 4V6l-5 4z"/><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>',
    muted: '<svg viewBox="0 0 24 24"><path d="M5 10v4h4l5 4V6l-5 4z"/><path d="m17 10 4 4M21 10l-4 4"/></svg>',
    previous: '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg>',
    skipNext: '<svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l9 6-9 6z"/></svg>',
    rewind: '<svg viewBox="0 0 24 24"><path d="m11 6-8 6 8 6zM21 6l-8 6 8 6z"/></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="m13 6 8 6-8 6zM3 6l8 6-8 6z"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="m9 7-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></svg>',
    fullscreenExit: '<svg viewBox="0 0 24 24"><path d="M8 8H3M8 8V3M16 8h5M16 8V3M8 16H3M8 16v5M16 16h5M16 16v5"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
    airplay: '<svg viewBox="0 0 24 24"><path d="M6 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/><path d="m12 14-5 7h10z"/></svg>',
    record: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>',
    playlist: '<svg viewBox="0 0 24 24"><path d="M3 5h13M3 10h13M3 15h7M17 13v8M13 17h8"/></svg>',
    select: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>'
  };

  let activeAutomation = 'radarr';
  let pendingDelete = null;
  let pendingRequest = null;
  let requestDestinations = null;
  let episodePickerData = null;
  let lastSeriesContext = null;
  let releaseSearchSequence = 0;
  let releaseSearchContext = null;
  let releaseSearchView = null;
  let automationLoadSequence = 0;
  let indexerEditorContext = null;
  let homeEnhanceTimer = null;
  let homeLibraryRepairTimer = null;
  let homeLibraryObserver = null;
  let homeLibraryObserverTarget = null;
  let dockCloseTimer = null;
  let lastDockPlayingState = null;
  let authContext = null;
  let lastAuthToken = null;
  let authSyncPromise = null;
  let authRetryTimer = null;
  let detailParallaxTarget = null;
  let detailParallaxFrame = null;
  let downloadsLiveTimer = null;
  let downloadsLiveRequest = null;
  let downloadRelinkTimer = null;
  let downloadRelinkCompletion = '';
  let lastDownloadRelinkStatus = null;
  let downloadRelinkFailures = 0;
  let downloadsUiState = { filter: 'all', search: '', visibleLimit: 0, detailHash: '', detailName: '' };
  let lastDownloadsData = null;
  let libraryRecoveryTimer = null;
  let libraryNavigationSequence = 0;
  let libraryRefreshSequence = 0;
  let libraryBridgeTarget = '';
  let identifyPanelState = null;
  let pwaInstallPrompt = null;
  let libraryGridFrame = 0;
  let fileExplorerState = { roots: [], root: '', path: '' };
  let fileDuplicateStatus = null;
  let fileDuplicateTimer = null;
  let fileDuplicateSequence = 0;
  let completenessTimer = null;
  let completenessSequence = 0;
  let completenessStatus = null;
  let completenessKind = 'movie';
  let discoveryState = { category: 'smart', provider: '', mediaType: 'all', mode: 'balanced', genre: '' };
  let discoveryFeed = null;
  let discoveryViewSequence = 0;
  let trackerAvailabilityObserver = null;
  let trackerObservationRoot = null;
  let requestHistoryState = { status: 'all', mediaType: 'all', query: '' };
  let lastRequestHistoryData = null;
  let lastRequestDiscoveryData = null;
  let requestNavigationSequence = 0;
  let mediaDetailState = null;
  let tvState = { sources: [], sourceId: '', section: 'channels', ref: '', group: 'Toutes', search: '', catalog: null, resolvedEmbeds: [], currentChannelIndex: -1, currentPlaybackType: '', currentStreamUrl: '', visibleLimit: 120, showSports: false, mobileView: 'channels' };
  const TV_FAVORITES_STORAGE_KEY = 'noctra-tv-favorites-v1';
  let tvFavorites = [];
  try {
    const storedTvFavorites = JSON.parse(window.localStorage?.getItem(TV_FAVORITES_STORAGE_KEY) || '[]');
    if (Array.isArray(storedTvFavorites)) tvFavorites = storedTvFavorites.filter(item => item?.key && item?.sourceId && item?.name).slice(0, 300);
  } catch {}
  const tvSearchBlobCache = new WeakMap();
  const tvVirtualState = { raf: 0, pitch: 68, lastStart: -1, lastEnd: -1, lastKey: '', matches: [] };
  let heavyPrefetchScheduled = false;
  try { tvState.showSports = window.localStorage?.getItem('noctra-tv-sports-visible') === '1'; } catch {}
  let tvFilterTimer = null;
  let tvHls = null;
  let tvShaka = null;
  let tvShakaLoader = null;
  let tvShakaCleanup = Promise.resolve();
  let tvShakaBufferedRecoverySequence = -1;
  let tvEnginePreference = 'shaka';
  let tvDirectRestart = null;
  try { if (window.localStorage?.getItem('noctra-tv-engine') === 'hls') tvEnginePreference = 'hls'; } catch {}
  let tvMpegTsLoader = null;
  let tvHlsLoader = null;
  let tvVideoEventsController = null;
  let tvResolverController = new AbortController();
  let tvOptionSequence = 0;
  let tvWaitingStatusTimer = 0;
  let tvDesktopControlsHideTimer = 0;
  let tvLiveEdgeRefreshFrame = 0;
  let tvDiagnosticsTimer = 0;
  let tvDiagnosticsOpen = false;
  let tvDiagnosticStatusKey = '';
  let tvPlaybackStartedAt = 0;
  const tvDiagnostics = [];
  const TV_DIAGNOSTIC_MAX = 90;
  // V101: Cinema/Multiview are deliberately isolated from the core TV renderer.
  // Nothing here changes playback until the user explicitly opens the TV tools.
  const TV_SAFE_MULTI_MAX = 25;
  const tvSafeExtras = {
    theater: false,
    menuOpen: false,
    slots: [],
    multiOpen: false,
    audioId: '',
    hls: new Map(),
    shaka: new Map(),
    shakaCleanup: new Map(),
    multiControllers: new Map(),
    mainMutedBeforeMulti: null,
    mainPausedBeforeMulti: null,
    mainHlsSuspended: false,
    mainEmbedSrc: '',
    multiGeneration: 0,
    multiQuality: 'stable',
    fullscreenFallback: false
  };
  let tvSafeExtrasObserver = null;
  let tvSafeExtrasMountFrame = 0;
  let tvFrameResizeObserver = null;
  let tvNavigationSequence = 0;
  let tvPlaybackSequence = 0;
  let tvResolvedFallbackSequence = -1;
  let tvFailedOptionIndexes = new Set();
  // V126 : récupération LiveWatch liée au clic courant. Une coupure d'un
  // direct déjà démarré peut renouveler plusieurs fois LE MEME direct Premium
  // au cours d'une longue session. Le budget empêche les boucles rapides avant
  // qu'un autre serveur explicitement fourni pour cette chaîne soit essayé.
  let tvLiveWatchRefreshSequence = -1;
  let tvLiveWatchRefreshCount = 0;
  let tvLiveWatchLastRefreshAt = 0;
  let tvLiveWatchRecoveryInFlight = false;
  let tvLogoRefreshTimer = null;
  let arrCenterState = { type: 'radarr', view: 'overview', page: 1, query: '', lookup: [] };
  const apiResponseCache = new Map();
  const availabilityRequests = new Map();
  const discoveryEnrichmentQueue = new Map();
  let discoveryEnrichmentTimer = 0;
  let discoveryEnrichmentObserver = null;
  let discoveryObservationRoot = null;
  const trackerWorkQueue = [];
  let trackerWorkers = 0;
  let discoveryTorrentLiveTimer = 0;
  let discoveryTorrentLiveState = null;
  let headerActionMenuIntent = '';
  let headerActionMenuIntentUntil = 0;
  const identificationJobTimers = new Map();
  let lastMediaContext = {
    itemId: '',
    capturedAt: 0
  };
  const libraryRecovery = {
    route: '',
    attempt: 0,
    startedAt: 0
  };
  const identifyDialogState = new WeakMap();
  const boundHomeScrollers = new WeakSet();
  const homeCarouselFeeds = new WeakMap();
  const homeCarouselTargets = new WeakMap();
  const homeCarouselGeometry = new WeakMap();
  let jellyfinWebpackRequire = null;
  const validMediaItemId = value => /^[a-f0-9]{32}$/i.test(String(value || ''));

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  const formatBytes = value => {
    const number = Number(value || 0);
    if (!number) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    const index = Math.min(Math.floor(Math.log(number) / Math.log(1024)), units.length - 1);
    return `${(number / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  };

  const formatSpeed = value => `${formatBytes(value)}/s`;
  const sortTorrentsBySize = releases => [...releases].sort((left, right) => {
    const size = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : Number.MAX_VALUE;
    return size(left.size) - size(right.size) || String(left.title || '').localeCompare(String(right.title || ''), 'fr', { numeric: true });
  });
  const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  const formatDuration = value => {
    const seconds = Math.max(0, Number(value || 0));
    if (!Number.isFinite(seconds) || seconds >= 8_640_000) return '∞';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = Math.floor(seconds % 60);
    if (hours) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
    if (minutes) return `${minutes} min ${String(remaining).padStart(2, '0')} s`;
    return `${remaining} s`;
  };
  const formatTimestamp = value => Number(value || 0) > 0
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(value) * 1000))
    : '—';
  const shellScript = [...document.scripts].find(script => /\/noctra-shell\.js(?:\?|$)/.test(script.src));
  const noctraBasePath = (() => {
    try {
      const clientPath = location.pathname.match(/^(.*)\/client\/(?:index\.html)?$/i);
      if (clientPath) return clientPath[1].replace(/\/$/, '');
      const pathname = new URL(shellScript?.src || location.href, location.href).pathname;
      return pathname.replace(/\/noctra-shell\.js$/, '').replace(/\/$/, '');
    } catch {
      return '';
    }
  })();
  const appPath = value => {
    const source = String(value || '');
    if (/^(?:[a-z]+:)?\/\//i.test(source)) return source;
    const path = source.startsWith('/') ? source : `/${source}`;
    // Certaines routes générées côté serveur contiennent déjà BASE_URL
    // (ex. /noctra/api/...). Ne jamais préfixer une seconde fois : en v67,
    // OHA devenait /noctra/noctra/api/... sur Ultra.cc et renvoyait un 404 HTML.
    if (noctraBasePath && (path === noctraBasePath || path.startsWith(`${noctraBasePath}/`))) return path;
    return `${noctraBasePath}${path}` || '/';
  };
  const NOCTRA_BUILD_VERSION = '200.0.109';
  document.documentElement.dataset.noctraBuild = NOCTRA_BUILD_VERSION;

  const formatDate = value => value ? new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value)) : 'Date inconnue';

  function runWhenIdle(callback, timeout = 1200) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(callback, { timeout });
    }
    return window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), Math.min(timeout, 48));
  }

  function desktopPerformanceProfile() {
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return width >= 1025 && !connection?.saveData;
  }

  function backgroundPrefetchProfile() {
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    return {
      desktop: width >= 1025,
      allowed: !connection?.saveData && effectiveType !== 'slow-2g'
    };
  }

  function scheduleHeavyPrefetch() {
    const profile = backgroundPrefetchProfile();
    if (heavyPrefetchScheduled || !profile.allowed) return;
    heavyPrefetchScheduled = true;
    runWhenIdle(() => {
      // Les demandes partent immédiatement et indépendamment du préchauffage
      // TV. Auparavant une source TV lente retardait tout le premier onglet
      // Demandes, et aucun préchargement n'était effectué sur mobile.
      void cachedApi('/api/jellyseerr/requests', 15_000, { timeoutMs: 8_000 }).catch(() => undefined);
      void cachedApi('/api/discovery?category=trending&provider=&mode=balanced', 5 * 60_000, { timeoutMs: 12_000 }).catch(() => undefined);
      void cachedApi('/api/discovery?category=smart&provider=&mode=balanced', 60_000, { timeoutMs: profile.desktop ? 20_000 : 25_000 }).catch(() => undefined);
      if (authContext?.isAdmin) {
        void cachedApi('/api/servarr/center?type=sonarr&view=overview&page=1&pageSize=40', 60_000, { timeoutMs: 12_000 }).catch(() => undefined);
      }
      if (profile.desktop) {
        void cachedApi('/api/discovery/providers?type=all', 24 * 60 * 60_000, { timeoutMs: 8_000 }).catch(() => undefined);
      }
      void (async () => {
        try {
          const sourceData = await cachedApi('/api/tv/sources', 2 * 60_000, { timeoutMs: 8_000 });
          let lastSource = '';
          try { lastSource = window.localStorage?.getItem('noctra-tv-last-source') || ''; } catch {}
          const sources = sourceData?.sources || [];
          const preferred = sources.find(source => source.id === lastSource)
            || sources.find(source => tvSourceSection(source) === 'channels')
            || sources[0];
          if (preferred?.id) {
            void cachedApi(`/api/tv/catalog?source=${encodeURIComponent(preferred.id)}`, 5 * 60_000, { timeoutMs: 12_000 }).catch(() => undefined);
          }
        } catch {}
      })();
    }, profile.desktop ? 1800 : 650);
  }

  function jellyfinAccessToken() {
    try {
      return window.ApiClient?.accessToken?.()
        || window.ApiClient?._serverInfo?.AccessToken
        || window.ApiClient?._serverInfo?.accessToken
        || window.ApiClient?.serverInfo?.AccessToken
        || window.ApiClient?.serverInfo?.accessToken
        || '';
    } catch {
      return '';
    }
  }

  async function api(path, options = {}) {
    const { timeoutMs = 0, ...requestOptions } = options;
    const headers = new Headers(requestOptions.headers || {});
    const token = jellyfinAccessToken();
    if (token) headers.set('x-noctra-token', token);
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const externalSignal = requestOptions.signal;
    const abortRequest = () => controller?.abort(externalSignal?.reason);
    if (controller && externalSignal) {
      if (externalSignal.aborted) abortRequest();
      else externalSignal.addEventListener('abort', abortRequest, { once: true });
    }
    const timer = controller
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const response = await fetch(appPath(path), {
        ...requestOptions,
        headers,
        credentials: 'same-origin',
        ...(controller ? { signal: controller.signal } : {})
      });
      const raw = await response.text();
      let payload = {};
      if (raw) {
        try { payload = JSON.parse(raw); }
        catch {
          if (/^\s*<!doctype\s+html|^\s*<html/i.test(raw)) {
            const proxyError = new Error('Noctra a reçu une page HTML à la place de son API. Vérifie le proxy et les URL internes dans le fichier .env.');
            proxyError.code = 'NOCTRA_HTML_RESPONSE';
            proxyError.status = response.status;
            throw proxyError;
          }
          throw new Error(`Réponse API non JSON (${response.status}).`);
        }
      }
      if (!response.ok) {
        const httpError = new Error(payload.detail || payload.error || `Erreur ${response.status}`);
        httpError.status = response.status;
        httpError.payload = payload;
        throw httpError;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new Error(String(path).startsWith('/api/tv')
          ? 'La source TV met trop de temps à répondre. Choisis un autre fournisseur ou réessaie.'
          : 'Jellyfin met trop de temps à répondre. Réessaie dans quelques secondes.');
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortRequest);
    }
  }


  function clearApiCache(prefix = '') {
    [...apiResponseCache.keys()].forEach(key => {
      if (!prefix || key.startsWith(prefix)) apiResponseCache.delete(key);
    });
    if (!prefix || prefix.startsWith('/api/discovery') || '/api/discovery'.startsWith(prefix)) {
      lastRequestDiscoveryData = null;
    }
  }

  async function cachedApi(path, ttl = 20_000, options = {}) {
    if (options.method && options.method !== 'GET') return api(path, options);
    const cached = apiResponseCache.get(path);
    if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
    if (cached?.promise) return cached.promise;
    const promise = api(path, options)
      .then(value => {
        apiResponseCache.set(path, { value, expiresAt: Date.now() + ttl });
        return value;
      })
      .finally(() => {
        const latest = apiResponseCache.get(path);
        if (latest?.promise) apiResponseCache.delete(path);
      });
    apiResponseCache.set(path, { promise, expiresAt: Date.now() + ttl });
    return promise;
  }

  function validCachedApiValue(path) {
    const cached = apiResponseCache.get(path);
    return cached?.value && cached.expiresAt > Date.now() ? cached.value : null;
  }

  function mobileMoreMarkup(isAdmin) {
    const entry = (action, icon, title, subtitle) => `<button type="button" data-noctra="${action}">${icons[icon]}<span><strong>${title}</strong><small>${subtitle}</small></span>${icons.next}</button>`;
    return `<header><div><p>VOTRE ESPACE</p><h2 id="noctra-more-title">Explorer Noctra</h2></div><button type="button" data-close-more aria-label="Fermer le menu">×</button></header>
      <div class="noctra-more-links">${entry('roulette','sparkle','Roulette','Trouver votre prochaine séance')}${entry('install','install','Installer Noctra','Un accès depuis votre écran d’accueil')}</div>
      ${isAdmin ? `<h3>Administration</h3><div class="noctra-more-links">${entry('download','download','Téléchargements','Suivre les transferts')}${entry('tools','tools','Automatisation','Radarr, Sonarr et Prowlarr')}${entry('dashboard','dashboard','Dashboard Jellyfin','Superviser votre serveur')}${entry('users','users','Utilisateurs','Gérer les comptes')}${entry('refresh','refresh','Actualiser les médiathèques','Mettre à jour le catalogue')}</div>` : ''}`;
  }

  function openMobileMore() {
    let dialog = document.querySelector('#noctra-mobile-more');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'noctra-mobile-more';
      dialog.setAttribute('aria-labelledby', 'noctra-more-title');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('[data-close-more]')) dialog.close();
      });
      dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
      dialog.addEventListener('close', () => {
        document.querySelector('[data-noctra="more"]')?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('noctra-more-open');
        premiereHomeController?.sync();
      });
    }
    dialog.innerHTML = mobileMoreMarkup(Boolean(authContext?.isAdmin));
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('noctra-more-open');
    premiereHomeController?.sync();
    document.querySelector('[data-noctra="more"]')?.setAttribute('aria-expanded', 'true');
  }

  function syncDockRoleButtons(role) {
    const items = document.querySelector('#noctra-dock .noctra-dock-items');
    if (!items) return;
    items.querySelectorAll('[data-admin-dock]').forEach(button => button.remove());
    if (role !== 'administrator') return;
    items.insertAdjacentHTML('beforeend', `
      <button class="noctra-dock-button" type="button" data-noctra="download" data-admin-dock aria-label="Téléchargements" title="Téléchargements">${icons.download}<span>Téléchargements</span></button>
      <button class="noctra-dock-button" type="button" data-noctra="tools" data-admin-dock aria-label="Automatisation" title="Radarr · Sonarr · Prowlarr">${icons.tools}<span>Radarr · Sonarr</span></button>
      <button class="noctra-dock-button" type="button" data-noctra="dashboard" data-admin-dock aria-label="Dashboard Jellyfin" title="Dashboard Jellyfin">${icons.dashboard}<span>Dashboard Jellyfin</span></button>
      <button class="noctra-dock-button" type="button" data-noctra="users" data-admin-dock aria-label="Gestion des utilisateurs" title="Gestion des utilisateurs">${icons.users}<span>Utilisateurs</span></button>
      <button class="noctra-dock-button" type="button" data-noctra="refresh" data-admin-dock aria-label="Actualiser les médiathèques" title="Actualiser les médiathèques">${icons.refresh}<span>Actualiser les médiathèques</span></button>`);
  }

  function applyAuthContext() {
    const role = authContext?.isAdmin ? 'administrator' : (authContext ? 'user' : 'guest');
    if (document.body.dataset.noctraRole !== role) document.querySelector('#noctra-mobile-more[open]')?.close();
    document.body.dataset.noctraRole = role;
    const dock = document.querySelector('#noctra-dock');
    if (dock) dock.dataset.role = role;
    syncDockRoleButtons(role);
    if (authContext) scheduleHeavyPrefetch();
    document.querySelectorAll('[data-admin-only]').forEach(element => {
      const adminVisible = role === 'administrator';
      element.hidden = !adminVisible;
      element.setAttribute('aria-hidden', String(!adminVisible));
      if ('inert' in element) element.inert = !adminVisible;
      if (adminVisible) element.style.removeProperty('display');
      else element.style.setProperty('display', 'none', 'important');
    });
    const brandRole = document.querySelector('#noctra-dock .noctra-brand small');
    if (brandRole) {
      brandRole.textContent = authContext
        ? `${authContext.user.name} · ${authContext.isAdmin ? 'ADMIN' : 'MEMBRE'}`
        : 'CONNEXION JELLYFIN';
    }
    const route = location.hash.toLowerCase();
    if (role === 'user' && route.includes('/dashboard')) {
      closePanel();
      location.hash = '#/home.html';
      toast('Cette section est réservée aux administrateurs.');
    }
    repairAuthenticatedViewState();
  }

  async function syncAuthContext(force = false) {
    const token = jellyfinAccessToken();
    window.clearTimeout(authRetryTimer);

    // V78 : sur la PWA mobile, Jellyfin peut recréer ApiClient quelques centaines
    // de millisecondes après le shell Noctra. La session HttpOnly Noctra est déjà
    // valide pendant cette fenêtre : ne jamais rétrograder l'admin en simple
    // utilisateur/guest uniquement parce que accessToken() n'est pas encore prêt.
    if (!token) {
      if (!force && authContext) {
        authRetryTimer = window.setTimeout(() => syncAuthContext(), 900);
        return authContext;
      }
      if (authSyncPromise) return authSyncPromise;
      authSyncPromise = api('/api/session')
        .then(context => {
          lastAuthToken = 'cookie-session';
          authContext = context;
          applyAuthContext();
          authRetryTimer = window.setTimeout(() => syncAuthContext(), 1200);
          return context;
        })
        .catch(() => {
          // Une absence réelle de session ne doit effacer le rôle qu'au premier
          // démarrage. Si on avait déjà un contexte valide, on le conserve jusqu'à
          // ce que Jellyfin ait fini de réhydrater son client.
          if (!authContext) {
            lastAuthToken = null;
            applyAuthContext();
          }
          authRetryTimer = window.setTimeout(() => syncAuthContext(), 900);
          return authContext;
        })
        .finally(() => {
          authSyncPromise = null;
        });
      return authSyncPromise;
    }

    if (!force && token === lastAuthToken && authContext) return authContext;
    if (authSyncPromise) return authSyncPromise;
    authSyncPromise = api('/api/session')
      .then(context => {
        lastAuthToken = token;
        authContext = context;
        applyAuthContext();
        return context;
      })
      .catch(() => {
        // Même règle : un bref échec réseau ne doit pas transformer visuellement
        // un administrateur déjà authentifié en membre sur mobile.
        if (!authContext) {
          lastAuthToken = null;
          applyAuthContext();
        }
        authRetryTimer = window.setTimeout(() => syncAuthContext(true), 1200);
        return authContext;
      })
      .finally(() => {
        authSyncPromise = null;
      });
    return authSyncPromise;
  }

  async function verifyNoctraBuild() {
    try {
      const health = await fetch(appPath('/health'), { credentials: 'same-origin', cache: 'no-store' }).then(response => response.json());
      const serverVersion = String(health?.version || '');
      document.documentElement.dataset.noctraServerVersion = serverVersion || 'unknown';
      if (serverVersion && serverVersion !== NOCTRA_BUILD_VERSION) {
        document.body.dataset.noctraVersionMismatch = 'true';
        toast(`Noctra n'est pas entièrement mis à jour : client ${NOCTRA_BUILD_VERSION} / serveur ${serverVersion}. Redémarre le service avant de tester la TV.`);
        return false;
      }
      document.body.dataset.noctraVersionMismatch = 'false';
      return true;
    } catch {
      return false;
    }
  }

  function toast(message, options = {}) {
    const element = document.querySelector('#noctra-toast');
    if (!element) return;
    const normalizedOptions = typeof options === 'number' ? { duration: options } : options;
    const progress = Number(normalizedOptions.progress);
    const hasProgress = Number.isFinite(progress);
    // Keep the progress nodes alive while polling so their transition is not restarted.
    let label = element.querySelector('span');
    if (!label) { label = document.createElement('span'); element.appendChild(label); }
    label.textContent = String(message || '');
    if (hasProgress) {
      const value = Math.max(0, Math.min(100, Math.round(progress)));
      let track = element.querySelector('i');
      let fill = track?.querySelector('b');
      if (!track || !fill) {
        track = document.createElement('i');
        fill = document.createElement('b');
        track.appendChild(fill);
        element.appendChild(track);
      }
      fill.style.width = `${value}%`;
      element.dataset.progress = String(value);
      element.setAttribute('aria-label', `${label.textContent} ${value} %`);
    } else {
      element.querySelector('i')?.remove();
      delete element.dataset.progress;
      element.removeAttribute('aria-label');
    }
    element.dataset.state = String(normalizedOptions.state || 'info');
    element.dataset.show = 'true';
    clearTimeout(toast.timer);
    if (!normalizedOptions.persistent) {
      toast.timer = setTimeout(() => { element.dataset.show = 'false'; }, Number(normalizedOptions.duration || 3600));
    }
  }

  function panel(title, eyebrow, content, options = {}) {
    stopDiscoveryFeed();
    stopDownloadsLive();
    closeDiscoveryTorrentLive();
    const backdrop = document.querySelector('#noctra-backdrop');
    const panelKind = options.kind || ({
      'Demandes': 'requests',
      'Téléchargements': 'downloads',
      'Automatisation': 'automation',
      'Médiathèques': 'libraries',
      'Explorateur média': 'files',
      'À découvrir': 'discovery',
      'TV en direct': 'tv',
      'Identifier le média': 'identify'
    }[title] || 'generic');
    const desktopWorkspacePanels = new Set(['files']);
    const workspacePanel = options.workspace ?? desktopWorkspacePanels.has(panelKind);
    backdrop.innerHTML = `
      <aside id="noctra-panel" class="${options.wide ? 'noctra-panel--wide ' : ''}${workspacePanel ? 'noctra-panel--workspace' : ''}"
        data-noctra-panel-kind="${escapeHtml(panelKind)}"
        role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <header class="noctra-panel-header">
          <div>
            <p class="noctra-eyebrow">${escapeHtml(eyebrow)}</p>
            <h2>${escapeHtml(title)}</h2>
          </div>
          <button class="noctra-close" type="button" data-noctra-close aria-label="Fermer">×</button>
        </header>
        <div class="noctra-panel-body">${content}</div>
      </aside>`;
    document.body.classList.add('noctra-panel-open');
    premiereHomeController?.sync();
    backdrop.dataset.open = 'true';
    backdrop.dataset.panelKind = panelKind;
    backdrop.dataset.ready = 'false';
    window.requestAnimationFrame(() => {
      backdrop.dataset.ready = 'true';
      backdrop.querySelector('[data-noctra-close]')?.focus({ preventScroll: true });
    });
  }

  function closePanel() {
    rouletteSequence += 1;
    releaseSearchSequence += 1;
    stopDiscoveryFeed();
    discoveryViewSequence += 1;
    closeDiscoveryTorrentLive();
    closeMediaDetail();
    const backdrop = document.querySelector('#noctra-backdrop');
    stopDownloadsLive();
    window.clearTimeout(fileDuplicateTimer);
    fileDuplicateTimer = null;
    downloadsUiState.detailHash = '';
    downloadsUiState.detailName = '';
    destroyTvPlayback();
    identifyPanelState = null;
    if (backdrop.querySelector('#noctra-request-confirm')) {
      pendingRequest = null;
      requestDestinations = null;
    }
    document.body.classList.remove('noctra-panel-open');
    backdrop.dataset.open = 'false';
    delete backdrop.dataset.panelKind;
    backdrop.innerHTML = '';
    document.querySelectorAll('.noctra-dock-button').forEach(button => button.dataset.active = 'false');
    window.requestAnimationFrame(syncRouteState);
  }

  function setLoading(title, eyebrow, wide = false, options = {}) {
    panel(title, eyebrow, '<div class="noctra-loading"><i></i><span>Connexion au service…</span></div>', { wide, ...options });
  }

  function setPanelBody(html, options = {}) {
    const body = document.querySelector('.noctra-panel-body');
    if (!body) return;
    const preserveScroll = options.preserveScroll !== false;
    const previousScroll = body.scrollTop;
    const update = () => {
      stopDiscoveryFeed();
      body.innerHTML = html;
      if (preserveScroll) body.scrollTop = Math.min(previousScroll, Math.max(0, body.scrollHeight - body.clientHeight));
      else body.scrollTop = 0;
      body.dataset.updating = 'false';
      options.afterUpdate?.(body);
    };
    body.dataset.updating = 'true';
    const panelKind = body.closest('#noctra-panel')?.dataset.noctraPanelKind || '';
    const heavyPanel = ['tv', 'discovery', 'files', 'downloads', 'automation'].includes(panelKind);
    const transition = !desktopPerformanceProfile() && !heavyPanel && document.startViewTransition && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ? document.startViewTransition(() => update())
      : null;
    if (!transition) window.requestAnimationFrame(update);
    transition?.finished?.catch(() => {}).finally(() => { body.dataset.updating = 'false'; });
  }

  function showError(error) {
    setPanelBody(`<div class="noctra-error">${escapeHtml(error.message)}</div>`);
  }

  function goHome() {
    closePanel();
    location.hash = '#/home.html';
  }

  function navigateNoctraBack() {
    const before = location.href;
    const currentRoute = String(location.hash || '').toLowerCase();
    if (currentRoute && !/(?:#\/home(?:\.html)?(?:[?&]|$))/.test(currentRoute)) {
      history.back();
      window.setTimeout(() => {
        if (location.href === before) goHome();
      }, 180);
      return;
    }
    goHome();
  }

  function canonicalLibraryHash(value = location.hash) {
    const raw = String(value || '').replace(/^#!/, '#/');
    const match = raw.match(/^(#\/(?:movies|tv)(?:\.html)?)(?:\?(.*))?$/i);
    if (!match) return '';
    const params = new URLSearchParams(match[2] || '');
    const parentKey = [...params.keys()].find(key => key.toLowerCase() === 'topparentid');
    const parentId = parentKey ? params.get(parentKey) : '';
    if (!parentId) return '';
    if (parentKey !== 'topParentId') {
      params.delete(parentKey);
      params.set('topParentId', parentId);
    }
    params.delete('noctraNav');
    params.delete('noctraBridge');
    return `${match[1]}?${params.toString()}`;
  }

  function libraryHashFromLink(link) {
    const href = link?.getAttribute?.('href') || link?.href || '';
    if (!href) return '';
    let candidate = href;
    try {
      const parsed = new URL(href, location.href);
      candidate = parsed.hash || `${parsed.pathname}${parsed.search}`;
    } catch {}
    if (!candidate.startsWith('#')) {
      const routeIndex = candidate.search(/(?:movies|tv)(?:\.html)?(?:\?|$)/i);
      if (routeIndex >= 0) candidate = `#/${candidate.slice(routeIndex)}`;
    }
    return canonicalLibraryHash(candidate);
  }

  function libraryHashWithNonce(value) {
    const route = canonicalLibraryHash(value);
    if (!route) return '';
    const separator = route.includes('?') ? '&' : '?';
    libraryNavigationSequence += 1;
    return `${route}${separator}noctraNav=${Date.now()}-${libraryNavigationSequence}`;
  }

  function activeLibraryPage() {
    const pages = [...document.querySelectorAll(
      '.mainAnimatedPage:not(.hide), .page:not(.hide), [data-role="page"]:not(.hide)'
    )].filter(page => page.querySelector('.itemsContainer, .alphaPicker'));
    return pages.at(-1) || null;
  }

  function libraryPageStatus() {
    const page = activeLibraryPage();
    if (!page) return 'missing';
    if (page.querySelector(
      '.itemsContainer .card, .itemsContainer .listItem, .itemsContainer [data-id], .card[data-id]'
    )) return 'ready';
    const emptyMessage = [...page.querySelectorAll('.noItemsMessage, .emptyMessage')].find(message => (
      !message.classList.contains('hide')
      && getComputedStyle(message).display !== 'none'
    ));
    if (emptyMessage) return 'ready';
    const loader = [...page.querySelectorAll(
      '.docspinner, .progressring, .loading, [aria-busy="true"]'
    )].find(element => (
      !element.classList.contains('hide')
      && getComputedStyle(element).display !== 'none'
    ));
    if (loader) return 'loading';
    return page.querySelector('.itemsContainer, .alphaPicker') ? 'empty' : 'missing';
  }

  function clearLibraryRecovery() {
    window.clearTimeout(libraryRecoveryTimer);
    libraryRecoveryTimer = null;
    libraryRecovery.route = '';
    libraryRecovery.attempt = 0;
    libraryRecovery.startedAt = 0;
    libraryBridgeTarget = '';
  }

  function scheduleLibraryRecovery(route, reset = false, delay = 720) {
    const canonical = canonicalLibraryHash(route);
    if (!canonical) return;
    if (reset || libraryRecovery.route !== canonical) {
      libraryRecovery.route = canonical;
      libraryRecovery.attempt = 0;
      libraryRecovery.startedAt = Date.now();
    }
    window.clearTimeout(libraryRecoveryTimer);
    libraryRecoveryTimer = window.setTimeout(() => {
      if (canonicalLibraryHash(location.hash) !== canonical) return;
      const status = libraryPageStatus();
      if (status === 'ready') {
        clearLibraryRecovery();
        return;
      }
      if (status === 'loading' && Date.now() - libraryRecovery.startedAt < 6500) {
        scheduleLibraryRecovery(canonical, false, 650);
        return;
      }
      if (libraryRecovery.attempt === 0) {
        libraryRecovery.attempt = 1;
        libraryRecovery.startedAt = Date.now();
        location.hash = libraryHashWithNonce(canonical);
        scheduleLibraryRecovery(canonical, false, 1050);
        return;
      }
      if (libraryRecovery.attempt === 1) {
        libraryRecovery.attempt = 2;
        libraryBridgeTarget = canonical;
        location.hash = `#/home.html?noctraBridge=${Date.now()}`;
        window.setTimeout(() => {
          if (!libraryBridgeTarget) return;
          const target = libraryBridgeTarget;
          libraryBridgeTarget = '';
          location.hash = libraryHashWithNonce(target);
          scheduleLibraryRecovery(target, false, 1200);
        }, 90);
        return;
      }
      toast('La médiathèque tarde à répondre. Réessaie dans quelques secondes.');
      clearLibraryRecovery();
    }, delay);
  }

  function navigateToLibrary(route) {
    const canonical = canonicalLibraryHash(route);
    if (!canonical) return;
    closePanel();
    const target = libraryHashWithNonce(canonical);
    location.hash = target;
    scheduleLibraryRecovery(canonical, true);
  }

  function chooseBalancedLibraryColumns(cardCount, maximumColumns) {
    const count = Math.max(0, Number(cardCount) || 0);
    const maximum = Math.max(1, Math.min(count || 1, Number(maximumColumns) || 1));
    if (count <= maximum || count < 3) return maximum;

    /* On conserve la grille la plus dense possible. Elle ne perd une colonne
       que lorsque la dernière rangée contiendrait exactement une affiche. */
    const minimum = Math.max(2, maximum - 4);
    for (let columns = maximum; columns >= minimum; columns -= 1) {
      if (count % columns !== 1) return columns;
    }
    return maximum;
  }

  function visiblePortraitCards(container) {
    return [...container.children].filter(element => (
      element.matches?.('.card.portraitCard')
      && element.getClientRects().length
      && getComputedStyle(element).display !== 'none'
    ));
  }


  function repairMobileLibraryLayout() {
    const mobile = (window.innerWidth || document.documentElement.clientWidth || 0) <= 760;
    const containers = document.querySelectorAll(
      '.libraryPage:not(.homePage):not(.itemDetailPage):not(.itemDetailsPage) .itemsContainer'
    );
    containers.forEach(container => {
      if (!mobile) {
        container.style.removeProperty('display');
        container.style.removeProperty('flex-wrap');
        container.style.removeProperty('gap');
        container.style.removeProperty('align-items');
        container.style.removeProperty('align-content');
        return;
      }
      if (!container.getClientRects().length) return;
      const cards = [...container.querySelectorAll('.card')];
      if (!cards.length) return;
      const hasVisibleCard = cards.some(card => {
        const style = getComputedStyle(card);
        const rect = card.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > .02
          && rect.width > 16
          && rect.height > 16;
      });
      if (hasVisibleCard) return;
      container.style.display = 'flex';
      container.style.flexWrap = 'wrap';
      container.style.alignItems = 'flex-start';
      container.style.alignContent = 'flex-start';
      container.style.gap = '14px 10px';
      cards.forEach(card => {
        card.style.display = 'block';
        card.style.visibility = 'visible';
        card.style.opacity = '1';
        if (card.classList.contains('portraitCard') || card.classList.contains('squareCard')) {
          card.style.flex = '0 0 calc(50% - 5px)';
          card.style.width = 'calc(50% - 5px)';
          card.style.maxWidth = 'calc(50% - 5px)';
        } else {
          card.style.flex = '0 0 100%';
          card.style.width = '100%';
          card.style.maxWidth = '100%';
        }
      });
    });
  }

  function balanceLibraryGrids() {
    window.cancelAnimationFrame(libraryGridFrame);
    libraryGridFrame = window.requestAnimationFrame(() => {
      const desktop = window.innerWidth >= 1100;
      const containers = document.querySelectorAll(
        '.libraryPage:not(.homePage):not(.itemDetailPage):not(.itemDetailsPage) .itemsContainer'
      );
      containers.forEach(container => {
        if (!desktop || !container.getClientRects().length) {
          container.style.removeProperty('--noctra-library-grid');
          return;
        }
        const cards = visiblePortraitCards(container);
        if (!cards.length) {
          container.style.removeProperty('--noctra-library-grid');
          return;
        }
        const style = getComputedStyle(container);
        const gap = Number.parseFloat(style.columnGap) || 18;
        const width = container.getBoundingClientRect().width;
        const minimumCardWidth = document.documentElement.classList.contains('noctra-ultrawide') ? 118 : 145;
        const maximumColumns = Math.max(1, Math.min(
          cards.length,
          Math.floor((width + gap) / (minimumCardWidth + gap))
        ));
        const columns = chooseBalancedLibraryColumns(cards.length, maximumColumns);
        container.style.setProperty(
          '--noctra-library-grid',
          `repeat(${columns}, minmax(0, 1fr))`
        );
        container.dataset.noctraLibraryColumns = String(columns);
      });
    });
  }

  function mediaItemIdFromElement(element) {
    if (!element?.closest) return '';
    const owners = [];
    const addOwner = owner => {
      if (owner && !owners.includes(owner)) owners.push(owner);
    };
    addOwner(element);
    [
      '[data-id]',
      '[data-itemid]',
      '[data-item-id]',
      '[data-media-id]',
      '.card',
      '.listItem',
      '.itemListItem',
      '.itemActionContainer'
    ].forEach(selector => addOwner(element.closest(selector)));

    const idFromOwner = owner => {
      const candidates = [
        owner.dataset?.id,
        owner.dataset?.itemId,
        owner.dataset?.itemid,
        owner.dataset?.mediaId,
        owner.getAttribute?.('data-item-id'),
        owner.getAttribute?.('data-itemid'),
        owner.getAttribute?.('data-media-id')
      ];
      const directId = candidates.find(validMediaItemId);
      if (directId) return directId;

      const linkedElements = [
        ...(owner.matches?.('a[href*="id="]') ? [owner] : []),
        ...[...(owner.querySelectorAll?.('a[href*="id="]') || [])]
      ];
      for (const link of linkedElements) {
        const href = link.getAttribute?.('href') || link.href || '';
        const match = href.match(/[?&]id=([a-f0-9]{32})(?:&|#|$)/i);
        if (match) return match[1];
      }

      if (owner.matches?.('.card, .listItem, .itemListItem, .itemActionContainer')) {
        const nested = owner.querySelector?.('[data-id], [data-itemid], [data-item-id], [data-media-id]');
        if (nested && nested !== owner) {
          const nestedCandidates = [
            nested.dataset?.id,
            nested.dataset?.itemId,
            nested.dataset?.itemid,
            nested.dataset?.mediaId,
            nested.getAttribute?.('data-item-id'),
            nested.getAttribute?.('data-itemid'),
            nested.getAttribute?.('data-media-id')
          ];
          const nestedId = nestedCandidates.find(validMediaItemId);
          if (nestedId) return nestedId;
        }
      }
      return '';
    };

    for (const owner of owners) {
      const itemId = idFromOwner(owner);
      if (itemId) return itemId;
    }
    return '';
  }

  function routeDetailItemId() {
    const query = String(location.hash || '').split('?')[1] || '';
    const routeId = new URLSearchParams(query).get('id');
    if (validMediaItemId(routeId)) return routeId;
    const page = document.querySelector('.itemDetailPage:not(.hide), .itemDetailsPage:not(.hide)');
    const candidates = [
      page?.dataset?.id,
      page?.dataset?.itemId,
      page?.querySelector?.('[data-id]')?.dataset?.id,
      page?.querySelector?.('[data-itemid]')?.dataset?.itemid
    ];
    return candidates.find(validMediaItemId) || '';
  }

  function likelyMediaMenuButton(target) {
    const button = target?.closest?.('button, [role="button"], .itemAction');
    if (!button || button.closest('#noctra-panel, .actionSheet, .dialog, [role="dialog"]')) return false;
    if (button.matches('.btnMore, .btnMoreCommands, [data-action="more"], [data-action="menu"]')) return true;
    const label = normalizedText([
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.textContent,
      button.querySelector('.material-icons')?.textContent
    ].filter(Boolean).join(' '));
    return /(?:^|\s)(?:more vert|more horiz|more|plus|menu|options|actions)(?:\s|$)/.test(label);
  }

  function rememberMediaContext(target, allowDetailFallback = false) {
    const directItemId = mediaItemIdFromElement(target);
    const itemId = directItemId || (
      allowDetailFallback && likelyMediaMenuButton(target) ? routeDetailItemId() : ''
    );
    if (!itemId) return '';
    lastMediaContext = {
      itemId,
      capturedAt: Date.now()
    };
    return itemId;
  }

  function currentDetailItemId(origin = null) {
    const originId = mediaItemIdFromElement(origin);
    if (originId) return originId;
    if (
      validMediaItemId(lastMediaContext.itemId)
      && Date.now() - lastMediaContext.capturedAt < 120000
    ) {
      return lastMediaContext.itemId;
    }
    return routeDetailItemId();
  }

  function identifyError(dialog, message) {
    dialog.querySelector('.noctra-identify-error')?.remove();
    const target = dialog.querySelector('.popupIdentifyForm:not(.hide), .identificationSearchResults:not(.hide), .identifyOptionsForm:not(.hide)')
      || dialog.querySelector('.dialogContentInner');
    target?.insertAdjacentHTML(
      'afterbegin',
      `<div class="noctra-identify-error" role="alert">${escapeHtml(message)}</div>`
    );
  }

  function identifySearchInfo(form) {
    const searchInfo = { ProviderIds: {} };
    form.querySelectorAll('.identifyField').forEach(field => {
      const value = String(field.value || '').trim();
      if (!value) return;
      searchInfo[field.dataset.lookup] = field.type === 'number' ? Number(value) : value;
    });
    form.querySelectorAll('.txtLookupId').forEach(field => {
      const value = String(field.value || '').trim();
      if (value) searchInfo.ProviderIds[field.dataset.providerkey] = value;
    });
    return searchInfo;
  }

  function identifyResultMarkup(result, index, attribute = 'data-noctra-identify-result') {
    const name = result.Name || result.name || 'Résultat sans titre';
    const year = result.ProductionYear || result.productionYear || '';
    const provider = result.SearchProviderName || result.ProviderName || '';
    const image = result.ImageUrl || result.imageUrl || '';
    return `
      <button class="noctra-identify-result" type="button" ${attribute}="${index}">
        <span class="noctra-identify-result__visual">
          ${image
            ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">`
            : `<span>${escapeHtml(String(name).slice(0, 1).toUpperCase())}</span>`}
        </span>
        <span class="noctra-identify-result__copy">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml([year, provider].filter(Boolean).join(' · ') || 'Source distante')}</small>
        </span>
        <i>Choisir</i>
      </button>`;
  }

  async function searchIdentification(dialog, form, itemId) {
    const submit = form.querySelector('[type="submit"]');
    dialog.querySelector('.noctra-identify-error')?.remove();
    dialog.dataset.noctraIdentifyManaged = 'true';
    if (submit) {
      submit.disabled = true;
      submit.dataset.busy = 'true';
    }
    try {
      const response = await api('/api/jellyfin/identify/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId,
          searchInfo: identifySearchInfo(form)
        })
      });
      const results = Array.isArray(response.results) ? response.results : [];
      identifyDialogState.set(dialog, { itemId, results, selected: null });
      form.classList.add('hide');
      const section = dialog.querySelector('.identificationSearchResults');
      const list = dialog.querySelector('.identificationSearchResultList');
      dialog.querySelector('.identifyOptionsForm')?.classList.add('hide');
      dialog.querySelector('.dialogContentInner')?.classList.remove('dialog-content-centered');
      section?.classList.remove('hide');
      if (section) {
        section.querySelector('.noctra-identify-toolbar')?.remove();
        section.querySelector('h1')?.insertAdjacentHTML(
          'afterend',
          `<div class="noctra-identify-toolbar">
            <span>${results.length} résultat${results.length > 1 ? 's' : ''}</span>
            <button type="button" data-noctra-identify-back>Modifier la recherche</button>
          </div>`
        );
      }
      if (list) {
        list.className = 'identificationSearchResultList noctra-identify-results';
        list.innerHTML = results.length
          ? results.map(identifyResultMarkup).join('')
          : '<div class="noctra-identify-empty">Aucun résultat. Modifie le titre, l’année ou un identifiant externe.</div>';
      }
    } catch (error) {
      identifyError(dialog, error.message);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.dataset.busy = 'false';
      }
    }
  }

  function selectIdentificationResult(button) {
    const dialog = button.closest('.identifyDialog');
    const state = dialog && identifyDialogState.get(dialog);
    const selected = state?.results?.[Number(button.dataset.noctraIdentifyResult)];
    if (!dialog || !selected) return;
    state.selected = selected;
    dialog.querySelector('.identificationSearchResults')?.classList.add('hide');
    const options = dialog.querySelector('.identifyOptionsForm');
    options?.classList.remove('hide');
    dialog.querySelector('.dialogContentInner')?.classList.add('dialog-content-centered');
    const preview = dialog.querySelector('.selectedSearchResult');
    if (preview) preview.innerHTML = identifyResultMarkup(selected, 0)
      .replace('data-noctra-identify-result="0"', 'tabindex="-1" aria-disabled="true"');
    const replaceImages = dialog.querySelector('#chkIdentifyReplaceImages');
    if (replaceImages) replaceImages.checked = true;
  }

  async function applyIdentification(dialog, form) {
    const state = identifyDialogState.get(dialog);
    if (!state?.selected) {
      identifyError(dialog, 'Choisis d’abord un résultat.');
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.dataset.busy = 'true';
      submit.innerHTML = '<span>Recherche en cours…</span>';
    }
    try {
      await api('/api/jellyfin/identify/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: state.itemId,
          result: state.selected,
          replaceAllImages: Boolean(dialog.querySelector('#chkIdentifyReplaceImages')?.checked)
        })
      });
      toast('Identification appliquée. La fiche est en cours d’actualisation.');
      dialog.querySelector('.btnCancel')?.click();
      const currentHash = location.hash;
      window.setTimeout(() => {
        if (location.hash !== currentHash) return;
        const separator = currentHash.includes('?') ? '&' : '?';
        location.hash = `${currentHash}${separator}noctraIdentified=${Date.now()}`;
      }, 120);
    } catch (error) {
      identifyError(dialog, error.message);
      if (submit) {
        submit.disabled = false;
        submit.dataset.busy = 'false';
      }
    }
  }

  const identifyProviderLabels = {
    Tmdb: 'TMDB',
    Tvdb: 'TVDB',
    Imdb: 'IMDb',
    AniDB: 'AniDB',
    AniList: 'AniList',
    Kitsu: 'Kitsu'
  };

  function identifyPanelSearchInfo(form) {
    const data = new FormData(form);
    const providerIds = {};
    form.querySelectorAll('[data-identify-provider]').forEach(field => {
      const value = String(field.value || '').trim();
      if (value) providerIds[field.dataset.identifyProvider] = value;
    });
    const year = Number(data.get('year'));
    return {
      Name: String(data.get('name') || '').trim(),
      ...(Number.isInteger(year) && year >= 1800 && year <= 2200 ? { Year: year } : {}),
      ProviderIds: providerIds
    };
  }

  function identifyPanelProviderFields() {
    if (!identifyPanelState) return '';
    const contextProviders = identifyPanelState.context?.providerIds || {};
    const keys = [...new Set([
      ...Object.keys(contextProviders),
      ...Object.keys(identifyProviderLabels)
    ])];
    return keys.map(key => `
      <label class="noctra-field">
        <span>${escapeHtml(identifyProviderLabels[key] || key)}</span>
        <input type="text" data-identify-provider="${escapeHtml(key)}"
          value="${escapeHtml(identifyPanelState.searchInfo?.ProviderIds?.[key] || '')}"
          autocomplete="off" spellcheck="false">
      </label>`).join('');
  }

  function renderIdentifyPanelSearch(error = '') {
    if (!identifyPanelState) return;
    const context = identifyPanelState.context;
    const proposedName = identifyPanelState.searchInfo?.Name || context.name || 'Média sans titre';
    const path = context.path
      ? `<p class="noctra-identify-panel-path" title="${escapeHtml(context.path)}">${escapeHtml(context.path)}</p>`
      : '';
    const suggestion = context.metadataMismatch
      ? `<div class="noctra-identify-suggestion">
          <strong>Correction proposée depuis le fichier</strong>
          <span>Les anciennes métadonnées semblent correspondre à un autre contenu. Noctra utilise le nom du dossier ou du fichier et ignore leurs anciens identifiants pour cette recherche.</span>
        </div>`
      : '';
    setPanelBody(`
      <div class="noctra-identify-panel">
        <div class="noctra-identify-panel-intro">
          <div>
            <p class="noctra-eyebrow">RECHERCHE DE MÉTADONNÉES</p>
            <h3>${escapeHtml(proposedName)}</h3>
            <p>Modifie le titre, l’année ou indique un identifiant externe pour cibler précisément le bon contenu.</p>
            ${path}
          </div>
          <span class="noctra-identify-panel-type">${escapeHtml(context.type || 'Média')}</span>
        </div>
        ${suggestion}
        ${error ? `<div class="noctra-error" role="alert">${escapeHtml(error)}</div>` : ''}
        <form id="noctra-identify-panel-search" class="noctra-identify-panel-form">
          <div class="noctra-identify-panel-main-fields">
            <label class="noctra-field">
              <span>Nom</span>
              <input name="name" type="text" value="${escapeHtml(identifyPanelState.searchInfo?.Name || '')}"
                autocomplete="off" required autofocus>
            </label>
            <label class="noctra-field">
              <span>Année</span>
              <input name="year" type="number" min="1800" max="2200"
                value="${escapeHtml(identifyPanelState.searchInfo?.Year || '')}">
            </label>
          </div>
          <details class="noctra-identify-panel-providers">
            <summary>Identifiants externes <span>Optionnel</span></summary>
            <div>${identifyPanelProviderFields()}</div>
          </details>
          <div class="noctra-identify-panel-actions">
            <button class="noctra-button" type="button" data-noctra-close>Annuler</button>
            <button class="noctra-button noctra-button--primary" type="submit">
              ${icons.search}<span>Rechercher</span>
            </button>
          </div>
        </form>
      </div>`);
    document.querySelector('#noctra-identify-panel-search [name="name"]')?.focus();
  }

  function renderIdentifyPanelResults() {
    if (!identifyPanelState) return;
    const results = identifyPanelState.results || [];
    setPanelBody(`
      <div class="noctra-identify-panel">
        <div class="noctra-identify-panel-toolbar">
          <div>
            <p class="noctra-eyebrow">RÉSULTATS DISTANTS</p>
            <h3>${results.length} résultat${results.length > 1 ? 's' : ''}</h3>
          </div>
          <button class="noctra-button" type="button" data-noctra-panel-identify-back>
            Modifier la recherche
          </button>
        </div>
        <div class="noctra-identify-results">
          ${results.length
            ? results.map((result, index) => (
              identifyResultMarkup(result, index, 'data-noctra-panel-identify-result')
            )).join('')
            : '<div class="noctra-identify-empty">Aucun résultat. Modifie le titre, l’année ou ajoute un identifiant externe.</div>'}
        </div>
      </div>`);
  }

  function renderIdentifyPanelChoice() {
    if (!identifyPanelState?.selected) return;
    const selected = identifyPanelState.selected;
    const name = selected.Name || selected.name || 'Résultat sans titre';
    const originalTitle = selected.OriginalTitle
      && selected.OriginalTitle !== name
      ? selected.OriginalTitle
      : '';
    const year = selected.ProductionYear || selected.productionYear || '';
    const provider = selected.SearchProviderName || selected.ProviderName || 'Source distante';
    const providerId = selected.ProviderIds?.Tmdb
      ? `TMDB ${selected.ProviderIds.Tmdb}`
      : Object.entries(selected.ProviderIds || {})
        .map(([key, value]) => `${key} ${value}`)
        .at(0) || '';
    const image = selected.ImageUrl || selected.imageUrl || '';
    const overview = selected.Overview || selected.overview || '';
    setPanelBody(`
      <div class="noctra-identify-panel noctra-identify-panel--confirmation">
        <div class="noctra-identify-panel-toolbar">
          <div>
            <p class="noctra-eyebrow">CONFIRMATION</p>
            <h3>Tout est prêt</h3>
            <p>Vérifie le média sélectionné avant de confier la mise à jour à Jellyfin.</p>
          </div>
          <button class="noctra-button noctra-identify-back-results" type="button"
            data-noctra-panel-identify-results-back>
            <span aria-hidden="true">←</span> Modifier le choix
          </button>
        </div>
        <div class="noctra-identify-panel-selection">
          <article class="noctra-identify-choice">
            <div class="noctra-identify-choice__visual">
              ${image
                ? `<img src="${escapeHtml(image)}" alt="" loading="eager">`
                : `<span>${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`}
            </div>
            <div class="noctra-identify-choice__content">
              <div class="noctra-identify-choice__status">
                <i aria-hidden="true">✓</i>
                <span>Correspondance sélectionnée</span>
              </div>
              <h4>${escapeHtml(name)}</h4>
              ${originalTitle ? `<p class="noctra-identify-choice__original">${escapeHtml(originalTitle)}</p>` : ''}
              <div class="noctra-identify-choice__meta">
                ${year ? `<span>${escapeHtml(year)}</span>` : ''}
                <span>${escapeHtml(provider)}</span>
                ${providerId ? `<span>${escapeHtml(providerId)}</span>` : ''}
              </div>
              ${overview
                ? `<p class="noctra-identify-choice__overview">${escapeHtml(overview)}</p>`
                : '<p class="noctra-identify-choice__overview">Les métadonnées, les visuels et les identifiants de ce résultat seront associés au fichier.</p>'}
            </div>
          </article>
          <form id="noctra-identify-panel-apply">
            <div class="noctra-identify-apply-card">
              <div class="noctra-identify-apply-card__copy">
                <strong>Mise à jour en arrière-plan</strong>
                <small>Noctra fermera ce panneau immédiatement, puis actualisera la fiche lorsque Jellyfin aura terminé.</small>
              </div>
              <label class="noctra-identify-panel-check">
                <input name="replaceImages" type="checkbox" checked>
                <span>
                  <strong>Renouveler tous les visuels</strong>
                  <small>Affiche, bannière, logo et images associées.</small>
                </span>
              </label>
            </div>
            <div class="noctra-identify-panel-actions noctra-identify-panel-actions--confirmation">
              <button class="noctra-button" type="button" data-noctra-panel-identify-results-back>Retour</button>
              <button class="noctra-button noctra-button--primary" type="submit">
                <span>Confirmer l’identification</span>
              </button>
            </div>
          </form>
        </div>
      </div>`);
  }

  async function openIdentifyPanel(itemId) {
    panel('Identifier le média', 'NOCTRA · JELLYFIN', `
      <div class="noctra-loading"><i></i><span>Lecture des métadonnées actuelles…</span></div>
    `, { wide: true });
    try {
      const context = await api(
        `/api/jellyfin/identify/context?itemId=${encodeURIComponent(itemId)}`,
        { timeoutMs: 15_000 }
      );
      identifyPanelState = {
        itemId,
        context,
        searchInfo: {
          Name: context.suggestedName || context.name || context.originalTitle || '',
          ...(context.suggestedYear || context.year
            ? { Year: context.suggestedYear || context.year }
            : {}),
          ProviderIds: {
            ...(context.recommendedProviderIds ?? context.providerIds ?? {})
          }
        },
        results: [],
        selected: null
      };
      renderIdentifyPanelSearch();
    } catch (error) {
      showError(error);
    }
  }

  async function searchIdentifyPanel(form) {
    if (!identifyPanelState || identifyPanelState.searching) return;
    const state = identifyPanelState;
    state.searching = true;
    state.searchInfo = identifyPanelSearchInfo(form);
    const submit = form.querySelector('[type="submit"]');
    const submitLabel = submit?.querySelector('span');
    if (submit) {
      submit.disabled = true;
      submit.dataset.busy = 'true';
    }
    if (submitLabel) submitLabel.textContent = 'Recherche en cours…';
    try {
      const response = await api('/api/jellyfin/identify/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          itemId: state.itemId,
          searchInfo: state.searchInfo
        }),
        timeoutMs: 25_000
      });
      if (identifyPanelState !== state) return;
      identifyPanelState.results = Array.isArray(response.results) ? response.results : [];
      identifyPanelState.selected = null;
      renderIdentifyPanelResults();
    } catch (error) {
      if (identifyPanelState === state) renderIdentifyPanelSearch(error.message);
    } finally {
      state.searching = false;
    }
  }

  async function applyIdentifyPanel(form) {
    if (!identifyPanelState?.selected || identifyPanelState.applying) return;
    const state = identifyPanelState;
    state.applying = true;
    const snapshot = {
      itemId: state.itemId,
      result: state.selected,
      replaceAllImages: Boolean(form.elements.replaceImages?.checked)
    };
    const submit = form.querySelector('[type="submit"]');
    const submitLabel = submit?.querySelector('span');
    if (submit) {
      submit.disabled = true;
      submit.dataset.busy = 'true';
    }
    if (submitLabel) submitLabel.textContent = 'Transmission à Jellyfin…';
    try {
      const job = await api('/api/jellyfin/identify/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
        timeoutMs: 10_000
      });
      const currentHash = location.hash;
      closePanel();
      toast('Identification lancée. Jellyfin travaille en arrière-plan.');
      watchIdentificationJob(job.jobId, currentHash);
    } catch (error) {
      const target = document.querySelector('.noctra-identify-panel-selection');
      target?.querySelector('.noctra-error')?.remove();
      target?.insertAdjacentHTML(
        'afterbegin',
        `<div class="noctra-error" role="alert">${escapeHtml(error.message)}</div>`
      );
      state.applying = false;
      if (submit) {
        submit.disabled = false;
        submit.dataset.busy = 'false';
      }
      if (submitLabel) submitLabel.textContent = 'Confirmer l’identification';
    }
  }

  function refreshIdentifiedRoute(expectedHash) {
    if (location.hash !== expectedHash) return;
    const [route, query = ''] = expectedHash.split('?');
    const params = new URLSearchParams(query);
    params.set('noctraIdentified', String(Date.now()));
    location.hash = `${route}?${params.toString()}`;
  }

  async function watchIdentificationJob(jobId, expectedHash, attempt = 0) {
    if (!jobId || attempt > 60) {
      identificationJobTimers.delete(jobId);
      return;
    }
    try {
      const job = await api(
        `/api/jellyfin/identify/apply-status?jobId=${encodeURIComponent(jobId)}`,
        { timeoutMs: 8_000 }
      );
      if (job.status === 'completed') {
        identificationJobTimers.delete(jobId);
        toast('Identification appliquée. La fiche vient d’être actualisée.');
        refreshIdentifiedRoute(expectedHash);
        return;
      }
      if (job.status === 'failed') {
        identificationJobTimers.delete(jobId);
        toast(job.message || 'Jellyfin n’a pas confirmé la modification.');
        return;
      }
    } catch {
      // Une perte de connexion temporaire ne doit pas recréer un faux échec.
    }
    const timer = window.setTimeout(
      () => watchIdentificationJob(jobId, expectedHash, attempt + 1),
      2_500
    );
    identificationJobTimers.set(jobId, timer);
  }

  function identifyMenuTrigger(target) {
    const candidate = target?.closest?.(
      '.actionSheetMenuItem, [role="menuitem"], .listItem, button, a'
    );
    if (!candidate || candidate.closest('#noctra-panel')) return null;
    const labels = [
      candidate.textContent,
      candidate.getAttribute('aria-label'),
      candidate.getAttribute('title'),
      candidate.querySelector('.listItemBodyText, .actionSheetMenuItemText, .button-text')?.textContent,
      ...[...candidate.querySelectorAll('span, div')]
        .filter(element => (
          !element.children.length
          && !element.classList.contains('material-icons')
          && element.getAttribute('aria-hidden') !== 'true'
        ))
        .map(element => element.textContent)
    ].map(normalizedText).filter(Boolean);
    return labels.some(label => label === 'identifier' || label === 'identify')
      ? candidate
      : null;
  }

  function dismissNativeEditorMenu(trigger) {
    const dialog = trigger.closest('.dialog, .actionSheet, [role="dialog"]');
    const container = dialog?.dialogContainer
      || dialog?.closest('.dialogContainer, .focuscontainer')
      || null;
    const backdrop = dialog?.backdrop
      || (container?.previousElementSibling?.classList.contains('dialogBackdrop')
        ? container.previousElementSibling
        : null);
    const targets = [...new Set([dialog, container, backdrop].filter(Boolean))];

    targets.forEach(element => {
      element.classList.add('noctra-native-menu-dismissed');
      element.setAttribute('aria-hidden', 'true');
    });

    if (dialog) {
      // Jellyfin écoute cet événement interne pour libérer correctement son
      // backdrop, son verrou de défilement et son piège de focus.
      dialog.dispatchEvent(new CustomEvent('_close', {
        bubbles: false,
        cancelable: false
      }));
    } else {
      const cancel = trigger.closest('.dialogContainer')
        ?.querySelector('.btnCancel, [data-action="cancel"]');
      if (cancel && cancel !== trigger) cancel.click();
    }

    window.setTimeout(() => {
      targets.forEach(element => {
        element.classList.remove('noctra-native-menu-dismissed');
        element.removeAttribute('aria-hidden');
      });
    }, 520);
  }

  function normalizedText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function positionHeaderActionMenu(menu, kind) {
    const selector = kind === 'syncplay' ? '.headerTop .headerSyncButton' : '.headerTop .headerCastButton';
    const trigger = [...document.querySelectorAll(selector)].find(button => button.getClientRects().length) || null;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const safe = viewportWidth <= 760 ? 10 : 14;
    const menuWidth = Math.min(menuRect.width || 286, viewportWidth - safe * 2);
    const left = Math.max(safe, Math.min(viewportWidth - menuWidth - safe, triggerRect.right - menuWidth));
    const preferredTop = Math.max(safe, triggerRect.bottom + 8);
    const top = viewportHeight - preferredTop - safe >= 120 ? preferredTop : safe;
    menu.style.setProperty('--noctra-header-menu-left', `${Math.round(left)}px`);
    menu.style.setProperty('--noctra-header-menu-top', `${Math.round(top)}px`);
    menu.style.setProperty('--noctra-header-menu-max-height', `${Math.max(120, Math.floor(viewportHeight - top - safe))}px`);
  }

  function syncHeaderActionMenus() {
    const intent = headerActionMenuIntentUntil > Date.now() ? headerActionMenuIntent : '';
    const menus = document.querySelectorAll(
      '.actionSheet.actionsheet-not-fullscreen, .dialog.actionsheet-not-fullscreen, [role="dialog"].actionsheet-not-fullscreen, #app-sync-play-menu .MuiPaper-root'
    );
    menus.forEach(menu => {
      const label = normalizedText(menu.textContent);
      const detected = /jouer sur|play on|rejoindre un groupe|join a group|syncplay/.test(label)
        ? (label.includes('sync') || label.includes('groupe') || label.includes('group') ? 'syncplay' : 'cast')
        : '';
      const kind = detected || (menu.getClientRects().length ? intent : '');
      if (kind) menu.dataset.noctraHeaderMenu = kind;
      else delete menu.dataset.noctraHeaderMenu;
      repairHeaderMenuIcons(menu, kind);
      if (kind) {
        positionHeaderActionMenu(menu, kind);
        window.requestAnimationFrame(() => positionHeaderActionMenu(menu, kind));
      }
    });
  }

  function cssBackgroundUrl(value) {
    const match = String(value || '').match(/url\((["']?)(.+?)\1\)/i);
    return match?.[2] || '';
  }

  function elementImageSource(element) {
    if (!element) return '';
    const direct = element.currentSrc
      || element.src
      || element.getAttribute?.('src')
      || element.getAttribute?.('data-src')
      || element.getAttribute?.('data-original')
      || element.getAttribute?.('data-imageurl')
      || element.getAttribute?.('data-image-url')
      || '';
    if (direct) return direct;
    const inlineBackground = cssBackgroundUrl(element.style?.backgroundImage);
    if (inlineBackground) return inlineBackground;
    try {
      return cssBackgroundUrl(window.getComputedStyle(element).backgroundImage);
    } catch {
      return '';
    }
  }

  function applyHomeLibraryCardImage(card, visual) {
    if (!card || !visual) return true;
    const candidates = [
      ...visual.querySelectorAll('img, picture source, .cardImage, [data-src], [data-original], [data-imageurl], [data-image-url]'),
      visual,
      card.querySelector('.cardImage'),
      card.querySelector('.cardPadder'),
      card
    ].filter(Boolean);
    const src = candidates.map(elementImageSource).find(Boolean) || '';
    candidates.forEach(element => {
      if (!element?.style) return;
      if (element.tagName === 'IMG') {
        element.loading = 'eager';
        element.decoding = 'async';
        const deferredSrc = element.getAttribute('data-src') || element.getAttribute('data-original');
        if (!element.getAttribute('src') && deferredSrc) element.setAttribute('src', deferredSrc);
      }
      element.style.opacity = '1';
      element.style.visibility = 'visible';
      element.removeAttribute?.('aria-hidden');
    });
    if (!src) {
      delete visual.dataset.noctraLibraryImage;
      return false;
    }
    const escaped = src.replace(/"/g, '%22');
    visual.dataset.noctraLibraryImage = 'true';
    if (!visual.style.backgroundImage || !visual.style.backgroundImage.includes(escaped)) {
      visual.style.setProperty('background-image', `url("${escaped}")`, 'important');
    }
    visual.style.setProperty('background-size', 'cover', 'important');
    visual.style.setProperty('background-position', 'center center', 'important');
    visual.style.setProperty('background-repeat', 'no-repeat', 'important');
    return true;
  }

  let homeLibraryCatalogPromise = null;

  function homeLibraryKind(value) {
    const label = normalizedText(value);
    if (/film.*anim|anim.*film/.test(label)) return 'animation';
    if (/anime|japan|manga/.test(label)) return 'anime';
    if (/serie|show|television|tv/.test(label)) return 'series';
    if (/film|movie|cinema/.test(label)) return 'movies';
    return label;
  }

  function watchHomeLibraryImages(mediaSection) {
    if (!mediaSection?.isConnected || homeLibraryObserverTarget === mediaSection) return;
    homeLibraryObserver?.disconnect();
    homeLibraryObserverTarget = mediaSection;
    homeLibraryObserver = new MutationObserver(mutations => {
      const rebuilt = mutations.some(mutation => mutation.type === 'childList'
        && (mutation.addedNodes.length || mutation.removedNodes.length));
      if (!rebuilt || !mediaSection.isConnected) return;
      window.clearTimeout(homeLibraryRepairTimer);
      homeLibraryRepairTimer = window.setTimeout(() => {
        void hydrateHomeLibraryImages(mediaSection);
      }, 60);
    });
    homeLibraryObserver.observe(mediaSection, { childList: true, subtree: true });
  }

  async function hydrateHomeLibraryImages(mediaSection) {
    if (!mediaSection?.isConnected) return 0;
    if (!homeLibraryCatalogPromise) {
      homeLibraryCatalogPromise = cachedApi('/api/libraries', 45_000)
        .catch(error => {
          homeLibraryCatalogPromise = null;
          throw error;
        });
    }
    try {
      const catalog = await homeLibraryCatalogPromise;
      if (!mediaSection.isConnected) return 0;
      const images = new Map(Object.entries(catalog || {})
        .filter(([, library]) => library?.image)
        .map(([label, library]) => [homeLibraryKind(label), library.image]));
      let hydrated = 0;
      mediaSection.querySelectorAll('.card').forEach(card => {
        const visual = card.querySelector('.cardImageContainer');
        const kind = homeLibraryKind(homeLibraryCardLabel(card));
        const source = String(images.get(kind) || '');
        const image = source ? appPath(source) : '';
        if (!visual || !image) return;
        const escaped = String(image).replace(/"/g, '%22');
        let cover = visual.querySelector(':scope > .noctra-home-library-cover[data-noctra-library-cover]');
        if (!cover) {
          cover = document.createElement('span');
          cover.className = 'noctra-home-library-cover';
          cover.dataset.noctraLibraryCover = 'true';
          cover.setAttribute('aria-hidden', 'true');
          visual.appendChild(cover);
        }
        let fallbackImage = cover.querySelector(':scope > img[data-noctra-library-fallback]');
        if (!fallbackImage) {
          fallbackImage = document.createElement('img');
          fallbackImage.className = 'noctra-home-library-fallback';
          fallbackImage.dataset.noctraLibraryFallback = 'true';
          fallbackImage.alt = '';
          fallbackImage.loading = 'eager';
          fallbackImage.decoding = 'async';
          fallbackImage.draggable = false;
          cover.appendChild(fallbackImage);
          fallbackImage.addEventListener('load', () => {
            if (!fallbackImage.isConnected || fallbackImage.naturalWidth < 1) return;
            cover.dataset.noctraLibraryLoaded = 'true';
            visual.dataset.noctraLibraryImageReady = 'true';
          });
          fallbackImage.addEventListener('error', () => {
            delete cover.dataset.noctraLibraryLoaded;
            delete visual.dataset.noctraLibraryImageReady;
            fallbackImage.removeAttribute('src');
            window.clearTimeout(homeLibraryRepairTimer);
            homeLibraryRepairTimer = window.setTimeout(() => {
              homeLibraryCatalogPromise = null;
              void hydrateHomeLibraryImages(mediaSection);
            }, 900);
          });
        }
        fallbackImage.dataset.noctraLibrarySource = source;
        if (fallbackImage.getAttribute('src') !== String(image)) {
          delete cover.dataset.noctraLibraryLoaded;
          delete visual.dataset.noctraLibraryImageReady;
          fallbackImage.setAttribute('src', String(image));
        }
        if (fallbackImage.complete && fallbackImage.naturalWidth > 0) {
          cover.dataset.noctraLibraryLoaded = 'true';
          visual.dataset.noctraLibraryImageReady = 'true';
        }
        // Jellyfin reconstruit parfois les enfants de la carte apres son rendu.
        // La couverture Noctra reste toujours la derniere couche et l'observer
        // la remet en place si ce rendu tardif la retire.
        if (visual.lastElementChild !== cover) visual.appendChild(cover);
        cover.style.setProperty('background-image', `url("${escaped}")`, 'important');
        visual.dataset.noctraLibraryImage = 'true';
        visual.style.setProperty('background-image', `url("${escaped}")`, 'important');
        visual.style.setProperty('background-size', 'cover', 'important');
        visual.style.setProperty('background-position', 'center center', 'important');
        visual.style.setProperty('background-repeat', 'no-repeat', 'important');
        hydrated += 1;
      });
      return hydrated;
    } catch {
      return 0;
    }
  }

  function homeLibraryCardLabel(card) {
    return String(
      card?.querySelector('.cardText-first, .cardText, .innerCardFooter, .cardFooter')?.textContent
      || card?.getAttribute('aria-label')
      || card?.getAttribute('title')
      || ''
    ).replace(/\s+/g, ' ').trim();
  }

  function findHomeLibrarySection(home, sectionTitles) {
    const mediaTitle = sectionTitles.find(title => {
      const text = normalizedText(title.textContent);
      return text === 'mes medias' || text === 'my media' || text.includes('mediatheque');
    });
    if (mediaTitle?.closest('.verticalSection')) return mediaTitle.closest('.verticalSection');

    const expected = /^(?:animes?|films?|films? d.?animations?|series?|shows?|movies?)$/;
    const matchingCards = [...home.querySelectorAll('.verticalSection .card')].filter(card => (
      expected.test(normalizedText(homeLibraryCardLabel(card)))
    ));
    const sections = matchingCards.map(card => card.closest('.verticalSection')).filter(Boolean);
    return sections.find(section => sections.filter(candidate => candidate === section).length >= 2) || null;
  }

  const recentEpisodeRepairs = new WeakSet();
  async function repairRecentEpisodeCards(section) {
    if (recentEpisodeRepairs.has(section) || !window.ApiClient?.getItems) return;
    const cards = [...section.querySelectorAll('.card:is([data-type="Episode" i],[data-type="Season" i])[data-id]')];
    const userId = window.ApiClient.getCurrentUserId?.();
    const tools = homeCarouselCardTools();
    if (!cards.length || !userId || !tools?.cards?.getCardsHtml) return;
    recentEpisodeRepairs.add(section);
    try {
      const episodes = await window.ApiClient.getItems(userId, { Ids: cards.map(card => card.dataset.id).join(','), Fields: 'SeriesId', Limit: cards.length });
      const parents = new Map((episodes.Items || []).filter(item => item.SeriesId).map(item => [homeCarouselItemKey(item.Id), item.SeriesId]));
      const ids = [...new Set(parents.values())];
      if (!ids.length) return;
      const result = await window.ApiClient.getItems(userId, { Ids: ids.join(','), Fields: 'PrimaryImageAspectRatio,ProductionYear', Limit: ids.length });
      const series = new Map((result.Items || []).filter(item => item.Type === 'Series').map(item => [homeCarouselItemKey(item.Id), item]));
      const activeScroller = section.querySelector('.emby-scroller');
      while (activeScroller && homeCarouselTargets.get(activeScroller)?.until > Date.now()) {
        await new Promise(resolve => window.setTimeout(resolve, 80));
        if (!section.isConnected) return;
      }
      const seen = new Set([...section.querySelectorAll('.card[data-type="Series" i]')].map(card => homeCarouselItemKey(card.dataset.id)));
      for (const card of cards) {
        if (!section.contains(card)) continue;
        const id = homeCarouselItemKey(parents.get(homeCarouselItemKey(card.dataset.id)));
        const item = series.get(id);
        if (!item) continue; // Preserve the card when its parent cannot be retrieved.
        if (seen.has(id)) { card.remove(); continue; }
        const shape = card.classList.contains('overflowBackdropCard') ? 'overflowBackdrop'
          : card.classList.contains('overflowSmallBackdropCard') ? 'overflowSmallBackdrop'
          : card.classList.contains('overflowPortraitCard') ? 'overflowPortrait' : 'portrait';
        const markup = tools.cards.getCardsHtml({ items: [item], shape, showTitle: true, showYear: true, showParentTitle: false, centerText: true, overlayPlayButton: true, lazy: true });
        if (markup) { card.insertAdjacentHTML('beforebegin', markup); card.remove(); seen.add(id); }
      }
      tools.lazy?.lazyChildren?.(section);
    } catch { /* Keep usable original cards if Jellyfin is temporarily unavailable. */ }
    finally { window.setTimeout(() => recentEpisodeRepairs.delete(section), 5000); }
  }

  function markRecentHomeSections(home, sectionTitles = [...home.querySelectorAll('.sectionTitle')]) {
    sectionTitles.forEach(title => {
      const section = title.closest('.verticalSection');
      if (!section) return;
      const text = normalizedText(title.textContent).replace(/\s+/g, ' ');
      const episodeFeed = /ajout.*recent|recent.*ajout|recently added|latest/.test(text);
      if (episodeFeed) {
        if (section.dataset.noctraRecentSeriesFeed !== 'true') section.dataset.noctraRecentSeriesFeed = 'true';
        repairRecentEpisodeCards(section);
      }
      const recent = /^(?:films|series),?\s+ajouts?\s+recents?$/.test(text);
      section.classList.toggle('noctra-recent-section', recent);
      if (!recent) return;

      const titleButton = title.closest('.sectionTitleTextButton, a.more.button-flat')
        || section.querySelector('.sectionTitleTextButton, a.more.button-flat');
      if (!titleButton) return;
      titleButton.dataset.noctraTitleWithoutCaret = 'true';
      if (!titleButton.getAttribute('aria-label')) {
        titleButton.setAttribute('aria-label', String(title.textContent || '').replace(/\s+/g, ' ').trim());
      }
      titleButton.querySelectorAll(
        ':scope > .material-icons, :scope > .material-icons-round, :scope > .material-icons-outlined, '
        + ':scope > .material-symbols-rounded, :scope > .material-symbols-outlined, :scope > .material-symbols-sharp, '
        + ':scope > svg'
      ).forEach(icon => {
        icon.dataset.noctraSectionCaret = 'true';
        icon.setAttribute('aria-hidden', 'true');
      });
    });
  }

  let premiereHomeController = null;
  let premiereResumeCache = null;
  let premiereVisitIndex = 0;

  function premiereCardData(card) {
    const visual = card.querySelector('.cardImageContainer');
    const title = card.querySelector('.cardText-first')?.textContent?.trim() || visual?.getAttribute('aria-label') || '';
    const subtitle = card.querySelector('.cardText-secondary')?.textContent?.trim() || '';
    const candidates = [visual?.querySelector('img, .cardImage, [data-src], [data-original]'), visual, card.querySelector('img, .cardImage')].filter(Boolean);
    let image = '';
    for (const element of candidates) {
      const sources = [element.getAttribute('data-src'), element.getAttribute('data-original'), elementImageSource(element)].filter(Boolean);
      for (const source of sources) {
        try {
          const url = new URL(cssBackgroundUrl(source) || source, location.href);
          if (!/^https?:$/.test(url.protocol)) continue;
          if (url.searchParams.has('fillWidth')) url.searchParams.set('fillWidth', '1280');
          if (url.searchParams.has('fillHeight')) url.searchParams.set('fillHeight', '720');
          image = url.href;
          break;
        } catch { /* Ignore placeholders and wait for the native image. */ }
      }
      if (image) break;
    }
    return { id: card.dataset.id, card, title, subtitle, image, resume: card.querySelector('[data-action="resume"]'), visual };
  }

  function premiereResumeData(item) {
    const client = window.ApiClient;
    const serverId = item.ServerId || client?.serverInfo?.()?.Id || '';
    const imageId = item.BackdropImageTags?.length ? item.Id : item.ParentBackdropItemId || item.Id;
    const imageType = item.BackdropImageTags?.length || item.ParentBackdropItemId ? 'Backdrop' : 'Primary';
    const image = client?.getImageUrl?.(imageId, { type: imageType, maxWidth: 1280, quality: 90 }) || appPath('/api/jellyfin/image/' + encodeURIComponent(item.Id));
    const action = name => ({ click: () => {
      // Use this bundled client's native action handler, preserving resume ticks and player choice.
      let runtime;
      window.webpackChunk.push([['noctra-premiere-actions'], {}, require => { runtime = require; }]);
      if (!runtime) { toast('Le lecteur est encore en cours de chargement. Réessayez dans un instant.'); return; }
      runtime.e(12011).then(() => {
        const button = document.createElement('button');
        button.className = 'itemAction';
        Object.assign(button.dataset, { id: item.Id, serverid: serverId, type: item.Type, mediatype: item.MediaType || 'Video', action: name, positionticks: String(item.UserData?.PlaybackPositionTicks || 0) });
        runtime(22832).Ay.onClick({ target: button, preventDefault() {}, stopPropagation() {} });
      }).catch(() => toast('Impossible d’ouvrir le lecteur. Réessayez.'));
    }});
    return { id: item.Id, title: item.SeriesName || item.Name, subtitle: item.Type === 'Episode' ? 'S' + (item.ParentIndexNumber || 1) + ':E' + (item.IndexNumber || 1) + ' · ' + item.Name : String(item.ProductionYear || ''), image, resume: action('resume'), visual: action('link') };
  }

  function currentJellyfinUserId() {
    try { return String(window.ApiClient?.getCurrentUserId?.() || authContext?.user?.id || ''); }
    catch { return String(authContext?.user?.id || ''); }
  }

  function resumeItemsForUser(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(item => {
      const id = String(item?.Id || '');
      const userData = item?.UserData || {};
      const position = Number(userData.PlaybackPositionTicks || 0);
      const runtime = Number(item?.RunTimeTicks || 0);
      const playedPercentage = Number(userData.PlayedPercentage);
      if (!id || seen.has(id) || userData.Played === true || !(position > 0)) return false;
      if (Number.isFinite(playedPercentage) && playedPercentage >= 99) return false;
      if (runtime > 0 && position >= runtime * .99) return false;
      seen.add(id);
      return true;
    }).slice(0, 12);
  }

  function nativeResumeSections(home) {
    return [...home.querySelectorAll('.sectionTitle')].map(title => {
      const label = normalizedText(title.textContent);
      const section = title.closest('.verticalSection');
      const isContinueWatching = (label.includes('continuer') && label.includes('regarder')) || label.includes('continue watching');
      const isResume = label.includes('reprendre la lecture') || label === 'continuer';
      return section && (isContinueWatching || isResume) ? section : null;
    }).filter(Boolean);
  }

  function reconcileNativeResumeSections(home, items, userId = '') {
    const allowedIds = new Set(resumeItemsForUser(items).map(item => String(item.Id)));
    nativeResumeSections(home).forEach(section => {
      section.dataset.noctraResumeUser = String(userId || '');
      section.dataset.noctraResumeSynced = 'true';
      let visibleCount = 0;
      section.querySelectorAll('.card[data-id]').forEach(card => {
        const allowed = allowedIds.has(String(card.dataset.id || ''));
        card.dataset.noctraResumeState = allowed ? 'allowed' : 'filtered';
        if (allowed) {
          visibleCount += 1;
          if (card.dataset.noctraResumeHidden === 'true') {
            delete card.dataset.noctraResumeHidden;
            card.hidden = false;
            card.removeAttribute('aria-hidden');
          }
        } else {
          card.dataset.noctraResumeHidden = 'true';
          card.hidden = true;
          card.setAttribute('aria-hidden', 'true');
        }
      });
      if (visibleCount === 0) {
        section.dataset.noctraResumeHidden = 'true';
        section.hidden = true;
        section.setAttribute('aria-hidden', 'true');
      } else if (section.dataset.noctraResumeHidden === 'true') {
        delete section.dataset.noctraResumeHidden;
        section.hidden = false;
        section.removeAttribute('aria-hidden');
      }
    });
  }

  function premiereHomeCards(home) {
    const seen = new Set();
    return [...home.querySelectorAll('.verticalSection .card[data-id]')].filter(card => {
      if (card.closest('.noctra-my-media-section, .hide, [hidden]') || /CollectionFolder|UserView/i.test(card.dataset.type || '')) return false;
      if (seen.has(card.dataset.id)) return false;
      seen.add(card.dataset.id);
      return true;
    }).map(premiereCardData).filter(item => item.title && item.visual).slice(0, 12);
  }

  function enhancePremiereHome(home) {
    if (premiereHomeController?.home === home) { premiereHomeController.refresh(); return; }
    premiereHomeController?.destroy();
    const container = home.querySelector('.homeSectionsContainer');
    const resumeUser = currentJellyfinUserId();
    if (premiereResumeCache?.user && resumeUser && premiereResumeCache.user !== resumeUser) premiereResumeCache = null;
    const cachedResumeItems = premiereResumeCache?.user === resumeUser ? resumeItemsForUser(premiereResumeCache.items) : null;
    if (cachedResumeItems) reconcileNativeResumeSections(home, cachedResumeItems, resumeUser);
    let resumeItems = cachedResumeItems?.map(premiereResumeData) ?? null;
    // Ne jamais utiliser une rangée native non vérifiée comme reprise : lors d'un
    // changement de compte, Jellyfin peut conserver quelques cartes de l'ancien DOM.
    let items = resumeItems ?? [];
    if (!container) return;
    home.querySelector('.noctra-premiere')?.remove();
    const premiere = document.createElement('section');
    premiere.className = 'noctra-premiere';
    premiere.setAttribute('aria-label', 'Continuer à regarder');
    premiere.setAttribute('aria-roledescription', 'carrousel');
    premiere.innerHTML = '<div class="noctra-premiere-art" aria-hidden="true"></div><div class="noctra-premiere-atmosphere" aria-hidden="true"></div><div class="noctra-premiere-copy"><p class="noctra-eyebrow">CONTINUER À REGARDER</p><span class="noctra-premiere-label"></span><h1></h1><p class="noctra-premiere-subtitle"></p><div class="noctra-premiere-actions"><button type="button" class="noctra-button noctra-button--primary" data-premiere-play>'+icons.play+'<span>Reprendre</span></button><button type="button" class="noctra-button" data-premiere-details>Voir la fiche</button></div></div><div class="noctra-premiere-controls"><button type="button" data-premiere-prev aria-label="Titre précédent">'+icons.back+'</button><span data-premiere-count></span><button type="button" data-premiere-next aria-label="Titre suivant">'+icons.next+'</button><button type="button" class="noctra-premiere-motion" aria-label="Mettre le défilement en pause" aria-pressed="false">'+icons.pause+'</button></div>';
    home.querySelector('.noctra-home-heading')?.remove();
    const homeHeading = document.createElement('header');
    homeHeading.className = 'noctra-home-heading';
    homeHeading.innerHTML = '<div><p>VOTRE SALLE DE CINÉMA</p><h2>À l’affiche chez vous<span>.</span></h2></div><span class="noctra-home-heading-note">Votre collection. À votre rythme.</span>';
    container.before(homeHeading, premiere);
    const previews = document.createElement('div');
    previews.className = 'noctra-premiere-previews';
    previews.setAttribute('aria-label', 'Choisir un titre à la une');
    premiere.append(previews);
    let index = 0;
    const request = new AbortController();
    let disposed = false;
    let timer = 0, paused = false, hovering = false, focused = false, visible = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const text = (selector, value) => { const node = premiere.querySelector(selector); if (node.textContent !== value) node.textContent = value; };
    const canRun = () => !paused && !hovering && !focused && visible && !reduced.matches && !document.hidden && home.isConnected && !home.classList.contains('hide') && !document.body.classList.contains('noctra-panel-open') && !document.body.classList.contains('noctra-more-open') && items.length > 1;
    const sync = () => {
      clearTimeout(timer); timer = 0;
      premiere.dataset.motionPaused = String(!canRun());
      if (canRun()) timer = setTimeout(() => { index = (index + 1) % items.length; render(); sync(); }, 8000);
    };
    const render = () => {
      const item = items[index];
      if (!item) {
        premiere.querySelector('.noctra-premiere-art').replaceChildren();
        delete premiere.dataset.itemId;
        text('h1', resumeItems === null ? 'Vos lectures en cours' : 'Tout est à jour');
        text('.noctra-premiere-label', 'Continuer à regarder');
        text('.noctra-premiere-subtitle', resumeItems === null ? 'Retrouvez votre prochaine reprise ici.' : 'Vos films et épisodes commencés apparaîtront ici.');
        premiere.querySelector('.noctra-premiere-actions').hidden = true;
        premiere.querySelector('.noctra-premiere-controls').hidden = true;
        previews.replaceChildren(); return;
      }
      premiere.querySelector('.noctra-premiere-actions').hidden = false;
      premiere.querySelector('.noctra-premiere-controls').hidden = false;
      premiere.dataset.itemId = item.id;
      text('h1', item.title); text('.noctra-premiere-subtitle', item.subtitle);
      text('.noctra-premiere-label', item.resume ? 'L’histoire continue' : 'À découvrir dans votre collection');
      text('[data-premiere-count]', (index + 1) + ' / ' + items.length);
      const art = premiere.querySelector('.noctra-premiere-art');
      if (art.dataset.image !== (item.image || '')) {
        art.dataset.image = item.image || '';
        const requested = item.image || '';
        const picture = new Image();
        picture.alt = ''; picture.decoding = 'async'; picture.fetchPriority = 'high';
        picture.className = 'noctra-premiere-picture';
        picture.onload = () => {
          if (!art.isConnected || art.dataset.image !== requested) return;
          const previous = art.lastElementChild;
          art.append(picture);
          if (previous) {
            if (reduced.matches) previous.remove();
            else {
              previous.animate([{opacity:1},{opacity:0}], {duration:650,fill:'forwards'}).finished.then(() => previous.remove()).catch(() => previous.remove());
            }
          }
          if (!reduced.matches) picture.animate([{opacity:0},{opacity:1}], {duration:650,easing:'ease-out'});
        };
        picture.onerror = () => { if (art.dataset.image === requested) art.dataset.image = ''; };
        if (requested) picture.src = requested;
        else art.replaceChildren();
        // Start the following slide's image before its timer expires.
        const nextImage = items[(index + 1) % items.length]?.image;
        if (nextImage) { const next = new Image(); next.decoding = 'async'; next.src = nextImage; }
      }
      premiere.dataset.hasImage = String(Boolean(item.image));
      premiere.querySelector('[data-premiere-play]').hidden = !item.resume;
      premiere.querySelector('[data-premiere-prev]').disabled = items.length < 2;
      premiere.querySelector('[data-premiere-next]').disabled = items.length < 2;
      const nearby = items.slice(0, 3);
      const signature = nearby.map(entry => entry.id + ':' + entry.image + ':' + entry.title).join('|');
      if (previews.dataset.signature !== signature) {
        previews.dataset.signature = signature;
        previews.replaceChildren(...nearby.map((entry, offset) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.itemId = entry.id;
          button.setAttribute('aria-label', 'Afficher ' + entry.title);
          const picture = document.createElement('span');
          picture.className = 'noctra-premiere-preview-image';
          if (entry.image) picture.style.backgroundImage = 'url(' + JSON.stringify(entry.image) + ')';
          const label = document.createElement('span');
          label.textContent = entry.title;
          button.append(picture, label);
          button.onclick = () => { index = items.findIndex(item => item.id === entry.id); if (index < 0) index = 0; render(); sync(); };
          return button;
        }));
      }
      for (const button of previews.children) {
        const current = button.dataset.itemId === item.id;
        button.dataset.current = String(current);
        button.setAttribute('aria-pressed', String(current));
      }
    };
    const refresh = () => {
      const id = items[index]?.id;
      items = resumeItems ?? [];
      index = Math.max(0, items.findIndex(item => item.id === id));
      render();
      // Image loads must not postpone an already scheduled slide indefinitely.
      if (!timer) sync();
    };
    const step = delta => {
      if (items.length < 2) return;
      index = (index + delta + items.length) % items.length;
      render();
      sync();
    };
    const bindPremiereControl = (selector, delta) => {
      const button = premiere.querySelector(selector);
      if (!button) return;
      let lastPointerActivation = 0;
      const activate = event => {
        if (button.disabled) return;
        if (event.type === 'click' && Date.now() - lastPointerActivation < 500) return;
        if (event.type === 'pointerup') lastPointerActivation = Date.now();
        event.preventDefault();
        event.stopPropagation();
        step(delta);
      };
      button.addEventListener('pointerup', activate, { passive: false });
      button.addEventListener('click', activate);
      button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
    };
    bindPremiereControl('[data-premiere-prev]', -1);
    bindPremiereControl('[data-premiere-next]', 1);
    premiere.querySelector('[data-premiere-play]').onclick = () => items[index]?.resume?.click();
    premiere.querySelector('[data-premiere-details]').onclick = () => items[index]?.visual?.click();
    premiere.querySelector('.noctra-premiere-motion').onclick = event => {
      paused = !paused;
      const button = event.currentTarget;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Reprendre le défilement' : 'Mettre le défilement en pause');
      button.innerHTML = paused ? icons.play : icons.pause;
      sync();
    };
    premiere.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovering = true; sync(); } });
    premiere.addEventListener('pointerleave', () => { hovering = false; sync(); });
    premiere.addEventListener('focusin', () => { focused = true; sync(); });
    premiere.addEventListener('focusout', event => { if (!premiere.contains(event.relatedTarget)) { focused = false; sync(); } });
    let imageFrame = 0;
    const imageObserver = new MutationObserver(mutations => {
      if (!mutations.some(m => m.target.closest?.('.card')) || imageFrame) return;
      imageFrame = requestAnimationFrame(() => { imageFrame = 0; refresh(); });
    });
    imageObserver.observe(container, { subtree: true, attributes: true, attributeFilter: ['src','srcset','data-src','data-original','style'] });
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }) : null;
    intersection?.observe(premiere);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener?.('change', sync);
    const destroy = () => {
      disposed = true; request.abort();
      clearTimeout(timer); cancelAnimationFrame(imageFrame); imageObserver.disconnect(); intersection?.disconnect();
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener?.('change', sync);
      premiere.remove();
      if (premiereHomeController?.home === home) premiereHomeController = null;
    };
    premiereHomeController = { home, refresh, sync, destroy };
    render(); sync();
    api('/api/home/resume', { signal: request.signal, timeoutMs: 15000 }).then(payload => {
      if (disposed || !home.isConnected) return;
      const payloadUser = String(payload.userId || '');
      const liveUser = currentJellyfinUserId();
      if (payloadUser && liveUser && payloadUser !== liveUser) {
        premiereResumeCache = null;
        void syncAuthContext(true).finally(() => scheduleHomeEnhancement());
        return;
      }
      const resolvedUser = payloadUser || liveUser || resumeUser;
      const cleanItems = resumeItemsForUser(payload.items || []);
      premiereResumeCache = {user: resolvedUser, items: cleanItems};
      reconcileNativeResumeSections(home, cleanItems, resolvedUser);
      resumeItems = cleanItems.map(premiereResumeData);
      refresh();
    }).catch(error => {
      if (disposed || error.name === 'AbortError') return;
      if (!items.length) text('.noctra-premiere-subtitle', 'Les lectures en cours sont momentanément indisponibles. Revenez sur l’accueil pour réessayer.');
    });
  }

  function enhanceCinemaHome(home) {
    // Retire the injected landing section, including after a cached-page update.
    home.querySelectorAll('.noctra-cinema-home').forEach(section => section.remove());
    home.classList.add('noctra-content-home');
  }

  function enhanceHomePage() {
    const home = document.querySelector('.homePage:not(.hide)');
    if (!home) return false;

    const sectionTitles = [...home.querySelectorAll('.sectionTitle')];
    markRecentHomeSections(home, sectionTitles);
    const continuationCandidates = sectionTitles.map(title => {
      const text = normalizedText(title.textContent);
      const section = title.closest('.verticalSection');
      const isContinueWatching = (text.includes('continuer') && text.includes('regarder'))
        || text.includes('continue watching');
      const isResume = text.includes('reprendre la lecture') || text === 'continuer';
      if (!section || (!isContinueWatching && !isResume)) return null;
      const mediaCount = section.dataset.noctraResumeSynced === 'true'
        ? section.querySelectorAll('.card[data-noctra-resume-state="allowed"]').length
        : section.querySelectorAll('.card, .listItem, [data-id], .itemsContainer > *').length;
      return { title, section, text, mediaCount, priority: isContinueWatching ? 0 : 1 };
    }).filter(Boolean);

    continuationCandidates.forEach(candidate => {
      candidate.section.classList.remove('noctra-continue-section');
      candidate.section.classList.toggle('noctra-empty-resume-section', candidate.mediaCount === 0);
    });

    const continueCandidate = continuationCandidates
      .filter(candidate => candidate.mediaCount > 0)
      .sort((a, b) => a.priority - b.priority)[0] || null;
    const continueSection = continueCandidate?.section || null;
    const sectionsContainer = home.querySelector('.homeSectionsContainer');
    const mediaSection = findHomeLibrarySection(home, sectionTitles);
    let missingLibraryImages = 0;

    if (continueSection && sectionsContainer) {
      continueSection.classList.add('noctra-continue-section');
      continueSection.classList.remove('hide');
      continueSection.removeAttribute('hidden');
      continueSection.setAttribute('aria-hidden', 'false');

    }
    if (mediaSection && sectionsContainer) {
      mediaSection.classList.add('noctra-my-media-section');
      watchHomeLibraryImages(mediaSection);
      mediaSection.querySelectorAll('.card').forEach(card => {
        const label = homeLibraryCardLabel(card);
        const visual = card.querySelector('.cardImageContainer');
        if (visual && label) visual.dataset.noctraLibraryTitle = label;
        if (visual && !applyHomeLibraryCardImage(card, visual)) missingLibraryImages += 1;
      });
      // Le catalogue Noctra est utilise meme si Jellyfin a pose une image
      // native : la couverture dediee survit aux re-rendus tardifs.
      void hydrateHomeLibraryImages(mediaSection);

    }
    // Native sections may arrive late. Do not move their DOM nodes or keep
    // historical markers that hide everything after "Mes médias".
    home.querySelectorAll('.noctra-after-my-media').forEach(section => section.classList.remove('noctra-after-my-media'));
    enhanceCinemaHome(home);
    enhancePremiereHome(home);
    enableInfiniteHomeCarousels(home);
    const firstVisibleSection = sectionsContainer
      ? [...sectionsContainer.children].find(child => child.classList?.contains('verticalSection') && !child.classList.contains('hide'))
      : null;
    return Boolean(
      sectionsContainer
      && mediaSection
      && missingLibraryImages === 0
    );
  }

  function scheduleHomeEnhancement(attempt = 0) {
    // Les carrousels desktop ajoutent beaucoup de cartes par vagues. Regrouper
    // les mutations évite de rescanner toute la page plusieurs fois par frame.
    if (attempt === 0 && homeEnhanceTimer) return;
    window.clearTimeout(homeEnhanceTimer);
    const delay = attempt === 0 ? 40 : Math.min(900, 140 + attempt * 70);
    homeEnhanceTimer = window.setTimeout(() => {
      homeEnhanceTimer = null;
      if (!enhanceHomePage() && attempt < 14) scheduleHomeEnhancement(attempt + 1);
    }, delay);
  }

  function repairHeaderIconButtons(root = document) {
    const buttons = root.querySelectorAll?.('.headerTop .headerRight > button.headerButton, .headerTop .headerSyncButton, .headerTop .headerCastButton') || [];
    buttons.forEach(button => {
      if (button.closest('.headerUserButton') || button.querySelector('img, .headerUserImage')) return;
      const hint = normalizedText([
        button.className,
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.textContent
      ].filter(Boolean).join(' '));
      const icon = button.matches('.headerCastButton') || /(?:cast|diffuser|chromecast)/.test(hint)
        ? icons.cast
        : button.matches('.headerSyncButton') || /(?:sync|synchro|syncplay)/.test(hint)
          ? icons.live
          : /(?:search|rechercher)/.test(hint)
            ? icons.search
            : /(?:dashboard|admin|settings|parametres|paramètres)/.test(hint)
              ? icons.tools
              : /(?:home|accueil)/.test(hint)
                ? icons.home
                : /(?:tv|direct)/.test(hint)
                  ? icons.tv
                  : '';
      if (!icon) return;
      button.classList.add('noctra-header-icon-fixed');
      button.querySelectorAll('.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp').forEach(element => {
        element.setAttribute('aria-hidden', 'true');
        element.hidden = true;
      });
      if (!button.querySelector(':scope > svg[data-noctra-header-icon]')) {
        button.insertAdjacentHTML('afterbegin', icon.replace('<svg ', '<svg data-noctra-header-icon="true" '));
      }
    });
  }

  function repairHeaderMenuIcons(root = document, fallbackKind = '') {
    root.querySelectorAll?.('.actionSheetMenuItem, .MuiMenuItem-root, [role="menuitem"], .MuiListItemButton-root, li').forEach(item => {
      // Font-backed items are repaired beside the glyph, never inside it:
      // keeping a SVG inside a Material Icons span also keeps its ::before glyph.
      const material = item.querySelector('.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp');
      if (material && materialIconFallback(material)) {
        item.querySelectorAll('svg[data-noctra-menu-icon]').forEach(svg => svg.remove());
        repairMaterialIconFallbacks(item);
        return;
      }
      const hint = normalizedText([
        fallbackKind,
        item.className,
        item.getAttribute('aria-label'),
        item.getAttribute('title'),
        item.textContent
      ].filter(Boolean).join(' '));
      const icon = /(?:nouveau|new|creer|créer|create|add|groupe|group)/.test(hint)
        ? icons.plus
        : /(?:sync|synchro|syncplay|rejoindre|join)/.test(hint)
          ? icons.users
          : /(?:cast|diffuser|chromecast|play on|jouer sur)/.test(hint)
            ? icons.cast
            : '';
      if (!icon) return;
      const slot = item.querySelector('.actionsheetMenuItemIcon, .MuiListItemIcon-root, .listItemIcon')
        || item.querySelector('.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp')
        || item;
      slot.classList.add('noctra-menu-icon-fixed');
      slot.querySelectorAll('.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp').forEach(element => {
        element.setAttribute('aria-hidden', 'true');
        element.hidden = true;
      });
      if (!slot.querySelector(':scope > svg[data-noctra-menu-icon]')) {
        slot.insertAdjacentHTML('afterbegin', icon.replace('<svg ', '<svg data-noctra-menu-icon="true" '));
      }
    });
  }

  function materialIconFallback(element) {
    const hint = normalizedText([
      [...(element?.classList || [])].filter(name => !/^(?:material-|listItem|actionsheet|noctra-)/i.test(name)).join(' '),
      element?.textContent,
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
      element?.parentElement?.getAttribute?.('aria-label'),
      element?.parentElement?.getAttribute?.('title')
    ].filter(Boolean).join(' ')).replace(/\s+/g, '_');
    const mappings = [
      ['account', /account|person|profil|profile|utilisateur|user/],
      ['lightning', /phonelink_lock|bolt|flash|speed|connexion_rapide|quick_connect/],
      ['display', /palette|color_lens|display|affichage|appearance|theme/],
      ['home', /(?:^|_)home(?:_|$)|accueil/],
      ['previous', /skip_previous|previous_track/],
      ['skipNext', /skip_next|next_track/],
      ['rewind', /fast_rewind|rewind/],
      ['forward', /fast_forward|forward/],
      ['undo', /(?:^|_)undo(?:_|$)|previous_chapter/],
      ['redo', /(?:^|_)redo(?:_|$)|next_chapter/],
      ['fullscreenExit', /fullscreen_exit/],
      ['fullscreen', /(?:^|_)fullscreen(?:_|$)/],
      ['pip', /picture_in_picture|pip/],
      ['airplay', /airplay/],
      ['audio', /audiotrack|music_note|audio/],
      ['muted', /volume_off|volume_mute|muted/],
      ['volume', /volume_up|volume_down|volume/],
      ['record', /fiber_manual_record|record/],
      ['close', /(?:^|_)close(?:_|$)|fermer/],
      ['back', /arrow_back|chevron_left|keyboard_arrow_left/],
      ['next', /chevron_right|keyboard_arrow_right/],
      ['replay', /(?:^|_)replay(?:_|$)|restart|relire|depuis_le_debut/],
      ['film', /theaters|theatres|local_movies|bande_annonce/],
      ['shuffle', /shuffle/],
      ['copy', /content_copy|copy_stream|copier/],
      ['playlist', /playlist_add|queue_music|liste_de_lecture/],
      ['library', /library_add|collections_bookmark/],
      ['select', /check_box_outline_blank|select_all|selectionner/],
      ['play', /play_arrow|play_circle|lecture|(?:^|_)lire(?:_|$)/],
      ['pause', /(?:^|_)pause(?:_|$)/],
      ['captions', /closed_caption|subtitles|sous_titres|caption/],
      ['gamepad', /(?:^|_)keyboard(?:_|$)|sports_esports|gamepad|videogame|controles|controls/],
      ['view', /view_comfy|view_module|grid_view|selectionner_une_vue|sélectionner_une_vue/],
      ['sort', /sort_by_alpha|(?:^|_)sort(?:_|$)|trier/],
      ['filter', /filter_alt|filter_list|(?:^|_)filter(?:_|$)|filtrer/],
      ['tools', /settings|tune|parametres|paramètres/],
      ['dashboard', /dashboard|tableau_de_bord/],
      ['metadata', /metadata|metadonnees|edit_note/],
      ['logout', /logout|exit_to_app|deconnexion|deconnecter|sign_out/],
      ['heart', /favorite|favourite|coeur/],
      ['check', /check|done|watched|played/],
      ['more', /more_vert|more_horiz|menu|options/],
      ['star', /star|rating/],
      ['trash', /delete|trash|supprimer/],
      ['search', /search|recherche/],
      ['edit', /edit|modifier/],
      ['refresh', /refresh|actualiser|sync_problem|autorenew/],
      ['plus', /add|plus|ajouter/],
      ['download', /download|get_app|telecharger/],
      ['folder', /folder|dossier/],
      ['library', /video_library|collections|library|bibliotheque/],
      ['cast', /cast|chromecast|diffuser/],
      ['users', /sync|group|groupe/],
      ['info', /info|details|help/],
      ['external', /open_in_new|external|(?:^|_)link(?:_|$)/],
      ['tv', /live_tv|television|local_movies|movie|tv/]
    ];
    const matched = mappings.find(([, pattern]) => pattern.test(hint))?.[0];
    if (matched) return matched;
    // Fallback for private-use code points: inspect only the nearest action label,
    // never the surrounding page (which could name an unrelated action).
    const action = element?.closest?.('button, a, [role="menuitem"], .listItem');
    const label = normalizedText(action?.querySelector?.('.listItemBodyText, .actionSheetItemText, .actionSheetMenuItemText, .actionsheetMenuItemText')?.textContent || action?.getAttribute?.('aria-label') || action?.textContent || '').replace(/[\s-]+/g, '_');
    const id = action?.getAttribute?.('data-id');
    const actions = { resume: 'play', playallfromhere: 'play', select: 'select', addtocollection: 'library', addtoplaylist: 'playlist', download: 'download', 'copy-stream': 'copy' };
    return actions[id] || (/ajouter.*collection/.test(label) ? 'library' : /liste.*lecture/.test(label) ? 'playlist' : '') || mappings.find(([, pattern]) => pattern.test(label))?.[0] || (/^(?:lire|tout_lire)/.test(label) ? 'play' : '');
  }

  function repairDashboardLogo(root = document) {
    const images = [...(root.querySelectorAll?.('img') || [])];
    if (root.matches?.('img')) images.push(root);
    for (const image of images) {
      if (/icon-transparent\.baba78f2a106d9baee83\.png/.test(image.getAttribute('src') || '')) {
        image.src = appPath('/noctra-mark.svg?v=200.106');
        image.alt = 'Noctra';
      }
    }
  }
  document.addEventListener('error', event => { if (event.target?.matches?.('img')) repairDashboardLogo(event.target); }, true);

  function repairMaterialIconFallbacks(root = document) {
    repairDashboardLogo(root);
    const selector = '.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp';
    const hideOriginal = element => {
      if (element.dataset.noctraMaterialHidden !== 'true') element.dataset.noctraMaterialHidden = 'true';
      if (element.getAttribute('aria-hidden') !== 'true') element.setAttribute('aria-hidden', 'true');
      if (!element.hidden) element.hidden = true;
    };
    const home = root.matches?.('.homePage')
      ? root
      : root.closest?.('.homePage') || root.querySelector?.('.homePage');
    if (home) markRecentHomeSections(home);
    const elements = [...(root.matches?.(selector) ? [root] : []), ...(root.querySelectorAll?.(selector) || [])];
    elements.forEach(element => {
      // Empty selection slots must stay empty, including their replacement.
      if (element.style?.visibility === 'hidden' || (element.hidden && element.dataset.noctraMaterialHidden !== 'true')) return;
      const iconName = materialIconFallback(element);
      const icon = icons[iconName];
      const parent = element.parentElement;
      if (!icon || !parent) return;
      if (parent.matches('.sectionTitleTextButton[data-noctra-title-without-caret="true"], a.more.button-flat[data-noctra-title-without-caret="true"]')) {
        parent.querySelectorAll(':scope > svg[data-noctra-material-icon], :scope > svg[data-noctra-scroll-icon]').forEach(svg => svg.remove());
        if (element.dataset.noctraSectionCaret !== 'true') element.dataset.noctraSectionCaret = 'true';
        hideOriginal(element);
        return;
      }
      if (parent.querySelector(':scope > svg[data-noctra-header-icon], :scope > svg[data-noctra-menu-icon], :scope > svg[data-noctra-scroll-icon]')) {
        hideOriginal(element);
        return;
      }
      const current = parent.querySelector(':scope > svg[data-noctra-material-icon]');
      if (current?.dataset.noctraMaterialIcon !== iconName) current?.remove();
      if (!parent.querySelector(':scope > svg[data-noctra-material-icon]')) {
        element.insertAdjacentHTML(
          'beforebegin',
          icon.replace('<svg ', `<svg data-noctra-material-icon="${iconName}" aria-hidden="true" `)
        );
      }
      hideOriginal(element);
      if (!parent.classList.contains('noctra-material-icon-fixed')) parent.classList.add('noctra-material-icon-fixed');
    });
  }

  let nativePlayerIconObserver = null;
  let nativePlayerIconRoots = [];
  let nativePlayerIconFrame = 0;

  function observeNativePlayerIcons(player = null) {
    const roots = [...new Set([
      player,
      document.querySelector('#videoOsdPage'),
      document.querySelector('.osdHeader')
    ].filter(Boolean))];
    const changed = roots.length !== nativePlayerIconRoots.length
      || roots.some((root, index) => root !== nativePlayerIconRoots[index]);
    if (changed) {
      nativePlayerIconObserver?.disconnect();
      cancelAnimationFrame(nativePlayerIconFrame);
      nativePlayerIconFrame = 0;
      nativePlayerIconObserver = roots.length ? new MutationObserver(() => {
        if (nativePlayerIconFrame) return;
        // Repairs also produce mutations; yield to rendering and only write changed values.
        nativePlayerIconFrame = requestAnimationFrame(() => {
          nativePlayerIconFrame = 0;
          roots.forEach(root => repairMaterialIconFallbacks(root));
        });
      }) : null;
      roots.forEach(root => nativePlayerIconObserver?.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      }));
      nativePlayerIconRoots = roots;
    }
    roots.forEach(root => repairMaterialIconFallbacks(root));
  }

  const boundHomeCarouselButtons = new WeakSet();

  function repairScrollArrowButtons(root = document) {
    root.querySelectorAll?.('.sectionTitleTextButton.noctra-scroll-icon-fixed').forEach(button => {
      button.classList.remove('noctra-scroll-icon-fixed');
      button.querySelectorAll(':scope > svg[data-noctra-scroll-icon]').forEach(icon => icon.remove());
      button.querySelectorAll('[data-noctra-scroll-original]').forEach(element => {
        element.hidden = false;
        element.removeAttribute('data-noctra-scroll-original');
      });
    });
    root.querySelectorAll?.('.emby-scrollbuttons .emby-scrollbuttons-button, .emby-scrollbuttons .scrollbutton').forEach(button => {
      const hint = normalizedText([
        button.className,
        button.dataset?.direction,
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.textContent
      ].filter(Boolean).join(' '));
      const icon = /(?:left|previous|precedent|précédent|chevron_left|arrow_back|back)/.test(hint)
        ? icons.back
        : /(?:right|next|suivant|chevron_right|arrow_forward|more|voir)/.test(hint)
          ? icons.next
          : '';
      if (!icon) return;
      button.dataset.noctraDirection = icon === icons.back ? 'left' : 'right';
      button.classList.add('noctra-scroll-icon-fixed');
      // Jellyfin peut remplacer le custom element en recopiant ses attributs.
      // Le WeakSet identifie le noeud réellement lié, pas son ancien marqueur DOM.
      if (!boundHomeCarouselButtons.has(button)) {
        boundHomeCarouselButtons.add(button);
        button.dataset.noctraCarouselBound = 'true';
        button.addEventListener('click', event => {
          const carousel = getHomeCarousel(button);
          if (!carousel) return;
          const nativeScrollerReady = typeof carousel.scroller.addScrollEventListener === 'function'
            && typeof carousel.scroller.getScrollSize === 'function'
            && typeof carousel.scroller.scrollToPosition === 'function';
          button.dataset.noctraCarouselEngine = nativeScrollerReady ? 'jellyfin-api' : 'dom-fallback';
          // Un seul moteur pilote le rail. Le gestionnaire Jellyfin sait avancer
          // dans les cartes déjà montées, mais ne rappelle pas l'extension Noctra
          // lorsqu'il atteint leur bord : la flèche reste alors active sans effet.
          event.preventDefault();
          event.stopImmediatePropagation();
          moveHomeCarousel(button);
        }, true);
      }
      button.querySelectorAll('.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp').forEach(element => {
        element.setAttribute('aria-hidden', 'true');
        element.dataset.noctraScrollOriginal = 'true';
        element.hidden = true;
      });
      if (!button.querySelector(':scope > svg[data-noctra-scroll-icon]')) {
        button.insertAdjacentHTML('afterbegin', icon.replace('<svg ', '<svg data-noctra-scroll-icon="true" '));
      }
      const carousel = getHomeCarousel(button);
      if (carousel) syncHomeCarouselButtons(carousel);
    });
  }

  function repairAuthenticatedViewState() {
    const route = String(location.hash || '').toLowerCase();
    const explicitLoginRoute = /\/(?:login|selectserver|addserver)(?:[.?/&]|$)/.test(route);
    const hasJellyfinIdentity = Boolean(jellyfinAccessToken() || window.ApiClient?.getCurrentUserId?.());
    const authenticatedContent = document.querySelector(
      '.homePage:not(.hide), .itemDetailPage:not(.hide), .itemDetailsPage:not(.hide), .libraryPage:not(.hide):not(#loginPage)'
    );
    const stalePortal = Boolean(authContext && hasJellyfinIdentity && authenticatedContent && !explicitLoginRoute);
    document.querySelectorAll('#loginPage').forEach(portal => {
      portal.classList.toggle('noctra-stale-auth-portal', stalePortal);
      portal.setAttribute('aria-hidden', String(stalePortal));
      if ('inert' in portal) portal.inert = stalePortal;
    });
  }

  function updateDetailBanner() {
    if (!detailParallaxTarget) return;
    cancelAnimationFrame(detailParallaxFrame);
    detailParallaxFrame = requestAnimationFrame(() => {
      const scrollTop = Math.max(
        0,
        detailParallaxTarget.scrollTop || 0,
        document.scrollingElement?.scrollTop || 0
      );
      detailParallaxTarget.style.setProperty('--noctra-banner-shift', `${Math.min(104, scrollTop * .16)}px`);
    });
  }

  function bindDetailBanner() {
    const page = document.querySelector('.itemDetailPage:not(.hide), .itemDetailsPage:not(.hide)');
    if (!page || page === detailParallaxTarget) {
      updateDetailBanner();
      return;
    }
    if (detailParallaxTarget) detailParallaxTarget.removeEventListener('scroll', updateDetailBanner);
    window.removeEventListener('scroll', updateDetailBanner);
    detailParallaxTarget = page;
    detailParallaxTarget.style.setProperty('--noctra-banner-shift', '0px');
    detailParallaxTarget.addEventListener('scroll', updateDetailBanner, { passive: true });
    window.addEventListener('scroll', updateDetailBanner, { passive: true });
    updateDetailBanner();
  }

  function unbindDetailBanner() {
    if (detailParallaxTarget) {
      detailParallaxTarget.removeEventListener('scroll', updateDetailBanner);
      detailParallaxTarget.style.removeProperty('--noctra-banner-shift');
    }
    window.removeEventListener('scroll', updateDetailBanner);
    detailParallaxTarget = null;
    cancelAnimationFrame(detailParallaxFrame);
  }

  function decorateHomeCarousel(button) {
    const controls = button.parentElement;
    const scroller = controls?.nextElementSibling;
    return Boolean(scroller?.closest('.homePage'));
  }

  function homeCarouselDirection(button) {
    if (button?.dataset?.noctraDirection) return button.dataset.noctraDirection;
    const hint = normalizedText([
      button?.dataset?.direction,
      button?.className,
      button?.getAttribute?.('aria-label'),
      button?.getAttribute?.('title'),
      button?.textContent
    ].filter(Boolean).join(' '));
    return /(?:left|previous|precedent|précédent|chevron_left|arrow_back|back)/.test(hint) ? 'left' : 'right';
  }

  function getHomeCarousel(button) {
    const controls = button?.parentElement;
    const section = controls?.closest?.('.verticalSection') || null;
    const sibling = controls?.nextElementSibling;
    const scroller = sibling?.matches?.('[is="emby-scroller"], .emby-scroller, .itemsContainer, .scrollFrame')
      ? sibling
      : section?.querySelector?.('[is="emby-scroller"], .emby-scroller, .scrollFrame, .itemsContainer') || null;
    if (!scroller || !scroller.closest('.homePage')) return null;
    return {
      controls,
      scroller,
      section: section || scroller.closest('.verticalSection'),
      direction: homeCarouselDirection(button)
    };
  }

  function getCarouselMetrics(scroller) {
    scroller.scroller?.refreshBounds?.();
    const slider = scroller.getScrollSlider?.() || scroller.querySelector?.('.scrollSlider');
    const viewport = Math.max(1, Number(scroller.clientWidth || scroller.offsetWidth || slider?.parentElement?.clientWidth || 1));
    let methodPosition = NaN;
    let methodScrollSize = 0;
    try { methodPosition = Math.max(0, Number(scroller.getScrollPosition?.())); } catch {}
    try { methodScrollSize = Math.max(0, Number(scroller.getScrollSize?.() || 0) || 0); } catch {}
    let transformedPosition = 0;
    let hasTransform = false;
    try {
      const transform = window.getComputedStyle(slider).transform;
      if (transform && transform !== 'none') {
        hasTransform = true;
        let translateX = 0;
        if (typeof window.DOMMatrixReadOnly === 'function') {
          translateX = Number(new window.DOMMatrixReadOnly(transform).m41 || 0);
        } else {
          const values = transform.slice(transform.indexOf('(') + 1, transform.lastIndexOf(')'))
            .split(',').map(value => Number.parseFloat(value.trim()));
          translateX = transform.startsWith('matrix3d(') ? Number(values[12] || 0) : Number(values[4] || 0);
        }
        transformedPosition = Math.max(0, -translateX);
      }
    } catch {}
    const nativePosition = Math.max(0, Number(scroller.scrollLeft || 0) || 0);
    const position = Number.isFinite(methodPosition) ? methodPosition : (hasTransform ? transformedPosition : nativePosition);
    const domMaximum = Math.max(0, Number(scroller.scrollWidth || 0) - viewport);
    const sliderMaximum = Math.max(0, Number(slider?.scrollWidth || slider?.offsetWidth || 0) - viewport);
    const tail = slider?.lastElementChild;
    const contentMaximum = Math.max(0, Number(tail?.offsetLeft || 0) + Number(tail?.offsetWidth || 0) - viewport);
    const methodMaximum = Math.max(0, methodScrollSize - viewport);
    const maximum = Math.max(domMaximum, sliderMaximum, contentMaximum, methodMaximum);
    return { position, maximum, viewport, slider, nativeMaximum: Math.max(domMaximum, methodMaximum) };
  }

  function setCarouselPosition(scroller, position, animate = false, knownMetrics = null) {
    const metrics = knownMetrics || getCarouselMetrics(scroller);
    const normalizedPosition = Math.max(0, Number(position || 0));
    if (animate) {
      const targetState = { position: normalizedPosition, until: Date.now() + 480 };
      homeCarouselTargets.set(scroller, targetState);
      window.setTimeout(() => {
        if (homeCarouselTargets.get(scroller) === targetState) homeCarouselTargets.delete(scroller);
      }, 500);
    } else {
      homeCarouselTargets.delete(scroller);
    }
    if (typeof scroller.scrollToPosition === 'function' && Number.isFinite(Number(scroller.getScrollPosition?.()))) {
      // Card replacement changes scrollWidth without resizing the viewport.
      // Refresh the engine's cached bounds without issuing an intermediate move.
      scroller.scroller?.refreshBounds?.();
      scroller.scrollToPosition(normalizedPosition, !animate || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches));
      return;
    }
    if (metrics.slider) {
      metrics.slider.style.setProperty('transition', animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'transform 440ms cubic-bezier(.22,.61,.36,1)' : 'none', 'important');
      metrics.slider.style.transform = `translate3d(${-normalizedPosition}px, 0, 0)`;
      return;
    }
    const nativeRangeCoversContent = metrics.nativeMaximum >= metrics.maximum - 8;
    if (metrics.nativeMaximum >= 12 && nativeRangeCoversContent) {
      // Certains thèmes Jellyfin n'exposent aucun rail transformable. Leur API
      // reste alors le dernier secours, toujours sans animation différée.
      if (typeof scroller.scrollToPosition === 'function') scroller.scrollToPosition(normalizedPosition, animate);
      else if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left: normalizedPosition, behavior: animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'smooth' : 'auto' });
      else scroller.scrollLeft = normalizedPosition;
      return;
    }
  }

  function homeCarouselCardStep(scroller, slider, viewport) {
    const cached = homeCarouselGeometry.get(scroller);
    if (cached && Math.abs(cached.viewport - viewport) < 2 && cached.slider === slider) return cached.step;
    const sample = slider?.querySelector?.('.card, .listItem, [data-id]');
    const sampleWidth = Number(sample?.offsetWidth || sample?.getBoundingClientRect?.().width || 0);
    const styles = window.getComputedStyle(slider || scroller);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    const step = sampleWidth > 40 ? sampleWidth + gap : 0;
    homeCarouselGeometry.set(scroller, { viewport, slider, step });
    return step;
  }

  function homeCarouselPageDistance(scroller, slider, viewport) {
    const cardStep = homeCarouselCardStep(scroller, slider, viewport);
    if (!cardStep) return Math.max(280, viewport);
    const cardsPerPage = Math.max(1, Math.floor(viewport / cardStep));
    return Math.max(cardStep, cardsPerPage * cardStep);
  }

  function syncHomeCarouselButtons(carousel) {
    const section = carousel?.section;
    if (!section) return;
    const metrics = getCarouselMetrics(carousel.scroller);
    const planned = homeCarouselTargets.get(carousel.scroller);
    const position = planned?.until > Date.now() ? planned.position : metrics.position;
    const { maximum } = metrics;
    const feed = homeCarouselFeed(carousel.scroller);
    section.querySelectorAll('.emby-scrollbuttons-button, .emby-scrollbuttons .scrollbutton').forEach(button => {
      const direction = homeCarouselDirection(button);
      const canExtend = direction === 'right' && feed && !feed.exhausted;
      const disabled = direction === 'left'
        ? maximum < 12 || position <= 8
        : !canExtend && (maximum < 12 || position >= maximum - 8);
      if (button.disabled !== disabled) button.disabled = disabled;
      if (button.getAttribute('aria-disabled') !== String(disabled)) button.setAttribute('aria-disabled', String(disabled));
    });
  }

  function moveHomeCarousel(button) {
    const carousel = getHomeCarousel(button);
    if (!carousel) return false;
    const { scroller, direction } = carousel;
    const metrics = getCarouselMetrics(scroller);
    const planned = homeCarouselTargets.get(scroller);
    const directionSign = direction === 'left' ? -1 : 1;
    const pendingDirection = Math.sign((planned?.position ?? metrics.position) - metrics.position);
    const position = planned?.until > Date.now() && pendingDirection === directionSign
      ? planned.position : metrics.position;
    const { maximum, viewport } = metrics;
    if (direction === 'right' && (maximum < 12 || position >= maximum - 8)) {
      const feed = homeCarouselFeed(scroller);
      if (feed && !feed.exhausted) {
        void extendHomeMovieCarousel(scroller, true);
        return true;
      }
      if (maximum < 12) return false;
      return false;
    }
    if (maximum < 12) return false;
    if (direction === 'left' && position <= 8) return false;
    const slider = scroller.getScrollSlider?.() || scroller.querySelector?.('.scrollSlider, .itemsContainer');
    const distance = homeCarouselPageDistance(scroller, slider, viewport);
    const target = Math.max(0, Math.min(maximum, position + (direction === 'left' ? -distance : distance)));
    decorateHomeCarousel(button);
    setCarouselPosition(scroller, target, true, metrics);
    window.setTimeout(() => syncHomeCarouselButtons(carousel), 300);
    bindHomeCarouselFeed(scroller);
    return true;
  }

  function homeWebpackRequire() {
    if (jellyfinWebpackRequire) return jellyfinWebpackRequire;
    const chunks = window.webpackChunk;
    if (!chunks?.push) return null;
    try {
      const chunkId = 910_000 + Math.floor(performance.now() % 80_000);
      chunks.push([[chunkId], {}, require => { jellyfinWebpackRequire = require; }]);
    } catch {}
    return jellyfinWebpackRequire;
  }

  function homeCarouselCardTools() {
    const require = homeWebpackRequire();
    if (!require) return null;
    try {
      const cards = require(24468);
      const lazy = require(76542);
      return {
        cards: cards?.default || cards,
        lazy: lazy?.default || lazy
      };
    } catch {
      return null;
    }
  }

  function homeCarouselItemKey(value) {
    return String(value || '').replace(/-/g, '').toLowerCase();
  }

  function homeCarouselFeed(scroller) {
    if (!desktopPerformanceProfile() || !window.ApiClient?.getItems) return null;
    const section = scroller?.closest?.('.verticalSection');
    const title = normalizedText(section?.querySelector?.('.sectionTitle')?.textContent);
    const recent = /ajout.*recent|recent.*ajout|recently added|latest/.test(title);
    if (!section || !recent) return null;

    let state = homeCarouselFeeds.get(scroller);
    if (state) return state;
    const itemsContainer = scroller.getScrollSlider?.()
      || scroller.querySelector?.('.scrollSlider, .itemsContainer')
      || null;
    if (!itemsContainer) return null;
    const sample = itemsContainer.querySelector('.card');
    const sectionLink = section.querySelector('.sectionTitleContainer a[href], .sectionTitleTextButton[href]');
    const routeQuery = String(sectionLink?.getAttribute('href') || '').split('?', 2)[1] || '';
    const routeParams = new URLSearchParams(routeQuery);
    const collectionType = normalizedText(routeParams.get('collectionType') || '');
    const sampleType = normalizedText(sample?.dataset?.type || '');
    const includeItemTypes = collectionType === 'tvshows' || sampleType === 'series' || sampleType === 'episode' || /series|anime/.test(title)
      ? 'Series'
      : collectionType === 'movies' || sampleType === 'movie'
        ? 'Movie'
        : '';
    if (!includeItemTypes) return null;
    const shape = sample?.classList.contains('overflowSmallBackdropCard')
      ? 'overflowSmallBackdrop'
      : sample?.classList.contains('overflowBackdropCard')
        ? 'overflowBackdrop'
        : sample?.classList.contains('overflowSquareCard')
          ? 'overflowSquare'
          : sample?.classList.contains('overflowPortraitCard')
            ? 'overflowPortrait'
            : sample?.classList.contains('backdropCard')
              ? 'backdrop'
              : sample?.classList.contains('squareCard') ? 'square' : 'portrait';
    state = {
      scroller,
      section,
      itemsContainer,
      shape,
      parentId: String(routeParams.get('topParentId') || ''),
      includeItemTypes,
      startIndex: 0,
      limit: window.innerWidth >= 1800 ? 48 : 36,
      domLimit: window.innerWidth >= 1800 ? 120 : 96,
      loading: false,
      exhausted: false,
      bound: false,
      ids: new Set([...itemsContainer.querySelectorAll('[data-id]')].map(node => homeCarouselItemKey(node.dataset.id)).filter(Boolean))
    };
    homeCarouselFeeds.set(scroller, state);
    section.dataset.noctraExtendedFeed = `${includeItemTypes.toLowerCase()}-latest`;
    return state;
  }

  function appendHomeCarouselItems(state, items) {
    const tools = homeCarouselCardTools();
    if (!tools?.cards?.getCardsHtml || !items.length || !document.contains(state.itemsContainer)) return 0;
    const markup = tools.cards.getCardsHtml({
      items,
      shape: state.itemsContainer.querySelector('.overflowPortraitCard') ? 'overflowPortrait' : state.shape,
      showTitle: true,
      showYear: /portrait/i.test(state.shape),
      showParentTitle: false,
      centerText: true,
      cardLayout: false,
      overlayText: false,
      overlayPlayButton: true,
      scalable: false,
      lazy: true
    });
    if (!markup) return 0;
    state.itemsContainer.insertAdjacentHTML('beforeend', markup);
    try { tools.lazy?.lazyChildren?.(state.itemsContainer); } catch {}
    items.forEach(item => state.ids.add(homeCarouselItemKey(item.Id)));
    return items.length;
  }

  function recycleHomeCarouselItems(state, position) {
    const cards = [...state.itemsContainer.children].filter(node => node.matches?.('.card, .listItem, [data-id]'));
    const excess = cards.length - Math.max(48, Number(state.domLimit || 96));
    if (excess <= 0) return 0;
    const first = cards[0];
    const keep = cards[excess];
    const distance = Math.max(0, Number(keep?.offsetLeft || 0) - Number(first?.offsetLeft || 0));
    const viewport = Math.max(1, Number(state.scroller.clientWidth || 1));
    if (!distance || Number(position || 0) < distance + viewport * .5) return 0;
    cards.slice(0, excess).forEach(card => card.remove());
    return distance;
  }

  async function extendHomeMovieCarousel(scroller, advanceAfterLoad = false) {
    const state = homeCarouselFeed(scroller);
    if (!state || state.exhausted) return false;
    if (state.loading) {
      state.advanceAfterLoad ||= advanceAfterLoad;
      return false;
    }
    const userId = window.ApiClient?.getCurrentUserId?.() || authContext?.user?.id || '';
    if (!userId) return false;
    state.loading = true;
    state.section.dataset.noctraFeedLoading = 'true';
    const before = getCarouselMetrics(scroller);
    let appended = 0;
    try {
      for (let attempt = 0; attempt < 2 && appended < 12 && !state.exhausted; attempt += 1) {
        const query = {
          StartIndex: state.startIndex,
          Limit: state.limit,
          Recursive: true,
          IncludeItemTypes: state.includeItemTypes,
          SortBy: 'DateCreated,SortName',
          SortOrder: 'Descending',
          Fields: 'PrimaryImageAspectRatio,DateCreated,ProductionYear,MediaSourceCount',
          ImageTypeLimit: 1,
          EnableImageTypes: 'Primary,Backdrop,Thumb',
          EnableTotalRecordCount: true
        };
        if (state.parentId) query.ParentId = state.parentId;
        const result = await window.ApiClient.getItems(userId, query);
        const page = Array.isArray(result?.Items) ? result.Items : [];
        state.startIndex += page.length;
        // Jellyfin can populate its first cards after the feed state is created.
        // Read the mounted IDs after the request, not only during initialization.
        for (const node of state.itemsContainer.querySelectorAll('[data-id]')) {
          const key = homeCarouselItemKey(node.dataset.id);
          if (key) state.ids.add(key);
        }
        const pageIds = new Set(state.ids);
        const fresh = page.filter(item => {
          const key = homeCarouselItemKey(item?.Id);
          if (!key || pageIds.has(key)) return false;
          pageIds.add(key);
          return true;
        });
        appended += appendHomeCarouselItems(state, fresh);
        const total = Number(result?.TotalRecordCount || 0);
        state.exhausted = page.length === 0 || page.length < state.limit || (total > 0 && state.startIndex >= total);
      }
      if (appended) {
        // Preserve the position reached while the asynchronous page was loading.
        while (homeCarouselTargets.get(scroller)?.until > Date.now()) {
          await new Promise(resolve => window.setTimeout(resolve, 80));
          if (!scroller.isConnected) return false;
        }
        const currentPosition = getCarouselMetrics(scroller).position;
        const recycledDistance = recycleHomeCarouselItems(state, currentPosition);
        // Let an in-progress arrow animation settle before recalculating its bounds.
        await new Promise(resolve => window.setTimeout(resolve, 400));
        if (!scroller.isConnected) return false;
        const settledPosition = getCarouselMetrics(scroller).position;
        const preservedPosition = Math.max(0, settledPosition - recycledDistance);
        enableInfiniteHomeCarousels(state.section);
        if (advanceAfterLoad || state.advanceAfterLoad) {
          state.advanceAfterLoad = false;
          window.requestAnimationFrame(() => {
            const after = getCarouselMetrics(scroller);
            const slider = scroller.getScrollSlider?.() || scroller.querySelector?.('.scrollSlider, .itemsContainer');
            const target = Math.min(after.maximum, preservedPosition + homeCarouselPageDistance(scroller, slider, before.viewport));
            setCarouselPosition(scroller, target, true);
            window.setTimeout(() => syncHomeCarouselButtons({ scroller, section: state.section }), 300);
          });
        } else if (recycledDistance) {
          setCarouselPosition(scroller, preservedPosition, false);
        }
      }
      return appended > 0;
    } catch {
      return false;
    } finally {
      state.loading = false;
      state.advanceAfterLoad = false;
      delete state.section.dataset.noctraFeedLoading;
      if (state.exhausted) state.section.dataset.noctraFeedExhausted = 'true';
      syncHomeCarouselButtons({ scroller, section: state.section });
    }
  }

  function bindHomeCarouselFeed(scroller) {
    if (!scroller || boundHomeScrollers.has(scroller)) return;
    boundHomeScrollers.add(scroller);
    const section = scroller.closest('.verticalSection');
    const controls = section?.querySelector('.emby-scrollbuttons');
    // Jellyfin updates disabled after its animation using cached bounds. Keep
    // the arrows aligned with the actual cards, including asynchronously added cards.
    let buttonFrame = 0;
    const syncButtons = () => {
      if (buttonFrame) return;
      buttonFrame = requestAnimationFrame(() => {
        buttonFrame = 0;
        if (scroller.isConnected) syncHomeCarouselButtons({scroller, section});
      });
    };
    if (controls) new MutationObserver(syncButtons).observe(controls, {subtree:true, attributes:true, attributeFilter:['disabled','aria-disabled']});
    scroller.addEventListener('scroll', syncButtons, {passive:true});
    try { scroller.addScrollEventListener?.(syncButtons); } catch {}
    let pendingCheck = 0;
    const check = () => {
      if (pendingCheck || document.body.classList.contains('noctra-panel-open')) return;
      pendingCheck = window.setTimeout(() => {
        pendingCheck = 0;
        if (!scroller.isConnected || document.body.classList.contains('noctra-panel-open')) return;
        const metrics = getCarouselMetrics(scroller);
        syncButtons();
        const state = homeCarouselFeed(scroller);
        if (state && metrics.position >= metrics.maximum - metrics.viewport * 1.4) void extendHomeMovieCarousel(scroller);
      }, 120);
    };
    scroller.addEventListener('scroll', check, { passive: true });
    scroller.addEventListener('wheel', check, { passive: true });
    scroller.addEventListener('pointerup', check, { passive: true });
    try { scroller.addScrollEventListener?.(check); } catch {}
  }

  function bindMobileCarouselLoop(scroller) {
    if (scroller.dataset.noctraMobileLoop || window.innerWidth > 760) return;
    const slider = scroller.getScrollSlider?.() || scroller.querySelector('.scrollSlider, .itemsContainer');
    if (!slider || slider.children.length < 4 || typeof scroller.scrollToPosition !== 'function') return;
    scroller.dataset.noctraMobileLoop = 'true';
    let frame = 0, busy = false;
    const rotate = () => {
      frame = 0;
      if (busy || !scroller.isConnected || window.innerWidth > 760 || document.body.classList.contains('noctra-panel-open') || slider.contains(document.activeElement)) return;
      // Mobile Jellyfin scrolls the slider itself. A transform here clips its
      // viewport and double-counts the finger movement.
      const viewport = scroller.clientWidth;
      const position = Math.max(0, Number(scroller.getScrollPosition?.() || 0));
      const maximum = Math.max(0, Number(scroller.getScrollSize?.() || 0) - viewport);
      const metrics = {position, maximum, viewport};
      if (metrics.maximum < metrics.viewport) return;
      const children = [...slider.children];
      if (!children.every(node => node.classList.contains('card') || node.classList.contains('cardColumn'))) return;
      const first = children[0], second = children[1], last = children[children.length-1];
      const stride = second.offsetLeft - first.offsetLeft;
      if (!(stride > 0)) return;
      busy = true;
      if (metrics.position < stride * .5) {
        slider.insertBefore(last, first); scroller.scroller?.reload?.();
        scroller.scrollToPosition(metrics.position + stride, true);
      } else if (metrics.position > metrics.maximum - stride * .5) {
        slider.append(first); scroller.scroller?.reload?.();
        scroller.scrollToPosition(metrics.position - stride, true);
      }
      busy = false;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(rotate); };
    scroller.addEventListener('scroll', schedule, {passive:true});
    scroller.addEventListener('touchend', schedule, {passive:true});
    try { scroller.addScrollEventListener?.(schedule); } catch {}
    schedule();
  }

  function enableInfiniteHomeCarousels(root = document) {
    if (window.innerWidth <= 760) {
      root.querySelectorAll?.('.homePage .emby-scroller').forEach(bindMobileCarouselLoop);
    }
    root.querySelectorAll?.('.homePage .emby-scrollbuttons-button, .homePage .emby-scrollbuttons .scrollbutton').forEach(button => {
      const carousel = getHomeCarousel(button);
      if (!carousel || getCarouselMetrics(carousel.scroller).maximum < 12) return;
      bindHomeCarouselFeed(carousel.scroller);
      delete button.dataset.noctraInfinite;
    });
  }


  function fileBreadcrumb(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    const crumbs = [{ label: 'Racine', path: '' }];
    parts.forEach((part, index) => crumbs.push({
      label: part,
      path: parts.slice(0, index + 1).join('/')
    }));
    return crumbs.map((crumb, index) => `
      <button type="button" data-file-open="${escapeHtml(crumb.path)}"
        ${index === crumbs.length - 1 ? 'disabled' : ''}>${escapeHtml(crumb.label)}</button>`).join('<span>/</span>');
  }

  function fileExplorerRow(item) {
    const directory = item.type === 'directory';
    const typeLabel = directory ? 'Dossier' : item.type === 'file' ? (item.extension?.toUpperCase() || 'Fichier') : 'Lien';
    return `
      <article class="noctra-file-row" data-file-kind="${escapeHtml(item.type)}">
        <button class="noctra-file-main" type="button"
          ${directory ? `data-file-open="${escapeHtml(item.path)}"` : 'disabled'}>
          <span class="noctra-file-icon">${directory ? icons.folder : icons.library}</span>
          <span><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(typeLabel)}${directory ? '' : ` · ${formatBytes(item.size)}`} · ${escapeHtml(formatDate(item.modifiedAt))}</small></span>
        </button>
        ${item.manageable ? `<div class="noctra-file-actions">
          <button class="noctra-icon-button" type="button" data-file-rename="${escapeHtml(item.path)}"
            data-file-name="${escapeHtml(item.name)}" aria-label="Renommer">${icons.edit}</button>
          <button class="noctra-icon-button noctra-icon-button--danger" type="button"
            data-file-trash="${escapeHtml(item.path)}" data-file-name="${escapeHtml(item.name)}"
            aria-label="Mettre à la corbeille">${icons.trash}</button>
        </div>` : ''}
      </article>`;
  }

  function duplicateScanProgress(status) {
    if (!status?.running) return 100;
    if (status.phase === 'hash' && Number(status.candidateFiles) > 0) {
      return Math.max(5, Math.min(99, Math.round(Number(status.hashedFiles || 0) / Number(status.candidateFiles) * 100)));
    }
    return Math.max(2, Math.min(35, Math.round(Number(status.scannedFiles || 0) / 4_000 * 35)));
  }

  function duplicateSelectionSummary() {
    const confirm = document.querySelector('#noctra-confirm');
    if (!confirm) return;
    const selected = [...confirm.querySelectorAll('[data-duplicate-file]:checked')];
    const bytes = selected.reduce((sum, input) => sum + Number(input.dataset.duplicateSize || 0), 0);
    const summary = confirm.querySelector('[data-duplicate-selection-summary]');
    if (summary) summary.textContent = selected.length
      ? `${selected.length} fichier${selected.length > 1 ? 's' : ''} · ${formatBytes(bytes)} à supprimer`
      : 'Aucun fichier sélectionné';
    const submit = confirm.querySelector('[data-duplicate-delete]');
    if (submit) submit.disabled = selected.length === 0;
    const selectAll = confirm.querySelector('[data-duplicate-select-all]');
    const all = [...confirm.querySelectorAll('[data-duplicate-file]')];
    if (selectAll) {
      selectAll.checked = all.length > 0 && selected.length === all.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < all.length;
    }
  }

  function duplicateGroupMarkup(group, groupIndex) {
    const keep = group.keep || {};
    const duplicates = Array.isArray(group.duplicates) ? group.duplicates : [];
    return `<section class="noctra-duplicate-group">
      <header><div><strong>${escapeHtml(keep.name || keep.path || 'Fichier')}</strong><span>${formatBytes(group.size)} · SHA-256 confirmé</span></div><span>${duplicates.length + 1} copies</span></header>
      <div class="noctra-duplicate-copy" data-copy-kind="keep">
        <span class="noctra-duplicate-copy-state">${icons.check}<b>Conserver</b></span>
        <span><strong>${escapeHtml(keep.rootLabel || keep.root || 'Média')}</strong><small title="${escapeHtml(keep.path || '')}">${escapeHtml(keep.path || '')}</small></span>
      </div>
      ${duplicates.map((item, duplicateIndex) => `<label class="noctra-duplicate-copy" data-copy-kind="duplicate">
        <input type="checkbox" data-duplicate-file value="${groupIndex}:${duplicateIndex}" data-duplicate-size="${Number(item.size || group.size || 0)}">
        <span><strong>${escapeHtml(item.rootLabel || item.root || 'Média')}</strong><small title="${escapeHtml(item.path || '')}">${escapeHtml(item.path || '')}</small></span>
        <span>${formatDate(item.modifiedAt)}</span>
      </label>`).join('')}
    </section>`;
  }

  function bindExplorerDialogFocus(form) {
    form.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...form.querySelectorAll('button:not(:disabled), input:not(:disabled), select, summary')]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      const first = controls[0], last = controls.at(-1);
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    form.querySelector('[aria-label="Fermer"]')?.focus({ preventScroll: true });
  }

  function renderDuplicateDialog(status) {
    fileDuplicateStatus = status || {};
    const confirm = document.querySelector('#noctra-confirm');
    if (!confirm) return;
    const running = Boolean(status?.running);
    const failed = status?.phase === 'error' || status?.phase === 'failed';
    const groups = Array.isArray(status?.groups) ? status.groups : [];
    const duplicateCount = Number(status?.duplicateFiles || 0);
    const progress = duplicateScanProgress(status);
    const previous = confirm.querySelector('#noctra-duplicate-form');
    if (running && previous?.dataset.running === 'true') {
      previous.querySelector('[data-duplicate-message]').textContent = status.message || 'Analyse…';
      previous.querySelector('[data-duplicate-progress-bar]').style.width = `${progress}%`;
      previous.querySelector('[data-duplicate-progress-counts]').textContent = `${Number(status.scannedFiles || 0).toLocaleString('fr-FR')} fichiers inventoriés · ${Number(status.hashedFiles || 0).toLocaleString('fr-FR')} empreintes vérifiées`;
      previous.querySelector('[data-duplicate-current]').textContent = status.current || '';
      return;
    }
    confirm.innerHTML = `<form class="noctra-confirm-card noctra-duplicate-dialog" id="noctra-duplicate-form" data-running="${running}" role="dialog" aria-modal="true" aria-label="Détecter les fichiers en double">
      <header class="noctra-duplicate-dialog-head">
        <span class="noctra-confirm-icon">${icons.verify}</span>
        <div><p class="noctra-eyebrow">EXPLORATEUR · VÉRIFICATION EXACTE</p><h2>Fichiers en double</h2><p data-duplicate-message>${escapeHtml(status?.message || 'Préparation de l’analyse…')}</p></div>
        <button class="noctra-icon-button" type="button" data-duplicate-close aria-label="Fermer">×</button>
      </header>
      ${running ? `<div class="noctra-duplicate-progress" aria-live="polite">
        <div><span data-duplicate-progress-bar style="width:${progress}%"></span></div>
        <p data-duplicate-progress-counts>${Number(status.scannedFiles || 0).toLocaleString('fr-FR')} fichiers inventoriés · ${Number(status.hashedFiles || 0).toLocaleString('fr-FR')} empreintes vérifiées</p>
        <small data-duplicate-current>${escapeHtml(status.current || '')}</small>
      </div>` : failed ? `<div class="noctra-error">${escapeHtml(status?.error || status?.message || 'La vérification a échoué.')}</div>` : `
        <div class="noctra-duplicate-summary">
          <span><small>Groupes</small><strong>${groups.length.toLocaleString('fr-FR')}</strong></span>
          <span><small>Doublons</small><strong>${duplicateCount.toLocaleString('fr-FR')}</strong></span>
          <span><small>Récupérable</small><strong>${formatBytes(status?.reclaimableBytes || 0)}</strong></span>
          <label><input type="checkbox" data-duplicate-select-all><span>Tout sélectionner</span></label>
        </div>
        <div class="noctra-duplicate-groups">
          ${groups.map(duplicateGroupMarkup).join('') || '<div class="noctra-empty">Aucun doublon exact détecté dans les médiathèques.</div>'}
        </div>
        <p class="noctra-confirm-error" data-duplicate-error hidden></p>
        <footer class="noctra-confirm-actions noctra-duplicate-actions">
          <span data-duplicate-selection-summary>Aucun fichier sélectionné</span>
          <button class="noctra-button" type="button" data-duplicate-rescan>${icons.refresh}<span>Revérifier</span></button>
          <button class="noctra-button noctra-button--danger" type="submit" data-duplicate-delete disabled>${icons.trash}<span>Supprimer la sélection</span></button>
        </footer>`}
      ${running || failed ? `<footer class="noctra-confirm-actions noctra-duplicate-actions"><span></span><button class="noctra-button" type="button" data-duplicate-rescan ${running ? 'disabled' : ''}>Revérifier</button><button class="noctra-button" type="button" data-duplicate-close>Fermer</button></footer>` : ''}
    </form>`;
    confirm.dataset.open = 'true';
    duplicateSelectionSummary();
    bindExplorerDialogFocus(confirm.querySelector('#noctra-duplicate-form'));
  }

  function closeDuplicateDialog() {
    window.clearTimeout(fileDuplicateTimer);
    fileDuplicateTimer = null;
    fileDuplicateStatus = null;
    closeConfirm();
    document.querySelector('[data-file-duplicates]')?.focus({ preventScroll: true });
  }

  async function refreshDuplicateStatus(sequence = fileDuplicateSequence) {
    window.clearTimeout(fileDuplicateTimer);
    fileDuplicateTimer = null;
    try {
      const status = await api('/api/files/duplicates/status', { timeoutMs: 20_000 });
      if (sequence !== fileDuplicateSequence || !document.querySelector('#noctra-duplicate-form')) return;
      renderDuplicateDialog(status);
      if (status.running) fileDuplicateTimer = window.setTimeout(() => refreshDuplicateStatus(sequence), 900);
    } catch (error) {
      if (sequence !== fileDuplicateSequence || !document.querySelector('#noctra-duplicate-form')) return;
      renderDuplicateDialog({ phase: 'error', running: false, message: error.message, error: error.message, groups: [] });
    }
  }

  async function openDuplicateDialog() {
    window.clearTimeout(fileDuplicateTimer);
    const sequence = ++fileDuplicateSequence;
    renderDuplicateDialog({ running: true, phase: 'scan', message: 'Inventaire des médiathèques…', groups: [] });
    try {
      await api('/api/files/duplicates/start', { method: 'POST', timeoutMs: 20_000 });
    } catch (error) {
      if (sequence !== fileDuplicateSequence) return;
      if (!/déjà en cours/i.test(error.message || '')) {
        renderDuplicateDialog({ phase: 'error', running: false, message: error.message, error: error.message, groups: [] });
        return;
      }
    }
    if (sequence === fileDuplicateSequence) await refreshDuplicateStatus(sequence);
  }

  async function deleteSelectedDuplicates(form) {
    const selected = [...form.querySelectorAll('[data-duplicate-file]:checked')];
    if (!selected.length || !fileDuplicateStatus) return;
    const items = selected.map(input => {
      const [groupIndex, duplicateIndex] = input.value.split(':').map(Number);
      const group = fileDuplicateStatus.groups?.[groupIndex];
      const duplicate = group?.duplicates?.[duplicateIndex];
      if (!group?.keep || !duplicate) return null;
      return {
        root: duplicate.root,
        path: duplicate.path,
        keepRoot: group.keep.root,
        keepPath: group.keep.path,
        size: group.size,
        hash: group.hash
      };
    }).filter(Boolean);
    const bytes = items.reduce((sum, item) => sum + Number(item.size || 0), 0);
    if (!items.length || !window.confirm(`Supprimer définitivement ${items.length} copie${items.length > 1 ? 's' : ''} confirmée${items.length > 1 ? 's' : ''} (${formatBytes(bytes)}) ? Une copie de chaque fichier restera conservée.`)) return;
    const submit = form.querySelector('[data-duplicate-delete]');
    const errorNode = form.querySelector('[data-duplicate-error]');
    if (submit) { submit.disabled = true; submit.innerHTML = `${icons.verify}<span>Dernière vérification…</span>`; }
    if (errorNode) errorNode.hidden = true;
    try {
      const result = await api('/api/files/duplicates/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
        timeoutMs: 180_000
      });
      clearApiCache('/api/files');
      toast(result.message || `${result.removed || 0} doublon(s) supprimé(s).`);
      if (Array.isArray(result.errors) && result.errors.length) {
        if (errorNode) {
          errorNode.textContent = `${result.errors.length} fichier(s) non supprimé(s) : ${result.errors[0]?.message || 'vérification refusée'}`;
          errorNode.hidden = false;
        }
        if (submit) { submit.disabled = false; submit.innerHTML = `${icons.trash}<span>Supprimer la sélection</span>`; }
        return;
      }
      await openDuplicateDialog();
    } catch (error) {
      if (errorNode) { errorNode.textContent = error.message; errorNode.hidden = false; }
      if (submit) { submit.disabled = false; submit.innerHTML = `${icons.trash}<span>Supprimer la sélection</span>`; }
    }
  }

  function completenessOverview(status, kind) {
    const groups = (status?.groups || []).filter(group => group.kind === kind);
    const counts = { incomplete: 0, complete: 0, unknown: 0, missing: 0 };
    for (const group of groups) {
      counts[group.status] = (counts[group.status] || 0) + 1;
      counts.missing += Number(group.missingCount || 0);
    }
    return { groups, counts };
  }

  function completenessGroups() {
    const form = document.querySelector('#noctra-completeness-form');
    if (!form) return;
    const status = form.querySelector('[data-completeness-status]')?.value || 'attention';
    const query = (form.querySelector('[data-completeness-search]')?.value || '').toLocaleLowerCase('fr');
    const groups = completenessOverview(completenessStatus, completenessKind).groups.filter(group =>
      (status === 'all' || (status === 'attention' ? group.status !== 'complete' || group.upcomingCount : group.status === status))
      && group.title.toLocaleLowerCase('fr').includes(query));
    const container = form.querySelector('[data-completeness-groups]');
    container.innerHTML = groups.map(group => `<details class="noctra-completeness-group" data-completeness-group="${escapeHtml(group.id)}">
      <summary><span><strong>${escapeHtml(group.title)}</strong><small>${group.kind === 'movie' ? 'Saga' : 'Série'}${group.source ? ` · ${escapeHtml(group.source)}` : ''} · ${group.present}/${group.expected || '?'} présents</small></span>
      <span class="noctra-completeness-state" data-state="${group.status}">${group.missingCount ? `${group.missingCount} manquant${group.missingCount > 1 ? 's' : ''}` : group.status === 'unknown' ? 'À vérifier' : 'À jour'}${group.upcomingCount ? ` · ${group.upcomingCount} à venir` : ''}</span></summary>
      ${group.warning ? `<p class="noctra-completeness-warning">${escapeHtml(group.warning)}</p>` : ''}
      <div data-completeness-entries></div>
    </details>`).join('') || '<p class="noctra-empty">Aucun résultat pour ces filtres.</p>';
    container.querySelectorAll('details').forEach(details => details.addEventListener('toggle', () => {
      if (details.open && !details.dataset.loaded) void loadCompletenessGroup(details);
    }));
  }

  async function loadCompletenessGroup(details, offset = 0) {
    if (!details || details.dataset.loading === 'true') return;
    details.dataset.loading = 'true';
    const sequence = completenessSequence;
    const list = details.querySelector('[data-completeness-entries]');
    if (!offset) list.innerHTML = '<p class="noctra-empty">Chargement…</p>';
    const more = details.querySelector('[data-completeness-more]');
    if (more) more.disabled = true;
    try {
      const data = await api(`/api/files/completeness/group?id=${encodeURIComponent(details.dataset.completenessGroup)}&offset=${offset}`, { timeoutMs: 20_000 });
      if (!details.isConnected || sequence !== completenessSequence) return;
      if (!offset) list.innerHTML = '';
      more?.remove();
      const states = { missing: 'Manquant', upcoming: 'À venir', undated: 'Date inconnue', unverified: 'À vérifier' };
      list.insertAdjacentHTML('beforeend', data.entries.map(row => `<div class="noctra-completeness-entry">
        <span><strong>${row.season ? `S${String(row.season).padStart(2, '0')}E${String(row.episode).padStart(2, '0')} · ` : ''}${escapeHtml(row.title)}</strong><small>${row.date ? escapeHtml(formatDate(row.date)) : 'Date non annoncée'}</small></span>
        <span data-state="${escapeHtml(row.state)}">${states[row.state] || 'À vérifier'}</span></div>`).join('')
        || (!offset ? '<p class="noctra-empty">Aucun contenu manquant identifié.</p>' : ''));
      if (data.nextOffset !== null) list.insertAdjacentHTML('beforeend', `<button type="button" class="noctra-button" data-completeness-more="${data.nextOffset}">Afficher la suite (${data.total - data.nextOffset})</button>`);
      details.dataset.loaded = 'true';
    } catch (error) {
      if (details.isConnected && sequence === completenessSequence) {
        if (!offset) list.innerHTML = `<p class="noctra-error">${escapeHtml(error.message)}</p><button type="button" class="noctra-button" data-completeness-more="0">Réessayer</button>`;
        else { if (more) more.disabled = false; toast(error.message); }
      }
    } finally { details.dataset.loading = 'false'; }
  }

  function renderCompletenessDialog(status) {
    completenessStatus = status;
    const confirm = document.querySelector('#noctra-confirm');
    if (!confirm) return;
    let form = confirm.querySelector('#noctra-completeness-form');
    if (form?.dataset.running === 'true' && status.running) {
      form.querySelector('[data-completeness-progress]').textContent = `${status.message || 'Analyse'}${status.total ? ` · ${status.processed}/${status.total}` : ''}`;
      return;
    }
    const { groups, counts } = completenessOverview(status, completenessKind);
    const movies = completenessKind === 'movie';
    confirm.innerHTML = `<section class="noctra-confirm-card noctra-completeness-dialog" id="noctra-completeness-form" data-running="${Boolean(status.running)}" data-kind="${completenessKind}" role="dialog" aria-modal="true" aria-labelledby="noctra-completeness-title">
      <header class="noctra-duplicate-dialog-head"><span class="noctra-confirm-icon">${icons.library}</span>
        <div><p class="noctra-eyebrow">EXPLORATEUR · COLLECTIONS</p><h2 id="noctra-completeness-title">${movies ? 'Sagas de films' : 'Séries'}</h2></div>
        <button type="button" class="noctra-icon-button" data-completeness-close aria-label="Fermer">×</button>
      </header>
      ${status.running ? `<p class="noctra-completeness-progress" data-completeness-progress role="status">${escapeHtml(status.message || 'Préparation…')}${status.total ? ` · ${status.processed}/${status.total}` : ''}</p>` : ''}
      ${status.phase === 'failed' ? `<div class="noctra-error">${escapeHtml(status.message)}</div>` : ''}
      ${!status.running && status.phase === 'complete' ? `<div class="noctra-completeness-summary">
        <span><small>Incomplètes</small><strong>${counts.incomplete}</strong></span><span><small>À jour</small><strong>${counts.complete}</strong></span><span><small>À vérifier</small><strong>${counts.unknown}</strong></span><span><small>${movies ? 'Films absents' : 'Épisodes absents'}</small><strong>${counts.missing}</strong></span>
      </div><p class="noctra-completeness-note">${groups.length} ${movies ? 'sagas' : 'séries'} · ${movies ? `${status.standalone || 0} films hors saga` : 'Hors épisodes spéciaux'}${status.finishedAt ? ` · ${escapeHtml(formatDate(status.finishedAt))}` : ''}</p>
      <div class="noctra-completeness-filters">
        <input class="noctra-input" type="search" data-completeness-search placeholder="Rechercher un titre" aria-label="Rechercher un titre">
        <select class="noctra-input" data-completeness-status aria-label="État des collections"><option value="attention">Manquants, à venir ou à vérifier</option><option value="incomplete">Incomplètes</option><option value="complete">À jour</option><option value="unknown">À vérifier</option><option value="all">Toutes</option></select>
      </div>${(status.warnings || []).length ? `<details class="noctra-completeness-notices"><summary>${status.warnings.length} avertissement(s)</summary>${status.warnings.map(warning => `<p class="noctra-completeness-warning">${escapeHtml(warning)}</p>`).join('')}</details>` : ''}<div class="noctra-completeness-groups" data-completeness-groups></div>` : ''}
      <footer class="noctra-confirm-actions"><button type="button" class="noctra-button" data-completeness-restart ${status.running ? 'disabled' : ''}>${icons.refresh}<span>Revérifier</span></button><button type="button" class="noctra-button" data-completeness-close>Fermer</button></footer>
    </section>`;
    confirm.dataset.open = 'true';
    form = confirm.querySelector('#noctra-completeness-form');
    bindExplorerDialogFocus(form);
    form.querySelector('[data-completeness-search]')?.addEventListener('input', completenessGroups);
    form.querySelectorAll('select').forEach(select => select.addEventListener('change', completenessGroups));
    if (form.querySelector('[data-completeness-groups]')) completenessGroups();
  }

  async function refreshCompletenessStatus(sequence) {
    window.clearTimeout(completenessTimer);
    try {
      const status = await api('/api/files/completeness/status', { timeoutMs: 20_000 });
      if (sequence !== completenessSequence || !document.querySelector('#noctra-completeness-form')) return;
      renderCompletenessDialog(status);
      if (status.running) completenessTimer = window.setTimeout(() => refreshCompletenessStatus(sequence), 1500);
    } catch (error) {
      if (sequence === completenessSequence && document.querySelector('#noctra-completeness-form')) renderCompletenessDialog({ phase: 'failed', message: error.message });
    }
  }

  async function openCompletenessDialog(kind = 'movie', restart = false) {
    window.clearTimeout(completenessTimer);
    completenessKind = kind === 'series' ? 'series' : 'movie';
    const sequence = ++completenessSequence;
    renderCompletenessDialog({ running: true, message: 'Inventaire des collections…' });
    document.querySelector('[data-completeness-close]')?.focus({ preventScroll: true });
    try {
      let status = restart ? null : await api('/api/files/completeness/status', { timeoutMs: 20_000 });
      if (sequence !== completenessSequence) return;
      if (!status || status.phase === 'idle') status = await api('/api/files/completeness/start', { method: 'POST', timeoutMs: 20_000 });
      if (sequence !== completenessSequence) return;
      renderCompletenessDialog(status);
      if (status.running) completenessTimer = window.setTimeout(() => refreshCompletenessStatus(sequence), 1500);
    } catch (error) {
      if (sequence === completenessSequence) renderCompletenessDialog({ phase: 'failed', message: error.message });
    }
  }

  async function openFileExplorer(rootId = '', path = '') {
    if (!authContext?.isAdmin) {
      toast('L’explorateur de fichiers est réservé aux administrateurs.');
      return;
    }
    setLoading('Explorateur média', 'FICHIERS · ULTRA.CC', true);
    try {
      if (!fileExplorerState.roots.length) {
        const rootsData = await cachedApi('/api/files/roots', 60_000);
        fileExplorerState.roots = rootsData.roots || [];
      }
      const availableRoots = fileExplorerState.roots.filter(root => root.available);
      const selectedRoot = availableRoots.find(root => root.id === rootId)
        || availableRoots.find(root => root.id === fileExplorerState.root)
        || availableRoots[0];
      if (!selectedRoot) throw new Error('Aucun dossier média configuré ou accessible.');
      const listingPath = `/api/files?root=${encodeURIComponent(selectedRoot.id)}&path=${encodeURIComponent(path || '')}`;
      const data = await cachedApi(listingPath, 12_000);
      fileExplorerState.root = selectedRoot.id;
      fileExplorerState.path = data.path || '';
      const tabs = fileExplorerState.roots.map(root => `
        <button class="noctra-tab" type="button" data-file-root="${escapeHtml(root.id)}"
          data-active="${root.id === selectedRoot.id}" ${root.available ? '' : 'disabled'}>
          ${escapeHtml(root.label)}
        </button>`).join('');
      setPanelBody(`
        <div class="noctra-release-toolbar noctra-file-toolbar">
          <div>
            <strong>Gestion sécurisée des dossiers média</strong>
            <span>Navigation limitée aux racines autorisées, dont Trash. Les suppressions classiques vont dans .noctra-trash.</span>
          </div>
          <div class="noctra-file-toolbar-actions">
            <button class="noctra-button" type="button" data-files-back-libraries>← Médiathèques</button>
            <button class="noctra-button" type="button" data-file-duplicates>${icons.verify}<span>Détecter les doublons</span></button>
            <button class="noctra-button" type="button" data-file-completeness="movie">${icons.library}<span>Sagas</span></button>
            <button class="noctra-button" type="button" data-file-completeness="series">${icons.tv}<span>Séries</span></button>
            ${selectedRoot.id === 'trash' ? `<button class="noctra-button noctra-button--danger" type="button" data-file-empty-trash>${icons.empty}<span>Vider Trash</span></button>` : ''}
            <button class="noctra-button noctra-button--primary" type="button" data-file-mkdir>+ Nouveau dossier</button>
          </div>
        </div>
        <div class="noctra-tabs noctra-file-roots">${tabs}</div>
        <nav class="noctra-file-breadcrumb" aria-label="Chemin">${fileBreadcrumb(data.path)}</nav>
        ${data.parent !== null ? `<button class="noctra-button noctra-file-up" type="button" data-file-open="${escapeHtml(data.parent)}">${icons.up}<span>Dossier parent</span></button>` : ''}
        <div class="noctra-file-list">
          ${(data.items || []).map(fileExplorerRow).join('') || '<div class="noctra-empty">Ce dossier est vide.</div>'}
        </div>
        ${data.truncated ? '<div class="noctra-access-note"><strong>Affichage limité</strong><span>Seuls les 1 000 premiers éléments sont affichés.</span></div>' : ''}`);
    } catch (error) {
      showError(error);
    }
  }

  function trackerBadgeMarkup(item) {
    const title = item.title || item.name || '';
    const year = String(item.releaseDate || item.firstAirDate || '').slice(0, 4);
    return `<div class="noctra-tracker-status" data-tracker-status="pending"
      data-availability-title="${escapeHtml(title)}" data-availability-year="${escapeHtml(year)}"
      data-availability-id="${escapeHtml(item.id || '')}"
      data-availability-type="${item.mediaType === 'tv' ? 'tv' : 'movie'}">
      <span class="noctra-tracker-dot"></span>
      <span class="noctra-tracker-copy">Analyse des trackers…</span>
      <button class="noctra-tracker-retry" type="button" data-tracker-retry hidden aria-label="Relancer la vérification">${icons.retry}</button>
    </div>`;
  }

  function discoveryExplanation(item) {
    const signals = Array.isArray(item.explanation?.signals) ? item.explanation.signals : [];
    const confidence = Number(item.explanation?.confidence || 0);
    const breakdown = item.explanation?.breakdown || {};
    if (!signals.length && !confidence && !Object.keys(breakdown).length) return '';
    const labels = {
      base: 'Signal global', genres: 'Affinité genres', similarities: 'Titres proches',
      balance: 'Équilibre film/série', feedback: 'Tes retours', diversity: 'Diversité', novelty: 'Découverte'
    };
    const rows = Object.entries(breakdown)
      .filter(([key, value]) => key !== 'base' && Number(value || 0) !== 0)
      .map(([key, value]) => `<span><b>${escapeHtml(labels[key] || key)}</b><i>${Number(value) > 0 ? '+' : ''}${Math.round(Number(value))}</i></span>`)
      .join('');
    return `<div class="noctra-discovery-explanation">
      ${confidence ? `<span class="noctra-confidence"><i style="--confidence:${Math.min(100, confidence)}%"></i>${confidence}% d'affinité</span>` : ''}
      ${signals.slice(0, 3).map(signal => `<span class="noctra-signal">${escapeHtml(signal)}</span>`).join('')}
      ${rows ? `<details class="noctra-discovery-why"><summary>Pourquoi cette suggestion ?</summary><div>${rows}</div></details>` : ''}
    </div>`;
  }


  function discoveryImageMarkup(item, variant, title) {
    const backdrop = String(item.backdropPath || '').trim();
    const poster = String(item.posterPath || '').trim();
    const path = backdrop || poster;
    if (!path) return '<div class="noctra-card__image noctra-card__image--empty"></div>';
    const sizes = variant === 'featured'
      ? '(max-width: 760px) calc(100vw - 24px), (max-width: 1180px) 62vw, 760px'
      : '(max-width: 760px) 82vw, (max-width: 1180px) 44vw, 390px';
    const srcset = backdrop
      ? `https://image.tmdb.org/t/p/w500${path} 500w, https://image.tmdb.org/t/p/w780${path} 780w`
      : `https://image.tmdb.org/t/p/w342${path} 342w, https://image.tmdb.org/t/p/w500${path} 500w`;
    return `<img class="noctra-card__image" src="https://image.tmdb.org/t/p/w500${escapeHtml(path)}"
      srcset="${escapeHtml(srcset)}" sizes="${escapeHtml(sizes)}" alt="${escapeHtml(title)}"
      loading="${variant === 'featured' ? 'eager' : 'lazy'}" fetchpriority="${variant === 'featured' ? 'high' : 'low'}" decoding="async">`;
  }


  function discoveryCard(item, variant = '') {
    const title = item.title || item.name || 'Sans titre';
    const date = item.releaseDate || item.firstAirDate;
    const image = item.backdropPath
      ? `https://image.tmdb.org/t/p/w780${item.backdropPath}`
      : item.posterPath
        ? `https://image.tmdb.org/t/p/w500${item.posterPath}`
        : '';
    const requestState = item.requestState || { key: 'loading', label: 'Vérification…', disabled: true };
    const serviceId = item.resolvedServiceId || item.mediaInfo?.externalServiceId;
    const interactive = Boolean(authContext?.isAdmin && serviceId);
    const year = String(date || '').slice(0, 4);
    const overview = String(item.overview || '').trim();
    return `
      <article class="noctra-card noctra-discovery-card${variant ? ` noctra-discovery-card--${escapeHtml(variant)}` : ''}" data-media-type="${escapeHtml(item.mediaType)}" data-discovery-id="${escapeHtml(item.id)}" data-discovery-type="${escapeHtml(item.mediaType)}"
        data-media-detail data-media-detail-id="${escapeHtml(item.id)}" data-media-detail-type="${escapeHtml(item.mediaType)}" data-media-detail-title="${escapeHtml(title)}" data-media-detail-year="${escapeHtml(year)}" data-media-release-date="${escapeHtml(date || '')}" data-media-detail-image="${escapeHtml(image)}">
        <div class="noctra-discovery-visual">
          ${discoveryImageMarkup(item, variant, title)}
          <span class="noctra-discovery-type">${item.mediaType === 'tv' ? 'Série' : 'Film'}</span>
        </div>
        <div class="noctra-card__body">
          <p class="noctra-discovery-reason">${escapeHtml(item.reason || 'Sélection Noctra')}</p>
          <h3 title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
          <p class="noctra-discovery-meta">${escapeHtml(formatDate(date))}${item.voteAverage ? ` · ★ ${Number(item.voteAverage).toFixed(1)}` : ''}</p>
          <div class="noctra-legal-platforms" data-discovery-platforms ${Array.isArray(item.legalPlatforms) && item.legalPlatforms.length ? '' : 'hidden'}>${Array.isArray(item.legalPlatforms) && item.legalPlatforms.length ? `<span>Streaming</span>${item.legalPlatforms.slice(0, 4).map(name => `<b>${escapeHtml(name)}</b>`).join('')}` : ''}</div>
          ${discoveryExplanation(item)}
          ${overview ? `<p class="noctra-discovery-overview">${escapeHtml(overview)}</p>` : ''}
          <div class="noctra-discovery-feedback" aria-label="Affiner les recommandations">
            <button type="button" data-discovery-feedback="more" data-feedback-id="${escapeHtml(item.id)}" data-feedback-type="${escapeHtml(item.mediaType)}" data-feedback-title="${escapeHtml(title)}" data-feedback-genres="${escapeHtml((item.genreIds || []).join(','))}">Plus comme ça</button>
            <button type="button" data-discovery-feedback="less" data-feedback-id="${escapeHtml(item.id)}" data-feedback-type="${escapeHtml(item.mediaType)}" data-feedback-title="${escapeHtml(title)}" data-feedback-genres="${escapeHtml((item.genreIds || []).join(','))}">Pas pour moi</button>
          </div>
          ${trackerBadgeMarkup(item)}
          <div class="noctra-discovery-actions">
            <button class="noctra-button noctra-button--tracker-live" type="button"
              data-discovery-torrents data-availability-title="${escapeHtml(title)}" data-availability-year="${escapeHtml(year)}"
              data-availability-id="${escapeHtml(item.id || '')}"
              data-availability-type="${item.mediaType === 'tv' ? 'tv' : 'movie'}" title="Consulter les torrents disponibles maintenant">${icons.live}<span>Torrents : …</span></button>
            ${interactive ? `<button class="noctra-button" type="button"
                data-release-type="${item.mediaType === 'tv' ? 'sonarr' : 'radarr'}"
                data-release-id="${escapeHtml(serviceId)}" data-release-title="${escapeHtml(title)}">${icons.search}<span>Releases</span></button>` : ''}
            <button class="noctra-button ${requestState.disabled ? '' : 'noctra-button--primary'}" type="button"
              data-request-id="${escapeHtml(item.id)}" data-request-type="${escapeHtml(item.mediaType)}"
              data-request-title="${escapeHtml(title)}" data-request-image="${escapeHtml(image)}"
              data-request-year="${escapeHtml(year)}" data-request-state="${escapeHtml(requestState.key || 'loading')}"
              data-request-original-state="${escapeHtml(requestState.key || 'loading')}" data-request-original-label="${escapeHtml(requestState.label || '')}"
              data-request-original-disabled="${requestState.disabled ? 'true' : 'false'}" data-discovery-request-button ${requestState.disabled ? 'disabled' : ''}>
              ${escapeHtml(requestState.label || (requestState.disabled ? 'Déjà demandé' : 'Ajouter à Noctra'))}
            </button>
          </div>
        </div>
      </article>`;
  }

  function smartDiscoveryMarkup(smart) {
    const available = Array.isArray(smart?.results) ? smart.results.filter(Boolean) : [];
    if (!available.length) return '<div class="noctra-empty">Aucune suggestion disponible.</div>';

    const remaining = [...available];
    const take = (predicate, limit) => {
      const picked = [];
      for (let index = 0; index < remaining.length && picked.length < limit;) {
        if (predicate(remaining[index])) picked.push(...remaining.splice(index, 1));
        else index += 1;
      }
      return picked;
    };
    const featured = remaining.shift();
    const highAffinity = take(item => Number(item.explanation?.confidence || 0) >= 72 || Boolean(item.recommendedBy?.length), 10);
    const momentum = take(item => (item.signals || []).some(signal => /seerr-day|seerr-week|trending/.test(signal)) || /tendance/i.test(item.reason || ''), 10);
    const freshCinema = take(item => item.mediaType === 'movie' && /cinéma|sortie/i.test(item.reason || ''), 9);
    const streaming = take(item => item.source === 'streaming' || (item.signals || []).includes('streaming') || (Array.isArray(item.legalPlatforms) && item.legalPlatforms.length > 0), 10);
    const series = take(item => item.mediaType === 'tv', 9);
    const gems = take(item => Number(item.voteAverage || 0) >= 7.2 && Number(item.voteCount || 0) >= 80, 8);
    const explore = remaining.slice(0, 14);
    const profile = smart?.profile || {};
    const tasteLabels = [
      ...(Array.isArray(profile.topGenres) ? profile.topGenres.slice(0, 5) : []),
      ...(Array.isArray(profile.topPeople) ? profile.topPeople.slice(0, 2) : []),
      ...(Array.isArray(profile.topStudios) ? profile.topStudios.slice(0, 2) : [])
    ];
    const rail = (title, subtitle, items, key, description = '') => items.length ? `
      <section class="noctra-smart-section" data-smart-section="${key}">
        <div class="noctra-smart-section-head"><div><p class="noctra-eyebrow">${escapeHtml(subtitle)}</p><h3>${escapeHtml(title)}</h3>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div><span>${items.length} choix</span></div>
        <div class="noctra-smart-rail">${items.map(item => discoveryCard(item, 'rail')).join('')}</div>
      </section>` : '';

    return `<div class="noctra-smart-experience">
      <section class="noctra-smart-intro">
        <div><p class="noctra-eyebrow">À VOTRE IMAGE</p><h3>Des idées pour votre prochaine soirée</h3><p>Retrouvez des suggestions inspirées de vos goûts, de votre collection et des nouveautés.</p></div>
        <div class="noctra-smart-profile" aria-label="Repères de personnalisation">
          ${tasteLabels.map(label => `<span>${escapeHtml(label)}</span>`).join('') || '<span>Nouveautés</span><span>Découvertes</span>'}
        </div>
        ${!smart.profile ? '<p data-discovery-profile-state role="status">Personnalisation en cours…</p>' : ''}
        <div class="noctra-smart-balance" ${!smart.profile ? 'hidden' : ''}>
          <span><strong>${Number(profile.sampleSize || 0)}</strong> titres analysés</span>
          <span><strong>${Number(profile.playedCount || 0)}</strong> vus</span>
          <span><strong>${Number(profile.favoriteCount || 0)}</strong> favoris</span>
          <span><strong>${Number(profile.movieShare ?? 50)}%</strong> cinéma</span>
          <span><strong>${Number(profile.seriesShare ?? 50)}%</strong> séries</span>
        </div>
        <button class="noctra-button" type="button" data-open-discovery>${icons.sparkle}<span>Affiner mes suggestions</span></button>
      </section>
      <section class="noctra-smart-feature">
        <div class="noctra-smart-section-head"><div><p class="noctra-eyebrow">MEILLEUR MATCH ACTUEL</p><h3>Le choix Noctra</h3><p>Le titre qui combine le plus de signaux pertinents pour ton profil actuellement.</p></div><span>Classement dynamique</span></div>
        ${discoveryCard(featured, 'featured')}
      </section>
      ${rail('Les plus proches de tes goûts', 'AFFINITÉ FORTE', highAffinity, 'affinity', 'Recommandations et similarités issues des titres que tu regardes vraiment.')}
      ${rail('Ça monte maintenant', 'TENDANCES CROISÉES', momentum, 'momentum', 'Signaux quotidiens et hebdomadaires croisés pour éviter les effets de mode d’une seule liste.')}
      ${rail('Nouveautés cinéma', 'SORTIES', freshCinema, 'cinema', 'Films actuellement ou prochainement visibles en salles.')}
      ${rail('À voir sur les plateformes', 'STREAMING LÉGAL FR', streaming, 'streaming', 'Titres disponibles sur au moins une plateforme référencée en France.')}
      ${rail('Séries à lancer', 'SÉRIES', series, 'series', 'Nouveaux programmes et séries compatibles avec ton profil.')}
      ${rail('Pépites bien notées', 'QUALITÉ', gems, 'gems', 'Des titres solides qui ne reposent pas seulement sur la popularité.')}
      ${rail('Sors de ta zone de confort', 'EXPLORATION', explore, 'explore', 'Une part de diversité volontaire pour que les suggestions ne tournent pas en boucle.')}
    </div>`;
  }

  function applyDiscoveryEnrichment(result) {
    if (!result?.id) return;
    document.querySelectorAll(`.noctra-discovery-card[data-discovery-id="${CSS.escape(String(result.id))}"][data-discovery-type="${CSS.escape(String(result.mediaType || 'movie'))}"]`).forEach(card => {
      const button = card.querySelector('[data-discovery-request-button]');
      if (button && result.requestState) {
        const state = result.requestState;
        button.dataset.requestOriginalState = state.key || 'requestable';
        button.dataset.requestOriginalLabel = state.label || (state.disabled ? 'Déjà demandé' : 'Ajouter à Noctra');
        button.dataset.requestOriginalDisabled = state.disabled ? 'true' : 'false';
        button.dataset.requestState = state.key || 'requestable';
        button.textContent = state.label || (state.disabled ? 'Déjà demandé' : 'Ajouter à Noctra');
        button.disabled = Boolean(state.disabled);
        button.classList.toggle('noctra-button--primary', !state.disabled);
        if (button.dataset.torrentNoPreferred === 'true' && !['present', 'partial'].includes(String(state.key || ''))) {
          button.dataset.requestState = state.disabled ? 'upcoming' : 'upcoming_requestable';
          button.textContent = state.disabled ? 'Bientôt disponible' : 'Ajouter quand même';
          button.disabled = Boolean(state.disabled);
          button.classList.toggle('noctra-button--primary', !state.disabled);
        }
      }
      const platforms = card.querySelector('[data-discovery-platforms]');
      if (platforms) {
        const names = Array.isArray(result.legalPlatforms) ? result.legalPlatforms.filter(Boolean).slice(0, 4) : [];
        platforms.hidden = names.length === 0;
        platforms.innerHTML = names.length ? `<span>Streaming FR</span>${names.map(name => `<b>${escapeHtml(name)}</b>`).join('')}` : '';
      }
    });
  }

  async function flushDiscoveryEnrichment() {
    window.clearTimeout(discoveryEnrichmentTimer);
    discoveryEnrichmentTimer = 0;
    const batch = [...discoveryEnrichmentQueue.values()].slice(0, 10);
    batch.forEach(item => discoveryEnrichmentQueue.delete(`${item.mediaType}:${item.id}`));
    if (!batch.length) return;
    try {
      const payload = await api('/api/discovery/enrich', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: batch }),
        timeoutMs: 7_000
      });
      (payload.results || []).forEach(applyDiscoveryEnrichment);
    } catch {
      batch.forEach(item => {
        document.querySelectorAll(`.noctra-discovery-card[data-discovery-id="${CSS.escape(String(item.id))}"][data-discovery-type="${CSS.escape(String(item.mediaType))}"] [data-discovery-request-button]`).forEach(button => {
          button.disabled = false;
          button.dataset.requestState = 'requestable';
          button.textContent = 'Ajouter à Noctra';
          button.classList.add('noctra-button--primary');
          button.dataset.requestOriginalState = 'requestable';
          button.dataset.requestOriginalLabel = 'Ajouter à Noctra';
          button.dataset.requestOriginalDisabled = 'false';
        });
      });
    } finally {
      if (discoveryEnrichmentQueue.size) discoveryEnrichmentTimer = window.setTimeout(flushDiscoveryEnrichment, 80);
    }
  }

  function queueDiscoveryEnrichment(card) {
    const id = Number(card?.dataset.discoveryId || 0);
    const mediaType = card?.dataset.discoveryType === 'tv' ? 'tv' : 'movie';
    if (!id || card.dataset.discoveryQueued === 'true') return;
    card.dataset.discoveryQueued = 'true';
    discoveryEnrichmentQueue.set(`${mediaType}:${id}`, { id, mediaType });
    if (!discoveryEnrichmentTimer) discoveryEnrichmentTimer = window.setTimeout(flushDiscoveryEnrichment, 55);
  }

  function activateDiscoveryEnrichment(root = document) {
    const cards = [...root?.querySelectorAll?.('.noctra-discovery-card[data-discovery-id]:not([data-discovery-observed]):not([data-discovery-queued])') || []];
    if (!cards.length) return;
    if (!('IntersectionObserver' in window)) {
      cards.slice(0, 12).forEach(queueDiscoveryEnrichment);
      return;
    }
    const panelRoot = document.querySelector('.noctra-panel-body');
    if (!discoveryEnrichmentObserver || discoveryObservationRoot !== panelRoot) {
      discoveryEnrichmentObserver?.disconnect();
      discoveryObservationRoot = panelRoot;
      discoveryEnrichmentObserver = new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach(entry => {
          discoveryEnrichmentObserver?.unobserve(entry.target);
          queueDiscoveryEnrichment(entry.target);
        });
      }, { root: panelRoot, rootMargin: '360px' });
    }
    cards.forEach(card => {
      card.dataset.discoveryObserved = 'true';
      discoveryEnrichmentObserver.observe(card);
    });
  }

  function trackerStatusText(element, text, status, details = '') {
    element.dataset.trackerStatus = status;
    const copy = element.querySelector('.noctra-tracker-copy');
    if (copy) copy.textContent = text;
    element.title = details || text;
    const retry = element.querySelector('[data-tracker-retry]');
    if (retry) retry.hidden = !['error', 'deferred'].includes(status);
  }

  function frenchList(values = []) {
    const labels = [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
    if (labels.length < 2) return labels[0] || '';
    return `${labels.slice(0, -1).join(', ')} et ${labels.at(-1)}`;
  }

  function torrentAvailabilityPresentation(data = {}) {
    const count = Math.max(0, Number(data.count || 0));
    const preferredCount = Math.max(0, Number(data.preferredCount ?? (data.status === 'available' ? count : 0)));
    const alternateLanguages = Array.isArray(data.alternateLanguages) ? data.alternateLanguages.filter(Boolean) : [];
    const languages = frenchList(alternateLanguages);
    if (data.configured === false) return { state: 'unavailable', title: 'Disponibilité inconnue', detail: 'Prowlarr n’est pas configuré.', count, preferredCount, languages };
    if (data.status === 'error') return { state: 'error', title: 'Vérification impossible', detail: data.message || 'Les trackers ne répondent pas.', count, preferredCount, languages };
    if (data.status === 'deferred') return { state: 'deferred', title: 'Vérification à relancer', detail: data.message || 'La vérification automatique a été reportée.', count, preferredCount, languages };
    if (preferredCount > 0) {
      return {
        state: 'available',
        title: 'Disponible en VFF',
        detail: `${preferredCount} release${preferredCount > 1 ? 's' : ''} VFF ou MULTI VFF disponible${preferredCount > 1 ? 's' : ''}.`,
        count, preferredCount, languages
      };
    }
    if (count > 0) {
      return {
        state: 'alternate',
        title: 'Bientôt disponible en VFF',
        detail: `Déjà disponible en ${languages || 'd’autres langues'}. Tu peux l’ajouter quand même.`,
        count, preferredCount, languages
      };
    }
    return {
      state: 'missing',
      title: 'Bientôt disponible',
      detail: 'Aucun torrent VFF ou MULTI VFF disponible pour le moment. Tu peux l’ajouter quand même.',
      count, preferredCount, languages
    };
  }

  function trackerAvailabilityPath({ mediaType, title, year = '', tmdbId = '' }) {
    return `/api/discovery/availability?${new URLSearchParams({ mediaType, title, year, tmdbId: String(tmdbId || '') })}`;
  }

  async function fetchTrackerAvailability(criteria, force = false) {
    const path = trackerAvailabilityPath(criteria);
    const data = force
      ? await api(`${path}&force=1`, { timeoutMs: 22_000 })
      : await cachedApi(path, 2 * 60_000, { timeoutMs: 22_000 });
    if (data.status === 'error' || data.configured === false) apiResponseCache.delete(path);
    else if (force) apiResponseCache.set(path, { value: data, expiresAt: Date.now() + 2 * 60_000 });
    return data;
  }

  async function loadTrackerAvailability(element, force = false) {
    if (!element || (!force && element.dataset.trackerStatus !== 'pending')) return;
    const criteria = { mediaType: element.dataset.availabilityType, title: element.dataset.availabilityTitle,
      year: element.dataset.availabilityYear || '', tmdbId: element.dataset.availabilityId || '' };
    const key = trackerAvailabilityPath(criteria);
    const sequence = String(Number(element.dataset.trackerSequence || 0) + 1);
    element.dataset.trackerSequence = sequence;
    element.dataset.trackerStatus = 'loading';
    let promise = availabilityRequests.get(key);
    if (!promise || force) {
      promise = fetchTrackerAvailability(criteria, force)
        .finally(() => { if (availabilityRequests.get(key) === promise) availabilityRequests.delete(key); });
      availabilityRequests.set(key, promise);
    }
    try {
      const data = await promise;
      if (!element.isConnected || element.dataset.trackerSequence !== sequence) return;
      updateDiscoveryTorrentButton(element, data);
      if (!data.configured) {
        trackerStatusText(element, 'Prowlarr non configuré', 'unavailable', data.message);
      } else if (data.status === 'available') {
        const seeders = Number(data.bestSeeders || 0);
        trackerStatusText(
          element,
          `${data.count} release${data.count > 1 ? 's' : ''} · ${data.trackers.length} tracker${data.trackers.length > 1 ? 's' : ''}${seeders ? ` · jusqu’à ${seeders} seeders` : ''}`,
          'available',
          `${data.message || ''}${data.trackers?.length ? `\n${data.trackers.join(', ')}` : ''}`
        );
      } else if (data.status === 'alternate') {
        const presentation = torrentAvailabilityPresentation(data);
        trackerStatusText(
          element,
          `${presentation.title} · ${presentation.languages || 'autres langues disponibles'}`,
          'alternate',
          presentation.detail
        );
      } else if (data.status === 'error') {
        trackerStatusText(element, 'Vérification à relancer', 'deferred', data.message || 'Prowlarr n’a pas répondu');
      } else if (data.status === 'deferred') {
        trackerStatusText(element, 'Vérification à relancer', 'deferred', data.message);
      } else {
        const presentation = torrentAvailabilityPresentation(data);
        trackerStatusText(
          element,
          presentation.title,
          'missing',
          `${presentation.detail}${data.message ? `\n${data.message}` : ''}`
        );
      }
    } catch (error) {
      if (!element.isConnected || element.dataset.trackerSequence !== sequence) return;
      updateDiscoveryTorrentButton(element, { configured: true, status: 'deferred', message: error.message });
      trackerStatusText(element, 'Vérification à relancer', 'deferred', error.message || 'Vérification impossible');
    }
  }


  function updateDiscoveryTorrentButton(element, data = {}) {
    const card = element?.closest?.('.noctra-discovery-card');
    const button = card?.querySelector?.('[data-discovery-torrents]');
    if (!button) return;
    const label = button.querySelector('span');
    const count = Math.max(0, Number(data.count || 0));
    button.dataset.available = String(data.status === 'available');
    const unknown = ['error', 'deferred'].includes(data.status) || data.configured === false;
    button.dataset.count = unknown ? '' : String(count);
    if (label) label.textContent = unknown ? 'Torrents : à vérifier' : `Torrents : ${count}`;
    const requestButton = card.querySelector('[data-discovery-request-button]');
    if (!requestButton) return;
    const originalState = String(requestButton.dataset.requestOriginalState || requestButton.dataset.requestState || 'requestable');
    const originalLabel = String(requestButton.dataset.requestOriginalLabel || requestButton.textContent || 'Ajouter à Noctra').trim();
    const originalDisabled = requestButton.dataset.requestOriginalDisabled === 'true';
    const presentation = torrentAvailabilityPresentation(data);
    requestButton.dataset.torrentNoPreferred = String(!['unavailable', 'error', 'deferred'].includes(presentation.state) && presentation.preferredCount === 0);
    if (['unavailable', 'error', 'deferred'].includes(presentation.state) || presentation.preferredCount > 0 || ['present', 'partial'].includes(originalState)) {
      requestButton.dataset.requestState = originalState;
      requestButton.textContent = originalLabel;
      requestButton.disabled = originalDisabled;
      requestButton.classList.toggle('noctra-button--primary', !originalDisabled);
      return;
    }
    if (!originalDisabled) {
      requestButton.dataset.requestState = 'upcoming_requestable';
      requestButton.textContent = 'Ajouter quand même';
      requestButton.disabled = false;
      requestButton.classList.add('noctra-button--primary');
      return;
    }
    requestButton.dataset.requestState = 'upcoming';
    requestButton.textContent = 'Bientôt disponible';
    requestButton.disabled = true;
    requestButton.classList.remove('noctra-button--primary');
  }

  function closeDiscoveryTorrentLive() {
    window.clearTimeout(discoveryTorrentLiveTimer);
    discoveryTorrentLiveTimer = 0;
    discoveryTorrentLiveState = null;
    document.querySelector('[data-discovery-torrent-live]')?.remove();
    document.body.classList.remove('noctra-discovery-torrent-live-open');
  }

  function discoveryTorrentAge(release = {}) {
    const hours = Number(release.ageHours);
    if (Number.isFinite(hours) && hours >= 0) {
      if (hours < 1) return 'moins d’1 h';
      if (hours < 48) return `${Math.round(hours)} h`;
      return `${Math.round(hours / 24)} j`;
    }
    const date = Date.parse(release.publishDate || '');
    if (!date) return 'âge inconnu';
    const diff = Math.max(0, Date.now() - date);
    const roundedHours = Math.round(diff / 3_600_000);
    return roundedHours < 48 ? `${roundedHours} h` : `${Math.round(roundedHours / 24)} j`;
  }

  function discoveryTorrentLiveMarkup(data, state) {
    const releases = sortTorrentsBySize(Array.isArray(data?.releases) ? data.releases : []);
    const presentation = torrentAvailabilityPresentation(data);
    const checkedAt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
    const status = !data?.configured
      ? '<div class="noctra-live-torrent-empty"><strong>Prowlarr non configuré</strong><span>Configure Prowlarr pour interroger tes trackers.</span></div>'
      : data.status === 'error'
        ? `<div class="noctra-live-torrent-empty"><strong>Recherche impossible</strong><span>${escapeHtml(data.message || 'Les trackers ne répondent pas. Relance la vérification.')}</span></div>`
      : releases.length
        ? `<div class="noctra-live-torrent-list">${releases.map((release, index) => `<article class="noctra-live-torrent-row"><div class="noctra-live-torrent-rank">${index + 1}</div><div class="noctra-live-torrent-copy"><strong title="${escapeHtml(release.title || '')}">${escapeHtml(release.title || 'Release sans titre')}</strong><span>${escapeHtml(release.indexer || 'Tracker')} · ${escapeHtml(discoveryTorrentAge(release))}${release.protocol ? ` · ${escapeHtml(String(release.protocol).toUpperCase())}` : ''} <b class="noctra-release-language" data-preferred="${release.preferredLanguage ? 'true' : 'false'}">${escapeHtml(release.language || 'Langue non précisée')}</b></span></div><div class="noctra-live-torrent-metrics"><b>${Number(release.seeders || 0)} <small>seed</small></b><span>${formatBytes(release.size || 0)}</span></div></article>`).join('')}</div>`
        : '<div class="noctra-live-torrent-empty"><strong>Aucun torrent trouvé maintenant</strong><span>Tu peux actualiser sans créer de demande.</span></div>';
    return `<header class="noctra-live-torrent-head"><div><p class="noctra-eyebrow">TRACKERS · TEMPS RÉEL</p><h3>${escapeHtml(state.title)}</h3><span>${escapeHtml(state.mediaType === 'tv' ? 'Série' : 'Film')}${state.year ? ` · ${escapeHtml(state.year)}` : ''} · vérifié à ${checkedAt}</span></div><div><button type="button" class="noctra-button" data-discovery-torrents-refresh>${icons.refresh}<span>Actualiser</span></button><button type="button" class="noctra-icon-button" data-discovery-torrents-close aria-label="Fermer">×</button></div></header><div class="noctra-live-torrent-summary" data-state="${escapeHtml(presentation.state)}"><strong>${escapeHtml(presentation.title)}</strong><span>${escapeHtml(presentation.detail)}</span><i>Auto-actualisation 45 s</i></div>${status}`;
  }

  async function refreshDiscoveryTorrentLive(force = true) {
    const state = discoveryTorrentLiveState;
    const layer = document.querySelector('[data-discovery-torrent-live]');
    if (!state || !layer) return;
    const body = layer.querySelector('[data-discovery-torrent-live-body]');
    if (!body) return;
    if (force) body.dataset.loading = 'true';
    const query = new URLSearchParams({
      mediaType: state.mediaType,
      title: state.title,
      year: state.year || '',
      tmdbId: state.tmdbId || '',
      limit: '24',
      force: force ? '1' : '0'
    });
    try {
      const data = await api(`/api/discovery/availability?${query.toString()}`, { timeoutMs: 22_000 });
      if (!body.isConnected || discoveryTorrentLiveState !== state) return;
      body.innerHTML = discoveryTorrentLiveMarkup(data, state);
      body.querySelectorAll('.noctra-live-torrent-row').forEach((row, index) => {
        const release = data.releases[index];
        if (authContext?.isAdmin && release?.downloadId) row.insertAdjacentHTML('beforeend', `<button class="noctra-button noctra-live-torrent-download" type="button" data-discovery-download="${escapeHtml(release.downloadId)}" data-download-title="${escapeHtml(release.title)}" title="Télécharger cette release">${icons.download}<span>Télécharger</span></button>`);
      });
      body.dataset.loading = 'false';
      document.querySelectorAll('.noctra-discovery-card [data-discovery-torrents]').forEach(button => {
        if (String(button.dataset.availabilityTitle || '') !== state.title) return;
        if ((button.dataset.availabilityType === 'tv' ? 'tv' : 'movie') !== state.mediaType) return;
        if (String(button.dataset.availabilityYear || '') !== state.year) return;
        if (String(button.dataset.availabilityId || '') !== state.tmdbId) return;
        updateDiscoveryTorrentButton(button, data);
      });
    } catch (error) {
      if (!body.isConnected) return;
      body.innerHTML = `<div class="noctra-live-torrent-empty" data-error="true"><strong>Recherche impossible</strong><span>${escapeHtml(error.message || 'Prowlarr ne répond pas.')}</span><button type="button" class="noctra-button" data-discovery-torrents-refresh>${icons.retry}<span>Réessayer</span></button></div>`;
      body.dataset.loading = 'false';
    }
    window.clearTimeout(discoveryTorrentLiveTimer);
    if (discoveryTorrentLiveState === state) discoveryTorrentLiveTimer = window.setTimeout(() => refreshDiscoveryTorrentLive(false), 45_000);
  }

  function openDiscoveryTorrentLive(button) {
    const title = String(button?.dataset?.availabilityTitle || '').trim();
    if (!title) return;
    closeDiscoveryTorrentLive();
    discoveryTorrentLiveState = {
      title,
      year: String(button.dataset.availabilityYear || ''),
      tmdbId: String(button.dataset.availabilityId || ''),
      mediaType: button.dataset.availabilityType === 'tv' ? 'tv' : 'movie'
    };
    const layer = document.createElement('section');
    layer.className = 'noctra-discovery-torrent-live';
    layer.dataset.discoveryTorrentLive = 'true';
    layer.innerHTML = `<div class="noctra-discovery-torrent-live-body" data-discovery-torrent-live-body data-loading="true"><div class="noctra-loading"><i></i><span>Recherche en direct sur tes trackers…</span></div></div>`;
    document.body.appendChild(layer);
    document.body.classList.add('noctra-discovery-torrent-live-open');
    void refreshDiscoveryTorrentLive(false);
  }

  function closeMediaDetail() {
    mediaDetailState = null;
    document.querySelector('[data-media-detail-layer]')?.remove();
    document.body.classList.remove('noctra-media-detail-open');
  }

  function mediaDetailDateLabel(value) {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value || '');
      return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch {
      return String(value || '');
    }
  }

  function mediaDetailDurationLabel(value) {
    const minutes = Math.max(0, Number(value || 0));
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return hours ? `${hours} h${rest ? ` ${String(rest).padStart(2, '0')} min` : ''}` : `${rest} min`;
  }

  function mediaDetailMoneyLabel(value) {
    const amount = Math.max(0, Number(value || 0));
    if (!amount) return '';
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md $`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M $`;
    return `${Math.round(amount).toLocaleString('fr-FR')} $`;
  }

  function mediaDetailStatusLabel(value) {
    const status = String(value || '').trim();
    const labels = {
      Released: 'Sorti',
      'Post Production': 'Post-production',
      Planned: 'Prévu',
      Rumored: 'Envisagé',
      Canceled: 'Annulé',
      'In Production': 'En production',
      'Returning Series': 'En cours',
      Ended: 'Terminée',
      Pilot: 'Pilote'
    };
    return labels[status] || status;
  }

  function mediaDetailInfoRow(label, value, options = {}) {
    const text = String(value || '').trim();
    if (!text) return '';
    return `<div class="noctra-media-detail-info-row${options.wide ? ' noctra-media-detail-info-row--wide' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
  }

  function mediaDetailEpisodeMarkup(label, episode) {
    if (!episode) return '';
    const season = Number.isFinite(Number(episode.seasonNumber)) ? Number(episode.seasonNumber) : null;
    const number = Number.isFinite(Number(episode.episodeNumber)) ? Number(episode.episodeNumber) : null;
    const code = season != null && number != null ? `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}` : '';
    const date = mediaDetailDateLabel(episode.airDate);
    return `<article class="noctra-media-detail-episode">
      ${episode.stillPath ? `<img src="https://image.tmdb.org/t/p/w300${escapeHtml(episode.stillPath)}" alt="" loading="lazy" decoding="async">` : '<div class="noctra-media-detail-episode-fallback">N</div>'}
      <div><span>${escapeHtml(label)}${code ? ` · ${escapeHtml(code)}` : ''}</span><strong>${escapeHtml(episode.name || 'Épisode')}</strong>${date ? `<small>${escapeHtml(date)}${episode.runtime ? ` · ${escapeHtml(mediaDetailDurationLabel(episode.runtime))}` : ''}</small>` : ''}</div>
    </article>`;
  }

  function mediaDetailCastMarkup(cast = []) {
    if (!Array.isArray(cast) || !cast.length) return '';
    return `<section class="noctra-media-detail-section noctra-media-detail-cast-section">
      <div class="noctra-media-detail-section-head"><div><p class="noctra-eyebrow">DISTRIBUTION</p><h3>Acteurs principaux</h3></div><span>${Math.min(12, cast.length)} affichés</span></div>
      <div class="noctra-media-detail-cast-list">${cast.slice(0, 12).map(person => {
        const name = typeof person === 'string' ? person : String(person?.name || '');
        const character = typeof person === 'string' ? '' : String(person?.character || '');
        const profilePath = typeof person === 'string' ? '' : String(person?.profilePath || '');
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'N';
        return `<article class="noctra-media-detail-person">${profilePath ? `<img src="https://image.tmdb.org/t/p/w185${escapeHtml(profilePath)}" alt="" loading="lazy" decoding="async">` : `<div class="noctra-media-detail-person-fallback">${escapeHtml(initials)}</div>`}<div><strong>${escapeHtml(name)}</strong>${character ? `<span>${escapeHtml(character)}</span>` : ''}</div></article>`;
      }).join('')}</div>
    </section>`;
  }

  function mediaDetailReleaseRows(availability = {}) {
    if (availability.status === 'error') {
      return `<div class="noctra-media-detail-empty"><strong>Recherche impossible</strong><span>${escapeHtml(availability.message || 'Relance la vérification des trackers.')}</span></div>`;
    }
    const releases = Array.isArray(availability?.releases) ? availability.releases : [];
    if (!releases.length) {
      return '<div class="noctra-media-detail-empty"><strong>Aucune release disponible maintenant</strong><span>La fiche reste utilisable : tu peux actualiser les trackers ou créer une demande.</span></div>';
    }
    return `<div class="noctra-media-detail-release-list">${releases.map((release, index) => `
      <article class="noctra-media-detail-release">
        <span class="noctra-live-torrent-rank">${index + 1}</span>
        <div><strong title="${escapeHtml(release.title || '')}">${escapeHtml(release.title || 'Release sans titre')}</strong><small>${escapeHtml(release.indexer || 'Tracker')} · ${escapeHtml(discoveryTorrentAge(release))}${release.protocol ? ` · ${escapeHtml(String(release.protocol).toUpperCase())}` : ''} <b class="noctra-release-language" data-preferred="${release.preferredLanguage ? 'true' : 'false'}">${escapeHtml(release.language || 'Langue non précisée')}</b></small></div>
        <div class="noctra-media-detail-release-stats"><b>${Number(release.seeders || 0)} seed</b><span>${formatBytes(release.size || 0)}</span>${release.leechers != null ? `<span>${Number(release.leechers)} leech</span>` : ''}</div>
      </article>`).join('')}</div>`;
  }

  function mediaDetailMarkup(detail = {}) {
    const type = detail.mediaType === 'tv' ? 'tv' : 'movie';
    const availability = detail.availability || {};
    const requestState = detail.requestState || { key: 'requestable', label: 'Ajouter à Noctra', disabled: false };
    const image = detail.posterPath ? `https://image.tmdb.org/t/p/w500${detail.posterPath}` : '';
    const backdrop = detail.backdropPath ? `https://image.tmdb.org/t/p/w1280${detail.backdropPath}` : '';
    const year = detail.year || String(detail.releaseDate || detail.firstAirDate || '').slice(0, 4);
    const people = Array.isArray(detail.creators) && detail.creators.length ? detail.creators : [];
    const writers = Array.isArray(detail.writers) ? detail.writers : [];
    const cast = Array.isArray(detail.cast) ? detail.cast : [];
    const genres = Array.isArray(detail.genres) ? detail.genres : [];
    const keywords = Array.isArray(detail.keywords) ? detail.keywords : [];
    const platforms = Array.isArray(detail.legalPlatforms) ? detail.legalPlatforms : [];
    const productionCompanies = Array.isArray(detail.productionCompanies) ? detail.productionCompanies : [];
    const productionCountries = Array.isArray(detail.productionCountries) ? detail.productionCountries : [];
    const networks = Array.isArray(detail.networks) ? detail.networks : [];
    const spokenLanguages = Array.isArray(detail.spokenLanguages) ? detail.spokenLanguages : [];
    const originCountries = Array.isArray(detail.originCountries) ? detail.originCountries : [];
    const torrentCount = availability.status === 'error' || availability.configured === false
      ? 'à vérifier' : Math.max(0, Number(availability.count || 0));
    const availabilityPresentation = torrentAvailabilityPresentation(availability);
    const trackerCount = Math.max(0, Number(availability.trackers?.length || availability.checkedIndexers || 0));
    const bestSeeders = Math.max(0, Number(availability.bestSeeders || 0));
    const serviceId = Number(detail.resolvedServiceId || 0);
    const releaseDate = mediaDetailDateLabel(type === 'tv' ? detail.firstAirDate || detail.releaseDate : detail.releaseDate);
    const lastAirDate = mediaDetailDateLabel(detail.lastAirDate);
    const status = mediaDetailStatusLabel(detail.status);
    const runtime = mediaDetailDurationLabel(detail.runtime);
    const companyNames = productionCompanies.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean);
    const countryNames = productionCountries.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean);
    const networkNames = networks.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean);
    const trailerKey = String(detail.trailer?.key || '').trim();
    const imdbId = String(detail.imdbId || '').trim();
    const primaryMetadata = [
      mediaDetailInfoRow(type === 'tv' ? 'Première diffusion' : 'Date de sortie', releaseDate),
      mediaDetailInfoRow('Durée', runtime),
      mediaDetailInfoRow('Classification', detail.certification),
      mediaDetailInfoRow('Statut', status),
      mediaDetailInfoRow('Langue originale', detail.originalLanguage ? String(detail.originalLanguage).toUpperCase() : ''),
      mediaDetailInfoRow('Langues', spokenLanguages.slice(0, 4).join(' · ')),
      mediaDetailInfoRow('Titre original', detail.originalTitle && detail.originalTitle !== detail.title ? detail.originalTitle : '', { wide: true })
    ].join('');
    const productionMetadata = [
      mediaDetailInfoRow(type === 'tv' ? 'Diffuseur' : 'Production', (type === 'tv' ? networkNames : companyNames).slice(0, 4).join(' · '), { wide: true }),
      mediaDetailInfoRow('Pays', (countryNames.length ? countryNames : originCountries).slice(0, 4).join(' · '), { wide: true }),
      type === 'tv' ? mediaDetailInfoRow('Saisons', detail.numberOfSeasons) : mediaDetailInfoRow('Budget', mediaDetailMoneyLabel(detail.budget)),
      type === 'tv' ? mediaDetailInfoRow('Épisodes', detail.numberOfEpisodes) : mediaDetailInfoRow('Recettes', mediaDetailMoneyLabel(detail.revenue)),
      type === 'tv' ? mediaDetailInfoRow('Dernière diffusion', lastAirDate, { wide: true }) : mediaDetailInfoRow('Collection', detail.collection, { wide: true })
    ].join('');
    const requestKey = String(requestState.key || 'requestable');
    const requestTone = requestKey === 'present' ? 'present' : requestKey === 'downloading' ? 'downloading' : requestKey === 'pending' || requestKey === 'requested' || requestKey === 'upcoming' ? 'pending' : 'requestable';
    const completedRequest = ['present', 'partial'].includes(requestKey);
    const availabilityUnknown = ['unavailable', 'error'].includes(availabilityPresentation.state);
    const availabilityTitle = completedRequest || availabilityUnknown
      ? String(requestState.label || availabilityPresentation.title)
      : availabilityPresentation.title;
    const availabilityDetail = completedRequest && !availabilityUnknown
      ? `${torrentCount} torrent${torrentCount > 1 ? 's' : ''} trouvé${torrentCount > 1 ? 's' : ''} sur les trackers.`
      : availabilityPresentation.detail;
    return `
      <div class="noctra-media-detail-backdrop" ${backdrop ? `style="background-image:linear-gradient(180deg,rgba(4,7,18,.18),rgba(4,7,18,.96)),url('${escapeHtml(backdrop)}')"` : ''}></div>
      <header class="noctra-media-detail-head">
        <div><p class="noctra-eyebrow">${type === 'tv' ? 'SÉRIE' : 'FILM'} · FICHE NOCTRA</p><h2>${escapeHtml(detail.title || 'Sans titre')}</h2>${detail.tagline ? `<p>${escapeHtml(detail.tagline)}</p>` : ''}</div>
        <button type="button" class="noctra-close" data-media-detail-close aria-label="Fermer">×</button>
      </header>
      <div class="noctra-media-detail-body">
        <section class="noctra-media-detail-hero-grid">
          <aside class="noctra-media-detail-poster">${image ? `<img src="${escapeHtml(image)}" alt="" loading="eager" decoding="async">` : '<span>N</span>'}</aside>
          <main class="noctra-media-detail-main">
            <div class="noctra-media-detail-facts">
              ${year ? `<span>${escapeHtml(year)}</span>` : ''}
              ${runtime ? `<span>${escapeHtml(runtime)}</span>` : ''}
              ${detail.certification ? `<span>${escapeHtml(detail.certification)}</span>` : ''}
              ${detail.voteAverage ? `<span>★ ${Number(detail.voteAverage).toFixed(1)}${detail.voteCount ? ` · ${Number(detail.voteCount).toLocaleString('fr-FR')} votes` : ''}</span>` : ''}
              ${status ? `<span>${escapeHtml(status)}</span>` : ''}
              ${detail.originalLanguage ? `<span>${escapeHtml(String(detail.originalLanguage).toUpperCase())}</span>` : ''}
            </div>
            ${genres.length ? `<div class="noctra-media-detail-tags">${genres.map(name => `<span>${escapeHtml(name)}</span>`).join('')}</div>` : ''}
            ${detail.overview ? `<p class="noctra-media-detail-overview">${escapeHtml(detail.overview)}</p>` : '<p class="noctra-media-detail-overview noctra-media-detail-overview--muted">Aucun synopsis disponible pour ce titre.</p>'}
            ${people.length ? `<p class="noctra-media-detail-people"><strong>${type === 'tv' ? 'Création' : 'Réalisation'} :</strong> ${people.map(escapeHtml).join(' · ')}</p>` : ''}
            ${writers.length ? `<p class="noctra-media-detail-people"><strong>Scénario :</strong> ${writers.map(escapeHtml).join(' · ')}</p>` : ''}
          </main>
          <nav class="noctra-media-detail-actions" aria-label="Actions pour ${escapeHtml(detail.title || 'ce média')}">
            <button class="noctra-button noctra-button--tracker-live" type="button" data-media-detail-refresh>${icons.refresh}<span>Torrents : ${torrentCount}</span></button>
            ${trailerKey ? `<a class="noctra-button" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailerKey)}" target="_blank" rel="noreferrer">${icons.external}<span>Bande-annonce</span></a>` : ''}
            ${imdbId ? `<a class="noctra-button" href="https://www.imdb.com/title/${encodeURIComponent(imdbId)}/" target="_blank" rel="noreferrer">${icons.external}<span>IMDb</span></a>` : ''}
            ${serviceId && authContext?.isAdmin ? `<button class="noctra-button" type="button" data-release-type="${type === 'tv' ? 'sonarr' : 'radarr'}" data-release-id="${serviceId}" data-release-title="${escapeHtml(detail.title || '')}">${icons.search}<span>${type === 'tv' ? 'Choisir un épisode / release' : 'Releases Radarr'}</span></button>` : ''}
            <button class="noctra-button ${requestState.disabled ? '' : 'noctra-button--primary'}" type="button"
              data-request-id="${escapeHtml(detail.id)}" data-request-type="${escapeHtml(type)}" data-request-title="${escapeHtml(detail.title || '')}" data-request-image="${escapeHtml(backdrop || image)}" data-request-year="${escapeHtml(year || '')}" ${requestState.disabled ? 'disabled' : ''}>${escapeHtml(requestState.label || 'Ajouter à Noctra')}</button>
          </nav>
          <aside class="noctra-media-detail-side">
            <section class="noctra-media-detail-status-card" data-state="${escapeHtml(requestTone)}">
              <p class="noctra-eyebrow">DISPONIBILITÉ</p>
              <strong>${escapeHtml(availabilityTitle)}</strong>
              <div class="noctra-media-detail-live-count"><span>Torrents VFF</span><b>${availabilityUnknown ? '-' : availabilityPresentation.preferredCount}</b></div>
              <small>${escapeHtml(availabilityDetail)}${trackerCount ? ` ${trackerCount} tracker${trackerCount > 1 ? 's' : ''} interrogé${trackerCount > 1 ? 's' : ''}.` : ''}${bestSeeders ? ` Jusqu’à ${bestSeeders} seeders.` : ''}</small>
            </section>
            ${platforms.length ? `<section class="noctra-media-detail-platform-card"><p class="noctra-eyebrow">STREAMING · FRANCE</p><div>${platforms.slice(0, 8).map(name => `<span>${escapeHtml(name)}</span>`).join('')}</div></section>` : ''}
            ${type === 'tv' && (detail.nextEpisode || detail.lastEpisode) ? `<div class="noctra-media-detail-episodes">${mediaDetailEpisodeMarkup(detail.nextEpisode ? 'Prochain épisode' : 'Dernier épisode', detail.nextEpisode || detail.lastEpisode)}</div>` : ''}
          </aside>
        </section>

        <section class="noctra-media-detail-info-grid">
          <article class="noctra-media-detail-info-card"><div class="noctra-media-detail-card-head"><p class="noctra-eyebrow">INFORMATIONS</p><h3>À propos</h3></div><div class="noctra-media-detail-info-rows">${primaryMetadata || '<span class="noctra-media-detail-muted">Métadonnées non disponibles.</span>'}</div></article>
          <article class="noctra-media-detail-info-card"><div class="noctra-media-detail-card-head"><p class="noctra-eyebrow">${type === 'tv' ? 'DIFFUSION' : 'PRODUCTION'}</p><h3>${type === 'tv' ? 'Série' : 'Production'}</h3></div><div class="noctra-media-detail-info-rows">${productionMetadata || '<span class="noctra-media-detail-muted">Informations non disponibles.</span>'}</div></article>
          <article class="noctra-media-detail-info-card noctra-media-detail-info-card--themes"><div class="noctra-media-detail-card-head"><p class="noctra-eyebrow">THÈMES</p><h3>Genres & mots-clés</h3></div>${genres.length || keywords.length ? `<div class="noctra-media-detail-keywords">${[...genres, ...keywords].slice(0, 14).map(name => `<span>${escapeHtml(name)}</span>`).join('')}</div>` : '<span class="noctra-media-detail-muted">Aucun mot-clé disponible.</span>'}</article>
        </section>

        ${mediaDetailCastMarkup(cast)}

        <section class="noctra-media-detail-section noctra-media-detail-torrents">
          <div class="noctra-media-detail-section-head"><div><p class="noctra-eyebrow">TRACKERS · TEMPS RÉEL</p><h3>Torrents : ${torrentCount}</h3>${trackerCount ? `<span>${trackerCount} tracker${trackerCount > 1 ? 's' : ''}${bestSeeders ? ` · jusqu’à ${bestSeeders} seeders` : ''}</span>` : ''}</div><button class="noctra-button" type="button" data-media-detail-refresh>${icons.refresh}<span>Actualiser</span></button></div>
          ${availability.configured === false ? '<div class="noctra-media-detail-empty"><strong>Prowlarr non configuré</strong><span>La disponibilité torrent ne peut pas être interrogée.</span></div>' : mediaDetailReleaseRows(availability)}
        </section>
      </div>`;
  }


  function mediaDetailLoadingMarkup(state = {}) {
    const type = state.mediaType === 'tv' ? 'SÉRIE' : 'FILM';
    const image = String(state.image || '').trim();
    return `
      <div class="noctra-media-detail-backdrop noctra-media-detail-loading-backdrop" ${image ? `style="background-image:linear-gradient(180deg,rgba(4,7,18,.2),rgba(4,7,18,.96)),url('${escapeHtml(image)}')"` : ''}></div>
      <header class="noctra-media-detail-head noctra-media-detail-loading-head">
        <div><p class="noctra-eyebrow">${type} · FICHE NOCTRA</p><h2>${escapeHtml(state.title || 'Chargement')}</h2></div>
        <button type="button" class="noctra-close" data-media-detail-close aria-label="Fermer">×</button>
      </header>
      <div class="noctra-media-detail-body noctra-media-detail-skeleton" role="status" aria-label="Chargement de la fiche média">
        <div class="noctra-media-detail-skeleton-poster"></div>
        <div class="noctra-media-detail-skeleton-copy"><i></i><i></i><i></i><i></i></div>
        <div class="noctra-media-detail-skeleton-actions"><i></i><i></i><i></i></div>
        <div class="noctra-media-detail-skeleton-side"><i></i><i></i></div>
      </div>`;
  }


  async function loadMediaDetail(forceTrackers = false) {
    const state = mediaDetailState;
    const layer = document.querySelector('[data-media-detail-layer]');
    if (!state || !layer) return;
    const content = layer.querySelector('[data-media-detail-content]');
    if (!content) return;
    content.dataset.loading = 'true';
    if (!content.innerHTML.trim()) content.innerHTML = mediaDetailLoadingMarkup(state);
    const query = new URLSearchParams({
      mediaType: state.mediaType,
      id: String(state.id),
      title: state.title || '',
      year: state.year || '',
      forceTrackers: forceTrackers ? '1' : '0'
    });
    try {
      const path = `/api/media/detail?${query.toString()}`;
      if (forceTrackers) clearApiCache('/api/media/detail?');
      const detail = forceTrackers
        ? await api(path, { timeoutMs: 22_000 })
        : await cachedApi(path, 5 * 60_000, { timeoutMs: 22_000 });
      if (!content.isConnected || mediaDetailState !== state) return;
      state.detail = detail;
      content.innerHTML = mediaDetailMarkup(detail);
      content.dataset.loading = 'false';
    } catch (error) {
      if (!content.isConnected) return;
      content.innerHTML = `<div class="noctra-error">${escapeHtml(error.message || 'Impossible de charger cette fiche.')}</div>`;
      content.dataset.loading = 'false';
    }
  }

  function openMediaDetail(target) {
    const id = Number(target?.dataset?.mediaDetailId || target?.dataset?.discoveryId || 0);
    if (!Number.isInteger(id) || id < 1) return;
    closeMediaDetail();
    mediaDetailState = {
      id,
      mediaType: target.dataset.mediaDetailType === 'tv' || target.dataset.discoveryType === 'tv' ? 'tv' : 'movie',
      title: String(target.dataset.mediaDetailTitle || ''),
      year: String(target.dataset.mediaDetailYear || ''),
      image: String(target.dataset.mediaDetailImage || '')
    };
    const layer = document.createElement('section');
    layer.className = 'noctra-media-detail-layer';
    layer.dataset.mediaDetailLayer = 'true';
    layer.innerHTML = `<div class="noctra-media-detail-content" data-media-detail-content data-loading="true">${mediaDetailLoadingMarkup(mediaDetailState)}</div>`;
    document.body.appendChild(layer);
    document.body.classList.add('noctra-media-detail-open');
    void loadMediaDetail(false);
  }

  function pumpTrackerQueue() {
    while (trackerWorkers < 3 && trackerWorkQueue.length) {
      const job = trackerWorkQueue.shift();
      if (!job?.element?.isConnected) continue;
      trackerWorkers += 1;
      loadTrackerAvailability(job.element, job.force)
        .catch(() => {})
        .finally(() => {
          trackerWorkers = Math.max(0, trackerWorkers - 1);
          pumpTrackerQueue();
        });
    }
  }

  function queueTrackerAvailability(element, force = false) {
    if (!element || (!force && element.dataset.trackerQueued === 'true')) return;
    element.dataset.trackerQueued = 'true';
    trackerWorkQueue.push({ element, force });
    pumpTrackerQueue();
  }

  function activateTrackerAvailability(root = document) {
    const elements = [...root?.querySelectorAll?.('[data-tracker-status="pending"]:not([data-tracker-observed]):not([data-tracker-queued])') || []];
    if (!elements.length) return;
    if (!('IntersectionObserver' in window)) {
      elements.slice(0, 10).forEach(element => queueTrackerAvailability(element));
      return;
    }
    const panelRoot = document.querySelector('.noctra-panel-body');
    if (!trackerAvailabilityObserver || trackerObservationRoot !== panelRoot) {
      trackerAvailabilityObserver?.disconnect();
      trackerObservationRoot = panelRoot;
      trackerAvailabilityObserver = new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach(entry => {
          trackerAvailabilityObserver.unobserve(entry.target);
          queueTrackerAvailability(entry.target);
        });
      }, { root: panelRoot, rootMargin: '240px' });
    }
    elements.forEach(element => {
      element.dataset.trackerObserved = 'true';
      trackerAvailabilityObserver.observe(element);
    });
  }

  function stopDiscoveryFeed() {
    discoveryFeed?.observer?.disconnect();
    discoveryFeed = null;
  }

  function discoveryPagePath(state, page = 1) {
    const query = new URLSearchParams({ category: state.category, provider: state.provider || '', mode: state.mode || 'balanced', genre: state.genre || '', page: String(page) });
    return `/api/discovery?${query}`;
  }

  function discoveryFeedStatus(feed, error = '') {
    const button = feed.button;
    if (!button?.isConnected) return;
    const finished = !feed.pending.length && !feed.hasMore;
    button.disabled = feed.loading || finished;
    button.innerHTML = `${error ? icons.retry : icons.more || icons.plus}<span>${error ? 'Réessayer' : feed.loading ? 'Chargement…' : finished ? 'Fin de la sélection' : 'Afficher plus'}</span>`;
    button.title = error;
    feed.grid.dataset.exhausted = String(finished);
    if (finished) feed.observer?.disconnect();
  }

  async function loadMoreDiscoveries(feed = discoveryFeed) {
    if (!feed || feed !== discoveryFeed || feed.loading || !feed.grid.isConnected) return;
    feed.loading = true;
    discoveryFeedStatus(feed);
    let error = '';
    let added = 0;
    try {
      // Remplir un lot avant affichage, sans requetes sans fin sur un filtre vide.
      for (let attempts = 0; feed.pending.length < 12 && feed.hasMore && attempts < 3; attempts += 1) {
        const page = feed.nextPage;
        const data = await cachedApi(discoveryPagePath(feed.state, page), 5 * 60_000);
        if (discoveryFeed !== feed || !feed.grid.isConnected) return;
        feed.hasMore = Boolean(data.hasMore && Number(data.nextPage) > page);
        feed.nextPage = Number(data.nextPage || page + 1);
        for (const item of data.results || []) {
          const key = `${item.mediaType}:${item.id}`;
          if (feed.seen.has(key)) continue;
          feed.seen.add(key);
          if (feed.state.mediaType === 'all' || feed.state.mediaType === item.mediaType) feed.pending.push(item);
        }
      }
      const items = feed.pending.splice(0, 12);
      added = items.length;
      if (items.length) {
        feed.grid.querySelector('.noctra-empty')?.remove();
        feed.grid.insertAdjacentHTML('beforeend', items.map(item => discoveryCard(item)).join(''));
        activateDiscoveryEnrichment(feed.grid);
        activateTrackerAvailability(feed.grid);
      }
    } catch (failure) {
      error = failure.message || 'Chargement indisponible';
    } finally {
      feed.loading = false;
      if (discoveryFeed === feed) {
        discoveryFeedStatus(feed, error);
        // Le bouton reste utilisable si une erreur ou trois pages vides surviennent.
        if (!error && added && (feed.pending.length || feed.hasMore)) feed.observer?.observe(feed.button);
      }
    }
  }

  function startDiscoveryFeed(grid, data, state, deferredResults) {
    const button = grid?.parentElement?.querySelector('[data-discovery-more]');
    if (!grid || !button) return;
    const feed = {
      grid, button, state: { ...state }, pending: [...deferredResults],
      seen: new Set((data.results || []).map(item => `${item.mediaType}:${item.id}`)),
      hasMore: Boolean(data.hasMore), nextPage: Number(data.nextPage || 2), loading: false, observer: null
    };
    discoveryFeed = feed;
    button.addEventListener('click', () => void loadMoreDiscoveries(feed));
    if ('IntersectionObserver' in window) {
      feed.observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && !feed.loading) {
          feed.observer.unobserve(button);
          void loadMoreDiscoveries(feed);
        }
      }, { root: grid.closest('.noctra-panel-body'), rootMargin: '600px' });
      feed.observer.observe(button);
    }
    discoveryFeedStatus(feed);
    activateDiscoveryEnrichment(grid);
    activateTrackerAvailability(grid);
  }

  function annualDiscoveryMarkup(results = [], year = new Date().getFullYear(), updatedAt = '') {
    const groups = [
      ['annual-cinema', 'Sorties cinéma incontournables', 'CINÉMA'],
      ['annual-movie-streaming', 'Films à voir en streaming', 'FILMS · PLATEFORMES'],
      ['annual-tv', 'Séries TV de l’année', 'SÉRIES TV'],
      ['annual-tv-streaming', 'Séries à voir en streaming', 'SÉRIES · PLATEFORMES']
    ];
    const updated = Date.parse(updatedAt || '')
      ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(updatedAt))
      : '';
    const rails = groups.map(([source, title, eyebrow]) => {
      const items = results.filter(item => item.source === source).slice(0, 12);
      if (!items.length) return '';
      return `<section class="noctra-smart-section noctra-annual-section" data-annual-source="${source}">
        <div class="noctra-smart-section-head"><div><p class="noctra-eyebrow">${eyebrow} · ${escapeHtml(year)}</p><h3>${escapeHtml(title)}</h3></div><span>${items.length} tendances</span></div>
        <div class="noctra-smart-rail">${items.map(item => discoveryCard(item, 'rail')).join('')}</div>
      </section>`;
    }).join('');
    return `<div class="noctra-annual-discovery">
      <div class="noctra-access-note noctra-annual-update"><strong>Top de l’année ${escapeHtml(year)}</strong><span>Mise à jour automatique toutes les 5 minutes${updated ? ` · dernière vérification ${escapeHtml(updated)}` : ''}.</span></div>
      ${rails || '<div class="noctra-empty">Aucune tendance annuelle disponible pour ce filtre.</div>'}
    </div>`;
  }

  const discoveryGenreOptions = [
    ['', 'Tous les genres'],
    ['action', 'Action'],
    ['adventure', 'Aventure'],
    ['animation', 'Animation'],
    ['comedy', 'Comédie'],
    ['crime', 'Crime'],
    ['documentary', 'Documentaire'],
    ['drama', 'Drame'],
    ['family', 'Famille'],
    ['fantasy', 'Fantastique'],
    ['history', 'Histoire'],
    ['horror', 'Horreur'],
    ['music', 'Musique'],
    ['mystery', 'Mystère'],
    ['romance', 'Romance'],
    ['scifi', 'Science-fiction'],
    ['thriller', 'Thriller'],
    ['war', 'Guerre'],
    ['western', 'Western']
  ];

  async function openDiscoveries(
    category = discoveryState.category,
    provider = discoveryState.provider,
    mediaType = discoveryState.mediaType || 'all',
    mode = discoveryState.mode || 'balanced',
    genre = discoveryState.genre || '',
    force = false
  ) {
    stopDiscoveryFeed();
    const viewSequence = ++discoveryViewSequence;
    discoveryState = { category, provider, mediaType, mode, genre };
    setLoading('À découvrir', 'NOCTRA · SÉLECTION INTELLIGENTE', true);
    try {
      const providersPromise = cachedApi('/api/discovery/providers?type=all', 24 * 60 * 60_000).catch(() => ({ results: [] }));
      // Le contenu principal ne dépend plus de la liste des plateformes : sur PC,
      // un appel watch-providers lent ne bloque donc jamais toute la page.
      const data = force ? await api(`${discoveryPagePath(discoveryState)}&force=1`, { timeoutMs: 35000 })
        : await cachedApi(discoveryPagePath(discoveryState), category === 'smart' ? 60_000 : 5 * 60_000);
      if (viewSequence !== discoveryViewSequence) return;
      const providers = apiResponseCache.get('/api/discovery/providers?type=all')?.value || { results: [] };
      const categories = [
        ['smart', 'Pour toi'],
        ['year', 'Top de l’année'],
        ['cinema', 'Au cinéma'],
        ['streaming', 'Streaming'],
        ['series', 'Séries'],
        ['anime', 'Animés'],
        ['animation', 'Films d’animation'],
        ['classics', 'Classiques'],
        ['gems', 'Pépites'],
        ['trending', 'Tendances']
      ];
      const profile = data.profile || null;
      const results = (data.results || []).filter(item => mediaType === 'all' || item.mediaType === mediaType);
      const progressiveDiscovery = category !== 'year';
      const initialResults = progressiveDiscovery ? results.slice(0, 12) : results;
      const deferredResults = progressiveDiscovery ? results.slice(12) : [];
      setPanelBody(`
        <section class="noctra-discovery-hero">
          <div>
            <p class="noctra-eyebrow">${provider ? 'VOTRE CATALOGUE STREAMING' : 'LA SÉLECTION NOCTRA'}</p>
            <h3>${provider ? 'Une plateforme. Des histoires à l’infini.' : 'Votre prochaine obsession est ici.'}</h3>
            <p>${provider ? 'Films et séries de toutes les années, avec une offre identifiée dans le pays sélectionné.' : 'Des découvertes inspirées de vos films, séries et favoris.'}</p>
          </div>
          ${profile ? `<div class="noctra-taste-summary">
            <span><strong>${profile.sampleSize || 0}</strong> titres analysés</span>
            <span><strong>${profile.playedCount || 0}</strong> regardés</span>
            <span><strong>${profile.favoriteCount || 0}</strong> favoris</span>
            <span class="noctra-taste-wide">Goûts dominants : ${(profile.topGenres || []).map(escapeHtml).join(' · ') || 'en cours d’apprentissage'}</span>
          </div>` : ''}
        </section>
        <div class="noctra-release-toolbar noctra-discovery-toolbar">
          <div class="noctra-tabs noctra-discovery-tabs">
            ${categories.map(([id, label]) => `<button class="noctra-tab" type="button"
              data-discovery-category="${id}" data-active="${id === category}">${label}</button>`).join('')}
          </div>
          <button class="noctra-button" type="button" data-discovery-back-libraries>← Médiathèques</button>
        </div>
        <div class="noctra-discovery-filters">
          <div data-platform-buttons>${streamingPlatformButtons(providers.results || [], provider, data.region)}</div>
          <label class="noctra-field noctra-provider-field" hidden>
            <span>Plateforme</span>
            <select data-discovery-provider>
              <option value="">Toutes</option>
              ${(providers.results || []).map(item => `<option value="${item.id}" ${String(item.id) === String(provider) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
            </select>
          </label>
          <label class="noctra-field">
            <span>Type</span>
            <select data-discovery-media-type>
              <option value="all" ${mediaType === 'all' ? 'selected' : ''}>Films et séries</option>
              <option value="movie" ${mediaType === 'movie' ? 'selected' : ''}>Films</option>
              <option value="tv" ${mediaType === 'tv' ? 'selected' : ''}>Séries</option>
            </select>
          </label>
          <label class="noctra-field">
            <span>Genre</span>
            <select data-discovery-genre>
              ${discoveryGenreOptions.map(([id, label]) => `<option value="${id}" ${id === genre ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <label class="noctra-field">
            <span>Personnalisation</span>
            <select data-discovery-mode>
              <option value="precise" ${mode === 'precise' ? 'selected' : ''}>Très fidèle à mes goûts</option>
              <option value="balanced" ${mode === 'balanced' ? 'selected' : ''}>Équilibrée</option>
              <option value="explore" ${mode === 'explore' ? 'selected' : ''}>Plus de découvertes</option>
            </select>
          </label>
          <button class="noctra-button" type="button" data-discovery-refresh>${icons.refresh}<span>Recalculer</span></button>
        </div>
        ${data.engine ? `<div class="noctra-access-note noctra-discovery-engine-note"><strong>${escapeHtml(data.engine.metadata || 'Moteur Noctra')}</strong><span>${data.engine.personalized ? 'Profil Jellyfin analysé · ' : ''}${data.engine.trackerCheck ? 'vérification trackers active · ' : ''}aucun token TMDB supplémentaire requis.</span></div>` : (data.warning ? `<div class="noctra-access-note"><strong>Information</strong><span>${escapeHtml(data.warning)}</span></div>` : '')}
        ${category === 'year'
          ? annualDiscoveryMarkup(results, data.currentYear, data.updatedAt)
          : `<div class="noctra-grid noctra-discovery-grid" data-discovery-progressive-grid>${initialResults.map(item => discoveryCard(item)).join('') || '<div class="noctra-empty">Aucun titre confirmé pour ces filtres sur cette page. Essayez un autre genre ou affichez la suite.</div>'}</div><div class="noctra-discovery-continuation"><button class="noctra-button" type="button" data-discovery-more>Afficher plus</button></div>`}
        <p class="noctra-discovery-credit">Disponibilité ${escapeHtml(data.region || 'FR')} fournie par TMDB / <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer">JustWatch</a> · Les catalogues et les offres peuvent évoluer.</p>`, { preserveScroll: false, afterUpdate: body => {
          loadStreamingPlatformButtons(provider);
          const grid = body.querySelector('[data-discovery-progressive-grid]');
          if (grid) startDiscoveryFeed(grid, data, discoveryState, deferredResults);
          else requestAnimationFrame(() => { activateDiscoveryEnrichment(body); activateTrackerAvailability(body); });
        } });
      providersPromise.then(freshProviders => {
        const select = document.querySelector('[data-discovery-provider]');
        if (!select || viewSequence !== discoveryViewSequence || String(discoveryState.provider || '') !== String(provider || '')) return;
        const rows = (freshProviders?.results || []);
        const options = [`<option value="">Toutes</option>`, ...rows.map(item => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(provider) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)].join('');
        select.innerHTML = options;
        loadStreamingPlatformButtons(provider);
      }).catch(() => undefined);
    } catch (error) {
      if (viewSequence === discoveryViewSequence) showError(error);
    }
  }

  let rouletteSequence = 0;
  const rouletteState = { library: '', genre: '', rating: 0, minYear: '', maxYear: '', count: 1, unplayed: false };

  async function openRoulette() {
    const sequence = ++rouletteSequence;
    setLoading('Roulette', 'NOCTRA · LE CHOIX DU HASARD', true, { kind: 'roulette' });
    try {
      const catalog = await cachedApi('/api/libraries', 45_000);
      if (sequence !== rouletteSequence || !document.querySelector('#noctra-panel[data-noctra-panel-kind="roulette"]')) return;
      const libraries = Object.entries(catalog).filter(([, lib]) => lib);
      if (!libraries.some(([, lib]) => lib.id === rouletteState.library)) rouletteState.library = '';
      const genres = ['Action', 'Aventure', 'Animation', 'Comédie', 'Crime', 'Documentaire', 'Drame', 'Familial', 'Fantastique', 'Histoire', 'Horreur', 'Musique', 'Mystère', 'Romance', 'Science-Fiction', 'Thriller', 'Western'];
      setPanelBody(`<section class="noctra-roulette">
        <div class="noctra-roulette-intro"><span class="noctra-roulette-symbol">${icons.sparkle}</span><p class="noctra-eyebrow">LAISSEZ-VOUS SURPRENDRE</p><h3>Votre prochaine<br>bonne surprise.</h3><p>Un film, une série, une nouvelle obsession.<br>Donnez vos envies au hasard.</p><div class="noctra-roulette-deck" aria-hidden="true">${[icons.film, icons.tv, icons.sparkle].map((icon, i) => `<span class="noctra-roulette-ticket">${icon}<small>${['CINÉMA', 'SÉRIES', 'ET SI…'][i]}</small></span>`).join('')}</div><span class="noctra-roulette-caption">LE MEILLEUR PLAN ? L’IMPRÉVU.</span></div>
        <form id="noctra-roulette-form">
          <fieldset class="noctra-roulette-libraries"><legend>Médiathèque</legend>
            <label><input type="radio" name="library" value="" ${!rouletteState.library ? 'checked' : ''}><span>Tous les univers</span></label>
            ${libraries.map(([label, lib]) => `<label><input type="radio" name="library" value="${escapeHtml(lib.id)}" ${rouletteState.library === lib.id ? 'checked' : ''}><span>${escapeHtml(label.replace('Films D’animations', 'Films Animation'))}</span></label>`).join('')}
          </fieldset>
          <details class="noctra-roulette-filters"><summary>${icons.filter || icons.settings || icons.tools}<span>Affiner le hasard</span></summary><div class="noctra-roulette-fields">
            <label class="noctra-field"><span>Genre</span><select name="genre"><option value="">Tous les genres</option>${genres.map(genre => `<option ${rouletteState.genre === genre ? 'selected' : ''}>${genre}</option>`).join('')}</select></label>
            <label class="noctra-field"><span>Note minimum <output data-roulette-rating>${rouletteState.rating}/10</output></span><input type="range" name="rating" min="0" max="10" step="0.5" value="${rouletteState.rating}"></label>
            <label class="noctra-field"><span>Année minimum</span><input name="minYear" type="number" min="1870" max="${new Date().getFullYear()+2}" placeholder="Sans limite" value="${escapeHtml(rouletteState.minYear)}"></label>
            <label class="noctra-field"><span>Année maximum</span><input name="maxYear" type="number" min="1870" max="${new Date().getFullYear()+2}" placeholder="Sans limite" value="${escapeHtml(rouletteState.maxYear)}"></label>
          </div><label class="noctra-roulette-unplayed"><input type="checkbox" name="unplayed" ${rouletteState.unplayed ? 'checked' : ''}> Uniquement les titres non vus</label></details>
          <div class="noctra-roulette-actions"><label class="noctra-field"><span>Nombre de suggestions</span><select name="count" aria-label="Nombre de suggestions">${[1,3,5,10].map(count => `<option value="${count}" ${count === rouletteState.count ? 'selected' : ''}>${count} ${count === 1 ? 'titre' : 'titres'}</option>`).join('')}</select></label><button type="submit" class="noctra-button noctra-button--primary" ${libraries.length ? '' : 'disabled'}>${icons.sparkle}<span>Lancer la roulette</span></button></div>
        </form><div data-roulette-results aria-live="polite">${libraries.length ? '<div class="noctra-roulette-empty">'+icons.film+'<div><h4>Votre prochaine séance vous attend</h4><p>Choisissez vos univers, puis lancez la roulette pour révéler la sélection.</p></div></div>' : '<p class="noctra-empty">Aucune médiathèque accessible pour ce compte.</p>'}</div>
      </section>`);
    } catch (error) { if (sequence === rouletteSequence) showError(error); }
  }

  async function spinRoulette(form) {
    const result = document.querySelector('[data-roulette-results]');
    if (!result || form.getAttribute('aria-busy') === 'true') return;
    const values = new FormData(form);
    Object.assign(rouletteState, Object.fromEntries(values), { count: Number(values.get('count')), rating: Number(values.get('rating')), unplayed: values.has('unplayed') });
    const params = new URLSearchParams(values);
    if (rouletteState.unplayed) params.set('unplayed', '1');
    const sequence = ++rouletteSequence;
    const submit = form.querySelector('[type="submit"]');
    form.setAttribute('aria-busy', 'true'); submit.disabled = true;
    result.innerHTML = '<div class="noctra-loading"><i></i><span>Le hasard parcourt vos médiathèques…</span></div>';
    try {
      const data = await api(`/api/roulette?${params}`, { timeoutMs: 30_000, cache: 'no-store' });
      if (sequence !== rouletteSequence || !result.isConnected) return;
      result.innerHTML = data.results.length ? `<div class="noctra-roulette-results">${data.results.map(item => `<article class="noctra-roulette-result">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="Affiche de ${escapeHtml(item.title)}" loading="lazy">` : `<div class="noctra-roulette-poster-empty">${icons.film}</div>`}
        <div><p class="noctra-eyebrow">${escapeHtml(item.library)}</p><h3>${escapeHtml(item.title)}</h3><p class="noctra-roulette-meta">${[item.year, item.rating ? `${Number(item.rating).toFixed(1)}/10` : '', ...(item.genres || []).slice(0,2)].filter(Boolean).map(escapeHtml).join(' · ')}</p><p class="noctra-roulette-overview">${escapeHtml(item.overview || 'Découvrez ce titre dans votre médiathèque.')}</p><button type="button" class="noctra-button" data-roulette-item="${escapeHtml(item.id)}">${icons.next}<span>Voir la fiche</span></button></div></article>`).join('')}</div>${data.results.length < data.requested ? '<p class="noctra-roulette-hint">Moins de titres correspondent à ces filtres. Élargissez votre sélection pour en découvrir davantage.</p>' : ''}` : '<div class="noctra-empty">Aucun titre avec ces critères. Essayez une autre période ou un autre genre.</div>';
      submit.querySelector('span').textContent = 'Relancer la roulette';
    } catch (error) { if (sequence === rouletteSequence && result.isConnected) result.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`; }
    finally { if (form.isConnected) { form.removeAttribute('aria-busy'); submit.disabled = false; } }
  }

  async function openLibraries() {
    setLoading('Médiathèques', 'NOCTRA · VOS UNIVERS', true);
    try {
      const data = await cachedApi('/api/libraries', 45_000);
      const categories = ['CINÉMA', 'SÉRIES', 'ANIMATION', 'JAPANIMATION'];
      const cards = Object.entries(data).map(([label, library], index) => library ? `
        <button class="noctra-library-card noctra-library-card--${index + 1}" type="button"
          data-library-id="${escapeHtml(library.id)}" data-library-type="${escapeHtml(library.type)}">
          ${library.image
            ? `<img class="noctra-library-card__image" src="${escapeHtml(library.image)}" alt="" loading="eager">`
            : '<span class="noctra-library-card__fallback"></span>'}
          <span class="noctra-library-card__shade"></span>
          <span class="noctra-library-card__content">
            <span class="noctra-library-card__number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
            <span class="noctra-library-card__meta">
              <small>${categories[index]}</small>
              ${Number.isInteger(library.count) ? `<i>${library.count} ${library.count > 1 ? 'éléments' : 'élément'}</i>` : ''}
            </span>
            <strong>${escapeHtml(label)}</strong>
            <span class="noctra-library-card__action">Explorer <b>→</b></span>
          </span>
        </button>` : `
        <div class="noctra-library-card noctra-library-card--missing">
          <span class="noctra-library-card__content">
            <small>${categories[index]}</small>
            <strong>${escapeHtml(label)}</strong>
            <span>Bibliothèque introuvable</span>
          </span>
        </div>`).join('');
      setPanelBody(`
        <div class="noctra-library-hero">
          <div>
            <p class="noctra-eyebrow">COLLECTION PERSONNELLE</p>
            <h3>Choisis ton univers</h3>
            <p>Retrouve chaque médiathèque dans un espace visuel dédié, sans quitter Noctra.</p>
          </div>
          <div class="noctra-library-hero-actions"><button class="noctra-button" type="button" data-noctra="roulette">${icons.sparkle}<span>Roulette</span></button>
            <button class="noctra-button noctra-button--primary" type="button" data-open-discovery>
              ${icons.sparkle}<span>À découvrir</span>
            </button>
            <button class="noctra-button" type="button" data-open-files
              data-admin-only ${authContext?.isAdmin ? '' : 'hidden'}>
              ${icons.folder}<span>Explorateur</span>
            </button>
            <button class="noctra-button noctra-library-refresh" type="button"
              data-library-refresh data-admin-only ${authContext?.isAdmin ? '' : 'hidden'}>
              ${icons.refresh}<span>Actualiser</span>
            </button>
          </div>
        </div>
        <div class="noctra-library-showcase">${cards}</div>`);
    } catch (error) {
      showError(error);
    }
  }

  function updateLibraryRefreshControls(status = null) {
    const busy = Boolean(status && !['complete', 'error', 'idle'].includes(status.phase));
    const progress = Math.max(0, Math.min(100, Math.round(Number(status?.progress || 0))));
    document.querySelectorAll('[data-library-refresh], [data-noctra="refresh"]').forEach(control => {
      const label = control.querySelector('span');
      if (label && !control.dataset.noctraRefreshLabel) control.dataset.noctraRefreshLabel = label.textContent || 'Actualiser';
      control.disabled = busy;
      control.dataset.busy = String(busy);
      control.setAttribute('aria-busy', String(busy));
      if (label) label.textContent = busy
        ? (status?.phase === 'starting' ? 'Démarrage…' : `Analyse · ${progress} %`)
        : control.dataset.noctraRefreshLabel;
      if (!busy) control.dataset.active = 'false';
    });
  }

  function showLibraryRefreshProgress(status) {
    const progress = Math.max(0, Math.min(100, Math.round(Number(status?.progress || 0))));
    toast(status?.message || `Analyse des médiathèques · ${progress} %`, {
      progress,
      persistent: !['complete', 'error'].includes(status?.phase),
      duration: status?.phase === 'complete' ? 5200 : 6200,
      state: status?.phase || 'running'
    });
    updateLibraryRefreshControls(status);
  }

  async function refreshLibraries(button) {
    const sequence = ++libraryRefreshSequence;
    updateLibraryRefreshControls({ phase: 'starting', progress: 0 });
    try {
      let status = await api('/api/libraries/refresh', { method: 'POST', cache: 'no-store', timeoutMs: 20_000 });
      showLibraryRefreshProgress(status);
      let failedPolls = 0;
      for (let attempt = 0; attempt < 7_200 && sequence === libraryRefreshSequence; attempt += 1) {
        if (status.phase === 'complete' || status.phase === 'error') break;
        await wait(document.hidden ? 5_000 : 1_200);
        try {
          status = await api('/api/libraries/refresh', { cache: 'no-store', timeoutMs: 12_000 });
          failedPolls = 0;
        } catch (error) {
          if (++failedPolls >= 3) throw new Error('Suivi Jellyfin momentanément indisponible. L’analyse peut continuer sur le serveur.');
          continue;
        }
        if (status.phase === 'idle') throw new Error('Jellyfin n’a pas confirmé la fin de l’analyse.');
        showLibraryRefreshProgress(status);
      }
      if (sequence !== libraryRefreshSequence) return;
      if (status.phase === 'error') throw new Error(status.message || 'L’actualisation des médiathèques a échoué.');
      if (status.phase !== 'complete') throw new Error('L’analyse continue sur Jellyfin. Relance le suivi pour voir sa progression.');
      clearApiCache('/api/libraries');
      homeLibraryCatalogPromise = null;
      const mediaSection = document.querySelector('.homePage:not(.hide) .noctra-my-media-section');
      if (mediaSection) void hydrateHomeLibraryImages(mediaSection);
      showLibraryRefreshProgress({ phase: 'complete', progress: 100, message: 'Médiathèques actualisées · 100 %' });
    } catch (error) {
      if (sequence === libraryRefreshSequence) toast(error.message, { state: 'error', duration: 6200 });
    } finally {
      if (sequence === libraryRefreshSequence) updateLibraryRefreshControls();
    }
  }

  function jellyseerrCard(item) {
    const title = item.title || item.name || 'Sans titre';
    const date = item.releaseDate || item.firstAirDate;
    const image = item.backdropPath
      ? `https://image.tmdb.org/t/p/w780${item.backdropPath}`
      : item.posterPath
        ? `https://image.tmdb.org/t/p/w500${item.posterPath}`
        : '';
    const status = item.mediaInfo?.status;
    const serviceId = item.resolvedServiceId || item.mediaInfo?.externalServiceId;
    const interactive = Boolean(authContext?.isAdmin && serviceId);
    const year = String(date || '').slice(0, 4);
    return `
      <article class="noctra-card" data-media-detail data-media-detail-id="${escapeHtml(item.id)}" data-media-detail-type="${escapeHtml(item.mediaType)}" data-media-detail-title="${escapeHtml(title)}" data-media-detail-year="${escapeHtml(year)}">
        ${image ? `<img class="noctra-card__image" src="${escapeHtml(image)}" alt="">` : '<div class="noctra-card__image"></div>'}
        <div class="noctra-card__body">
          <h3 title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
          <p>${item.mediaType === 'tv' ? 'Série' : 'Film'} · ${escapeHtml(formatDate(date))}</p>
          ${interactive ? `
            <button class="noctra-button noctra-button--primary" type="button"
              data-release-type="${item.mediaType === 'tv' ? 'sonarr' : 'radarr'}"
              data-release-id="${escapeHtml(serviceId)}" data-release-title="${escapeHtml(title)}">
              Recherche interactive
            </button>` : `
            <button class="noctra-button ${status ? '' : 'noctra-button--primary'}" type="button"
              data-request-id="${escapeHtml(item.id)}" data-request-type="${escapeHtml(item.mediaType)}"
              data-request-title="${escapeHtml(title)}" data-request-image="${escapeHtml(image)}"
              data-request-year="${escapeHtml(year)}"
              ${status ? 'disabled' : ''}>
              ${status ? 'Déjà demandé' : 'Demander'}
            </button>`}
        </div>
      </article>`;
  }

  function destinationOptions(server) {
    return `
      <label class="noctra-field noctra-request-profile-field">
        <span>Profil qualité</span>
        <select name="profileId" required>
          ${server.profiles.map(profile => `
            <option value="${profile.id}" ${profile.id === server.defaultProfileId ? 'selected' : ''}>
              ${escapeHtml(profile.name)}
            </option>`).join('')}
        </select>
        <small>Le profil sélectionné sera transmis explicitement à Jellyseerr pour éviter les anciens profils devenus invalides.</small>
      </label>
      ${authContext?.isAdmin ? `
        <label class="noctra-field">
          <span>Dossier de destination</span>
          <select name="rootFolder" required>
            ${server.rootFolders.map(folder => `
              <option value="${escapeHtml(folder.path)}"
                ${folder.path === server.defaultRootFolder ? 'selected' : ''}>
                ${escapeHtml(folder.path.split('/').filter(Boolean).at(-1) || folder.path)}
                · ${formatBytes(folder.freeSpace)} libres
              </option>`).join('')}
          </select>
          <small>Le média sera importé et rangé dans ce dossier par ${requestDestinations.service === 'sonarr' ? 'Sonarr' : 'Radarr'}.</small>
        </label>` : `
        <div class="noctra-request-auto-destination">
          ${icons.folder}
          <span><strong>Rangement automatique</strong><small>${escapeHtml(server.defaultRootFolderLabel || server.defaultRootFolder?.split('/').filter(Boolean).at(-1) || 'Destination définie')} · défini par l’administrateur</small></span>
        </div>`}`;
  }

  function requestServersForMode(mode = 'auto') {
    const servers = Array.isArray(requestDestinations?.servers) ? requestDestinations.servers : [];
    return servers.filter(server => mode === 'manual' ? Boolean(server.preventSearch) : !server.preventSearch);
  }

  function renderRequestMode(mode = 'auto') {
    const select = document.querySelector('[data-request-server]');
    if (!select) return;
    const forceSeriesAuto = Boolean(requestDestinations?.requestPolicy?.forceAutomatic);
    if (forceSeriesAuto) mode = 'auto';
    const servers = requestServersForMode(mode);
    const fallback = Array.isArray(requestDestinations?.servers) ? requestDestinations.servers : [];
    const candidates = servers.length ? servers : fallback;
    const current = Number(select.value);
    const selected = candidates.find(server => Number(server.id) === current)
      || candidates.find(server => server.isDefault)
      || candidates[0];
    select.innerHTML = candidates.map(server => `<option value="${server.id}" ${selected && Number(server.id) === Number(selected.id) ? 'selected' : ''}>${escapeHtml(server.name)}${server.is4k ? ' · 4K' : ''}${server.preventSearch ? ' · manuel' : ' · auto'}</option>`).join('');
    if (selected) renderDestinationFields(selected.id);
    const note = document.querySelector('[data-request-mode-note]');
    if (note) {
      note.dataset.mode = forceSeriesAuto ? 'series-auto' : mode;
      note.innerHTML = forceSeriesAuto
        ? `<strong>Série non terminée · automatique conservé</strong><span>${escapeHtml(requestDestinations?.requestPolicy?.reason || 'Sonarr continue de récupérer automatiquement les épisodes manquants et futurs.')}</span>`
        : mode === 'manual'
          ? '<strong>Choix manuel</strong><span>Jellyseerr ajoute le média à Radarr/Sonarr sans lancer de recherche automatique. Après validation, Noctra ouvre la recherche interactive pour que tu choisisses la release.</span>'
          : '<strong>Automatique</strong><span>Comportement habituel : Radarr/Sonarr peut rechercher et lancer automatiquement la meilleure release selon ton profil.</span>';
    }
  }

  function renderDestinationFields(serverId) {
    const target = document.querySelector('#noctra-destination-fields');
    const server = requestDestinations?.servers.find(item => item.id === Number(serverId));
    if (!target || !server) return;
    target.innerHTML = destinationOptions(server);
  }

  async function openRequestDestination(button) {
    pendingRequest = {
      mediaId: Number(button.dataset.requestId),
      mediaType: button.dataset.requestType,
      title: button.dataset.requestTitle || 'Nouveau média',
      image: button.dataset.requestImage || '',
      year: button.dataset.requestYear || ''
    };
    let availability = null;
    try {
      availability = await fetchTrackerAvailability({ ...pendingRequest, tmdbId: pendingRequest.mediaId });
    } catch {}
    const requestAvailability = torrentAvailabilityPresentation(availability || {});
    const availabilityMarkup = availability?.configured
      ? `<div class="noctra-request-availability" data-status="${escapeHtml(requestAvailability.state)}"><strong>${escapeHtml(requestAvailability.title)}</strong><span>${escapeHtml(requestAvailability.detail)}</span></div>`
      : '';
    setLoading(pendingRequest.title, 'CHOISIR LA QUALITÉ');
    try {
      requestDestinations = await api(`/api/jellyseerr/destinations?mediaType=${encodeURIComponent(pendingRequest.mediaType)}&mediaId=${encodeURIComponent(pendingRequest.mediaId)}`);
      if (!requestDestinations.servers.length) {
        const details = (requestDestinations.unavailableServers || [])
          .map(server => `${server.name} : ${(server.missing || []).join(' et ')} manquant`)
          .join(' · ');
        throw new Error(details || 'Aucun serveur de destination utilisable n’est configuré dans Jellyseerr.');
      }
      const selected = requestDestinations.servers.find(server => server.isDefault) || requestDestinations.servers[0];
      const requestPolicy = requestDestinations.requestPolicy || {};
      const forceSeriesAuto = pendingRequest.mediaType === 'tv' && Boolean(requestPolicy.forceAutomatic);
      setPanelBody(`
        <div class="noctra-request-config">
          <div class="noctra-request-preview">
            ${pendingRequest.image ? `<img src="${escapeHtml(pendingRequest.image)}" alt="">` : '<div class="noctra-request-preview__empty">N</div>'}
            <div>
              <p class="noctra-eyebrow">${pendingRequest.mediaType === 'tv' ? 'NOUVELLE SÉRIE' : 'NOUVEAU FILM'}</p>
              <h3>${escapeHtml(pendingRequest.title)}</h3>
              <p>Choisis la qualité souhaitée. Noctra vérifie le profil auprès de ${pendingRequest.mediaType === 'tv' ? 'Sonarr' : 'Radarr'} avant l’envoi.</p>
            </div>
          </div>
          ${availabilityMarkup}
          <form id="noctra-request-confirm" class="noctra-destination-form">
            <div class="noctra-request-fields">
              ${authContext?.isAdmin ? (forceSeriesAuto ? `<input type="hidden" name="selectionMode" value="auto"><div class="noctra-request-auto-destination noctra-request-series-auto"><span><strong>Série en cours · automatique</strong><small>${escapeHtml(requestPolicy.reason || 'Sonarr garde la recherche automatique pour les épisodes manquants et futurs.')}</small></span></div>` : `<label class="noctra-field">
                <span>Après validation</span>
                <select name="selectionMode" data-request-download-mode>
                  <option value="auto" ${requestServersForMode('auto').length ? '' : 'disabled'}>Automatique · laisser Radarr/Sonarr choisir</option>
                  <option value="manual" ${requestServersForMode('manual').length ? '' : 'disabled'}>Manuel · je choisis la release</option>
                </select>
              </label>`) : '<input type="hidden" name="selectionMode" value="auto">'}
              <label class="noctra-field">
                <span>Serveur</span>
                <select name="serverId" data-request-server required>
                  ${requestDestinations.servers.map(server => `
                    <option value="${server.id}" ${server.id === selected.id ? 'selected' : ''}>
                      ${escapeHtml(server.name)}${server.is4k ? ' · 4K' : ''}
                    </option>`).join('')}
                </select>
              </label>
              <div id="noctra-destination-fields"></div>
            </div>
            ${!authContext?.isAdmin ? `<div class="noctra-access-note"><strong>Demande personnelle</strong><span>Elle restera associée à ton compte Jellyseerr et suivra ses règles d’approbation.</span></div>` : ''}
            ${authContext?.isAdmin ? `<div class="noctra-access-note noctra-request-mode-note" data-request-mode-note></div>${forceSeriesAuto || requestServersForMode('manual').length ? '' : '<div class="noctra-access-note"><strong>Mode manuel à activer</strong><span>Dans Jellyseerr, ajoute une deuxième destination Radarr/Sonarr pointant vers la même instance et désactive « Automatic Search ». Noctra la détectera automatiquement comme destination manuelle.</span></div>'}` : ''}
            <div class="noctra-request-actions">
              <button class="noctra-button" type="button" data-noctra-close>Annuler</button>
              <button class="noctra-button noctra-button--primary" type="submit">${authContext?.isAdmin ? 'Confirmer l’ajout' : 'Envoyer la demande'}</button>
            </div>
          </form>
        </div>`, { afterUpdate: () => {
          // Compatibilité du contrat historique : afterUpdate: () => renderDestinationFields(selected.id)
          const initialMode = forceSeriesAuto
            ? 'auto'
            : authContext?.isAdmin && requestServersForMode('manual').length
              ? 'manual'
              : 'auto';
          const modeSelect = document.querySelector('[data-request-download-mode]');
          if (modeSelect) modeSelect.value = initialMode;
          renderRequestMode(initialMode);
        } });
    } catch (error) {
      showError(error);
    }
  }

  async function searchJellyseerr(query) {
    const results = document.querySelector('#noctra-seerr-results');
    if (!results) return;
    results.innerHTML = '<div class="noctra-loading"><i></i><span>Recherche Jellyseerr…</span></div>';
    try {
      const data = await api(`/api/jellyseerr/search?q=${encodeURIComponent(query)}`);
      const cards = (data.results || []).slice(0, 24).map(jellyseerrCard).join('');
      results.innerHTML = cards ? `<div class="noctra-grid">${cards}</div>` : '<div class="noctra-empty">Aucun résultat.</div>';
    } catch (error) {
      results.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function requestStatusMeta(status) {
    const value = Number(status || 0);
    if (value === 1) return { key: 'pending', label: 'En attente' };
    if (value === 2) return { key: 'approved', label: 'Approuvée' };
    if (value === 3) return { key: 'declined', label: 'Refusée' };
    return { key: 'other', label: 'Traitement' };
  }

  function requestRow(item) {
    const media = item.media || {};
    const mediaType = item.mediaType || media.mediaType || (item.type === 'tv' ? 'tv' : 'movie');
    const type = mediaType === 'tv' ? 'sonarr' : 'radarr';
    const title = item.displayTitle || `${type === 'sonarr' ? 'Série' : 'Film'} · TMDB ${media.tmdbId || '—'}`;
    const serviceId = item.resolvedServiceId || media.externalServiceId;
    const status = requestStatusMeta(item.status);
    const requestId = Number(item.id || 0);
    const image = item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : '';
    const requester = item.requestedBy?.displayName || item.requestedBy?.username || item.requestedBy?.email || '';
    return `
      <article class="noctra-row noctra-request-row" data-request-status="${status.key}" data-request-media-type="${escapeHtml(mediaType)}" data-request-search-text="${escapeHtml(`${title} ${requester}`.toLocaleLowerCase('fr'))}"
        ${media.tmdbId ? `data-media-detail data-media-detail-id="${escapeHtml(media.tmdbId)}" data-media-detail-type="${escapeHtml(mediaType)}" data-media-detail-title="${escapeHtml(title)}" data-media-detail-year="${escapeHtml(String(item.releaseDate || '').slice(0, 4))}"` : ''}>
        <div class="noctra-request-row-media">
          ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<span class="noctra-request-row-poster">${mediaType === 'tv' ? 'TV' : 'FILM'}</span>`}
          <div>
            <div class="noctra-request-row-title"><h3>${escapeHtml(title)}</h3><span class="noctra-request-state" data-state="${status.key}">${escapeHtml(status.label)}</span></div>
            <p>${type === 'sonarr' ? 'Série · Sonarr' : 'Film · Radarr'} · ${escapeHtml(formatDate(item.createdAt))}${requester && authContext?.isAdmin ? ` · ${escapeHtml(requester)}` : ''}</p>
            ${item.overview ? `<small>${escapeHtml(item.overview)}</small>` : ''}
          </div>
        </div>
        <div class="noctra-request-row-actions">
          ${authContext?.isAdmin && status.key === 'pending' ? `<button class="noctra-button noctra-button--primary" type="button" data-request-admin-status="approve" data-request-admin-id="${requestId}">Approuver</button><button class="noctra-button" type="button" data-request-admin-status="decline" data-request-admin-id="${requestId}">Refuser</button>` : ''}
          ${serviceId && authContext?.isAdmin ? `<button class="noctra-button" type="button" data-release-type="${type}" data-release-id="${escapeHtml(serviceId)}" data-release-title="${escapeHtml(title)}">Choisir le torrent</button>` : ''}
          ${requestId && (authContext?.isAdmin || status.key === 'pending') ? `<button class="noctra-button noctra-button--danger" type="button" data-request-delete-id="${requestId}">${authContext?.isAdmin ? 'Supprimer' : 'Annuler'}</button>` : ''}
        </div>
      </article>`;
  }

  function requestSummaryMarkup(data) {
    const summary = data?.summary || {};
    const quota = data?.quota || {};
    const pending = Number(summary.pending ?? quota.pending ?? 0);
    const remaining = Number(quota.remaining ?? Math.max(0, Number(quota.limit || 10) - pending));
    return `<section class="noctra-request-command-center">
      <div class="noctra-request-command-copy">
        <p class="noctra-eyebrow">CENTRE DE DEMANDES</p>
        <h3>${authContext?.isAdmin ? 'Les demandes en un regard' : 'Tes demandes, au même endroit'}</h3>
        <p>${authContext?.isAdmin ? 'Filtre les demandes, valide les ajouts utiles et nettoie les attentes abandonnées.' : `Tu peux garder jusqu’à ${Number(quota.limit || 10)} demandes simultanément en attente.`}</p>
      </div>
      <div class="noctra-request-stats">
        <button type="button" data-request-status-filter="all" data-active="${requestHistoryState.status === 'all'}"><strong>${Number(summary.total || 0)}</strong><span>Total</span></button>
        <button type="button" data-request-status-filter="pending" data-active="${requestHistoryState.status === 'pending'}"><strong>${pending}</strong><span>En attente</span></button>
        <button type="button" data-request-status-filter="approved" data-active="${requestHistoryState.status === 'approved'}"><strong>${Number(summary.approved || 0)}</strong><span>Approuvées</span></button>
        <button type="button" data-request-status-filter="declined" data-active="${requestHistoryState.status === 'declined'}"><strong>${Number(summary.declined || 0)}</strong><span>Refusées</span></button>
        ${!authContext?.isAdmin ? `<span class="noctra-request-slots"><strong>${remaining}</strong><span>places libres</span></span>` : ''}
      </div>
    </section>`;
  }

  function applyRequestHistoryFilters() {
    const root = document.querySelector('#noctra-seerr-results');
    if (!root) return;
    const needle = normalizedText(requestHistoryState.query || '');
    root.querySelectorAll('.noctra-request-row').forEach(row => {
      const statusOk = requestHistoryState.status === 'all' || row.dataset.requestStatus === requestHistoryState.status;
      const typeOk = requestHistoryState.mediaType === 'all' || row.dataset.requestMediaType === requestHistoryState.mediaType;
      const haystack = normalizedText(row.dataset.requestSearchText || '');
      row.hidden = !(statusOk && typeOk && (!needle || haystack.includes(needle)));
    });
    root.querySelectorAll('[data-request-status-filter]').forEach(button => button.dataset.active = String(button.dataset.requestStatusFilter === requestHistoryState.status));
  }

  async function showRequestHistory() {
    const target = document.querySelector('#noctra-seerr-results');
    if (!target) return;
    target.innerHTML = '<div class="noctra-loading"><i></i><span>Chargement des demandes…</span></div>';
    try {
      const data = await cachedApi('/api/jellyseerr/requests', 15_000);
      lastRequestHistoryData = data;
      const rows = (data.results || []).map(requestRow).join('');
      const pending = Number(data?.summary?.pending ?? data?.quota?.pending ?? 0);
      target.innerHTML = `${requestSummaryMarkup(data)}
        <div class="noctra-request-history-toolbar">
          <label>${icons.search}<input type="search" data-request-history-search value="${escapeHtml(requestHistoryState.query)}" placeholder="Titre ou utilisateur…"></label>
          <select data-request-media-filter aria-label="Type de contenu"><option value="all">Films et séries</option><option value="movie" ${requestHistoryState.mediaType === 'movie' ? 'selected' : ''}>Films</option><option value="tv" ${requestHistoryState.mediaType === 'tv' ? 'selected' : ''}>Séries</option></select>
          ${authContext?.isAdmin ? `<button class="noctra-button noctra-button--danger" type="button" data-clear-pending-requests ${pending ? '' : 'disabled'}>Nettoyer les ${pending} attente${pending > 1 ? 's' : ''}</button>` : ''}
        </div>
        <div class="noctra-list noctra-request-history-list">${rows || '<div class="noctra-empty">Aucune demande récente.</div>'}</div>`;
      applyRequestHistoryFilters();
    } catch (error) {
      target.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function requestDiscoverySkeletonMarkup() {
    const cards = Array.from({ length: 3 }, () => `
      <article class="noctra-request-skeleton-card">
        <i class="noctra-request-skeleton-visual"></i>
        <span><i></i><i></i><i></i><i></i></span>
      </article>`).join('');
    return `<div class="noctra-request-skeleton" role="status" aria-label="Chargement des suggestions">
      <section class="noctra-request-skeleton-intro"><i></i><i></i><i></i><span><i></i><i></i><i></i></span></section>
      <section><div class="noctra-request-skeleton-title"><i></i><i></i></div><div class="noctra-request-skeleton-rail">${cards}</div></section>
    </div>`;
  }

  function streamingPlatformButtons(rows = [], selected = '', region = 'FR') {
    const preferred = /^(netflix|amazon prime video|disney\+|apple tv|paramount\+|canal\+|hbo max|crunchyroll|arte|animation digital network|mubi)$/i;
    const unique = [...new Map(rows.map(p=>[String(p.id),p])).values()];
    const platforms = unique.filter(p=>preferred.test(p.name || ''));
    const others = unique.filter(p=>!preferred.test(p.name || ''));
    const tile = p => '<button type="button" data-platform-id="'+escapeHtml(p.id)+'" aria-pressed="'+(String(p.id)===String(selected))+'">'+(p.logoPath ? '<img src="https://image.tmdb.org/t/p/w185'+escapeHtml(p.logoPath)+'" alt="" loading="lazy">' : icons.tv)+'<span>'+escapeHtml(p.name)+'</span></button>';
    const rail = (content, label) => '<div class="noctra-platform-carousel"><div class="noctra-platform-controls" aria-label="'+label+'"><button type="button" data-platform-scroll="-1" aria-label="Plateformes précédentes">←</button><button type="button" data-platform-scroll="1" aria-label="Plateformes suivantes">→</button></div><div class="noctra-platform-rail" tabindex="0" role="region" aria-label="'+label+'">'+content+'</div></div>';
    return '<section class="noctra-platform-section"><div class="noctra-platform-heading"><div><p class="noctra-eyebrow">LE CINÉMA, PARTOUT</p><h3>Vos plateformes. Toutes vos envies.</h3></div><span class="noctra-region-pill">Catalogue · '+escapeHtml(region)+'</span></div><p>Abonnement, gratuit ou avec publicité. Les offres à l’achat et à la location sont exclues.</p>'+rail('<button type="button" data-platform-id="" aria-pressed="'+(!selected)+'">'+icons.tv+'<span>Toutes</span></button>'+platforms.map(tile).join(''),'Plateformes principales')+(others.length ? '<details class="noctra-platform-more"><summary>Autres services et chaînes · '+others.length+'</summary><p>Les chaînes via Amazon peuvent nécessiter un abonnement supplémentaire. Certains services proposent uniquement de la VOD.</p>'+rail(others.map(tile).join(''),'Autres plateformes')+'</details>' : '')+(!unique.length ? '<p>Chargement des plateformes…</p>' : '')+'</section>';
  }

  function loadStreamingPlatformButtons(selected = '') {
    const host = document.querySelector('[data-platform-buttons]');
    if (!host) return;
    cachedApi('/api/discovery/providers?type=all', 60*60_000).then(data=>{
      if(host.isConnected) host.innerHTML=streamingPlatformButtons(data.results || [], selected, data.region || 'FR');
    }).catch(()=>{if(host.isConnected)host.innerHTML='<p>Les plateformes ne répondent pas. La recherche reste disponible.</p>';});
  }

  function requestHomeShellMarkup(history = null) {
    const pending = Number(history?.summary?.pending ?? history?.quota?.pending ?? 0);
    const remaining = Number(history?.quota?.remaining ?? Math.max(0, Number(history?.quota?.limit || 10) - pending));
    return `
      <section class="noctra-request-home-head">
        <div><p class="noctra-eyebrow">À VOUS LA PROCHAINE SÉANCE</p><h3>Une envie. <br>Des milliers d’histoires.</h3><p>Trouvez votre prochain film ou votre prochaine série, et suivez son arrivée dans Noctra.</p></div>
        <div class="noctra-request-home-quota" data-request-home-quota><strong>${history ? (authContext?.isAdmin ? pending : remaining) : '…'}</strong><span>${history ? (authContext?.isAdmin ? 'en attente à gérer' : 'places encore disponibles') : 'Chargement…'}</span></div>
      <form class="noctra-search noctra-request-search" id="noctra-seerr-search">
        <input name="query" autocomplete="off" placeholder="Rechercher un film, une série, un univers…" aria-label="Rechercher">
        <button class="noctra-button noctra-button--primary" type="submit" aria-label="Rechercher">${icons.search}<span>Rechercher</span></button>
      </form>
      </section>
      <div class="noctra-tabs noctra-request-main-tabs">
        <button class="noctra-tab" type="button" data-request-view="discover" data-active="true">Pour toi</button>
        <button class="noctra-tab" type="button" data-open-discovery>Explorer</button>
        <button class="noctra-tab" type="button" data-request-view="history" data-request-history-tab>${authContext?.isAdmin ? 'Gestion' : 'Mes demandes'}${pending ? ` · ${pending}` : ''}</button>
      </div>
      <div data-platform-buttons><p>Chargement des plateformes…</p></div>
      <div id="noctra-seerr-results" data-request-results-loading="true">${requestDiscoverySkeletonMarkup()}</div>`;
  }

  async function openRequests() {
    ++requestNavigationSequence;
    setLoading('Demandes', 'NOCTRA · VOS ENVIES', true);
    // Le cadre utilisable est peint immédiatement. Les données et le quota
    // continuent à arriver en parallèle, comme auparavant.
    const historyPromise = cachedApi('/api/jellyseerr/requests', 15_000).catch(() => null);
    setPanelBody(requestHomeShellMarkup(lastRequestHistoryData), { afterUpdate: () => loadStreamingPlatformButtons() });
    historyPromise.then(fresh => {
      if (!fresh) return;
      lastRequestHistoryData = fresh;
      const freshPending = Number(fresh?.summary?.pending ?? fresh?.quota?.pending ?? 0);
      const freshRemaining = Number(fresh?.quota?.remaining ?? Math.max(0, Number(fresh?.quota?.limit || 10) - freshPending));
      const quota = document.querySelector('[data-request-home-quota]');
      if (quota) quota.innerHTML = `<strong>${authContext?.isAdmin ? freshPending : freshRemaining}</strong><span>${authContext?.isAdmin ? 'en attente à gérer' : 'places encore disponibles'}</span>`;
      const tab = document.querySelector('[data-request-history-tab]');
      if (tab) tab.textContent = `${authContext?.isAdmin ? 'Gestion' : 'Mes demandes'}${freshPending ? ` · ${freshPending}` : ''}`;
    });

    // setPanelBody peint au prochain frame. Attendre ce point empêche une réponse
    // rapide de se perdre avant que le conteneur des cartes existe réellement.
    for (let frame = 0; frame < 12 && !document.querySelector('#noctra-seerr-results'); frame += 1) {
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    }

    const smartPath = '/api/discovery?category=smart&provider=&mode=balanced';
    const quickPath = '/api/discovery?category=trending&provider=&mode=balanced';
    const profileFailure = () => {
      const state = document.querySelector('[data-discovery-profile-state]');
      if (state) state.innerHTML = `Personnalisation indisponible pour le moment. <button class="noctra-button" type="button" data-discovery-profile-retry>${icons.retry}<span>Réessayer</span></button>`;
    };
    const renderDiscovery = data => {
      if (!document.querySelector('#noctra-panel[data-noctra-panel-kind="requests"]')) return false;
      const root = document.querySelector('#noctra-seerr-results');
      if (!root || !data) return false;
      try {
        root.innerHTML = smartDiscoveryMarkup(data);
      } catch (error) {
        root.dataset.requestResultsLoading = 'false';
        root.innerHTML = `<div class="noctra-error">${escapeHtml(error.message || 'Impossible d’afficher les suggestions.')}</div>`;
        return false;
      }
      lastRequestDiscoveryData = data;
      root.dataset.requestResultsLoading = 'false';
      window.requestAnimationFrame(() => { const root = document.querySelector('#noctra-seerr-results'); activateDiscoveryEnrichment(root); activateTrackerAvailability(root); });
      return true;
    };

    // Une réouverture rapide ne doit jamais revenir au squelette pendant qu'un
    // rafraîchissement plus complet finit en arrière-plan.
    if (lastRequestDiscoveryData) {
      renderDiscovery(lastRequestDiscoveryData);
      void cachedApi(smartPath, 60_000, { timeoutMs: 35_000 }).then(renderDiscovery).catch(profileFailure);
      return;
    }

    const warmSmart = validCachedApiValue(smartPath);
    if (warmSmart) {
      renderDiscovery(warmSmart);
      return;
    }

    const warmQuick = validCachedApiValue(quickPath);
    if (warmQuick) {
      renderDiscovery(warmQuick);
      void cachedApi(smartPath, 60_000, { timeoutMs: 35_000 }).then(renderDiscovery).catch(profileFailure);
      return;
    }

    // Le premier écran dépend uniquement du flux rapide. La personnalisation
    // enrichie ne peut plus retenir le rendu si son calcul est encore en cours.
    try {
      const quick = await api(quickPath, { timeoutMs: 18_000 });
      apiResponseCache.set(quickPath, { value: quick, expiresAt: Date.now() + 5 * 60_000 });
      if (!renderDiscovery(quick)) return;
    } catch (quickError) {
      try {
        const smart = await cachedApi(smartPath, 60_000, { timeoutMs: 35_000 });
        renderDiscovery(smart);
      } catch (smartError) {
        const root = document.querySelector('#noctra-seerr-results');
        if (root) {
          root.dataset.requestResultsLoading = 'false';
          root.innerHTML = `<div class="noctra-error">${escapeHtml(quickError.message || smartError.message || 'Impossible de charger les suggestions.')}</div>`;
        }
      }
      return;
    }

    void cachedApi(smartPath, 60_000, { timeoutMs: 35_000 }).then(data => {
      if (!document.querySelector('#noctra-panel[data-noctra-panel-kind="requests"]')) return;
      renderDiscovery(data);
    }).catch(profileFailure);
  }


  function ensureMpegTsLibrary() {
    if (window.mpegts) return Promise.resolve(window.mpegts);
    if (!tvMpegTsLoader) tvMpegTsLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => reject(new Error('Le lecteur MPEG-TS ne répond pas.')), 8_000);
      script.src = appPath('/vendor/mpegts.js?v=1.8.0');
      script.onload = () => { window.clearTimeout(timeout); window.mpegts ? resolve(window.mpegts) : reject(new Error('Lecteur MPEG-TS indisponible.')); };
      script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Lecteur MPEG-TS inaccessible.')); };
      document.head.append(script);
    }).catch(error => { tvMpegTsLoader = null; throw error; });
    return tvMpegTsLoader;
  }

  function prepareTvShaka(engine) {
    // Shaka 5.2.10 can return null from SegmentIndex[Symbol.iterator] after
    // eviction empties a short live playlist. Its HLS PDT update then throws
    // every refresh. An empty index must yield an empty iterator, not null.
    const proto = engine?.media?.SegmentIndex?.prototype;
    if (/^v?5\.2\.10$/.test(engine?.Player?.version || '') && proto && !proto[Symbol.iterator]._noctraEmptyIndex) {
      const original = proto[Symbol.iterator];
      const iterate = function () { return original.call(this) || [][Symbol.iterator](); };
      iterate._noctraEmptyIndex = true;
      proto[Symbol.iterator] = iterate;
    }
    return engine;
  }

  function ensureShakaLibrary() {
    if (window.shaka?.Player) return Promise.resolve(prepareTvShaka(window.shaka));
    if (tvShakaLoader) return tvShakaLoader;
    tvShakaLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = window.setTimeout(() => reject(new Error('Chargement Shaka expiré')), 12000);
      script.src = appPath('/vendor/shaka-player.compiled.js?v=5.2.10');
      script.onload = () => { window.clearTimeout(timer); window.shaka?.Player ? resolve(prepareTvShaka(window.shaka)) : reject(new Error('Shaka indisponible')); };
      script.onerror = () => { window.clearTimeout(timer); reject(new Error('Chargement Shaka impossible')); };
      document.head.append(script);
    }).catch(error => { tvShakaLoader = null; throw error; });
    return tvShakaLoader;
  }

  function ensureHlsLibrary() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (tvHlsLoader) return tvHlsLoader;
    tvHlsLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // Le lecteur est livré avec Noctra : une panne ou un blocage du CDN ne
      // doit jamais rendre tous les flux HLS inutilisables.
      script.src = appPath('/vendor/hls.min.js?v=1.7.3');
      script.async = true;
      script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('HLS.js ne s’est pas initialisé.'));
      script.onerror = () => reject(new Error('Le module HLS.js est inaccessible.'));
      document.head.append(script);
      window.setTimeout(() => reject(new Error('Le chargement du lecteur HLS local a expiré.')), 8_000);
    }).catch(error => {
      tvHlsLoader = null;
      throw error;
    });
    return tvHlsLoader;
  }

  const tvDefaultIframeSandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation';
  const tvTrustedEmbedHosts = new Set(['livewatch.top', 'www.livewatch.top', 'witv.football', 'www.witv.football', 'oha.cx', 'www.oha.cx', 'streamed.pk', 'www.streamed.pk', 'embed.st', 'www.embed.st', 'volkamax.club', 'www.volkamax.club', 'bzh-sport.lat', 'www.bzh-sport.lat', 'zonalive.click', 'www.zonalive.click', '178.239.115.119']);

  function configureTvIframe(frame, channel) {
    if (!frame) return;
    // Embedded video should not scroll; full provider pages remain navigable.
    frame.setAttribute('scrolling', frame.dataset.tvCompatPage === 'true' ? 'auto' : 'no');
    // Published Brigitte players reject every sandbox attribute. Keep their
    // document external: never grant this exception to a local proxy page.
    if (['BrigitteTV', 'DLStreams', 'DaddyLive', 'Streamed', 'Volkamax', 'FCTV33', 'RénéVéo', 'BowdTV', 'Xtemus'].includes(channel?.provider)) {
      try {
        const target = new URL(channel.embedUrl, window.location.href);
        if (/^https?:$/.test(target.protocol) && target.origin !== window.location.origin) {
          frame.removeAttribute('sandbox');
          frame.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *');
          frame.setAttribute('allowfullscreen', '');
          return;
        }
        if (target.origin === window.location.origin) {
          frame.setAttribute('sandbox', tvDefaultIframeSandbox);
          frame.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *');
          frame.setAttribute('allowfullscreen', '');
          return;
        }
      } catch {}
    }
    if (channel?.noSandbox || channel?.provider === 'Alternative') {
      frame.removeAttribute('sandbox');
      frame.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *; clipboard-read; clipboard-write');
      frame.setAttribute('allowfullscreen', '');
      return;
    }
    let host = '';
    let preparedWiTv = false;
    let preparedOha = false;
    let preparedLiveWatch = false;
    try {
      const url = new URL(channel?.embedUrl || '', window.location.href);
      host = url.hostname.toLowerCase();
      preparedWiTv = url.origin === window.location.origin && /\/api\/tv\/embed\//.test(url.pathname);
      preparedOha = url.origin === window.location.origin && /\/api\/tv\/oha\/embed\//.test(url.pathname);
      preparedLiveWatch = url.origin === window.location.origin && /\/api\/tv\/livewatch\/(?:embed\/|vip\/[^/]+\/embed(?:$|\/))/.test(url.pathname);
    } catch {}
    if (preparedWiTv || preparedOha || preparedLiveWatch) {
      // Les pages tierces préparées sont volontairement sandboxées sans
      // allow-same-origin : elles peuvent lire leur vidéo mais pas les données
      // de session/localStorage de Noctra.
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');
      frame.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *');
      frame.setAttribute('allowfullscreen', '');
      return;
    }
    const trusted = tvTrustedEmbedHosts.has(host) || channel?.provider === 'LiveWatch' || channel?.provider === 'WiTV' || channel?.provider === 'OHA' || channel?.provider === 'Streamed' || channel?.provider === 'Volkamax';
    if (trusted) frame.removeAttribute('sandbox');
    else frame.setAttribute('sandbox', tvDefaultIframeSandbox);
    frame.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *');
    frame.setAttribute('allowfullscreen', '');
  }

  function destroyTvPlayback() {
    tvPlaybackSequence += 1;
    tvOptionSequence += 1;
    tvResolverController.abort();
    tvResolverController = new AbortController();
    try { tvVideoEventsController?.abort?.(); } catch {}
    tvVideoEventsController = null;
    window.clearTimeout(tvWaitingStatusTimer);
    tvWaitingStatusTimer = 0;
    window.clearTimeout(tvDesktopControlsHideTimer);
    tvDesktopControlsHideTimer = 0;
    window.cancelAnimationFrame(tvLiveEdgeRefreshFrame);
    tvLiveEdgeRefreshFrame = 0;
    closeTvDiagnosticsPanel();
    tvFrameResizeObserver?.disconnect?.();
    tvFrameResizeObserver = null;
    try { tvHls?.destroy?.(); } catch {}
    tvHls = null;
    const video = document.querySelector('#noctra-tv-video');
    if (video) {
      try { video.pause(); } catch {}
      video.removeAttribute('src');
      video.controls = true;
      video.hidden = false;
      video.load?.();
    }
    const frame = document.querySelector('#noctra-tv-embed');
    if (frame) {
      if (frame._noctraOhaMessageHandler) window.removeEventListener('message', frame._noctraOhaMessageHandler);
      frame._noctraOhaMessageHandler = null;
      frame.onload = null;
      frame.src = 'about:blank';
      frame.hidden = true;
      frame.closest('.noctra-tv-screen')?.removeAttribute('data-tv-web-page');
      frame.removeAttribute('data-tv-provider');
      frame.removeAttribute('data-tv-compat-page');
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.setAttribute('sandbox', tvDefaultIframeSandbox);
    }
    document.body.classList.remove('noctra-tv-pseudo-fullscreen');
    document.body.classList.remove('noctra-tv-native-fullscreen');
    document.documentElement.classList.remove('noctra-tv-native-fullscreen');
    const playerCard = document.querySelector('.noctra-tv-player-card');
    playerCard?.removeAttribute('data-tv-pseudo-fullscreen');
    playerCard?.removeAttribute('data-tv-custom-live');
    document.querySelector('.noctra-tv-screen')?.removeAttribute('data-tv-controls-hidden');
    tvState.currentPlaybackType = '';
    tvState.currentStreamUrl = '';
    refreshTvLiveEdgeControl();
  }

  function benignTvPlayInterruption(error) {
    const message = String(error?.message || '');
    return error?.name === 'AbortError'
      || /play\(\) request was interrupted|interrupted by a call to pause/i.test(message);
  }

  const tvClock = value => value ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';

  function tvProgrammeLine(channel) {
    if (channel.now?.title) return `${channel.now.title}${channel.now.stop ? ` · jusqu’à ${tvClock(channel.now.stop)}` : ''}`;
    if (channel.description) return channel.description;
    return channel.group || 'Télévision';
  }

  function tvBufferedAhead(video = document.querySelector('#noctra-tv-video')) {
    if (!video || !Number.isFinite(video.currentTime)) return 0;
    try {
      for (let index = 0; index < video.buffered.length; index += 1) {
        const start = video.buffered.start(index);
        const end = video.buffered.end(index);
        if (video.currentTime >= start - .15 && video.currentTime <= end + .15) return Math.max(0, end - video.currentTime);
      }
    } catch {}
    return 0;
  }

  function tvBufferedSpan(video = document.querySelector('#noctra-tv-video')) {
    let longest = 0;
    try {
      for (let index = 0; index < (video?.buffered?.length || 0); index += 1) {
        longest = Math.max(longest, video.buffered.end(index) - video.buffered.start(index));
      }
    } catch {}
    return Math.max(0, longest);
  }

  function tvStartupStillProgressing(now, startedAt, lastProgressAt, bufferedSpan) {
    // Bounded grace for actual appended media, never an endless loading loop.
    return bufferedSpan > .5 && lastProgressAt > 0
      && now - lastProgressAt < 25_000 && now - startedAt < 90_000;
  }

  function tvAchievableBufferGoal(desired, details = null) {
    const duration = Number(details?.totalduration || 0);
    if (details?.live === false || !Number.isFinite(duration) || duration <= 0) return desired;
    const segment = Number(details?.targetduration || 0);
    // Une playlist courte ne pourra jamais fournir 16 s de réserve. Garder
    // une marge sur son bord mobile, sans attendre un délai fixe de 34 s.
    const margin = Math.min(segment > 0 ? segment : 1, duration * .25);
    return Math.min(desired, Math.max(.5, duration - margin - .25));
  }

  function tvStartupBufferGoal(profile, details = null) {
    // Startup needs one usable segment; the larger live reserve builds while playing.
    const segment = Number(details?.targetduration || 0);
    const base = profile.weak ? 3 : 2;
    const goal = Math.max(base, Math.min(profile.weak ? 4 : 3, segment));
    return tvAchievableBufferGoal(goal, details);
  }

  function tvHlsFailurePolicy(data, active, provider) {
    const status = Number(data?.response?.code || data?.networkDetails?.status || 0);
    const details = String(data?.details || '');
    const missingSegment = /fragLoad/i.test(details) && [404, 410].includes(status);
    return {
      expired: [401, 403].includes(status) || (status === 410 && !missingSegment),
      invalid: (!missingSegment && [404, 415, 422].includes(status)) || /manifestParsing|manifestIncompatible|levelEmpty/i.test(details),
      missingSegment,
      limit: missingSegment ? 1 : active ? (/^FrameTV$/i.test(provider) ? 2 : 3) : 1
    };
  }

  function tvShouldDownshift(bufferAhead, fragmentSeconds, loadMs, autoLevel, level) {
    return autoLevel && level > 0 && bufferAhead < 6 && fragmentSeconds > 0
      && loadMs > 0 && loadMs >= fragmentSeconds * 850;
  }

  function tvHlsLoadPolicies(profile) {
    const shouldRetry = (config, count, isTimeout, response, retry) => {
      if ([401, 403, 404, 410, 415, 422, 429].includes(Number(response?.code))) return false;
      return Boolean(retry && count < Number(config?.maxNumRetry || 0));
    };
    const policy = (firstByteMs, totalMs, retries) => ({ default: {
      maxTimeToFirstByteMs: firstByteMs,
      maxLoadTimeMs: totalMs,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 4_000, shouldRetry },
      errorRetry: { maxNumRetry: retries, retryDelayMs: 500, maxRetryDelayMs: 2_000, backoff: 'exponential', shouldRetry }
    } });
    // Séparer un serveur muet d'un segment volumineux qui arrive lentement.
    // Les refus et segments disparus passent directement à la récupération.
    return {
      manifestLoadPolicy: policy(profile.weak ? 20_000 : 12_000, profile.manifestTimeout || 30_000, 3),
      playlistLoadPolicy: policy(profile.weak ? 20_000 : 12_000, profile.manifestTimeout || 30_000, 3),
      fragLoadPolicy: policy(profile.weak ? 15_000 : 10_000, profile.weak ? 65_000 : 45_000, 3),
      keyLoadPolicy: policy(profile.weak ? 12_000 : 8_000, profile.weak ? 24_000 : 16_000, 2)
    };
  }

  function watchTvPlaybackProgress({ video, signal, isCurrent, isActive, isManagedPause,
    downloadedBytes, stallDelay, onStall, bufferedAhead = () => 0, clock = () => Date.now(), timers = window }) {
    let lastTime = Number(video.currentTime || 0);
    let lastProgressAt = clock();
    let lastNetworkAt = clock();
    let lastBytes = 0;
    let lastAttemptAt = null;
    const stop = () => {
      timers.clearInterval(timer);
      signal.removeEventListener('abort', stop);
    };
    const tick = () => {
      if (signal.aborted || !isCurrent() || !video.isConnected) { stop(); return; }
      const now = clock();
      const current = Number(video.currentTime || 0);
      const bytes = Number(downloadedBytes() || 0);
      if (bytes > 0 && bytes !== lastBytes) lastNetworkAt = now;
      lastBytes = bytes;
      if (!isActive() || video.seeking || (video.paused && !isManagedPause()) || Math.abs(current - lastTime) > .05) {
        lastTime = current;
        lastProgressAt = now;
        return;
      }
      const threshold = Math.max(18_000, Math.min(35_000, Number(stallDelay()) || 18_000));
      // Des téléchargements qui continuent ne prouvent pas que le décodeur avance.
      // Leur délai de grâce reste borné pour éviter une image figée indéfiniment.
      const networkGrace = bufferedAhead() < 2 && now - lastNetworkAt < 15_000 && now - lastProgressAt < Math.max(90_000, threshold * 2);
      if (now - lastProgressAt < threshold || networkGrace
        || (lastAttemptAt !== null && now - lastAttemptAt < 20_000)) return;
      lastAttemptAt = now;
      if (onStall() === false) stop();
    };
    const timer = timers.setInterval(tick, 2_000);
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
    return stop;
  }

  function tvLatestBufferedWindow(video = document.querySelector('#noctra-tv-video'), minimumDuration = 0) {
    let longest = null;
    try {
      for (let index = (video?.buffered?.length || 0) - 1; index >= 0; index -= 1) {
        const start = Number(video.buffered.start(index));
        const end = Number(video.buffered.end(index));
        const duration = Math.max(0, end - start);
        const windowRange = { start, end, duration };
        if (!longest || duration > longest.duration) longest = windowRange;
        if (duration >= minimumDuration) return windowRange;
      }
    } catch {}
    return longest;
  }

  function tvForwardBufferedWindow(video) {
    const current = Number(video?.currentTime);
    if (!Number.isFinite(current)) return null;
    try {
      for (let index = 0; index < video.buffered.length; index += 1) {
        const start = Number(video.buffered.start(index));
        const end = Number(video.buffered.end(index));
        if (end <= current || start - current > 12) continue;
        const position = start > current ? Math.min(end, start + .05) : current;
        return { start, end, position, ahead: Math.max(0, end - position) };
      }
    } catch {}
    return null;
  }

  function createTvContinuityGuard(hls, { bufferAhead, reserveGoal, onAction, clock = () => Date.now() }) {
    let cap = -1, heldUntil = 0, healthy = 0;
    let originalCap = -1, originalSizeCap = false;
    const release = () => {
      if (cap < 0) return;
      hls.autoLevelCapping = originalCap;
      hls.capLevelToPlayerSize = originalSizeCap;
      cap = -1; healthy = 0; heldUntil = 0;
      onAction('quality-reserve-released', {});
    };
    const hold = (target, holdMs, reason) => {
      if (!hls.autoLevelEnabled || target < 0) return;
      const entering = cap < 0;
      if (entering) {
        originalCap = Number(hls.autoLevelCapping ?? -1);
        originalSizeCap = Boolean(hls.capLevelToPlayerSize);
        // Le contrôleur de taille réécrit autoLevelCapping périodiquement.
        // Le suspendre pendant cette limite temporaire, puis le restaurer.
        hls.capLevelToPlayerSize = false;
      }
      const next = Math.min(target, cap >= 0 ? cap : Infinity, originalCap >= 0 ? originalCap : Infinity);
      const changed = entering || next !== cap;
      cap = next;
      hls.autoLevelCapping = cap;
      hls.nextAutoLevel = cap;
      heldUntil = clock() + holdMs;
      healthy = 0;
      if (changed) onAction('quality-reserve-held', { level: cap, reason, bufferAhead: Number(bufferAhead().toFixed(2)) });
    };
    const sample = ({ level, duration, loadMs, type = 'main' }) => {
      if (!hls.autoLevelEnabled) { release(); return; }
      if (type !== 'main' || !(duration > 0) || !(loadMs > 0) || !(level >= 0)) return;
      const ahead = bufferAhead();
      const threshold = Math.min(18, Math.max(6, reserveGoal() * .8));
      const ratio = loadMs / (duration * 1000);
      if (level > 0 && ahead < threshold && ratio >= .8) {
        const bitrate = Number(hls.levels?.[level]?.bitrate || 0);
        const budget = bitrate > 0 ? bitrate / ratio * .72 : 0;
        let target = level - 1;
        if (budget > 0) {
          target = 0;
          for (let i = 0; i < level; i++) if (Number(hls.levels?.[i]?.bitrate || Infinity) <= budget) target = i;
        }
        hold(target, 45_000, 'segments trop lents pour la réserve');
        return;
      }
      if (cap < 0) return;
      healthy = ratio <= .65 && ahead >= Math.min(16, Math.max(4, reserveGoal() * .85)) ? healthy + 1 : 0;
      if (clock() < heldUntil || healthy < 6) return;
      const maximum = Math.min(hls.levels.length - 1, originalCap >= 0 ? originalCap : Infinity);
      if (cap >= maximum - 1) { release(); return; }
      cap += 1;
      hls.autoLevelCapping = cap;
      heldUntil = clock() + 30_000;
      healthy = 0;
      onAction('quality-reserve-step-up', { level: cap });
    };
    return {
      sample, release,
      pending({ level, duration, elapsedMs, type = 'main' }) {
        if (type !== 'main' || !hls.autoLevelEnabled || level <= 0 || !(duration > 0)) return;
        if (bufferAhead() > Math.min(6, reserveGoal() * .4) || elapsedMs < Math.max(2500, duration * 900)) return;
        if (cap >= 0 && cap < level) return;
        hold(level - 1, 60_000, 'segment en cours trop lent');
      },
      stall() {
        const level = Number(hls.currentLevel);
        if (level > 0) hold(level - 1, 90_000, 'interruption du direct');
        else if (cap >= 0) { heldUntil = clock() + 90_000; healthy = 0; }
      }
    };
  }

  function tvSeekIntoBufferedWindow(video, range, targetAhead = 0) {
    if (!video || !range || range.duration <= 0) return false;
    const current = Number(video.currentTime);
    const ahead = Number.isFinite(current) && current >= range.start - .1 && current <= range.end + .1
      ? range.end - current
      : 0;
    if (ahead >= Math.min(targetAhead, Math.max(0, range.duration - .2))) return false;
    try {
      video.currentTime = range.start + Math.min(.12, Math.max(.02, range.duration / 10));
      return true;
    } catch {
      return false;
    }
  }

  function tvSkipBufferedGap(video = document.querySelector('#noctra-tv-video'), maximumGap = 12) {
    if (!video || !Number.isFinite(Number(video.currentTime))) return false;
    const current = Number(video.currentTime);
    try {
      for (let index = 0; index < video.buffered.length; index += 1) {
        const start = Number(video.buffered.start(index));
        const end = Number(video.buffered.end(index));
        if (current >= start - .1 && current < end - .15) return false;
        const gap = start - current;
        if (gap > .1 && gap <= maximumGap && end - start >= .35) {
          video.currentTime = start + .05;
          return true;
        }
      }
    } catch {}
    return false;
  }

  function tvLiveSyncPosition(video = document.querySelector('#noctra-tv-video'), hls = tvHls) {
    const hlsPosition = Number(hls?.liveSyncPosition);
    if (Number.isFinite(hlsPosition) && hlsPosition > 0) return hlsPosition;
    try {
      const ranges = video?.seekable;
      if (ranges?.length) return Math.max(0, ranges.end(ranges.length - 1) - .35);
    } catch {}
    return NaN;
  }

  function tvLiveEdgeDrift(video = document.querySelector('#noctra-tv-video'), hls = tvHls) {
    const target = tvLiveSyncPosition(video, hls);
    return Number.isFinite(target) && Number.isFinite(Number(video?.currentTime))
      ? Math.max(0, target - Number(video.currentTime))
      : NaN;
  }

  function scheduleTvLiveEdgeControl() {
    if (tvLiveEdgeRefreshFrame) return;
    tvLiveEdgeRefreshFrame = window.requestAnimationFrame(() => {
      tvLiveEdgeRefreshFrame = 0;
      refreshTvLiveEdgeControl();
    });
  }

  function refreshTvLiveEdgeControl() {
    const button = document.querySelector('[data-tv-live-edge]');
    const video = document.querySelector('#noctra-tv-video');
    const target = tvLiveSyncPosition(video);
    const available = tvState.currentPlaybackType === 'stream'
      && Boolean(video && !video.hidden)
      && Number.isFinite(target);
    if (button) {
      button.hidden = !available;
      button.disabled = !available;
    }
    if (!available) {
      if (button) button.dataset.state = 'idle';
      refreshTvDesktopLiveState(video);
      return;
    }
    const drift = tvLiveEdgeDrift(video);
    const behind = Number.isFinite(drift) && drift > 6;
    if (button) button.dataset.state = behind ? 'behind' : 'live';
    const label = behind ? `Revenir au direct (${Math.round(drift)} s de retard)` : 'Lecture au direct';
    if (button) {
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }
    refreshTvDesktopLiveState(video);
  }

  function tvDesktopLiveControlsEnabled(video = document.querySelector('#noctra-tv-video')) {
    return Boolean(video
      && !video.hidden
      && tvState.currentPlaybackType === 'stream'
      && !tvAppleTouchDevice()
      && window.matchMedia?.('(min-width: 761px)')?.matches);
  }

  function tvFullscreenIsActive(screen = document.querySelector('.noctra-tv-screen')) {
    return Boolean(screen && (
      document.fullscreenElement === screen
      || document.webkitFullscreenElement === screen
      || document.body.classList.contains('noctra-tv-pseudo-fullscreen')
    ));
  }

  function scheduleTvDesktopControlsHide(delay = 1800) {
    window.clearTimeout(tvDesktopControlsHideTimer);
    tvDesktopControlsHideTimer = 0;
    const video = document.querySelector('#noctra-tv-video');
    const screen = document.querySelector('.noctra-tv-screen');
    const bar = document.querySelector('[data-tv-desktop-live-controls]');
    if (!video || video.hidden || video.paused || video.ended || tvState.currentPlaybackType !== 'stream') return;
    tvDesktopControlsHideTimer = window.setTimeout(() => {
      tvDesktopControlsHideTimer = 0;
      if (!screen?.isConnected || video.paused || video.ended || video.hidden) return;
      if (screen.contains?.(document.activeElement) && document.activeElement?.matches(':focus-visible')) return;
      if (tvSafeExtras.menuOpen) return;
      screen.setAttribute('data-tv-controls-hidden', 'true');
    }, delay);
  }

  function showTvDesktopLiveControls(scheduleHide = true) {
    const screen = document.querySelector('.noctra-tv-screen');
    if (screen?.hasAttribute('data-tv-controls-hidden')) screen.removeAttribute('data-tv-controls-hidden');
    window.clearTimeout(tvDesktopControlsHideTimer);
    tvDesktopControlsHideTimer = 0;
    if (scheduleHide) scheduleTvDesktopControlsHide();
  }

  function syncTvFullscreenUi() {
    const screen = document.querySelector('.noctra-tv-screen');
    const native = Boolean(screen && (document.fullscreenElement === screen || document.webkitFullscreenElement === screen));
    document.body.classList.toggle('noctra-tv-native-fullscreen', native);
    document.documentElement.classList.toggle('noctra-tv-native-fullscreen', native);
    if (tvFullscreenIsActive(screen)) {
      const bar = screen?.querySelector('[data-tv-desktop-live-controls]');
      const focused = document.activeElement;
      if (focused && bar?.contains(focused) && !focused.matches?.('input[type="range"]')) focused.blur?.();
      showTvDesktopLiveControls(true);
    }
    else showTvDesktopLiveControls(true);
  }

  function refreshTvDesktopLiveState(video = document.querySelector('#noctra-tv-video')) {
    const live = document.querySelector('[data-tv-custom-live-edge]');
    if (!video || !live) return;
    const drift = tvLiveEdgeDrift(video);
    const behind = Number.isFinite(drift) && drift > 6;
    const state = behind ? 'behind' : 'live';
    if (live.dataset.state !== state) live.dataset.state = state;
    const disabled = !Number.isFinite(tvLiveSyncPosition(video));
    if (live.disabled !== disabled) live.disabled = disabled;
    const label = behind ? 'Revenir au direct' : 'Lecture en direct';
    if (live.getAttribute('aria-label') !== label) live.setAttribute('aria-label', label);
    if (live.getAttribute('title') !== label) live.setAttribute('title', label);
  }

  function updateTvDesktopControlIcon(button, state, markup) {
    if (!button || button.dataset.tvControlState === state) return;
    button.dataset.tvControlState = state;
    button.innerHTML = markup;
  }

  function refreshTvDesktopLiveControls() {
    const video = document.querySelector('#noctra-tv-video');
    const bar = document.querySelector('[data-tv-desktop-live-controls]');
    const card = document.querySelector('.noctra-tv-player-card');
    if (!video || !bar) return;
    const enabled = tvDesktopLiveControlsEnabled(video);
    if (bar.hidden === enabled) bar.hidden = !enabled;
    if (video.controls === enabled) video.controls = !enabled;
    if (enabled && !card?.hasAttribute('data-tv-custom-live')) card?.setAttribute('data-tv-custom-live', 'true');
    else if (!enabled && card?.hasAttribute('data-tv-custom-live')) card.removeAttribute('data-tv-custom-live');
    const streamActive = !video.hidden && tvState.currentPlaybackType === 'stream';
    if (!streamActive || video.paused) showTvDesktopLiveControls(false);
    else if (!tvDesktopControlsHideTimer && !video.closest('.noctra-tv-screen')?.hasAttribute('data-tv-controls-hidden')) scheduleTvDesktopControlsHide();

    const toggle = bar.querySelector('[data-tv-live-toggle]');
    if (toggle) {
      const paused = video.paused;
      updateTvDesktopControlIcon(toggle, paused ? 'paused' : 'playing', paused ? icons.play : icons.pause);
      toggle.setAttribute('aria-label', paused ? 'Lire le direct' : 'Mettre le direct en pause');
      toggle.setAttribute('title', paused ? 'Lecture' : 'Pause');
      if (paused && enabled) showTvDesktopLiveControls(false);
      else if (enabled && !tvDesktopControlsHideTimer && !document.querySelector('.noctra-tv-screen')?.hasAttribute('data-tv-controls-hidden')) scheduleTvDesktopControlsHide();
    }
    const mute = bar.querySelector('[data-tv-live-mute]');
    if (mute) {
      const muted = video.muted || video.volume <= .001;
      updateTvDesktopControlIcon(mute, muted ? 'muted' : 'audible', muted ? icons.muted : icons.volume);
      mute.setAttribute('aria-label', muted ? 'Réactiver le son' : 'Couper le son');
      mute.setAttribute('title', muted ? 'Réactiver le son' : 'Couper le son');
    }
    const volume = bar.querySelector('[data-tv-live-volume]');
    const volumeValue = String(video.muted ? 0 : video.volume);
    if (volume && document.activeElement !== volume && volume.value !== volumeValue) volume.value = volumeValue;
    refreshTvDesktopLiveState(video);
    const pip = bar.querySelector('[data-tv-live-pip]');
    if (pip) {
      const pipDisabled = !tvPictureInPictureSupported(video);
      if (pip.disabled !== pipDisabled) pip.disabled = pipDisabled;
    }
  }

  function returnTvToLiveEdge() {
    const video = document.querySelector('#noctra-tv-video');
    const target = tvLiveSyncPosition(video);
    if (!video || video.hidden || !Number.isFinite(target)) return false;
    const drift = tvLiveEdgeDrift(video);
    try { video.currentTime = Math.max(0, target); } catch { return false; }
    try { video.playbackRate = 1; } catch {}
    void video.play().catch(() => undefined);
    setTvPlaybackStatus('Retour au direct…', 'loading');
    recordTvDiagnostic('live-edge-requested', { drift: Number.isFinite(drift) ? Number(drift.toFixed(2)) : -1 });
    window.requestAnimationFrame(refreshTvLiveEdgeControl);
    return true;
  }

  function recordTvDiagnostic(eventName, details = {}) {
    const channel = tvState.catalog?.channels?.[Number(tvState.currentChannelIndex)] || {};
    const video = document.querySelector('#noctra-tv-video');
    const safeDetails = {};
    for (const [key, value] of Object.entries(details || {})) {
      if (/url|token|cookie|authorization/i.test(key)) continue;
      if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) safeDetails[key] = value;
    }
    tvDiagnostics.push({
      at: Date.now(),
      event: String(eventName || 'event'),
      provider: String(channel.provider || tvState.catalog?.source?.provider || ''),
      channel: String(channel.name || ''),
      currentTime: Number(video?.currentTime || 0),
      bufferAhead: Number(tvBufferedAhead(video).toFixed(2)),
      readyState: Number(video?.readyState ?? -1),
      networkState: Number(video?.networkState ?? -1),
      paused: Boolean(video?.paused),
      ...safeDetails
    });
    if (tvDiagnostics.length > TV_DIAGNOSTIC_MAX) tvDiagnostics.splice(0, tvDiagnostics.length - TV_DIAGNOSTIC_MAX);
    if (tvDiagnosticsOpen) refreshTvDiagnosticsPanel();
  }

  function tvPlaybackElapsedMs() {
    if (!tvPlaybackStartedAt) return -1;
    return Math.max(0, Math.round(performance.now() - tvPlaybackStartedAt));
  }

  function setTvPlaybackStatus(message, state = 'idle') {
    const status = document.querySelector('[data-tv-player-status]');
    if (status) {
      status.textContent = message;
      status.dataset.state = state;
    }
    const hud = document.querySelector('[data-tv-safe-status-hud]');
    if (hud) {
      hud.dataset.state = state;
      const copy = hud.querySelector('span');
      if (copy) copy.textContent = message;
      hud.setAttribute('title', String(message || ''));
    }
    const key = `${state}|${String(message || '')}`;
    if (key !== tvDiagnosticStatusKey) {
      tvDiagnosticStatusKey = key;
      recordTvDiagnostic('status', { state, message: String(message || '') });
    }
  }

  function tvDiagnosticsSnapshot() {
    const video = document.querySelector('#noctra-tv-video');
    const channel = tvState.catalog?.channels?.[Number(tvState.currentChannelIndex)] || {};
    const quality = tvSafeExtrasPanel()?.querySelector('[data-tv-quality]')?.selectedOptions?.[0]?.textContent || 'Auto';
    const playbackQuality = video?.getVideoPlaybackQuality?.();
    return {
      provider: String(channel.provider || tvState.catalog?.source?.provider || 'TV'),
      channel: String(channel.name || 'Aucune chaîne'),
      engine: tvShaka ? 'Shaka' : tvHls ? 'HLS.js' : (video?.src ? 'Natif' : '—'),
      enginePreference: tvEnginePreference,
      quality: String(quality || 'Auto'),
      currentTime: Number(video?.currentTime || 0),
      bufferAhead: Number(tvBufferedAhead(video).toFixed(2)),
      readyState: Number(video?.readyState ?? -1),
      networkState: Number(video?.networkState ?? -1),
      paused: Boolean(video?.paused),
      droppedFrames: Number(playbackQuality?.droppedVideoFrames || 0),
      totalFrames: Number(playbackQuality?.totalVideoFrames || 0),
      bandwidthEstimate: Number(tvShaka?.getStats?.().estimatedBandwidth || tvHls?.bandwidthEstimate || 0),
      automaticQuality: Boolean(tvShaka ? tvShaka.getConfiguration().abr.enabled : tvHls?.autoLevelEnabled),
      qualityCap: Number(tvHls?.autoLevelCapping ?? -1),
      liveReserveTarget: Number(tvShaka ? tvShaka.getConfiguration().streaming.bufferingGoal : tvHls?.config?.liveSyncDuration || 0),
      events: tvDiagnostics.slice(-TV_DIAGNOSTIC_MAX)
    };
  }

  function tvDiagnosticsMarkup() {
    const snapshot = tvDiagnosticsSnapshot();
    const events = snapshot.events.slice(-35).reverse().map(item => {
      const stamp = new Date(item.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const extra = [
        item.type ? `type=${item.type}` : '',
        item.details ? `details=${item.details}` : '',
        item.responseFormat ? `réponse=${item.responseFormat}` : '',
        item.code ? `code=${item.code}` : '',
        item.errorName ? `erreur=${item.errorName}` : '',
        item.repeated > 1 ? `répétitions=${item.repeated}` : '',
        item.httpStatus > 0 ? `HTTP=${item.httpStatus}` : '',
        item.requestType === 0 ? 'manifeste' : item.requestType === 1 ? 'segment' : '',
        item.timedOut ? 'délai réseau dépassé' : '',
        item.fatal === true ? 'fatal' : '',
        typeof item.active === 'boolean' ? `active=${item.active}` : '',
        typeof item.renewable === 'boolean' ? `renewable=${item.renewable}` : '',
        typeof item.hls === 'boolean' ? `hls=${item.hls}` : '',
        Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 ? `délai=${item.elapsedMs}ms` : '',
        Number.isFinite(item.resolverMs) ? `résolution=${item.resolverMs}ms` : '',
        Number.isFinite(item.options) ? `serveurs=${item.options}` : '',
        Number.isFinite(item.levels) ? `niveaux=${item.levels}` : '',
        Number.isFinite(item.level) ? `niveau=${item.level}` : '',
        Number.isFinite(item.startLevel) ? `départ=${item.startLevel}` : '',
        Number.isFinite(item.syncSegments) ? `direct=${item.syncSegments} segment` : '',
        Number.isFinite(item.syncSeconds) ? `réserve-direct=${item.syncSeconds}s` : '',
        Number.isFinite(item.maxBuffer) ? `tampon-max=${item.maxBuffer}s` : '',
        Number.isFinite(item.duration) ? `segment=${item.duration}s` : '',
        item.engine ? `moteur=${item.engine}` : '',
        item.profile ? `profil=${item.profile}` : '',
        Number.isFinite(item.bufferAhead) ? `buffer=${item.bufferAhead}s` : ''
      ].filter(Boolean).join(' · ');
      return `<li data-event="${escapeHtml(item.event)}"><time>${stamp}</time><strong>${escapeHtml(item.event)}</strong><span>${escapeHtml(extra || item.message || '')}</span></li>`;
    }).join('') || '<li><span>Aucun événement enregistré.</span></li>';
    return `<header><div><p class="noctra-eyebrow">DIAGNOSTIC TV · SESSION LOCALE</p><h3>${escapeHtml(snapshot.provider)} · ${escapeHtml(snapshot.channel)}</h3><span>Aucune URL, cookie ou jeton n’est inclus dans ce diagnostic.</span></div><button type="button" data-tv-diagnostics-close aria-label="Fermer">×</button></header>
      <div class="noctra-tv-diagnostics-summary">
        <span><small>Moteur</small><b>${escapeHtml(snapshot.engine)}</b></span>
        <span><small>Qualité</small><b>${escapeHtml(snapshot.quality)}</b></span>
        <span><small>Buffer</small><b>${snapshot.bufferAhead.toFixed(1)} s</b></span>
        <span><small>ReadyState</small><b>${snapshot.readyState}</b></span>
        <span><small>NetworkState</small><b>${snapshot.networkState}</b></span>
        <span><small>Frames perdues</small><b>${snapshot.droppedFrames}/${snapshot.totalFrames}</b></span>
      </div>
      <div class="noctra-tv-diagnostics-actions"><button type="button" class="noctra-button" data-tv-diagnostics-refresh>Actualiser</button><button type="button" class="noctra-button" data-tv-diagnostics-copy>Copier le diagnostic</button><button type="button" class="noctra-button" data-tv-diagnostics-clear>Effacer</button></div>
      <ol class="noctra-tv-diagnostics-events">${events}</ol>`;
  }

  function ensureTvDiagnosticsPanel() {
    let panel = document.querySelector('[data-tv-diagnostics-panel]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'noctra-tv-diagnostics-panel';
      panel.dataset.tvDiagnosticsPanel = 'true';
      panel.hidden = true;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function refreshTvDiagnosticsPanel() {
    const panel = ensureTvDiagnosticsPanel();
    panel.innerHTML = tvDiagnosticsMarkup();
    panel.hidden = !tvDiagnosticsOpen;
  }

  function openTvDiagnosticsPanel() {
    tvDiagnosticsOpen = true;
    refreshTvDiagnosticsPanel();
    window.clearInterval(tvDiagnosticsTimer);
    tvDiagnosticsTimer = window.setInterval(() => { if (tvDiagnosticsOpen) refreshTvDiagnosticsPanel(); }, 1000);
  }

  function closeTvDiagnosticsPanel() {
    tvDiagnosticsOpen = false;
    window.clearInterval(tvDiagnosticsTimer);
    tvDiagnosticsTimer = 0;
    const panel = document.querySelector('[data-tv-diagnostics-panel]');
    if (panel) panel.hidden = true;
  }

  async function copyTvDiagnostics() {
    const snapshot = tvDiagnosticsSnapshot();
    const text = JSON.stringify({ version: NOCTRA_BUILD_VERSION, generatedAt: new Date().toISOString(), ...snapshot }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('Diagnostic TV copié.');
    } catch {
      toast('Impossible de copier automatiquement le diagnostic.');
    }
  }

  function configureOhaFrameSizing(frame, channel) {
    tvFrameResizeObserver?.disconnect?.();
    tvFrameResizeObserver = null;
    const screen = frame?.closest?.('.noctra-tv-screen');
    const reset = () => ['width', 'height', 'top', 'left', 'right', 'bottom', 'transform', 'transform-origin'].forEach(property => frame.style.removeProperty(property));
    if (frame) reset();
    if (!frame || !screen || channel?.provider !== 'OHA') return;
    const fit = () => {
      if (window.matchMedia('(max-width: 760px)').matches || document.body.classList.contains('noctra-tv-pseudo-fullscreen')) {
        reset();
        return;
      }
      const visibleWidth = Math.max(1, screen.clientWidth);
      const visibleHeight = Math.max(1, screen.clientHeight);
      const desktopViewport = Math.max(1080, visibleWidth);
      const scale = Math.min(1, visibleWidth / desktopViewport);
      frame.style.setProperty('width', `${desktopViewport}px`, 'important');
      frame.style.setProperty('height', `${Math.ceil(visibleHeight / scale)}px`, 'important');
      frame.style.setProperty('top', '0', 'important');
      frame.style.setProperty('left', '0', 'important');
      frame.style.setProperty('right', 'auto', 'important');
      frame.style.setProperty('bottom', 'auto', 'important');
      frame.style.setProperty('transform', `scale(${scale})`, 'important');
      frame.style.setProperty('transform-origin', 'top left', 'important');
    };
    fit();
    if ('ResizeObserver' in window) {
      tvFrameResizeObserver = new ResizeObserver(fit);
      tvFrameResizeObserver.observe(screen);
    }
  }

  function tvSourceSection(source) {
    if (source?.section) return source.section;
    return source?.origin === 'builtin' ? 'channels' : 'personal';
  }

  const tvSectionLabels = { favorites: 'Favoris', channels: 'Chaînes', sports: 'Sports', alternatives: 'Alternative', portals: 'Portails', personal: 'Mes sources' };
  const tvSectionIcons = { favorites: icons.heart, channels: icons.tv, sports: icons.live, alternatives: icons.external, portals: icons.external, personal: icons.library };

  function tvFavoriteKey(channel, sourceId = tvState.sourceId) {
    const identity = String(channel?.id || `${normalizedText(channel?.provider || '')}|${normalizedText(channel?.name || '')}`);
    return `${String(sourceId || 'source')}::${identity}`;
  }

  function tvFavoriteRecord(channel, sourceId = tvState.sourceId) {
    const source = tvState.sources.find(item => item.id === sourceId) || tvState.catalog?.source || {};
    return {
      key: tvFavoriteKey(channel, sourceId),
      sourceId: String(sourceId || source.id || ''),
      sourceName: String(source.name || channel?.provider || 'Source TV'),
      channelId: String(channel?.id || ''),
      name: String(channel?.name || 'Chaîne TV'),
      provider: String(channel?.provider || ''),
      group: String(channel?.group || channel?.category || 'Chaînes'),
      logo: String(channel?.logo || ''),
      secondaryLogo: String(channel?.secondaryLogo || ''),
      savedAt: Date.now()
    };
  }

  function saveTvFavorites() {
    try { window.localStorage?.setItem(TV_FAVORITES_STORAGE_KEY, JSON.stringify(tvFavorites.slice(0, 300))); } catch {}
  }

  function tvFavoriteByKey(key) {
    return tvFavorites.find(item => item.key === String(key || '')) || null;
  }

  function tvIsFavorite(channel, sourceId = tvState.sourceId) {
    return Boolean(tvFavoriteByKey(tvFavoriteKey(channel, sourceId)));
  }

  function toggleTvFavorite(channel, sourceId = tvState.sourceId, explicitKey = '') {
    const key = explicitKey || tvFavoriteKey(channel, sourceId);
    const existingIndex = tvFavorites.findIndex(item => item.key === key);
    if (existingIndex >= 0) {
      const [removed] = tvFavorites.splice(existingIndex, 1);
      saveTvFavorites();
      toast(`${removed.name} retirée des favoris.`);
      return false;
    }
    const record = tvFavoriteRecord(channel, sourceId);
    if (!record.sourceId) return false;
    tvFavorites.unshift(record);
    saveTvFavorites();
    toast(`${record.name} ajoutée aux favoris.`);
    return true;
  }

  function tvSourceButton(source) {
    const detail = source.description ? `<small>${escapeHtml(source.description)}</small>` : '';
    const provider = String(source.provider || source.name || '').toLowerCase();
    const icon = provider.includes('livewatch') ? icons.sparkle : tvSourceSection(source) === 'sports' ? icons.live : tvSourceSection(source) === 'portals' ? icons.external : icons.tv;
    const active = source.id === tvState.sourceId;
    return `<button class="noctra-tv-source-chip" type="button" data-tv-source="${escapeHtml(source.id)}" data-active="${active}" aria-pressed="${active}">${icon}<span><strong>${escapeHtml(source.name)}</strong>${detail}</span>${active ? '<i>ACTIF</i>' : ''}</button>`;
  }

  function tvNavigationMarkup() {
    if (tvState.section === 'personal') tvState.section = 'channels';
    const bySection = section => tvState.sources.filter(source => tvSourceSection(source) === section || (section === 'channels' && tvSourceSection(source) === 'personal'));
    const sections = ['favorites', 'channels', 'sports', 'alternatives', 'portals'].filter(section => {
      if (section === 'favorites') return true;
      if (section === 'channels') return true;
      if (section === 'personal') return Boolean(authContext?.isAdmin || bySection(section).length);
      return bySection(section).length > 0;
    });
    const activeSources = tvState.section === 'favorites' ? [] : bySection(tvState.section);
    const removableSource = activeSources.find(source => source.id === tvState.sourceId && source.editable);
    return `<nav class="noctra-tv-navigation" aria-label="Sources TV">
      <div class="noctra-tv-section-tabs" role="tablist" aria-label="Univers TV">
        ${sections.map(section => {
          const active = tvState.section === section;
          const count = section === 'favorites' ? tvFavorites.length : bySection(section).length;
          return `<button type="button" role="tab" data-tv-section="${section}" data-active="${active}" aria-selected="${active}">${tvSectionIcons[section]}<span>${tvSectionLabels[section]}</span><b>${count}</b></button>`;
        }).join('')}
      </div>
      <div class="noctra-tv-source-row">
        ${tvState.section !== 'favorites' && activeSources.length ? `<label class="noctra-tv-mobile-provider"><span>Fournisseur</span><select data-tv-source-select aria-label="Fournisseur TV">${activeSources.map(source=>`<option value="${escapeHtml(source.id)}" ${source.id===tvState.sourceId?'selected':''}>${escapeHtml(source.name)}</option>`).join('')}</select></label>` : ''}
        <div class="noctra-tv-source-context"><span>${tvState.section === 'favorites' ? 'RACCOURCI' : 'FOURNISSEURS'}</span><strong>${escapeHtml(tvSectionLabels[tvState.section] || 'TV')}</strong></div>
        <details class="noctra-tv-source-picker" ${tvState.sourceId && tvState.section !== 'favorites' ? '' : 'open'}><summary>${icons.tv}<span><small>${tvState.section === 'favorites' ? 'Accès rapide' : 'Source sélectionnée'}</small><strong>${tvState.section === 'favorites' ? 'Favoris · toutes les sources' : escapeHtml(tvState.sources.find(source => source.id === tvState.sourceId)?.name || 'Choisir une source')}</strong></span><b>${tvState.section === 'favorites' ? tvFavorites.length : activeSources.length}</b></summary>
        ${activeSources.length > 6 ? '<label class="noctra-tv-source-search"><span>Rechercher un fournisseur</span><input type="search" data-tv-source-search placeholder="Nom du fournisseur…" autocomplete="off"></label>' : ''}
        <div class="noctra-tv-source-strip">${tvState.section === 'favorites' ? `<span class="noctra-tv-source-strip-empty">${tvFavorites.length ? `${tvFavorites.length} chaîne${tvFavorites.length > 1 ? 's' : ''} · toutes les sources` : 'Ajoute une chaîne avec le cœur dans le zapping'}</span>` : activeSources.length ? activeSources.map(tvSourceButton).join('') : '<span class="noctra-tv-source-strip-empty">Aucune source dans cet univers</span>'}</div><p class="noctra-tv-source-no-result" hidden>Aucun fournisseur correspondant.</p></details>
        <div class="noctra-tv-mode-actions">
          ${authContext?.isAdmin && removableSource ? `<button class="noctra-tv-source-mini" type="button" data-tv-delete-source="${escapeHtml(removableSource.id)}" aria-label="Supprimer ${escapeHtml(removableSource.name)}">${icons.trash || '×'}<span>Supprimer la source</span></button>` : ''}
          ${authContext?.isAdmin ? `<button class="noctra-tv-source-mini" type="button" data-tv-provider-keys title="Accès TV" aria-label="Accès TV">${icons.tools}<span>Accès TV</span></button><button class="noctra-tv-source-mini" type="button" data-tv-show-source-form title="Ajouter une source TV" aria-label="Ajouter une source TV">${icons.plus}<span>Ajouter</span></button>` : ''}
        </div>
      </div>
    </nav>`;
  }

  function tvGroupCard(group) {
    return `<button class="noctra-tv-group" type="button" data-tv-group-ref="${escapeHtml(group.ref)}">
      ${group.image ? `<img src="${escapeHtml(group.image)}" alt="" loading="lazy" decoding="async">` : `<span>${icons.tv}</span>`}
      <strong>${escapeHtml(group.name)}</strong>
      <small>Ouvrir les chaînes</small>
    </button>`;
  }

  function tvSourceFormMarkup(open = false) {
    if (!authContext?.isAdmin) return '';
    return `<form id="noctra-tv-source-form" class="noctra-tv-source-form" ${open ? '' : 'hidden'}>
      <div class="noctra-tv-source-intro"><p class="noctra-eyebrow">AJOUTER UNE SOURCE</p><h4>Source TV personnelle</h4><p>M3U/M3U8, JSON, XMLTV, API JSON ou portail web auquel tu as accès.</p></div>
      <label><span>Nom (facultatif)</span><input name="name" maxlength="80" placeholder="Déduit automatiquement de l’adresse"></label>
      <label><span>Type</span><select name="type"><option value="auto">Détection automatique</option><option value="playlist">Playlist M3U</option><option value="json">Catalogue JSON</option><option value="livewatch">API LiveWatch JSON</option><option value="witv">Catalogue WiTV public</option><option value="portal">Portail web autorisé</option></select></label>
      <label class="noctra-tv-source-url"><span>Adresse de la source</span><input name="url" type="url" required inputmode="url" placeholder="https://…"></label>
      <label class="noctra-tv-source-epg"><span>Guide XMLTV (facultatif)</span><input name="epgUrl" type="url" inputmode="url" placeholder="https://…/guide.xml"></label>
      <div class="noctra-tv-source-form-actions"><button class="noctra-button" type="button" data-tv-cancel-source><span>Annuler</span></button><button class="noctra-button noctra-button--primary" type="submit">${icons.tv}<span>Analyser et ajouter</span></button></div>
    </form>`;
  }

  function tvLegalNote() {
    return `<div class="noctra-tv-notice"><span class="noctra-tv-live-dot"></span><div><strong>Centre TV Noctra</strong><small>Lecteur natif prioritaire · serveur sélectionné conservé · guide intégré quand il est disponible</small></div></div>`;
  }

  function liveWatchVipMarkup(catalog) {
    const liveWatchSource = catalog?.source?.type === 'livewatch' || catalog?.sourceType === 'livewatch';
    if (!liveWatchSource) return '';
    const status = catalog.liveWatchVip || { configured: false, active: false, isVip: false };
    const sourceId = String(catalog?.source?.id || '');
    const vipBridgeSource = sourceId === 'livewatch-curated';
    const officialEmbedSource = sourceId.startsWith('livewatch-') && !vipBridgeSource;
    if (status.active) {
      return `<div class="noctra-livewatch-status" data-state="active">
        <i aria-hidden="true"></i>
        <span><strong>${officialEmbedSource ? 'LiveWatch connecté' : 'LiveWatch VIP connecté'}</strong><small>${status.account ? escapeHtml(status.account) : 'Session partagée active'}</small></span>
        <b>Connecté</b>
      </div>`;
    }
    if (!authContext?.isAdmin) {
      return `<div class="noctra-livewatch-status" data-state="inactive"><i aria-hidden="true"></i><span><strong>LiveWatch VIP non connecté</strong><small>Le lecteur public reste disponible.</small></span><b>Hors ligne</b></div>`;
    }
    return `<form id="noctra-livewatch-vip-form" class="noctra-livewatch-vip noctra-livewatch-vip-form" data-state="inactive">
      <span class="noctra-livewatch-vip-icon">${icons.sparkle}</span>
      <div class="noctra-livewatch-vip-copy"><p class="noctra-eyebrow">PONT VIP PARTAGÉ</p><strong>${status.configured ? 'Reconnecter le compte LiveWatch' : 'Connecter LiveWatch VIP Premium'}</strong><small>Noctra échange les identifiants directement avec LiveWatch, ne conserve que la session renouvelable côté serveur et n’expose jamais le jeton aux membres.</small>${status.message ? `<em>${escapeHtml(status.message)}</em>` : ''}</div>
      <label><span>Email LiveWatch</span><input name="email" type="email" autocomplete="username" required maxlength="254" placeholder="compte@exemple.fr"></label>
      <label><span>Mot de passe</span><input name="password" type="password" autocomplete="current-password" required minlength="6" maxlength="512" placeholder="••••••••"></label>
      <div class="noctra-livewatch-vip-actions"><button class="noctra-button noctra-button--primary" type="submit">${icons.sparkle}<span>Activer pour Noctra</span></button>${status.configured ? `<button class="noctra-button" type="button" data-livewatch-vip-disconnect>Effacer la session</button>` : ''}</div>
    </form>`;
  }

  async function openTvProviderKeys() {
    destroyTvPlayback();
    setLoading('Accès TV', 'MOVIX · NORTHLIVE', true);
    try {
      const status = await api('/api/tv/provider-keys');
      setPanelBody(`<div class="noctra-provider-access"><h3>Vos accès, dans Noctra.</h3><p>Activez chaque fournisseur avec sa propre clé. L’accès sera disponible aux membres connectés à Noctra.</p>
        ${[['movix','Movix VIP'],['northlive','Northlive']].map(([provider,label]) => `<form data-tv-provider-key-form="${provider}" class="noctra-provider-access-card"><h4>${label}</h4><p>${status[provider] ? 'Une clé est configurée. Vous pouvez la remplacer.' : 'Aucune clé configurée.'}</p><label class="noctra-field"><span>Clé ${label}</span><input type="password" name="key" autocomplete="off" required maxlength="512" placeholder="Saisir la clé"></label><button class="noctra-button noctra-button--primary" type="submit">Vérifier et activer</button><p data-key-status role="status"></p></form>`).join('')}
        <button class="noctra-button" type="button" data-noctra="tv">Retour à la TV</button></div>`);
    } catch(error) { showError(error); }
  }

  function tvLogoMonogram(value) {
    const raw = String(value || 'TV').trim();
    const compact = normalizedText(raw).replace(/\b(?:hd|fhd|uhd|4k|sd|backup|live during events only|france|fr)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const known = [
      [/^tf\s*1\b/, 'TF1'], [/^france\s*2\b/, 'F2'], [/^france\s*3\b/, 'F3'], [/^france\s*4\b/, 'F4'], [/^france\s*5\b/, 'F5'],
      [/^france\s*info\b/, 'FI'], [/^canal\s*\+/, 'C+'], [/^be\s*in\s*sports?/, 'BEIN'], [/^rmc\b/, 'RMC'], [/^bfm\b/, 'BFM'],
      [/^c\s*news\b/, 'CNEWS'], [/^lci\b/, 'LCI'], [/^arte\b/, 'ARTE'], [/^m6\b/, 'M6'], [/^w9\b/, 'W9'], [/^6ter\b/, '6TER'],
      [/^13\s*(?:eme|ème)\s*rue\b/, '13E'], [/^eurosport\b/, 'EURO'], [/^cnn\b/, 'CNN'], [/^abc\b/, 'ABC'], [/^cbs\b/, 'CBS'],
      [/^nbc\b/, 'NBC'], [/^fox\b/, 'FOX'], [/^espn\b/, 'ESPN'], [/^hbo\b/, 'HBO']
    ];
    for (const [pattern, label] of known) if (pattern.test(compact)) return label;
    const clean = raw.replace(/[^\p{L}\p{N}+]+/gu, ' ').trim();
    const words = clean.split(/\s+/).filter(Boolean).filter(word => !/^(?:HD|FHD|UHD|SD|FR)$/i.test(word));
    if (!words.length) return 'TV';
    if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
    const initials = words.slice(0, 3).map(word => word[0] || '').join('').toUpperCase();
    return initials || 'TV';
  }

  function tvLogoMarkup(channel, extraClass = '', loadMode = 'lazy') {
    const eager = loadMode === true || loadMode === 'high' || loadMode === 'eager';
    const loading = eager ? 'eager' : 'lazy';
    const priority = loadMode === true || loadMode === 'high' ? ' fetchpriority="high"' : '';
    const logo = channel?.logo ? `<img data-tv-logo-image data-tv-logo-priority="0" src="${escapeHtml(channel.logo)}" alt="" loading="${loading}" decoding="async"${priority}>` : '';
    const secondarySource = channel?.logo
      ? `data-tv-logo-src="${escapeHtml(channel.secondaryLogo)}"`
      : `src="${escapeHtml(channel.secondaryLogo)}"`;
    const secondary = channel?.secondaryLogo ? `<img data-tv-logo-image data-tv-logo-priority="1" class="noctra-tv-channel-logo-secondary" ${secondarySource} alt="" loading="${loading}" decoding="async">` : '';
    const fallback = `<span class="noctra-tv-logo-fallback${extraClass ? ` ${extraClass}` : ''}" data-tv-logo-fallback>${escapeHtml(tvLogoMonogram(channel?.name))}</span>`;
    return `${logo}${secondary}${fallback}`;
  }

  function tvChannelMeta(channel) {
    const start = channel.startTime ? (() => {
      const raw = Number(channel.startTime);
      const date = Number.isFinite(raw) ? new Date(raw < 10_000_000_000 ? raw * 1000 : raw) : new Date(channel.startTime);
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
    })() : '';
    return [...new Set([channel.provider, channel.sourceLabel, channel.quality, channel.country, channel.category, channel.leagueName, channel.status, channel.score, start ? `Début ${start}` : '', channel.language].filter(Boolean))];
  }

  function tvChannelSearchBlob(channel) {
    if (channel && typeof channel === 'object') {
      const cached = tvSearchBlobCache.get(channel);
      if (cached) return cached;
    }
    const value = normalizedText([
      channel?.name, channel?.group, channel?.country, channel?.category,
      channel?.provider, channel?.leagueName, channel?.language,
      channel?.now?.title, channel?.next?.title, channel?.description
    ].filter(Boolean).join(' '));
    if (channel && typeof channel === 'object') tvSearchBlobCache.set(channel, value || ' ');
    return value;
  }

  function tvChannelCard(channel, index, logoLoadMode = 'lazy') {
    const programme = tvProgrammeLine(channel);
    const meta = tvChannelMeta(channel);
    const searchBlob = tvChannelSearchBlob(channel);
    const favorite = tvIsFavorite(channel);
    return `<button class="noctra-tv-channel" type="button" data-tv-channel-index="${index}"
      data-tv-channel-search="${escapeHtml(searchBlob)}"
      data-tv-channel-group="${escapeHtml(channel.group || 'Chaînes')}"
      data-active="${Number(index) === Number(tvState.currentChannelIndex)}">
      <span class="noctra-tv-channel-logo" data-tv-logo-label="${escapeHtml(channel.name)}" data-tv-logo-state="idle">${tvLogoMarkup(channel, '', logoLoadMode)}</span>
      <span><strong>${escapeHtml(channel.name)}</strong><small>${escapeHtml(programme)}</small>${meta.length ? `<em>${meta.map(value => escapeHtml(value)).join('<b>·</b>')}</em>` : ''}</span>
      <i>${channel.isLive ? 'LIVE' : ['embed','resolver'].includes(channel.playbackType) ? 'WEB' : 'DIRECT'}</i>
      <span class="noctra-tv-favorite-toggle" role="button" tabindex="0" data-tv-favorite-toggle data-tv-favorite-index="${index}" data-favorite="${favorite}" aria-pressed="${favorite}" aria-label="${favorite ? 'Retirer' : 'Ajouter'} ${escapeHtml(channel.name)} ${favorite ? 'des' : 'aux'} favoris" title="${favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${icons.heart}</span>
    </button>`;
  }

  function filteredTvChannels() {
    const channels = Array.isArray(tvState.catalog?.channels) ? tvState.catalog.channels : [];
    const search = normalizedText(tvState.search || '');
    return channels.map((channel, index) => ({ channel, index })).filter(({ channel }) => {
      if (tvState.group !== 'Toutes' && (channel.group || 'Chaînes') !== tvState.group) return false;
      return !search || tvChannelSearchBlob(channel).includes(search);
    }).sort((a, b) => String(a.channel?.name || '').localeCompare(String(b.channel?.name || ''), 'fr', { sensitivity: 'base', numeric: true }));
  }

  function resetTvVirtualState() {
    if (tvVirtualState.raf) cancelAnimationFrame(tvVirtualState.raf);
    tvVirtualState.raf = 0;
    tvVirtualState.lastStart = -1;
    tvVirtualState.lastEnd = -1;
    tvVirtualState.lastKey = '';
    tvVirtualState.matches = [];
  }

  function tvVirtualKey(matches) {
    const first = matches[0]?.index ?? -1;
    const last = matches.at(-1)?.index ?? -1;
    return `${tvState.sourceId}|${tvState.group}|${normalizedText(tvState.search || '')}|${matches.length}|${first}|${last}`;
  }

  function renderTvVirtualWindow(list, matches, force = false) {
    if (!list) return;
    const key = tvVirtualKey(matches);
    if (key !== tvVirtualState.lastKey) {
      tvVirtualState.lastKey = key;
      tvVirtualState.lastStart = -1;
      tvVirtualState.lastEnd = -1;
    }
    tvVirtualState.matches = matches;
    const pitch = Math.max(58, Number(tvVirtualState.pitch || 68));
    const viewport = Math.max(320, list.clientHeight || 650);
    const overscan = 7;
    const start = Math.max(0, Math.floor((list.scrollTop || 0) / pitch) - overscan);
    const end = Math.min(matches.length, Math.ceil(((list.scrollTop || 0) + viewport) / pitch) + overscan);
    if (!force && start === tvVirtualState.lastStart && end === tvVirtualState.lastEnd) return;
    tvVirtualState.lastStart = start;
    tvVirtualState.lastEnd = end;
    const before = Math.max(0, start * pitch);
    const after = Math.max(0, (matches.length - end) * pitch);
    const rows = matches.slice(start, end).map(({ channel, index }) => tvChannelCard(channel, index, true)).join('');
    list.innerHTML = `${before ? `<div class="noctra-tv-virtual-spacer" style="height:${before}px" aria-hidden="true"></div>` : ''}${rows}${after ? `<div class="noctra-tv-virtual-spacer" style="height:${after}px" aria-hidden="true"></div>` : ''}`
      || '<div class="noctra-empty noctra-tv-filter-empty">Aucune chaîne pour ce filtre.</div>';
    requestAnimationFrame(() => {
      if (!list.isConnected || list.dataset.virtual !== 'true') return;
      const firstRow = list.querySelector('.noctra-tv-channel');
      if (!firstRow) return;
      const margin = Number.parseFloat(getComputedStyle(firstRow).marginBottom || '0') || 0;
      const measured = Math.max(58, firstRow.getBoundingClientRect().height + margin);
      if (Math.abs(measured - tvVirtualState.pitch) > .1) {
        tvVirtualState.pitch = measured;
        tvVirtualState.lastStart = -1;
        renderTvVirtualWindow(list, tvVirtualState.matches, true);
      }
    });
  }

  function bindTvVirtualList(list) {
    if (!list || list._noctraVirtualHandler) return;
    const onScroll = () => {
      // V151 : une recherche peut faire repasser la liste sous le seuil de
      // virtualisation. L'ancien listener restait attaché et remplaçait alors
      // les résultats filtrés par `Aucune chaîne` au premier scroll, car
      // tvVirtualState.matches avait été réinitialisé. Il ne doit jamais agir
      // hors du mode virtuel courant.
      if (list.dataset.virtual !== 'true') return;
      if (tvVirtualState.raf) return;
      tvVirtualState.raf = requestAnimationFrame(() => {
        tvVirtualState.raf = 0;
        if (list.dataset.virtual !== 'true') return;
        renderTvVirtualWindow(list, tvVirtualState.matches, false);
      });
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    list._noctraVirtualHandler = onScroll;
  }

  function unbindTvVirtualList(list) {
    if (!list?._noctraVirtualHandler) return;
    try { list.removeEventListener('scroll', list._noctraVirtualHandler); } catch {}
    list._noctraVirtualHandler = null;
  }

  function ensureTvChannelVisible(index) {
    const list = document.querySelector('.noctra-tv-channel-list[data-virtual="true"]');
    if (!list) return;
    const position = tvVirtualState.matches.findIndex(item => Number(item.index) === Number(index));
    if (position < 0) return;
    const pitch = Math.max(58, Number(tvVirtualState.pitch || 68));
    const top = position * pitch;
    const bottom = top + pitch;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - Math.max(0, list.clientHeight - pitch) / 2);
      renderTvVirtualWindow(list, tvVirtualState.matches, true);
    }
  }

  function renderTvChannelList({ resetLimit = false } = {}) {
    const list = document.querySelector('.noctra-tv-channel-list');
    if (!list) return;
    const matches = filteredTvChannels();
    const counter = document.querySelector('[data-tv-visible-count]');
    if (counter) counter.textContent = `${matches.length} chaîne${matches.length > 1 ? 's' : ''}`;
    const virtual = desktopPerformanceProfile() && !usesCompactLayout() && matches.length > 70;
    if (virtual) {
      list.dataset.virtual = 'true';
      if (resetLimit) list.scrollTop = 0;
      bindTvVirtualList(list);
      renderTvVirtualWindow(list, matches, true);
      return;
    }
    list.removeAttribute('data-virtual');
    unbindTvVirtualList(list);
    resetTvVirtualState();
    if (resetLimit) {
      tvState.visibleLimit = 120;
      list.scrollTop = 0;
    }
    const shown = matches.slice(0, Math.max(40, Number(tvState.visibleLimit || 120)));
    list.innerHTML = shown.map(({ channel, index }, visibleIndex) => tvChannelCard(
      channel,
      index,
      visibleIndex < 8 ? 'high' : visibleIndex < 20 ? 'eager' : 'lazy'
    )).join('')
      || '<div class="noctra-empty noctra-tv-filter-empty">Aucune chaîne pour ce filtre.</div>';
    if (shown.length < matches.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'noctra-tv-load-more';
      more.dataset.tvLoadMore = 'true';
      more.innerHTML = `<strong>Afficher plus</strong><span>${shown.length} sur ${matches.length} chaînes</span>`;
      list.append(more);
    }
  }

  function tvChannelLogoKey(channel) {
    return String(channel?.id || `${normalizedText(channel?.name || '')}|${normalizedText(channel?.provider || '')}`);
  }

  function scheduleTvLogoRefresh(catalog, sequence) {
    window.clearTimeout(tvLogoRefreshTimer);
    if (catalog?.logosReady) return;
    const sourceId = catalog?.source?.id || tvState.sourceId;
    const channels = Array.isArray(catalog?.channels) ? catalog.channels : [];
    const provider = String(catalog?.source?.provider || '');
    const builtInTvLogos = ['LiveWatch', 'NorthTV', 'FrameTV', 'WiTV', 'OHA'].includes(provider);
    if (!sourceId || (!builtInTvLogos && !channels.some(channel => !channel.logo || channel.secondaryLogo))) return;
    tvLogoRefreshTimer = window.setTimeout(async () => {
      if (sequence !== tvNavigationSequence || tvState.sourceId !== sourceId || !document.querySelector('#noctra-panel[data-noctra-panel-kind="tv"]')) return;
      try {
        const refreshed = await api(`/api/tv/catalog?source=${encodeURIComponent(sourceId)}&logoRefresh=1`, { timeoutMs: 35_000 });
        if (sequence !== tvNavigationSequence || tvState.sourceId !== sourceId) return;
        const byKey = new Map((refreshed.channels || []).map(channel => [tvChannelLogoKey(channel), channel]));
        let changed = false;
        const updated = channels.map(channel => {
          const next = byKey.get(tvChannelLogoKey(channel));
          if (!next) return channel;
          const logo = next.logo || channel.logo || '';
          const secondaryLogo = next.secondaryLogo || channel.secondaryLogo || '';
          if (logo === channel.logo && secondaryLogo === channel.secondaryLogo) return channel;
          changed = true;
          return { ...channel, logo, secondaryLogo, iptvOrgId: next.iptvOrgId || channel.iptvOrgId || '' };
        });
        if (!changed || tvState.catalog !== catalog) return;
        catalog.channels = updated;
        const list = document.querySelector('.noctra-tv-channel-list');
        const scrollTop = list?.scrollTop || 0;
        renderTvChannelList({ resetLimit: false });
        const refreshedList = document.querySelector('.noctra-tv-channel-list');
        if (refreshedList) refreshedList.scrollTop = scrollTop;
        const current = updated[Number(tvState.currentChannelIndex)];
        const nowLogo = document.querySelector('[data-tv-now-logo]');
        if (current && nowLogo) {
          nowLogo.dataset.tvLogoLabel = current.name || 'TV';
          nowLogo.dataset.tvLogoState = 'idle';
          nowLogo.innerHTML = tvLogoMarkup(current, '', true);
        }
      } catch {
        // Les monogrammes restent le repli final si l'enrichissement visuel
        // est encore indisponible ; la lecture n'en dépend jamais.
      }
    }, String(catalog?.source?.provider || '') === 'LiveWatch' ? 450 : 1_200);
  }

  function renderTvLoading(source) {
    setPanelBody(`<section class="noctra-tv-shell" data-tv-layout="loading" data-tv-provider="${escapeHtml(String(source?.provider || source?.name || '').toLowerCase())}">
      ${tvNavigationMarkup()}
      <div class="noctra-tv-topbar">
        <div class="noctra-tv-title"><p class="noctra-eyebrow">NOCTRA · CONNEXION</p><div><h3>${escapeHtml(source?.name || 'Télévision')}</h3><span>CHARGEMENT</span></div><p>${escapeHtml(source?.description || 'Préparation du catalogue et des lecteurs disponibles…')}</p></div>
      </div>
      <section class="noctra-tv-loading-stage" aria-live="polite">
        <span class="noctra-tv-loading-orbit">${icons.tv}<i></i></span>
        <div><strong>Connexion à ${escapeHtml(source?.name || 'la source')}</strong><small>Les autres univers restent accessibles dans le bandeau ci-dessus.</small></div>
        <div class="noctra-tv-loading-lines"><i></i><i></i><i></i></div>
      </section>
    </section>`, { preserveScroll: false });
  }

  function renderTvSectionEmpty() {
    setPanelBody(`<section class="noctra-tv-shell" data-tv-layout="section-empty">
      ${tvNavigationMarkup()}
      <section class="noctra-tv-catalog-empty"><span>${tvSectionIcons[tvState.section] || icons.tv}</span><div><strong>Aucune source dans « ${escapeHtml(tvSectionLabels[tvState.section] || 'TV')} »</strong><small>${authContext?.isAdmin ? 'Ajoute une playlist, une API TV ou un portail autorisé pour compléter cet univers.' : 'Aucune source n’a encore été configurée par l’administrateur.'}</small></div>${authContext?.isAdmin ? `<button class="noctra-button" type="button" data-tv-show-source-form>${icons.plus}<span>Ajouter</span></button>` : ''}</section>
      ${tvSourceFormMarkup(authContext?.isAdmin)}
    </section>`, { preserveScroll: false });
  }

  function tvFavoriteCard(record) {
    return `<article class="noctra-tv-favorite-card">
      <button type="button" data-tv-favorite-open="${escapeHtml(record.key)}">
        <span class="noctra-tv-channel-logo" data-tv-logo-label="${escapeHtml(record.name)}" data-tv-logo-state="idle">${tvLogoMarkup(record, '', 'eager')}</span>
        <span><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.sourceName || record.provider || 'Source TV')}</small><em>${escapeHtml(record.group || 'Chaînes')}</em></span>
        ${icons.next}
      </button>
      <button class="noctra-tv-favorite-remove" type="button" data-tv-favorite-toggle data-tv-favorite-key="${escapeHtml(record.key)}" aria-label="Retirer ${escapeHtml(record.name)} des favoris" title="Retirer des favoris">${icons.heart}</button>
    </article>`;
  }

  function renderTvFavoritesWorkspace() {
    destroyTvPlayback();
    tvState.section = 'favorites';
    tvState.sourceId = '';
    tvState.catalog = null;
    const favorites = [...tvFavorites].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base', numeric: true }));
    setPanelBody(`<section class="noctra-tv-shell" data-tv-layout="favorites" data-tv-mobile-view="channels">
      ${tvNavigationMarkup()}
      <div class="noctra-tv-topbar">
        <div class="noctra-tv-title"><p class="noctra-eyebrow">NOCTRA · ACCÈS RAPIDE</p><div><h3>Chaînes favorites</h3><span>${favorites.length}</span></div><p>Une seule liste, commune à toutes les sources TV configurées.</p></div>
      </div>
      ${favorites.length ? `<div class="noctra-tv-favorites-grid">${favorites.map(tvFavoriteCard).join('')}</div>` : `<section class="noctra-tv-catalog-empty"><span>${icons.heart}</span><div><strong>Aucune chaîne favorite</strong><small>Ouvre une source puis utilise le cœur affiché sur une chaîne. Elle apparaîtra ici automatiquement.</small></div></section>`}
    </section>`, { preserveScroll: false });
  }

  async function waitForTvPlayer(sequence, timeoutMs = 4_000) {
    const deadline = performance.now() + Math.max(500, Number(timeoutMs) || 4_000);
    while (sequence === tvNavigationSequence && performance.now() < deadline) {
      const video = document.querySelector('#noctra-tv-video');
      const frame = document.querySelector('#noctra-tv-embed');
      if (video && frame && video.isConnected && frame.isConnected) return true;
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    return false;
  }

  async function openTvFavorite(key) {
    const favorite = tvFavoriteByKey(key);
    if (!favorite) return;
    tvState.group = 'Toutes';
    tvState.search = '';
    await openTv(favorite.sourceId, '');
    const sequence = tvNavigationSequence;
    if (tvState.sourceId !== favorite.sourceId || !await waitForTvPlayer(sequence)) {
      toast(`Le lecteur de ${favorite.name} n’a pas pu être préparé.`);
      return;
    }
    const channels = Array.isArray(tvState.catalog?.channels) ? tvState.catalog.channels : [];
    const index = channels.findIndex(channel => (
      (favorite.channelId && String(channel?.id || '') === favorite.channelId)
      || (
        normalizedText(channel?.name || '') === normalizedText(favorite.name || '')
        && (!favorite.provider || normalizedText(channel?.provider || '') === normalizedText(favorite.provider))
      )
    ));
    if (index < 0) {
      toast(`${favorite.name} n’est plus disponible dans cette source.`);
      return;
    }
    await playTvChannel(index);
    if (usesCompactLayout()) setTvMobileView('player');
  }

  function renderTvWorkspace(catalog, sequence = tvNavigationSequence) {
    tvState.catalog = catalog;
    const channels = Array.isArray(catalog.channels) ? catalog.channels : [];
    const groups = Array.isArray(catalog.groups) ? catalog.groups : [];
    const portalMode = Boolean(catalog.portalFallback) || (catalog.source?.section === 'portals' && channels.length === 1);
    const isOhaPortal = portalMode && catalog.source?.provider === 'OHA';
    const frameSource = catalog.source?.id === 'livewatch-frame';
    const groupNames = [...new Set(channels.map(channel => channel.group || 'Chaînes'))].sort((a, b) => {
      const aFrance = normalizedText(a) === 'france';
      const bFrance = normalizedText(b) === 'france';
      return aFrance === bFrance ? a.localeCompare(b, 'fr') : (aFrance ? -1 : 1);
    });
    if (frameSource) {
      const france = groupNames.find(group => normalizedText(group) === 'france');
      if (france && (tvState.group === 'Toutes' || !groupNames.includes(tvState.group))) tvState.group = france;
    }
    setPanelBody(`
      <section class="noctra-tv-shell" data-tv-layout="${portalMode ? 'portal' : 'catalog'}" data-tv-provider="${escapeHtml(String(catalog.source?.provider || '').toLowerCase())}" data-tv-mobile-view="${escapeHtml(tvState.mobileView || 'channels')}" ${isOhaPortal ? 'data-tv-oha-live="true"' : ''}>
        ${tvNavigationMarkup()}
        <div class="noctra-tv-topbar">
          <div class="noctra-tv-title"><p class="noctra-eyebrow">LE MONDE EN DIRECT</p><div><h3>${escapeHtml(catalog.name || 'Télévision')}</h3><span>${catalog.nativePlayback ? 'DIRECT' : 'EN DIRECT'}</span></div><p>${channels.length ? `${channels.length} chaîne${channels.length > 1 ? 's' : ''}` : `${groups.length} bouquet${groups.length > 1 ? 's' : ''}`}${catalog.source?.description ? ` · ${escapeHtml(catalog.source.description)}` : ''}</p></div>
          <div class="noctra-tv-source-actions">
            ${authContext?.isAdmin && catalog.source?.editable ? `<button class="noctra-tv-source-mini noctra-tv-source-mini--danger" type="button" data-tv-delete-source="${escapeHtml(catalog.source.id)}" title="Supprimer cette source" aria-label="Supprimer cette source">${icons.trash}<span>Supprimer</span></button>` : ''}
          </div>
        </div>
        ${channels.length ? `<div class="noctra-tv-mobile-switch" role="tablist" aria-label="Vue TV"><button type="button" data-tv-mobile-view="channels" data-active="${tvState.mobileView !== 'player'}">${icons.tv}<span>Chaînes</span></button><button type="button" data-tv-mobile-view="player" data-active="${tvState.mobileView === 'player'}">${icons.live}<span>Lecteur</span></button></div>` : ''}
        ${tvSourceFormMarkup(false)}
        ${liveWatchVipMarkup(catalog)}
        ${portalMode ? (isOhaPortal ? '' : `<div class="noctra-tv-portal-tools"><span><strong>Portail TV</strong><small>${escapeHtml(catalog.warning || 'Navigation intégrée')}</small></span><div><button class="noctra-button" type="button" data-tv-portal-reload>${icons.refresh}<span>Recharger</span></button><button class="noctra-button" type="button" data-tv-portal-fullscreen>${icons.external}<span>Plein écran</span></button></div></div>`) : tvLegalNote()}
        ${catalog.warning && !portalMode ? `<div class="noctra-tv-warning">${icons.info}<span>${escapeHtml(catalog.warning)}</span></div>` : ''}
        ${groups.length && !channels.length ? `<label class="noctra-tv-bouquet-search"><input type="search" data-tv-bouquet-search placeholder="Rechercher un bouquet…" aria-label="Rechercher un bouquet"><span>${groups.length} bouquets</span></label><div class="noctra-tv-groups">${groups.map(tvGroupCard).join('')}</div><p data-tv-bouquet-empty class="noctra-empty" hidden>Aucun bouquet avec ce nom.</p>` : ''}
        ${!groups.length && !channels.length ? `<section class="noctra-tv-catalog-empty"><span>${icons.tv}</span><div><strong>Aucune chaîne disponible dans cette source</strong><small>${escapeHtml(catalog.warning || 'Choisis une autre source TV dans le bandeau ci-dessus ou réessaie dans quelques instants.')}</small></div><button class="noctra-button" type="button" data-tv-retry>${icons.retry}<span>Réessayer</span></button></section>` : ''}
        ${channels.length ? `
          <div class="noctra-tv-player-layout">
            <section class="noctra-tv-player-card">
              <div class="noctra-tv-screen">
                <video id="noctra-tv-video" controls playsinline webkit-playsinline autopictureinpicture preload="metadata" controlslist="nodownload"></video>
                <iframe id="noctra-tv-embed" title="Lecteur TV intégré" hidden allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>
                <div class="noctra-tv-screen-brand"><span></span><strong>NOCTRA LIVE</strong></div>
                <div class="noctra-tv-screen-tools" role="toolbar" aria-label="Contrôles du lecteur TV">
                  <button class="noctra-tv-live-edge" type="button" data-tv-live-edge data-state="idle" aria-label="Revenir au direct" title="Revenir au direct" hidden>${icons.live}<span>Direct</span></button>
                  <button class="noctra-tv-safe-tools-launcher" type="button" data-tv-safe-tools-launcher aria-label="Outils TV" title="Outils TV">${icons.tools}</button>
                  <button class="noctra-tv-screen-fullscreen" type="button" data-tv-screen-fullscreen aria-label="Plein écran" title="Plein écran">${icons.fullscreen}</button>
                </div>
                <div class="noctra-tv-desktop-live-controls" data-tv-desktop-live-controls role="toolbar" aria-label="Lecteur TV en direct" hidden>
                  <button type="button" data-tv-live-toggle aria-label="Lire le direct" title="Lecture">${icons.play}</button>
                  <button class="noctra-tv-desktop-live-state" type="button" data-tv-custom-live-edge data-state="live" aria-label="Lecture en direct" title="Lecture en direct">${icons.live}<span>EN DIRECT</span></button>
                  <span class="noctra-tv-desktop-live-spacer"></span>
                  <button type="button" data-tv-live-mute aria-label="Couper le son" title="Couper le son">${icons.volume}</button>
                  <input type="range" data-tv-live-volume min="0" max="1" step="0.05" value="1" aria-label="Volume du direct">
                  <button type="button" data-tv-live-pip aria-label="Picture in Picture" title="Picture in Picture">${icons.pip}</button>
                  <button type="button" data-tv-safe-theater aria-label="Mode cinéma" title="Mode cinéma" aria-pressed="false">${icons.theater}</button>
                  <button type="button" data-tv-live-fullscreen aria-label="Plein écran" title="Plein écran">${icons.fullscreen}</button>
                </div>
                <div class="noctra-tv-placeholder"><span>${icons.tv}</span><strong>Choisis une chaîne</strong><small>Le lecteur sélectionnera automatiquement le meilleur mode disponible.</small></div>
              </div>
              <div class="noctra-tv-now">
                <div class="noctra-tv-now-main">
                  <span class="noctra-tv-now-logo" data-tv-now-logo>${icons.tv}</span>
                  <div class="noctra-tv-now-copy">
                    <div class="noctra-tv-now-heading"><strong data-tv-now-title>Aucune chaîne sélectionnée</strong><b data-tv-now-score hidden></b></div>
                    <small data-tv-now-group>TV en direct</small>
                    <div class="noctra-tv-now-badges" data-tv-now-badges></div>
                    <div class="noctra-tv-stream-options" data-tv-stream-options hidden></div>
                  </div>
                </div>
                <div class="noctra-tv-guide">
                  <div class="noctra-tv-guide-row" data-state="idle"><span>Maintenant</span><strong data-tv-now-programme>Sélectionne une chaîne pour afficher les informations disponibles.</strong></div>
                  <div class="noctra-tv-guide-row" data-tv-next-row hidden><span>Ensuite</span><strong data-tv-next-programme></strong></div>
                  <small data-tv-guide-note>Le guide dépend des données fournies par la source ou d’un guide XMLTV configuré.</small>
                </div>
                <div class="noctra-tv-player-actions"><div class="noctra-tv-zap"><button type="button" data-tv-zap="-1" aria-label="Chaîne précédente" title="Chaîne précédente">${icons.back}</button><button type="button" data-tv-zap="1" aria-label="Chaîne suivante" title="Chaîne suivante">${icons.back}</button></div><span class="noctra-tv-player-status" data-tv-player-status data-state="idle">En attente</span><label class="noctra-tv-quality" data-tv-quality-wrap hidden><span>Qualité</span><select data-tv-quality aria-label="Qualité vidéo"><option value="-1">Auto</option></select></label><button class="noctra-button noctra-tv-cast" type="button" data-tv-cast hidden>${icons.cast}<span>Caster</span></button><a class="noctra-button noctra-tv-open-external" data-tv-open-external hidden target="_blank" rel="noopener noreferrer">${icons.external}<span>Ouvrir le lecteur</span></a></div>
              </div>
            </section>
            <section class="noctra-tv-browser">
              <div class="noctra-tv-browser-head"><div><p class="noctra-eyebrow">ZAPPING</p><strong>Choisir une chaîne</strong></div><span data-tv-visible-count>${channels.length} chaîne${channels.length > 1 ? 's' : ''}</span></div>
              <div class="noctra-tv-filters">
                <label>${icons.search}<input type="search" data-tv-search value="${escapeHtml(tvState.search)}" placeholder="Chaîne, pays ou programme"><button type="button" data-tv-clear-search aria-label="Effacer la recherche" ${tvState.search ? '' : 'hidden'}>×</button></label>
                <select data-tv-group-filter><option value="Toutes" ${tvState.group === 'Toutes' ? 'selected' : ''}>${frameSource ? 'Tous les pays' : 'Tous les groupes'}</option>${groupNames.map(group => `<option value="${escapeHtml(group)}" ${group === tvState.group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}</select>
              </div>
              <div class="noctra-tv-channel-list" aria-live="polite"><div class="noctra-loading noctra-tv-list-loading"><i></i><span>Préparation des chaînes…</span></div></div>
            </section>
          </div>` : ''}
      </section>`, { preserveScroll: false, afterUpdate: () => {
        renderTvChannelList({ resetLimit: true });
        scheduleTvLogoRefresh(catalog, sequence);
      } });
  }

  function tvChannelStableIdentity(channel) {
    return String(channel?.id || `${normalizedText(channel?.provider || '')}|${normalizedText(channel?.name || '')}`);
  }

  function applyTvCatalogRefresh(enriched, sequence = tvNavigationSequence) {
    if (!enriched || sequence !== tvNavigationSequence) return;
    const previous = tvState.catalog;
    const previousCurrent = previous?.channels?.[Number(tvState.currentChannelIndex)] || null;
    const currentIdentity = previousCurrent ? tvChannelStableIdentity(previousCurrent) : '';
    enriched.source = enriched.source || previous?.source;
    tvState.catalog = enriched;
    if (currentIdentity) {
      const moved = (enriched.channels || []).findIndex(channel => tvChannelStableIdentity(channel) === currentIdentity);
      if (moved >= 0) tvState.currentChannelIndex = moved;
    }
    const title = document.querySelector('.noctra-tv-title');
    const titleCopy = title?.querySelector('p:last-child');
    if (titleCopy) {
      const count = Array.isArray(enriched.channels) ? enriched.channels.length : Number(enriched.count || 0);
      titleCopy.textContent = `${count} chaîne${count > 1 ? 's' : ''}${enriched.source?.description ? ` · ${enriched.source.description}` : ''}`;
    }
    renderTvChannelList({ resetLimit: false });
    document.querySelectorAll('[data-tv-channel-index]').forEach(button => {
      button.dataset.active = String(Number(button.dataset.tvChannelIndex) === Number(tvState.currentChannelIndex));
    });
    scheduleTvLogoRefresh(enriched, sequence);
  }

  async function openTv(sourceId = tvState.sourceId, ref = '', options = {}) {
    if (tvEnginePreference === 'shaka') void ensureShakaLibrary().catch(() => {});
    const sequence = ++tvNavigationSequence;
    window.clearTimeout(tvLogoRefreshTimer);
    const tvPanelOpen = document.querySelector('#noctra-panel[data-noctra-panel-kind="tv"]');
    if (!tvPanelOpen) setLoading('TV en direct', 'NOCTRA · LECTEUR TV', true);
    destroyTvPlayback();
    try {
      if (options.force) clearApiCache('/api/tv');
      const sourceData = await cachedApi('/api/tv/sources', 2 * 60_000);
      if (sequence !== tvNavigationSequence) return;
      tvState.sources = sourceData.sources || [];
      if (!sourceId && tvState.section === 'favorites') {
        renderTvFavoritesWorkspace();
        return;
      }
      if (!tvState.sources.length) {
        tvState.sourceId = '';
        setPanelBody(`<section class="noctra-tv-empty"><span>${icons.tv}</span><p class="noctra-eyebrow">TV EN DIRECT</p><h3>Ajoute ta première source</h3><p>Noctra propose les API LiveWatch documentées et accepte aussi tes playlists M3U/M3U8, catalogues JSON et portails web autorisés.</p>${tvLegalNote()}${authContext?.isAdmin ? tvSourceFormMarkup(true) : '<p>Demande à un administrateur de configurer une source.</p>'}</section>`, { preserveScroll: false });
        return;
      }
      let rememberedSourceId = '';
      if (!sourceId && !options.preferSection) {
        try { rememberedSourceId = window.localStorage?.getItem('noctra-tv-last-source') || ''; } catch {}
      }
      const requested = tvState.sources.find(source => source.id === sourceId)
        || tvState.sources.find(source => source.id === rememberedSourceId);
      const sectionSources = tvState.sources.filter(source => tvSourceSection(source) === tvState.section);
      const selected = requested || sectionSources[0] || (!options.preferSection && sourceId ? tvState.sources[0] : null);
      if (!selected) {
        tvState.sourceId = '';
        tvState.ref = '';
        renderTvSectionEmpty();
        return;
      }
      tvState.sourceId = selected.id;
      try { window.localStorage?.setItem('noctra-tv-last-source', selected.id); } catch {}
      tvState.section = tvSourceSection(selected);
      if (tvState.section === 'sports') tvState.showSports = true;
      tvState.ref = ref || '';
      const catalogPath = ref
        ? `/api/tv/catalog?ref=${encodeURIComponent(ref)}`
        : `/api/tv/catalog?source=${encodeURIComponent(selected.id)}`;
      const warmCatalog = validCachedApiValue(catalogPath);
      if (warmCatalog) {
        warmCatalog.source = warmCatalog.source || selected;
        renderTvWorkspace(warmCatalog, sequence);
      } else {
        renderTvLoading(selected);
      }
      const catalog = await cachedApi(catalogPath, ref ? 90_000 : 5 * 60_000, { timeoutMs: 35_000 });
      if (sequence !== tvNavigationSequence) return;
      catalog.source = catalog.source || selected;
      if (catalog !== warmCatalog) renderTvWorkspace(catalog, sequence);
      if (catalog.progressive && ['livewatch-curated', 'oha-live'].includes(selected.id)) {
        // V69 : LiveWatch et OHA rendent désormais leur première portion de
        // catalogue dès qu'une source répond. Les autres pages/fournisseurs
        // terminent côté serveur puis ce rafraîchissement léger enrichit la
        // liste sans bloquer le centre TV.
        const refreshDelays = selected.id === 'oha-live'
          ? [1_800, 4_500, 9_000, 15_000]
          : [2_200, 5_500, 10_000];
        refreshDelays.forEach(delayMs => {
          window.setTimeout(async () => {
            if (sequence !== tvNavigationSequence || tvState.sourceId !== selected.id) return;
            try {
              apiResponseCache.delete(catalogPath);
              const enriched = await cachedApi(catalogPath, 5 * 60_000, { timeoutMs: 12_000 });
              if (sequence !== tvNavigationSequence || tvState.sourceId !== selected.id) return;
              const hasMoreChannels = Number(enriched?.count || 0) > Number(tvState.catalog?.count || 0);
              const finishedProgressiveLoad = Boolean(tvState.catalog?.progressive) && !enriched?.progressive;
              if (hasMoreChannels || finishedProgressiveLoad) {
                enriched.source = enriched.source || selected;
                // V91 : un catalogue progressif ne remonte plus tout le panneau TV.
                // Le lecteur, ses iframes et sa vidéo restent intacts ; seule la liste
                // des chaînes est actualisée en place, ce qui supprime le gros freeze PC.
                applyTvCatalogRefresh(enriched, sequence);
              }
            } catch {}
          }, delayMs);
        });
      }
      if ((tvSourceSection(selected) === 'portals' || catalog.portalFallback) && Array.isArray(catalog.channels) && catalog.channels.length === 1) {
        window.requestAnimationFrame(() => playTvChannel(0));
      }
    } catch (error) {
      if (sequence !== tvNavigationSequence) return;
      // Une panne d'un fournisseur (notamment LiveWatch, première source de
      // la liste) ne doit jamais retirer l'accès à WiTV, OHA ou aux sources
      // personnelles. Le bandeau complet reste donc présent sur l'écran
      // d'erreur pour permettre de changer immédiatement de source.
      setPanelBody(`<section class="noctra-tv-shell" data-tv-layout="error">${tvNavigationMarkup()}<section class="noctra-tv-empty"><span>${icons.tv}</span><p class="noctra-eyebrow">${escapeHtml(tvState.sources.find(source => source.id === tvState.sourceId)?.name || 'SOURCE TV')}</p><h3>Cette source est momentanément indisponible</h3><p>${escapeHtml(error.message)}</p><small>Le reste du centre TV fonctionne toujours : choisis immédiatement un autre fournisseur dans le bandeau.</small>${tvLegalNote()}<div class="noctra-tv-source-actions">${authContext?.isAdmin ? `<button class="noctra-button" type="button" data-tv-show-source-form>Ajouter une autre source</button>` : ''}<button class="noctra-button" type="button" data-tv-retry>${icons.retry}<span>Réessayer cette source</span></button></div>${tvSourceFormMarkup(false)}</section></section>`, { preserveScroll: false });
    }
  }

  async function addTvSourceFromPrompt() {
    const url = window.prompt('URL de la playlist ou du catalogue :');
    if (!url) return;
    const name = window.prompt('Nom facultatif de la source TV :', '') || '';
    try {
      const result = await api('/api/tv/sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, url })
      });
      clearApiCache('/api/tv');
      toast('Source TV ajoutée.');
      await openTv(result.source?.id || '');
    } catch (error) {
      toast(error.message);
    }
  }

  function renderTvStreamOptions(options = [], activeIndex = 0) {
    const target = document.querySelector('[data-tv-stream-options]');
    if (!target) return;
    target.hidden = !options.length;
    target.innerHTML = options.length > 1
      ? options.map((item, index) => `<button type="button" data-tv-embed-option="${index}" data-tv-embed-compat="${item.compatPage ? 'true' : 'false'}" data-active="${index === activeIndex}">${escapeHtml(item.label || `Serveur ${index + 1}`)}</button>`).join('')
      : '';
    if (!target.innerHTML) target.hidden = true;
    if (options.length > 1 && tvState.section === 'channels') {
      const note = document.createElement('small');
      note.style.cssText = 'flex-basis:100%;opacity:.8';
      note.textContent = window.NoctraServerChoice?.isManual()
        ? 'Choix manuel conservé pour cette lecture'
        : 'Sélection au lancement · choix manuel disponible';
      target.prepend(note);
    }
  }

  function playTvEmbedUrl(channel, url, statusLabel = '', options = {}, playbackSequence = tvPlaybackSequence) {
    const video = document.querySelector('#noctra-tv-video');
    const frame = document.querySelector('#noctra-tv-embed');
    if (!video || !frame || !url || playbackSequence !== tvPlaybackSequence) return;
    const mobileWeb = tvAppleTouchDevice() || window.matchMedia?.('(max-width: 760px)')?.matches;
    if (mobileWeb) {
      try {
        const target = new URL(url, window.location.href);
        if (target.origin === window.location.origin && /\/api\/tv\/(?:alternative\/open|volkamax\/embed)\//.test(target.pathname)) {
          target.searchParams.set('mobile', '1');
          url = target.pathname + target.search;
        }
      } catch {}
    }
    const screen = frame.closest('.noctra-tv-screen');
    screen?.querySelector('[data-tv-provider-notice]')?.remove();
    if (screen) screen.dataset.tvWebPage = String(Boolean(options.compatPage || ['Alternative', 'Volkamax', 'Xtemus'].includes(channel.provider)));
    try { tvVideoEventsController?.abort?.(); } catch {}
    try { tvHls?.destroy?.(); } catch {}
    tvHls = null;
    tvVideoEventsController = null;
    window.clearTimeout(tvWaitingStatusTimer);
    tvWaitingStatusTimer = 0;
    resetTvQualitySelector();
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    video.controls = true;
    video.load?.();
    tvState.currentPlaybackType = 'embed';
    tvState.currentStreamUrl = '';
    refreshTvLiveEdgeControl();
    updateTvCastButton({ ...channel, playbackType: 'embed' });
    video.hidden = true;
    refreshTvDesktopLiveControls();
    frame.hidden = false;
    const external = document.querySelector('[data-tv-open-external]');
    if (external) {
      external.href = url;
      external.dataset.tvOpenExternal = url;
      external.hidden = false;
    }
    const resolvedChannel = { ...channel, embedUrl: url };
    frame.dataset.tvProvider = String(channel?.provider || '').toLowerCase();
    frame.dataset.tvCompatPage = options.compatPage ? 'true' : 'false';
    // YouTube et plusieurs lecteurs WiTV refusent la lecture sans origine HTTP.
    // Seuls les embeds LiveWatch documentés conservent leur politique sans référent.
    frame.referrerPolicy = channel?.liveWatchDocsEmbed ? 'no-referrer' : 'strict-origin-when-cross-origin';
    configureTvIframe(frame, resolvedChannel);
    frame.setAttribute('playsinline', '');
    frame.setAttribute('webkit-playsinline', '');
    // iOS may block a third-party session inside an iframe. A real anchor
    // preserves the user's gesture and opens the original provider page.
    if (external && tvAppleTouchDevice()) {
      external.href = channel.externalUrl || url;
      external.dataset.tvOpenExternal = external.href;
      const label = external.querySelector('span');
      if (label) label.textContent = 'Ouvrir le lecteur';
    }
    if (channel.provider === 'BowdTV') {
      frame.hidden = true;
      frame.src = 'about:blank';
      if (screen) {
        const notice = document.createElement('div');
        notice.dataset.tvProviderNotice = 'true';
        notice.innerHTML = `<strong>BowdTV · Guide France</strong><p>BowdTV refuse l’affichage dans un lecteur intégré. Ouvre son guide pour regarder les chaînes.</p><a class="noctra-button" href="https://bowdtv.com/live?view=guide&amp;country=France" target="_blank" rel="noopener">Ouvrir BowdTV ↗</a>`;
        screen.appendChild(notice);
      }
      setTvPlaybackStatus('BowdTV · ouverture sur le site du fournisseur', 'idle');
      return;
    }
    configureOhaFrameSizing(frame, channel);
    let loaded = false;
    if (frame._noctraOhaMessageHandler) window.removeEventListener('message', frame._noctraOhaMessageHandler);
    frame._noctraOhaMessageHandler = null;
    if (channel.provider === 'OHA' && options.compatPage) {
      let mediaPlaying = false;
      let nativeHandoffStarted = false;
      let alternateStarted = false;
      const startOhaNativeFallback = reason => {
        if (alternateStarted || mediaPlaying || frame.hidden || playbackSequence !== tvPlaybackSequence) return false;
        const currentIndex = Number.isInteger(options.optionIndex) ? options.optionIndex : -1;
        if (tvResolvedFallbackSequence !== playbackSequence) {
          tvResolvedFallbackSequence = playbackSequence;
          tvFailedOptionIndexes = new Set();
        }
        tvFailedOptionIndexes.add(currentIndex);
        const fallbackIndex = tvState.resolvedEmbeds.findIndex((item, index) => index !== currentIndex
          && !item?.manualOnly && !tvFailedOptionIndexes.has(index) && item?.resolveUrl);
        if (fallbackIndex < 0) return false;
        tvFailedOptionIndexes.add(fallbackIndex);
        alternateStarted = true;
        setTvPlaybackStatus(`OHA · lecteur web indisponible · essai ${tvState.resolvedEmbeds[fallbackIndex]?.label || 'du serveur natif'}…`, 'loading');
        recordTvDiagnostic('oha-web-native-fallback-start', { currentIndex, fallbackIndex, reason: String(reason || '') });
        void playTvResolvedOption(channel, tvState.resolvedEmbeds[fallbackIndex], fallbackIndex, playbackSequence).catch(() => {
          if (playbackSequence === tvPlaybackSequence) setTvPlaybackStatus('OHA · aucun serveur compatible', 'error');
        });
        return true;
      };
      const onOhaState = event => {
        if (frame.hidden || playbackSequence !== tvPlaybackSequence || event.source !== frame.contentWindow || event.data?.type !== 'noctra-oha-state') return;
        if (event.data.state === 'media' && event.data.url && !nativeHandoffStarted) {
          nativeHandoffStarted = true;
          setTvPlaybackStatus('OHA · flux résolu · passage au lecteur Noctra…', 'loading');
          playTvDirectStream(channel, event.data.url, 'OHA · lecture en direct', playbackSequence, Number.isInteger(options.optionIndex) ? options.optionIndex : -1).catch(() => {
            nativeHandoffStarted = false;
            setTvPlaybackStatus('OHA · flux résolu mais lecture impossible', 'error');
          });
        } else if (event.data.state === 'playing') {
          mediaPlaying = true;
          setTvPlaybackStatus('OHA · lecture en direct', 'playing');
        } else if (event.data.state === 'route-fallback') {
          setTvPlaybackStatus('OHA · route actualisée · recherche de la chaîne…', 'loading');
        } else if (event.data.state === 'error' || event.data.state === 'stalled') {
          if (event.data.message) toast(`OHA : ${event.data.message}`);
          if (!startOhaNativeFallback(event.data.state)) setTvPlaybackStatus('OHA · le lecteur officiel intégré ne fournit pas de média', 'error');
        }
      };
      frame._noctraOhaMessageHandler = onOhaState;
      window.addEventListener('message', onOhaState);
      window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || mediaPlaying || frame.hidden || frame.getAttribute('src') !== url) return;
        setTvPlaybackStatus('OHA · attente du lecteur officiel…', 'loading');
      }, 15_000);
      window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || mediaPlaying || frame.hidden || frame.getAttribute('src') !== url) return;
        if (!startOhaNativeFallback('aucune image après 36 secondes')) {
          setTvPlaybackStatus('OHA · le lecteur officiel ne fournit aucune image · essai terminé', 'error');
        }
      }, 36_000);
    } else if ((channel.vipPlayback || channel.provider === 'LiveWatch') && /\/api\/tv\/livewatch\/(?:embed\/|vip\/[^/]+\/embed(?:$|[?#]))/.test(String(url))) {
      let mediaPlaying = false;
      let vipReady = false;
      let mobileNativeHandoffStarted = false;
      let publicFallbackStarted = false;
      const liveWatchLabel = String(channel?.provider || 'LiveWatch');
      // V115 : pour les familles alternatives, le lecteur officiel LiveWatch
      // reste maître sur iOS. On ne le remplace plus immédiatement par une URL
      // média détectée dans l'iframe : ce handoff était à l'origine de la boucle
      // "Reconnexion au même flux…" visible sur Daddy TV / NorthTV.
      const preferOfficialAltIframe = /^(?:DaddyTV|Daddy TV|NorthTV|FrameTV)$/i.test(liveWatchLabel);
      const startPublicFallback = reason => {
        if (publicFallbackStarted || mediaPlaying || playbackSequence !== tvPlaybackSequence || frame.hidden) return false;
        const currentIndex = Number.isInteger(options.optionIndex) ? options.optionIndex : -1;
        const fallbackIndex = tvState.resolvedEmbeds.findIndex((item, index) => index !== currentIndex
          && item?.url
          && item?.fallback
          && item?.vip !== true
          && /public|pubs?|secours/i.test(String(item?.label || '')));
        if (fallbackIndex < 0) return false;
        publicFallbackStarted = true;
        recordTvDiagnostic('livewatch-public-fallback-start', { provider: liveWatchLabel, reason: String(reason || '') });
        setTvPlaybackStatus(`${liveWatchLabel} · lecteur VIP sans image · ouverture du lecteur public…`, 'loading');
        void playTvResolvedOption(channel, tvState.resolvedEmbeds[fallbackIndex], fallbackIndex, playbackSequence).catch(error => {
          if (playbackSequence !== tvPlaybackSequence) return;
          setTvPlaybackStatus(`${liveWatchLabel} · lecteur public indisponible`, 'error');
          if (error?.message) recordTvDiagnostic('livewatch-public-fallback-failed', { provider: liveWatchLabel, message: error.message });
        });
        return true;
      };
      const onLiveWatchState = event => {
        if (playbackSequence !== tvPlaybackSequence || event.source !== frame.contentWindow || event.data?.type !== 'noctra-livewatch-state') return;
        if (event.data.state === 'vip-ready') {
          vipReady = true;
          setTvPlaybackStatus(`${liveWatchLabel} · session VIP transmise au lecteur…`, 'loading');
        } else if (event.data.state === 'ready') {
          setTvPlaybackStatus(`${liveWatchLabel} · média prêt · démarrage…`, 'loading');
        } else if (event.data.state === 'media' && event.data.url) {
          frame.dataset.tvResolvedMedia = String(event.data.url);
          // V84 : la V80 passait le média Premium résolu au lecteur natif Noctra,
          // ce qui était nettement plus fiable sur mobile. On restaure ce chemin
          // uniquement AVANT le démarrage de l'iframe et sur écran tactile/mobile.
          // Une lecture déjà active n'est jamais remplacée : aucune bascule tardive
          // ne peut donc interrompre la chaîne ou provoquer le 502 observé en V82.
          const mobileNative = tvAppleTouchDevice() || window.matchMedia?.('(max-width: 760px)')?.matches;
          const desktopNative = !tvAppleTouchDevice() && window.matchMedia?.('(min-width: 761px)')?.matches;
          if ((desktopNative || (!preferOfficialAltIframe && mobileNative)) && !mediaPlaying && !mobileNativeHandoffStarted) {
            mobileNativeHandoffStarted = true;
            setTvPlaybackStatus(`${liveWatchLabel} · flux résolu · lecteur direct Noctra…`, 'loading');
            playTvDirectStream(channel, event.data.url, `${liveWatchLabel} · VIP Premium · lecture en direct`, playbackSequence, Number.isInteger(options.optionIndex) ? options.optionIndex : -1).catch(() => {
              mobileNativeHandoffStarted = false;
              setTvPlaybackStatus(`${liveWatchLabel} · flux Premium indisponible · lecteur officiel disponible`, 'error');
            });
          }
        } else if (event.data.state === 'playing') {
          mediaPlaying = true;
          setTvPlaybackStatus(`${liveWatchLabel} · VIP Premium · lecture en direct`, 'playing');
        } else if (event.data.state === 'vip-missed') {
          setTvPlaybackStatus(`${liveWatchLabel} · le lecteur n’a pas reconnu le VIP`, 'error');
          toast(event.data.message || 'LiveWatch affiche encore son mode public malgré la session VIP.');
        } else if (event.data.state === 'error') {
          setTvPlaybackStatus(`${liveWatchLabel} · lecteur VIP indisponible`, 'error');
          if (event.data.message) toast(`LiveWatch VIP : ${event.data.message}`);
        }
      };
      frame._noctraOhaMessageHandler = onLiveWatchState;
      window.addEventListener('message', onLiveWatchState);
      window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || mediaPlaying || frame.hidden) return;
        setTvPlaybackStatus(vipReady ? `${liveWatchLabel} · VIP transmis · attente du direct…` : `${liveWatchLabel} · initialisation VIP…`, 'loading');
      }, 12_000);
      window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || mediaPlaying || frame.hidden) return;
        const eventOnly = /live\s+during\s+events|events?\s+only/i.test(String(channel?.name || ''));
        if (/^NorthTV$/i.test(liveWatchLabel) && eventOnly) {
          setTvPlaybackStatus('NorthTV · aucun média reçu · chaîne probablement hors diffusion', 'error');
        }
      }, 20_000);
      window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || mediaPlaying || frame.hidden) return;
        setTvPlaybackStatus(`${liveWatchLabel} · le lecteur public reste disponible manuellement`, 'idle');
      }, 45_000);
    } else if (channel.provider === 'WiTV' && /\/api\/tv\/embed\//.test(String(url))) {
      let mediaPlaying = false;
      let fallbackStarted = false;
      const onWiTvState = event => {
        if (playbackSequence !== tvPlaybackSequence || event.source !== frame.contentWindow || event.data?.type !== 'noctra-witv-state') return;
        if (event.data.state === 'playing') {
          mediaPlaying = true;
          setTvPlaybackStatus('WiTV · lecture en direct', 'playing');
          return;
        }
        if ((event.data.state === 'error' || event.data.state === 'stalled') && !fallbackStarted) {
          fallbackStarted = true;
          if (event.data.message) toast(`WiTV : ${event.data.message}`);
          const currentIndex = Number.isInteger(options.optionIndex) ? options.optionIndex : -1;
          const afterCurrent = (item, itemIndex) => !item?.manualOnly && !item?.providerFallback && itemIndex > currentIndex && itemIndex !== currentIndex;
          let fallbackIndex = tvState.resolvedEmbeds.findIndex((item, itemIndex) => afterCurrent(item, itemIndex) && (item?.streamUrl || item?.playbackType === 'stream'));
          if (fallbackIndex < 0) fallbackIndex = tvState.resolvedEmbeds.findIndex((item, itemIndex) => afterCurrent(item, itemIndex) && item?.url);
          if (fallbackIndex < 0) fallbackIndex = tvState.resolvedEmbeds.findIndex((item, itemIndex) => !item?.manualOnly && !item?.providerFallback && itemIndex !== currentIndex && (item?.streamUrl || item?.url));
          if (fallbackIndex >= 0) {
            setTvPlaybackStatus(`WiTV · serveur indisponible · essai ${tvState.resolvedEmbeds[fallbackIndex]?.label || 'du secours'}…`, 'loading');
            playTvResolvedOption(channel, tvState.resolvedEmbeds[fallbackIndex], fallbackIndex, playbackSequence).catch(() => undefined);
          } else {
            setTvPlaybackStatus('WiTV · ce lecteur ne fournit aucun média', 'error');
          }
        }
      };
      frame._noctraOhaMessageHandler = onWiTvState;
      window.addEventListener('message', onWiTvState);
    }
    frame.onload = () => {
      if (playbackSequence !== tvPlaybackSequence) return;
      loaded = true;
      frame.dataset.tvLoaded = 'true';
      const liveWatchVipBridge = (channel.vipPlayback || channel.provider === 'LiveWatch') && /\/api\/tv\/livewatch\/(?:embed\/|vip\/[^/]+\/embed(?:$|[?#]))/.test(String(url));
      const wiTvPreparedBridge = channel.provider === 'WiTV' && /\/api\/tv\/embed\//.test(String(url));
      const wiTvWebFrame = channel.provider === 'WiTV';
      const untrackedWebFrame = ['DaddyLive', 'BrigitteTV', 'Xtemus', 'Streamed', 'Alternative', 'Volkamax', 'DLStreams'].includes(channel.provider);
      const loadedLabel = channel.provider === 'OHA' && options.compatPage
        ? 'OHA · lecteur chargé · démarrage du média…'
        : wiTvPreparedBridge
          ? 'WiTV · lecteur chargé · démarrage du média…'
          : wiTvWebFrame
            ? 'WiTV · lecteur web chargé · démarre la lecture dans le lecteur'
          : (statusLabel || (liveWatchVipBridge ? 'Lecteur LiveWatch VIP chargé' : 'Lecteur web chargé'));
      const publicGate = Boolean(channel.liveWatchMandatoryAd);
      // Une iframe WiTV distante ne remonte pas son état média à Noctra.
      // Son chargement terminé n'est ni une lecture prouvée, ni une attente infinie.
      setTvPlaybackStatus(untrackedWebFrame ? `${channel.provider} · lecteur web chargé · lance la lecture dans le lecteur` : loadedLabel, untrackedWebFrame ? 'idle' : wiTvWebFrame && !wiTvPreparedBridge ? 'idle'
        : (channel.provider === 'OHA' && options.compatPage) || wiTvPreparedBridge || liveWatchVipBridge || publicGate ? 'loading' : 'playing');
      try { options.onLoaded?.(); } catch {}
    };
    frame.dataset.tvLoaded = 'false';
    frame.src = url;
    if (channel.liveWatchDocsEmbed) {
      window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || frame.hidden || !loaded) return;
        const provider = String(channel.provider || 'LiveWatch');
        const eventOnly = /live\s+during\s+events|events?\s+only/i.test(String(channel?.name || ''));
        if (/^NorthTV$/i.test(provider) && eventOnly) {
          setTvPlaybackStatus('NorthTV · lecteur chargé · chaîne disponible uniquement pendant certains événements', 'loading');
        } else if (channel.liveWatchMandatoryAd) {
          setTvPlaybackStatus(`${provider} · lecteur officiel · valide l’étape intégrée pour lancer la lecture`, 'loading');
        }
      }, 3_000);
    }
    const connectionProfile = tvConnectionProfile();
    window.setTimeout(() => {
      if (playbackSequence !== tvPlaybackSequence || loaded || frame.hidden) return;
      setTvPlaybackStatus(connectionProfile.weak
        ? 'Mode réseau prudent · le lecteur continue de charger…'
        : 'Lecteur distant lent · chargement toujours en cours…', 'loading');
    }, connectionProfile.embedSoftTimeout);
    window.setTimeout(() => {
      if (playbackSequence !== tvPlaybackSequence || loaded || frame.hidden) return;
      setTvPlaybackStatus('Lecteur toujours indisponible · secours manuel disponible', 'error');
    }, connectionProfile.embedHardTimeout);
  }

  function resetTvQualitySelector() {
    const wrap = document.querySelector('[data-tv-quality-wrap]');
    const select = document.querySelector('[data-tv-quality]');
    if (select) select.innerHTML = '<option value="-1">Auto</option>';
    if (wrap) wrap.hidden = true;
  }

  function applyTvChannelAutoQuality(hls, automatic = true) {
    if (!hls?._noctraChannelAuto) return;
    if (hls._noctraOriginalSizeCap === undefined) hls._noctraOriginalSizeCap = Boolean(hls.capLevelToPlayerSize);
    const levels = Array.isArray(hls.levels) ? hls.levels : [];
    const eligible = levels.map((level, index) => ({index, height:Number(level.height || 0), bitrate:Number(level.bitrate || 0)}))
      .filter(level => level.height > 0 && level.height <= 720 && (!level.bitrate || level.bitrate <= 4_000_000));
    // HLS variants are bitrate ordered. Never invent a rendition for one-quality sources.
    const cap = levels.length > 1 && eligible.length ? Math.max(...eligible.map(level => level.index)) : -1;
    hls.autoLevelCapping = automatic ? cap : -1;
    hls.capLevelToPlayerSize = automatic && cap >= 0 ? false : hls._noctraOriginalSizeCap;
    hls._noctraChannelAutoCap = cap;
  }

  function populateTvQualitySelector(hls) {
    const wrap = document.querySelector('[data-tv-quality-wrap]');
    const select = document.querySelector('[data-tv-quality]');
    if (!wrap || !select || !hls) return;
    const levels = Array.isArray(hls.levels) ? hls.levels : [];
    const rows = levels.map((level, index) => ({
      index,
      height: Number(level?.height || 0),
      bitrate: Number(level?.bitrate || 0),
      width: Number(level?.width || 0)
    })).filter(level => level.height || level.bitrate);
    if (rows.length < 2) {
      wrap.hidden = true;
      return;
    }
    select.innerHTML = '<option value="-1">' + (hls._noctraChannelAutoCap >= 0 ? 'Auto stable · 720p max' : 'Auto') + '</option>' + rows
      .sort((a, b) => (b.height - a.height) || (b.bitrate - a.bitrate))
      .map(level => {
        const resolution = level.height ? `${level.height}p` : (level.width ? `${level.width}px` : 'Source');
        const bitrate = level.bitrate ? ` · ${(level.bitrate / 1_000_000).toFixed(level.bitrate >= 10_000_000 ? 0 : 1)} Mb/s` : '';
        return `<option value="${level.index}">${resolution}${bitrate}</option>`;
      }).join('');
    select.value = '-1';
    wrap.hidden = false;
    if (tvSafeExtras.menuOpen) refreshTvSafeToolsMenu();
  }


  /* V100 — TV extras isolated from the core playback path.
     The v94 TV markup and the v94 playback functions remain untouched. */
  function scheduleTvSafeExtrasMount() {
    window.cancelAnimationFrame(tvSafeExtrasMountFrame);
    tvSafeExtrasMountFrame = window.requestAnimationFrame(() => {
      tvSafeExtrasMountFrame = 0;
      mountTvSafeExtrasLauncher();
    });
  }

  function tvSafeExtrasPanel() {
    return document.querySelector('#noctra-panel[data-noctra-panel-kind="tv"]');
  }

  function mountTvSafeExtrasLauncher() {
    const panelNode = tvSafeExtrasPanel();
    const screen = panelNode?.querySelector('.noctra-tv-screen');
    if (!panelNode || !screen) return;
    if (!screen.dataset.noctraEmbedIdleBound) {
      screen.dataset.noctraEmbedIdleBound = 'true';
      let idleTimer;
      const idle = () => {
        clearTimeout(idleTimer);
        const frame = screen.querySelector('#noctra-tv-embed');
        if (!frame || frame.hidden) return;
        screen.removeAttribute('data-tv-controls-hidden');
        idleTimer = setTimeout(() => {
          if (screen.isConnected && !frame.hidden && !tvSafeExtras.menuOpen && !screen.querySelector('.noctra-tv-screen-tools :focus-visible')) screen.setAttribute('data-tv-controls-hidden', 'true');
        }, 1800);
      };
      ['pointerenter','pointermove','pointerdown','focusout'].forEach(event => screen.addEventListener(event, idle, {passive:true}));
      screen.querySelector('#noctra-tv-embed')?.addEventListener('load', idle);
      idle();
    }
    // V108 : le mode cinéma est un état persistant du panneau TV. Une mise à
    // jour partielle du DOM (zapping, état lecteur, menu, guide) ne doit jamais
    // le faire retomber en mode compact tant que l'utilisateur ne le désactive pas.
    if (tvSafeExtras.theater) panelNode.setAttribute('data-tv-safe-theater', 'true');
    else panelNode.removeAttribute('data-tv-safe-theater');
    let toolbar = screen.querySelector('.noctra-tv-screen-tools');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'noctra-tv-screen-tools';
      toolbar.setAttribute('role', 'toolbar');
      toolbar.setAttribute('aria-label', 'Contrôles du lecteur TV');
      screen.appendChild(toolbar);
    }
    let button = toolbar.querySelector('[data-tv-safe-tools-launcher]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'noctra-tv-safe-tools-launcher';
      button.dataset.tvSafeToolsLauncher = 'true';
      button.setAttribute('aria-label', 'Outils TV');
      toolbar.appendChild(button);
    }
    let liveEdgeButton = toolbar.querySelector('[data-tv-live-edge]');
    if (!liveEdgeButton) {
      liveEdgeButton = document.createElement('button');
      liveEdgeButton.type = 'button';
      liveEdgeButton.className = 'noctra-tv-live-edge';
      liveEdgeButton.dataset.tvLiveEdge = 'true';
      liveEdgeButton.dataset.state = 'idle';
      liveEdgeButton.hidden = true;
      liveEdgeButton.innerHTML = `${icons.live}<span>Direct</span>`;
      toolbar.insertBefore(liveEdgeButton, toolbar.firstChild);
    }
    let hud = screen.querySelector('[data-tv-safe-status-hud]');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'noctra-tv-safe-status-hud';
      hud.dataset.tvSafeStatusHud = 'true';
      const nativeStatus = panelNode.querySelector('[data-tv-player-status]');
      hud.dataset.state = nativeStatus?.dataset?.state || 'idle';
      hud.innerHTML = `<i aria-hidden="true"></i><span>${escapeHtml(nativeStatus?.textContent || 'En attente')}</span>`;
      screen.appendChild(hud);
    }
    if (button.dataset.tvSafeDirectBound !== 'true') {
      button.dataset.tvSafeDirectBound = 'true';
      // Liaison directe en capture : l'iframe/vidéo ne peut pas avaler le clic
      // et on ne dépend plus du grand délégateur document pour ouvrir le menu.
      button.addEventListener('pointerdown', event => event.stopPropagation(), { capture: true });
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (tvSafeExtras.menuOpen) closeTvSafeToolsMenu();
        else openTvSafeToolsMenu();
      }, { capture: true });
    }
    if (liveEdgeButton.dataset.tvLiveEdgeBound !== 'true') {
      liveEdgeButton.dataset.tvLiveEdgeBound = 'true';
      liveEdgeButton.addEventListener('pointerdown', event => event.stopPropagation(), { capture: true });
      liveEdgeButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        returnTvToLiveEdge();
      }, { capture: true });
    }
    const count = tvSafeExtras.slots.length;
    button.setAttribute('aria-expanded', String(tvSafeExtras.menuOpen));
    button.setAttribute('title', count >= 2 ? `Outils TV · Multiview prêt (${count}/${TV_SAFE_MULTI_MAX})` : 'Outils TV · cinéma, qualité et multiview');
    button.innerHTML = `<span class="noctra-tv-safe-tools-launcher-icon" aria-hidden="true">${icons.tools}</span>${count ? `<i data-tv-safe-tools-count>${count}</i>` : ''}`;
    refreshTvLiveEdgeControl();
    screen.querySelectorAll('button[data-tv-safe-theater]').forEach(theaterButton => {
      theaterButton.setAttribute('aria-pressed', String(tvSafeExtras.theater));
      theaterButton.setAttribute('aria-label', tvSafeExtras.theater ? 'Quitter le mode cinéma' : 'Mode cinéma');
      theaterButton.setAttribute('title', tvSafeExtras.theater ? 'Quitter le mode cinéma' : 'Mode cinéma');
      theaterButton.dataset.active = String(tvSafeExtras.theater);
    });
    const fullscreenButton = toolbar.querySelector('[data-tv-screen-fullscreen]');
    if (fullscreenButton && fullscreenButton.dataset.tvFullscreenDirectBound !== 'true') {
      fullscreenButton.dataset.tvFullscreenDirectBound = 'true';
      fullscreenButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void toggleTvFullscreen();
      }, { capture: true });
    }
  }

  function tvSafeCurrentChannel() {
    return tvState.catalog?.channels?.[Number(tvState.currentChannelIndex)] || null;
  }

  function tvSafeDirectSlot() {
    const channel = tvSafeCurrentChannel();
    const resolvedStream = tvState.resolvedEmbeds.find(option => option?.streamUrl === tvState.currentStreamUrl && option?.streamUrl)
      || tvState.resolvedEmbeds.find(option => option?.streamUrl || option?.playbackType === 'stream');
    const streamUrl = tvState.currentPlaybackType === 'embed' ? '' : String(tvState.currentStreamUrl || resolvedStream?.streamUrl || '');
    const frame = tvSafeExtrasPanel()?.querySelector('#noctra-tv-embed:not([hidden])');
    const embedUrl = tvState.currentPlaybackType === 'embed' && frame?.src && frame.src !== 'about:blank'
      ? String(frame.src)
      : '';
    if (!channel || (!streamUrl && !embedUrl)) return null;
    return {
      id: `${tvState.sourceId || 'tv'}|${tvChannelStableIdentity(channel)}`,
      name: String(channel.name || 'Chaîne TV'),
      provider: String(channel.provider || tvState.catalog?.source?.provider || 'TV'),
      group: String(channel.group || ''),
      sourceId: String(tvState.sourceId || ''),
      playbackType: streamUrl ? 'stream' : 'embed',
      streamUrl,
      resolveUrl: String(resolvedStream?.resolveUrl || ''),
      liveWatchDocsEmbed: Boolean(channel.liveWatchDocsEmbed),
      embedUrl
    };
  }

  function tvSafeQualityOptions() {
    const select = tvSafeExtrasPanel()?.querySelector('[data-tv-quality]');
    if (!select) return [];
    return [...select.options].map(option => ({ value: String(option.value), label: String(option.textContent || '').trim() })).filter(option => option.label);
  }

  function tvSafeQualityAvailable() {
    return tvSafeQualityOptions().some(option => Number(option.value) >= 0);
  }

  function tvSafeToolsMenuMarkup() {
    const slot = tvSafeDirectSlot();
    const count = tvSafeExtras.slots.length;
    const qualityOptions = tvSafeQualityOptions();
    const quality = tvSafeQualityAvailable();
    const nativeSelect = tvSafeExtrasPanel()?.querySelector('[data-tv-quality]');
    const currentQuality = String(nativeSelect?.value ?? '-1');
    const multiReady = count >= 2;
    const pipVideo = tvVisibleVideo();
    const pipCapability = tvPictureInPictureCapability(pipVideo);
    const pipAvailable = Boolean(slot && pipCapability.supported);
    const pipPwaBlocked = Boolean(slot && pipCapability.reason === 'ios-standalone');
    const pipLabel = pipAvailable ? 'Picture in Picture' : (pipPwaBlocked ? 'PiP bloqué par iOS · mode app' : 'PiP indisponible');
    const multiText = count === 0
      ? `Ajoute 2 chaînes minimum · jusqu’à ${TV_SAFE_MULTI_MAX}`
      : (multiReady ? `${count} chaînes prêtes · ouvre le Multiview quand tu veux` : `Encore 1 chaîne pour activer le Multiview`);
    const qualityMarkup = quality
      ? `<label class="noctra-tv-safe-quality-picker"><span><b>Qualité du lecteur</b><small>Réglages fournis par le flux</small></span><select data-tv-safe-quality-select aria-label="Qualité du lecteur TV">${qualityOptions.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === currentQuality ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`
      : `<div class="noctra-tv-safe-quality-picker" data-disabled="true"><span><b>Qualité du lecteur</b><small>Cette source n’expose qu’une qualité</small></span><em>Source</em></div>`;
    return `<div class="noctra-tv-safe-tools-head"><div><strong>Outils TV</strong><small>Lecteur, qualité et multiplex</small></div><button type="button" data-tv-safe-tools-close aria-label="Fermer">×</button></div>
      <div class="noctra-tv-safe-tools-summary" data-ready="${multiReady}"><span>▦</span><div><b>Multiview ${count}/${TV_SAFE_MULTI_MAX}</b><small>${multiText}</small></div></div>
      <label class="noctra-tv-safe-quality-picker"><span><b>Moteur du direct</b><small>Direct et Multiview · hors lecteurs externes</small></span><select data-tv-engine aria-label="Moteur du direct"><option value="hls" ${tvEnginePreference === 'hls' ? 'selected' : ''}>HLS.js</option><option value="shaka" ${tvEnginePreference === 'shaka' ? 'selected' : ''}>Shaka</option></select></label>
      ${qualityMarkup}
      <div class="noctra-tv-safe-tools-grid">
        <button type="button" data-tv-safe-pip ${pipAvailable ? '' : 'disabled'} ${pipPwaBlocked ? 'title="La PWA installée fonctionne hors d’un onglet Safari ; iOS y bloque actuellement le Picture in Picture."' : ''}><span>${icons.pip}</span><b>${pipLabel}</b></button>
        <button type="button" data-tv-safe-theater aria-pressed="${Boolean(tvSafeExtras.theater)}"><span>${icons.theater}</span><b>Mode cinéma</b></button>
        <button type="button" data-tv-safe-multi-add ${slot && count < TV_SAFE_MULTI_MAX ? '' : 'disabled'}><span>＋</span><b>Ajouter au multi</b></button>
        <button type="button" data-tv-safe-multi-open ${multiReady ? '' : 'disabled'}><span>▦</span><b>Ouvrir Multiview <i>${count}/${TV_SAFE_MULTI_MAX}</i></b></button>
        <button type="button" data-tv-safe-multi-clear ${count ? '' : 'disabled'}><span>×</span><b>Vider la sélection</b></button>
        <button type="button" data-tv-safe-diagnostics><span>◎</span><b>Diagnostic ${escapeHtml(String(tvSafeCurrentChannel()?.provider || 'TV'))}</b></button>
      </div>`;
  }

  function ensureTvSafeToolsMenu() {
    let menu = document.querySelector('[data-tv-safe-tools-menu]');
    if (!menu) {
      menu = document.createElement('section');
      menu.className = 'noctra-tv-safe-tools-menu';
      menu.dataset.tvSafeToolsMenu = 'true';
      menu.hidden = true;
      document.body.appendChild(menu);
    }
    return menu;
  }

  function refreshTvSafeToolsMenu() {
    const menu = ensureTvSafeToolsMenu();
    menu.innerHTML = tvSafeToolsMenuMarkup();
    menu.hidden = !tvSafeExtras.menuOpen;
    menu.dataset.open = String(tvSafeExtras.menuOpen);
    mountTvSafeExtrasLauncher();
  }

  function openTvSafeToolsMenu() {
    tvSafeExtras.menuOpen = true;
    refreshTvSafeToolsMenu();
  }

  function closeTvSafeToolsMenu() {
    tvSafeExtras.menuOpen = false;
    const menu = document.querySelector('[data-tv-safe-tools-menu]');
    if (menu) { menu.hidden = true; menu.dataset.open = 'false'; }
    scheduleTvDesktopControlsHide();
  }

  function setTvSafeTheater(enabled) {
    const panelNode = tvSafeExtrasPanel();
    if (!panelNode) return;
    const next = Boolean(enabled);
    const theaterCard = panelNode.querySelector('.noctra-tv-player-card');
    const before = theaterCard?.getBoundingClientRect();
    const scrollBody = theaterCard?.closest('.noctra-panel-body');
    if (next && !tvSafeExtras.theater && scrollBody) tvSafeExtras.theaterScrollTop = scrollBody.scrollTop;
    tvSafeExtras.theater = next;
    if (next) panelNode.setAttribute('data-tv-safe-theater', 'true');
    else panelNode.removeAttribute('data-tv-safe-theater');
    // Le mode cinéma ne touche jamais au lecteur : seulement au layout.
    // On ferme le menu après le clic pour éviter qu'une surcouche reste au-dessus
    // du lecteur redimensionné et donne l'impression que l'interface est bloquée.
    closeTvSafeToolsMenu();
    window.requestAnimationFrame(() => {
      // Centre the picture in the scroll viewport before measuring the transition.
      const screen = theaterCard?.querySelector('.noctra-tv-screen');
      if (scrollBody && screen) {
        const layout = theaterCard.closest('.noctra-tv-player-layout');
        if (layout) layout.style.paddingTop = '';
        if (next) {
          const natural = screen.getBoundingClientRect();
          const top = scrollBody.getBoundingClientRect().top;
          const missingSpace = (scrollBody.clientHeight - natural.height) / 2 - (natural.top - top + scrollBody.scrollTop);
          if (layout && missingSpace > 0) layout.style.paddingTop = `${missingSpace}px`;

          const viewport = scrollBody.getBoundingClientRect();
          const picture = screen.getBoundingClientRect();
          scrollBody.scrollTop += picture.top + picture.height / 2 - viewport.top - scrollBody.clientHeight / 2;
        } else if (Number.isFinite(tvSafeExtras.theaterScrollTop)) {
          scrollBody.scrollTop = tvSafeExtras.theaterScrollTop;
        }
      }
      if (theaterCard && before?.width && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const after = theaterCard.getBoundingClientRect();
        if (after.width && after.height) {
          theaterCard.getAnimations().forEach(animation => animation.cancel());
          theaterCard.animate([
            { transformOrigin: 'top left', translate: `${before.left - after.left}px ${before.top - after.top}px`, scale: `${before.width / after.width} ${before.height / after.height}` },
            { transformOrigin: 'top left', translate: '0px 0px', scale: '1 1' }
          ], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
      }
      mountTvSafeExtrasLauncher();

    });
  }

  function setTvSafeQuality(value) {
    const select = tvSafeExtrasPanel()?.querySelector('[data-tv-quality]');
    if (!select || (!tvHls && !tvShaka)) return;
    const level = Number(value);
    if (tvShaka) {
      const track = tvShaka.getVariantTracks()[level];
      if (level >= 0 && !track) return;
      tvShaka.configure({ abr: { enabled: level < 0 } });
      if (track) tvShaka.selectVariantTrack(track, false);
      select.value = String(level);
      refreshTvSafeToolsMenu();
      return;
    }
    select.value = String(Number.isInteger(level) ? level : -1);
    // loadLevel change les prochains fragments sans purger le buffer courant.
    tvHls._noctraContinuity?.release();
    tvHls.loadLevel = Number.isInteger(level) ? level : -1;
    const label = select.selectedOptions?.[0]?.textContent || 'Auto';
    setTvPlaybackStatus(level < 0 ? 'Qualité automatique' : `Qualité ${label}`, 'playing');
    refreshTvSafeToolsMenu();
  }

  function stepTvSafeQuality(direction) {
    const select = tvSafeExtrasPanel()?.querySelector('[data-tv-quality]');
    if (!select || !tvHls || select.options.length < 2) return;
    const available = [...select.options]
      .map(option => Number(option.value))
      .filter(value => Number.isFinite(value) && value >= 0);
    if (!available.length) return;
    const current = Number(select.value);
    let position = available.indexOf(current);
    if (position < 0) position = available.indexOf(Number(tvHls.loadLevel));
    if (position < 0) position = Number(direction) < 0 ? 0 : available.length - 1;
    position = Math.max(0, Math.min(available.length - 1, position + (Number(direction) < 0 ? 1 : -1)));
    setTvSafeQuality(available[position]);
  }


  function addTvSafeMultiviewCurrent() {
    const slot = tvSafeDirectSlot();
    if (!slot) return toast('Cette chaîne ne fournit pas encore de lecteur compatible avec le multiview.');
    if (tvSafeExtras.slots.some(item => item.id === slot.id)) return toast('Cette chaîne est déjà dans le multiview.');
    if (tvSafeExtras.slots.length >= TV_SAFE_MULTI_MAX) return toast(`Le multiview accepte jusqu’à ${TV_SAFE_MULTI_MAX} chaînes.`);
    tvSafeExtras.slots.push(slot);
    refreshTvSafeToolsMenu();
    if (tvSafeExtras.slots.length === 2) toast('2 chaînes sélectionnées : le Multiview est maintenant disponible.');
    else toast(`${slot.name} ajoutée au multiview (${tvSafeExtras.slots.length}/${TV_SAFE_MULTI_MAX}).`);
  }

  function clearTvSafeMultiviewSelection() {
    closeTvSafeMultiview();
    tvSafeExtras.slots = [];
    tvSafeExtras.audioId = '';
    refreshTvSafeToolsMenu();
    toast('Sélection Multiview vidée.');
  }

  function destroyTvSafeMultiviewPlayers() {
    for (const controller of tvSafeExtras.multiControllers.values()) controller.abort();
    tvSafeExtras.multiControllers.clear();
    for (const instance of tvSafeExtras.hls.values()) {
      try { instance?.destroy?.(); } catch {}
    }
    tvSafeExtras.hls.clear();
    document.querySelectorAll('[data-tv-safe-multi-video]').forEach(video => {
      try { video.pause(); } catch {}
      video.removeAttribute('src');
      try { video.load?.(); } catch {}
    });
    document.querySelectorAll('[data-tv-safe-multi-frame]').forEach(frame => { frame.src = 'about:blank'; });
  }

  function suspendTvSafeMainPlaybackForMulti() {
    const video = tvSafeExtrasPanel()?.querySelector('#noctra-tv-video:not([hidden])');
    const frame = tvSafeExtrasPanel()?.querySelector('#noctra-tv-embed:not([hidden])');
    if (video) {
      if (tvSafeExtras.mainMutedBeforeMulti === null) tvSafeExtras.mainMutedBeforeMulti = Boolean(video.muted);
      if (tvSafeExtras.mainPausedBeforeMulti === null) tvSafeExtras.mainPausedBeforeMulti = Boolean(video.paused);
      video.muted = true;
      try { video.pause(); } catch {}
    }
    if (frame?.src && frame.src !== 'about:blank') {
      tvSafeExtras.mainEmbedSrc = frame.src;
      frame.src = 'about:blank';
    }
    // Le lecteur principal resterait sinon comme un flux supplémentaire caché
    // (2 cases = 3 téléchargements). On suspend uniquement le réseau HLS courant
    // pendant le Multiview, sans détruire ni résoudre un autre serveur.
    if (tvHls && tvState.currentPlaybackType === 'stream' && !tvSafeExtras.mainHlsSuspended) {
      try {
        tvHls.stopLoad();
        tvSafeExtras.mainHlsSuspended = true;
      } catch {}
    }
  }

  function restoreTvSafeMainPlayback() {
    const video = tvSafeExtrasPanel()?.querySelector('#noctra-tv-video:not([hidden])');
    const frame = tvSafeExtrasPanel()?.querySelector('#noctra-tv-embed:not([hidden])');
    const shouldResume = tvSafeExtras.mainPausedBeforeMulti === false;
    if (tvHls && tvSafeExtras.mainHlsSuspended) {
      try { tvHls.startLoad(-1); } catch {}
    }
    tvSafeExtras.mainHlsSuspended = false;
    if (video && tvSafeExtras.mainMutedBeforeMulti !== null) video.muted = Boolean(tvSafeExtras.mainMutedBeforeMulti);
    if (video && shouldResume) window.setTimeout(() => void video.play().catch(() => undefined), 60);
    if (frame && tvSafeExtras.mainEmbedSrc) frame.src = tvSafeExtras.mainEmbedSrc;
    tvSafeExtras.mainEmbedSrc = '';
    tvSafeExtras.mainMutedBeforeMulti = null;
    tvSafeExtras.mainPausedBeforeMulti = null;
  }

  async function toggleTvSafeMultiviewFullscreen(tileId = '') {
    const group = document.querySelector('[data-tv-safe-multiview]');
    const layer = tileId ? [...(group?.querySelectorAll('[data-tv-safe-multi-tile]') || [])].find(tile => tile.dataset.tvSafeMultiTile === tileId) : group;
    if (!layer) return;
    const current = document.fullscreenElement || document.webkitFullscreenElement;
    if (current) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
      } catch {}
      if (current === layer) return;
    }
    if (tvSafeExtras.fullscreenFallback) {
      tvSafeExtras.fullscreenFallback = false;
      const previous = group.querySelector('[data-tv-safe-fullscreen-fallback]') || (group.hasAttribute('data-tv-safe-fullscreen-fallback') ? group : null);
      previous?.removeAttribute('data-tv-safe-fullscreen-fallback');
      document.body.classList.remove('noctra-tv-multiview-fullscreen-fallback');
      if (previous === layer || !tileId) return;
    }
    try {
      if (layer.requestFullscreen) {
        await layer.requestFullscreen({ navigationUI: 'hide' });
        return;
      }
      if (layer.webkitRequestFullscreen) {
        layer.webkitRequestFullscreen();
        return;
      }
    } catch {}
    // Fallback iOS/WebKit quand le fullscreen arbitraire n'est pas disponible.
    tvSafeExtras.fullscreenFallback = true;
    layer.setAttribute('data-tv-safe-fullscreen-fallback', 'true');
    document.body.classList.add('noctra-tv-multiview-fullscreen-fallback');
  }

  function focusTvSafeMultiviewTile(id) {
    const layer = document.querySelector('[data-tv-safe-multiview]');
    if (!layer) return;
    const tiles = [...layer.querySelectorAll('[data-tv-safe-multi-tile]')];
    if (!tiles.some(tile => tile.dataset.tvSafeMultiTile === id)) return;
    const focused = layer.dataset.focusedTile === id ? '' : id;
    layer.dataset.focusedTile = focused;
    layer.style.setProperty('--tv-focus-rows', String(Math.max(1, tiles.length - 1)));
    layer.style.setProperty('--tv-safe-touch-focus-rows', String(Math.ceil((tiles.length - 1) / 2)));
    tiles.forEach(tile => {
      const active = tile.dataset.tvSafeMultiTile === focused;
      tile.dataset.featured = String(active);
      const button = tile.querySelector('[data-tv-safe-multi-focus]');
      button?.setAttribute('aria-pressed', String(active));
      button?.setAttribute('title', active ? 'Revenir à la grille' : 'Mettre en avant');
    });
    window.requestAnimationFrame(() => layer._noctraPositionHandles?.());
  }

  function closeTvSafeMultiview() {
    document.querySelector('[data-tv-safe-multiview]')?._noctraResizeObserver?.disconnect();
    tvSafeExtras.multiOpen = false;
    tvSafeExtras.multiGeneration += 1;
    destroyTvSafeMultiviewPlayers();
    const layer = document.querySelector('[data-tv-safe-multiview]');
    if (layer?.contains(document.fullscreenElement || document.webkitFullscreenElement)) {
      try {
        const exitResult = typeof document.exitFullscreen === 'function'
          ? document.exitFullscreen()
          : document.webkitExitFullscreen?.();
        Promise.resolve(exitResult).catch(() => {});
      } catch {}
    }
    tvSafeExtras.fullscreenFallback = false;
    document.body.classList.remove('noctra-tv-multiview-open', 'noctra-tv-multiview-fullscreen-fallback');
    if (layer) layer.remove();
    restoreTvSafeMainPlayback();
    tvSafeExtrasPanel()?.querySelector('[data-tv-safe-tools-launcher]')?.focus();
    refreshTvSafeToolsMenu();
  }

  function updateTvSafeMultiviewLayout() {
    const layer = document.querySelector('[data-tv-safe-multiview]');
    if (!layer) return;
    const count = tvSafeExtras.slots.length;
    const geometry = tvSafeMultiviewGeometry(count);
    layer.dataset.count = String(count);
    layer.style.setProperty('--tv-safe-multi-touch-rows', String(Math.ceil(count / 2)));
    layer.dataset.dense = String(count >= 10);
    layer.dataset.ultraDense = String(count >= 17);
    layer.style.setProperty('--tv-safe-multi-cols', String(geometry.columns));
    layer.style.setProperty('--tv-safe-multi-rows', String(geometry.rows));
    layer.style.setProperty('--tv-focus-rows', String(Math.max(1, count - 1)));
    if (!tvSafeExtras.slots.some(slot => slot.id === layer.dataset.focusedTile)) layer.dataset.focusedTile = '';
    layer.querySelector('.noctra-tv-safe-multi-title > strong').textContent = count + ' chaînes simultanées';
    const webCount = tvSafeExtras.slots.filter(slot => slot.playbackType === 'embed').length;
    layer.querySelector('.noctra-tv-safe-multi-title > small').textContent = webCount
      ? 'Son des lecteurs web à gérer séparément · sélectionnez le son d’un flux direct'
      : 'Une seule sortie audio · touchez le haut-parleur d’une case';
    window.requestAnimationFrame(() => layer._noctraPositionHandles?.());
    refreshTvSafeMultiQuality();
  }

  function removeTvSafeMultiviewSlot(id) {
    const key = String(id || '');
    tvSafeExtras.multiControllers.get(key)?.abort();
    tvSafeExtras.multiControllers.delete(key);
    const instance = tvSafeExtras.hls.get(key);
    try { instance?.destroy?.(); } catch {}
    tvSafeExtras.hls.delete(key);
    const tile = [...document.querySelectorAll('[data-tv-safe-multi-tile]')].find(node => node.dataset.tvSafeMultiTile === key);
    const video = tile?.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    const frame = tile?.querySelector('iframe');
    if (frame) frame.src = 'about:blank';
    tile?.remove();
    tvSafeExtras.slots = tvSafeExtras.slots.filter(slot => slot.id !== key);
    if (tvSafeExtras.audioId === key) tvSafeExtras.audioId = '';
    if (tvSafeExtras.multiOpen) {
      if (tvSafeExtras.slots.length >= 2) updateTvSafeMultiviewLayout();
      else closeTvSafeMultiview();
    }
    refreshTvSafeToolsMenu();
  }

  function setTvSafeMultiviewAudio(id) {
    const requested = String(id || '');
    const requestedTile = [...document.querySelectorAll('[data-tv-safe-multi-tile]')].find(tile => tile.dataset.tvSafeMultiTile === requested);
    const external = requestedTile?.querySelector('[data-tv-safe-multi-frame]');
    if (external && !setTvSafeExternalAudio(external, tvSafeExtras.audioId === requested)) {
      requestedTile.dataset.controlsVisible = 'true';
      toast('Ce lecteur externe ne permet pas à Noctra de régler son son. Utilise son haut-parleur dans la vidéo.');
      external.focus();
      return;
    }
    tvSafeExtras.audioId = tvSafeExtras.audioId === requested ? '' : requested;
    document.querySelectorAll('[data-tv-safe-multi-tile]').forEach(tile => {
      const active = tile.dataset.tvSafeMultiTile === tvSafeExtras.audioId;
      const video = tile.querySelector('[data-tv-safe-multi-video]');
      if (video) {
        video.muted = !active;
        if (active && video.paused) void video.play().catch(() => undefined);
      }
      const frame = tile.querySelector('[data-tv-safe-multi-frame]');
      const controlled = !frame || setTvSafeExternalAudio(frame, !active);
      const button = tile.querySelector('[data-tv-safe-multi-audio]');
      if (button && !button.disabled && controlled) {
        button.innerHTML = active ? icons.volume : icons.muted;
        button.setAttribute('aria-pressed',String(active));
        button.setAttribute('aria-label',active ? 'Couper le son' : 'Activer le son');
      }
      tile.dataset.audio = String(active);
    });
  }

  function setTvSafeExternalAudio(frame, muted, depth = 0, volume = null) {
    // Only report success after changing actual media. Cross-origin players
    // without a public audio API cannot be controlled from the parent page.
    if (!frame || depth > 4) return false;
    try {
      const doc = frame.contentDocument;
      if (!doc) return false;
      let changed = false;
      doc.querySelectorAll('video,audio').forEach(media => { media.muted = muted; if (volume !== null) media.volume = volume; changed = true; });
      doc.querySelectorAll('iframe').forEach(child => { changed = setTvSafeExternalAudio(child, muted, depth + 1, volume) || changed; });
      return changed;
    } catch { return false; }
  }

  function bindTvSafeMultiviewChrome(layer) {
    const bind = (owner, attribute) => {
      const toggle = () => { owner.dataset[attribute] = String(owner.dataset[attribute] !== 'true'); };
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'noctra-multi-chrome-handle';
      handle.textContent = attribute === 'headerVisible' ? '⌄ Outils Multiview' : '⋯';
      handle.dataset.chromeScope = attribute === 'headerVisible' ? 'group' : 'tile';
      handle.title = 'Double-clic : afficher ou masquer les commandes';
      handle.setAttribute('aria-label', 'Afficher ou masquer les commandes (double-clic)');
      handle.addEventListener('dblclick', event => { event.stopPropagation(); toggle(); });
      handle.addEventListener('pointerup', event => { if (event.pointerType === 'touch' || event.pointerType === 'pen') { event.preventDefault(); toggle(); } });
      handle.addEventListener('click', event => { if (event.detail === 0) toggle(); });
      owner.appendChild(handle);
      owner.addEventListener('dblclick', event => {
        if (event.target.closest('button,input,select,a,footer,header')) return;
        event.stopPropagation(); toggle();
      });
      owner.addEventListener('keydown', event => {
        if (event.key === 'Escape') { delete owner.dataset[attribute]; }
      });
    };
    const positionHandles = () => {
      const bounds = layer.getBoundingClientRect();
      layer.querySelectorAll('[data-tv-safe-multi-tile]').forEach(tile => {
        const rect = tile.getBoundingClientRect();
        const side = rect.left + rect.width / 2 < bounds.left + bounds.width / 2 ? 'left' : 'right';
        tile.dataset.controlsSide = side;
        const handle = tile.querySelector(':scope > .noctra-multi-chrome-handle');
        if (handle) { handle.style.setProperty('left', side === 'left' ? '0px' : 'auto', 'important'); handle.style.setProperty('right', side === 'right' ? '0px' : 'auto', 'important'); }

      });
    };
    layer._noctraPositionHandles = positionHandles;
    window.requestAnimationFrame(positionHandles);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(positionHandles);
      observer.observe(layer);
      layer.querySelectorAll('[data-tv-safe-multi-tile]').forEach(tile => observer.observe(tile));
      layer._noctraResizeObserver = observer;
      positionHandles();
    }
    bind(layer, 'headerVisible');
    layer.querySelectorAll('[data-tv-safe-multi-tile]').forEach(tile => {
      bind(tile, 'controlsVisible');
      const slider = tile.querySelector('[data-tv-safe-multi-volume]');
      const webFrame = tile.querySelector('[data-tv-safe-multi-frame]');
      if (webFrame) {
        const syncCapability = () => {
          let accessible = false;
          try { accessible = Boolean(webFrame.contentDocument?.querySelector('video,audio')); } catch {}
          if (slider) { slider.hidden = !accessible; slider.disabled = !accessible; }
          const audioButton = tile.querySelector('[data-tv-safe-multi-audio]');
          if (audioButton) {
            audioButton.disabled = !accessible;
            audioButton.title = accessible ? 'Son du lecteur' : 'Son à régler dans le lecteur externe';
            audioButton.setAttribute('aria-label', audioButton.title);
          }
        };
        webFrame.addEventListener('load', syncCapability);
        syncCapability();
      }
      slider?.addEventListener('input', () => {
        const volume = Math.max(0, Math.min(1, Number(slider.value) / 100));
        const video = tile.querySelector('[data-tv-safe-multi-video]');
        const frame = tile.querySelector('[data-tv-safe-multi-frame]');
        if (frame && !setTvSafeExternalAudio(frame, volume === 0, 0, volume)) {
          slider.value = slider.dataset.lastVolume || '100';
          if (!slider.dataset.unsupported) toast('Volume géré par le haut-parleur du lecteur externe : ce fournisseur bloque le contrôle depuis Noctra.');
          slider.dataset.unsupported = 'true';
          slider.setAttribute('aria-label', 'Volume non accessible : utiliser le lecteur externe');
          return;
        }
        if (video) video.volume = volume;
        if (volume > 0 && tvSafeExtras.audioId !== tile.dataset.tvSafeMultiTile) setTvSafeMultiviewAudio(tile.dataset.tvSafeMultiTile);
        if (volume === 0 && tvSafeExtras.audioId === tile.dataset.tvSafeMultiTile) setTvSafeMultiviewAudio(tile.dataset.tvSafeMultiTile);
        slider.dataset.lastVolume = slider.value;
        slider.setAttribute('aria-valuetext', slider.value + ' %');
      });
    });
  }

  function retryTvSafeMultiviewSlot(id) {
    const slot = tvSafeExtras.slots.find(item => item.id === String(id));
    if (!slot || !tvSafeExtras.multiOpen) return;
    const tile = [...document.querySelectorAll('[data-tv-safe-multi-tile]')].find(node => node.dataset.tvSafeMultiTile === slot.id);
    const video = tile?.querySelector('video');
    const status = tile?.querySelector('[data-tv-safe-multi-status]');
    if (video && status?.dataset.state === 'idle') {
      void video.play().catch(() => toast('Lecture refusée par le navigateur. Réessayez après avoir coupé le son.'));
      return;
    }
    tvSafeExtras.multiControllers.get(slot.id)?.abort();
    tvSafeExtras.hls.get(slot.id)?.destroy();
    tvSafeExtras.hls.delete(slot.id);
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    void startTvSafeMultiviewStream(slot);
  }

  function tvSafeMultiTargetHeight() {
    const count = Math.max(2, tvSafeExtras.slots.length);
    if (tvSafeExtras.multiQuality !== 'stable') return Number(tvSafeExtras.multiQuality) || 0;
    if (count <= 4) return 720;
    if (count <= 9) return 540;
    if (count <= 16) return 480;
    return 360;
  }

  function applyTvSafeMultiQualityCap(hls, targetHeight = tvSafeMultiTargetHeight()) {
    if (!hls || !Array.isArray(hls.levels) || !hls.levels.length) return -1;
    if (!targetHeight) { hls.autoLevelCapping = -1; return -1; }
    const rows = hls.levels.map((level, index) => ({ index, height: Number(level?.height || 0), bitrate: Number(level?.bitrate || 0) }));
    const eligible = rows.filter(row => row.height > 0 && row.height <= targetHeight).sort((a,b) => (b.height-a.height) || (b.bitrate-a.bitrate));
    const fallback = rows.filter(row => row.height > 0).sort((a,b) => (a.height-b.height) || (a.bitrate-b.bitrate))[0];
    const chosen = eligible[0] || fallback;
    hls.autoLevelCapping = chosen ? chosen.index : -1;
    return chosen?.height || -1;
  }

  function refreshTvSafeMultiQuality() {
    for (const hls of tvSafeExtras.hls.values()) applyTvSafeMultiQualityCap(hls);
    for (const player of tvSafeExtras.shaka.values()) applyTvSafeShakaQuality(player);
    document.querySelectorAll('[data-tv-safe-multi-quality-label]').forEach(node => {
      node.textContent = tvSafeExtras.multiQuality === 'stable' ? `Auto stable · ${tvSafeMultiTargetHeight()}p max` : (tvSafeExtras.multiQuality === '0' ? 'Auto · sans limite' : `${tvSafeExtras.multiQuality}p max`);
    });
  }

  function tvSafeMultiStartupGoal() {
    const count = Math.max(2, tvSafeExtras.slots.length);
    if (count <= 4) return 8;
    if (count <= 9) return 6;
    return 4;
  }

  function applyTvSafeShakaQuality(player) {
    const height = tvSafeMultiTargetHeight();
    const heights = player.getVariantTracks().map(track => Number(track.height || 0)).filter(Boolean);
    // Do not exclude every track when a provider only offers a high resolution.
    const maximum = height ? Math.max(height, heights.length ? Math.min(...heights) : height) : Infinity;
    player.configure({ abr: { restrictions: { maxHeight: maximum } } });
  }

  function installTvShakaContinuity(player, video, signal, initialGoal, onAdjust = () => {}) {
    // Count short, real starvation events too, but never startup, seeks or pauses.
    // Shaka owns buffering; no extra pause/play loop or parallel recovery timer.
    let started = false;
    let since = null;
    let goal = initialGoal;
    const stalls = [];
    const playing = () => { started = true; };
    const reset = () => { since = null; };
    const buffering = event => {
      if (signal.aborted) return;
      const now = performance.now();
      while (stalls.length && now - stalls[0] > 90000) stalls.shift();
      if (!started || video.paused || video.seeking) return reset();
      if (event.buffering) {
        if (since === null) since = now;
      } else if (since !== null) {
        if (now - since >= 250) stalls.push(now);
        since = null;
        // Apply after recovery, so the current stall is not prolonged mid-load.
        const nextGoal = stalls.length >= 2 ? Math.min(12, initialGoal + stalls.length * 3) : initialGoal;
        if (nextGoal !== goal) {
          goal = nextGoal;
          player.configure({ streaming: { rebufferingGoal: goal } });
          onAdjust(goal);
        }
      }
    };
    video.addEventListener('playing', playing, { signal });
    video.addEventListener('pause', reset, { signal });
    video.addEventListener('seeking', reset, { signal });
    player.addEventListener('buffering', buffering);
    signal.addEventListener('abort', () => player.removeEventListener('buffering', buffering), { once: true });
  }

  function tvSafeBufferedAhead(video) {
    try {
      const ranges = video?.buffered;
      if (!ranges?.length) return 0;
      const now = Number(video.currentTime || 0);
      for (let index = 0; index < ranges.length; index += 1) {
        const start = ranges.start(index);
        const end = ranges.end(index);
        if (now >= start - .25 && now <= end + .25) return Math.max(0, end - Math.max(start, now));
      }
      const last = ranges.length - 1;
      return Math.max(0, ranges.end(last) - ranges.start(last));
    } catch {
      return 0;
    }
  }

  function lowerTvSafeMultiCap(hls, tile) {
    if (tvSafeExtras.multiQuality !== 'stable' || !Array.isArray(hls?.levels) || hls.levels.length < 2) return false;
    const rows = hls.levels
      .map((level, index) => ({ index, height: Number(level?.height || 0), bitrate: Number(level?.bitrate || 0) }))
      .filter(row => row.height > 0)
      .sort((a, b) => (b.height - a.height) || (b.bitrate - a.bitrate));
    if (rows.length < 2) return false;
    const currentIndex = Number(hls.autoLevelCapping);
    const currentLevel = hls.levels?.[currentIndex >= 0 ? currentIndex : Number(hls.currentLevel)];
    const currentHeight = Number(currentLevel?.height || rows[0].height);
    const lower = rows.find(row => row.height < currentHeight);
    if (!lower) return false;
    hls.autoLevelCapping = lower.index;
    const badge = tile?.querySelector('[data-tv-safe-multi-quality-badge]');
    if (badge) badge.textContent = `${lower.height}p stable`;
    return true;
  }

  async function startTvSafeMultiviewStream(slot) {
    const tile = [...document.querySelectorAll('[data-tv-safe-multi-tile]')]
      .find(node => node.dataset.tvSafeMultiTile === slot.id);
    const video = tile?.querySelector('[data-tv-safe-multi-video]');
    const frame = tile?.querySelector('[data-tv-safe-multi-frame]');
    const status = tile?.querySelector('[data-tv-safe-multi-status]');
    const generation = tvSafeExtras.multiGeneration;
    const controller = new AbortController();
    tvSafeExtras.multiControllers.get(slot.id)?.abort();
    tvSafeExtras.multiControllers.set(slot.id, controller);
    const active = () => !controller.signal.aborted && tile?.isConnected && tvSafeExtras.multiOpen && generation === tvSafeExtras.multiGeneration;
    const previousCleanup = tvSafeExtras.shakaCleanup.get(slot.id);
    if (previousCleanup) await previousCleanup;
    if (!active()) return;
    const listen = (node,event,handler,options = {}) => node?.addEventListener(event,handler,{...options,signal:controller.signal});
    const later = (handler,delay) => {
      const timer = window.setTimeout(() => { if (active()) handler(); },delay);
      controller.signal.addEventListener('abort', () => window.clearTimeout(timer), {once:true});
      return timer;
    };
    const mark = (text, state = '') => {
      if (!active()) return;
      if (status) { status.textContent = text; status.dataset.state = state; }
      const button = tile?.querySelector('[data-tv-safe-multi-retry]');
      if (button) { button.hidden = !['idle','error'].includes(state); button.textContent = state === 'idle' ? 'Lire' : 'Réessayer'; }
    };
    if (slot.playbackType === 'embed') {
      if (!frame || !slot.embedUrl) return mark('Lecteur web indisponible', 'error');
      // Apply the same provider policy as the single player. A blanket opaque
      // sandbox here changed the origin seen by external players in Multiview.
      configureTvIframe(frame, { provider: slot.provider, embedUrl: slot.embedUrl });
      frame.referrerPolicy = slot.liveWatchDocsEmbed ? 'no-referrer' : 'strict-origin-when-cross-origin';
      listen(frame,'load', () => mark('Lecteur externe · intégration selon le fournisseur', 'web'), { once: true });
      listen(frame,'error', () => mark('Intégration refusée', 'error'), { once: true });
      frame.src = slot.embedUrl;
      mark('Ouverture du lecteur web…', 'loading');
      return;
    }
    if (!video || !slot.streamUrl) return mark('Flux direct indisponible', 'error');
    if (slot.resolveUrl) {
      mark('Actualisation du flux…', 'loading');
      try {
        const result = await api(slot.resolveUrl, { timeoutMs: 55_000, signal: controller.signal });
        if (!active()) return;
        const fresh = (Array.isArray(result?.options) ? result.options : [result]).find(option => option?.streamUrl && !option.manualOnly);
        if (!fresh) return mark('Source indisponible · réessayez', 'error');
        slot.streamUrl = fresh.streamUrl;
      } catch { return mark('Connexion impossible · réessayez', 'error'); }
    }
    video.muted = tvSafeExtras.audioId !== slot.id;
    video.playsInline = true;
    video.preload = 'auto';
    // En Multiview, HLS.js décide lui-même quand démarrer après prébuffer.
    // L'attribut autoplay du markup ne doit pas court-circuiter cette marge.
    video.autoplay = false;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    listen(video,'playing', () => mark('En direct', 'playing'));
    listen(video,'error', () => mark('Flux interrompu', 'error'));
    if (tvEnginePreference === 'shaka') {
      let player;
      try {
        mark('Shaka · chargement…', 'loading');
        const engine = await ensureShakaLibrary();
        if (!active()) return;
        engine.polyfill.installAll();
        if (!engine.Player.isBrowserSupported()) throw new Error('Navigateur non compatible');
        player = new engine.Player();
        tvSafeExtras.shaka.set(slot.id, player);
        controller.signal.addEventListener('abort', () => {
          if (tvSafeExtras.shaka.get(slot.id) === player) tvSafeExtras.shaka.delete(slot.id);
          const cleanup = player.destroy().catch(() => undefined);
          tvSafeExtras.shakaCleanup.set(slot.id, cleanup);
          void cleanup.then(() => {
            if (tvSafeExtras.shakaCleanup.get(slot.id) === cleanup) tvSafeExtras.shakaCleanup.delete(slot.id);
          });
        }, { once: true });
        const deadline = later(() => {
          mark('Shaka · chargement expiré · réessayez', 'error');
          controller.abort();
        }, 60000);
        listen(video, 'playing', () => window.clearTimeout(deadline), { once: true });
        const count = Math.max(2, tvSafeExtras.slots.length);
        player.configure({
          streaming: { bufferingGoal: count <= 4 ? 36 : 24, rebufferingGoal: 4, bufferBehind: 6,
            segmentPrefetchLimit: 1, lowLatencyMode: false, maxDisabledTime: 15,
            retryParameters: { maxAttempts: 5, baseDelay: 500, backoffFactor: 1.5, timeout: 45000, stallTimeout: 10000, connectionTimeout: 10000 } },
          manifest: { defaultPresentationDelay: 30, hls: { ignoreManifestProgramDateTime: true },
            retryParameters: { maxAttempts: 4, baseDelay: 500, backoffFactor: 1.5, timeout: 20000, stallTimeout: 8000, connectionTimeout: 10000 } },
          abr: { enabled: true, defaultBandwidthEstimate: Math.max(300000, Math.floor(2000000 / count)) }
        });
        listen(player, 'trackschanged', () => applyTvSafeShakaQuality(player));
        installTvShakaContinuity(player, video, controller.signal, 4);
        listen(player, 'buffering', event => mark(event.buffering ? 'Shaka · mise en mémoire…' : 'En direct', event.buffering ? 'loading' : 'playing'));
        listen(player, 'error', event => {
          if (event.detail?.severity === 2) mark(`Shaka · erreur ${event.detail.code} · réessayez`, 'error');
        });
        await player.attach(video);
        if (!active()) return;
        await player.load(slot.streamUrl, undefined, 'application/x-mpegurl');
        if (!active()) return;
        applyTvSafeShakaQuality(player);
        await video.play().catch(() => mark('Touchez pour lire', 'idle'));
      } catch {
        if (active()) {
          mark('Shaka indisponible · réessayez ou choisissez HLS.js', 'error');
          controller.abort();
        }
      }
      return;
    }
    // iPhone/iPad : HLS natif pour éviter de multiplier les ManagedMediaSource.
    if (tvAppleTouchDevice() && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = slot.streamUrl;
      listen(video,'playing', () => mark('En direct', 'playing'));
      listen(video,'waiting', () => mark('Mise en mémoire…', 'loading'));
      listen(video,'stalled', () => mark('Réseau lent…', 'loading'));
      video.play().then(() => mark('En direct', 'playing')).catch(() => mark('Touchez pour lire', 'idle'));
      return;
    }

    try { await ensureHlsLibrary(); } catch {}
    if (!active()) return;
    if (window.Hls?.isSupported?.()) {
      const networkProfile = tvConnectionProfile();
      const count = Math.max(2, tvSafeExtras.slots.length);
      const bufferLength = count <= 4 ? 36 : count <= 9 ? 24 : 16;
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: count <= 4 ? 12 : 6,
        maxBufferSize: Math.floor(160 * 1024 * 1024 / count),
        maxBufferLength: bufferLength,
        maxMaxBufferLength: bufferLength + 12,
        maxBufferHole: .5,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 10,
        abrBandWidthFactor: .72,
        abrBandWidthUpFactor: .55,
        maxStarvationDelay: 8,
        maxLoadingDelay: 8,
        manifestLoadingTimeOut: 28_000,
        levelLoadingTimeOut: 28_000,
        fragLoadingTimeOut: 38_000,
        capLevelToPlayerSize: true,
        startLevel: 0,
        abrEwmaDefaultEstimate: networkProfile.weak ? 600_000 : Math.max(600_000, Math.floor(6_000_000 / count))
      });
      hls._noctraMultiNetworkRecoveries = 0;
      hls._noctraMultiMediaRecoveries = 0;
      hls._noctraMultiStalls = 0;
      hls._noctraMultiLastStall = 0;
      hls._noctraMultiLastDowngrade = 0;
      tvSafeExtras.hls.set(slot.id, hls);
      hls.on(window.Hls.Events.DESTROYING || 'hlsDestroying', () => controller.abort());

      let started = false;
      let startupExpired = false;
      let fallbackStartTimer = 0;
      const startWhenReady = (force = false) => {
        if (started || startupExpired || !active()) return;
        const ahead = tvSafeBufferedAhead(video);
        if (ahead < (force ? Math.min(4, tvSafeMultiStartupGoal()) : tvSafeMultiStartupGoal())) {
          mark(`Préchargement ${Math.max(0, Math.floor(ahead))}s…`, 'loading');
          if (force) fallbackStartTimer = later(() => startWhenReady(true), 4000);
          return;
        }
        // Use the downloaded range, including when the initial playhead lies outside it.
        try {
          const ranges = video.buffered;
          const index = ranges.length - 1;
          if (index >= 0 && (video.currentTime < ranges.start(index) || ranges.end(index) - video.currentTime < 3)) {
            video.currentTime = ranges.start(index) + .1;
          }
        } catch {}
        started = true;
        window.clearTimeout(fallbackStartTimer);
        video.play().then(() => mark('En direct', 'playing')).catch(() => mark('Touchez pour lire', 'idle'));
      };

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        const capped = applyTvSafeMultiQualityCap(hls);
        const badge = tile?.querySelector('[data-tv-safe-multi-quality-badge]');
        if (badge) badge.textContent = capped > 0 ? `${capped}p max` : 'Auto';
        mark('Préchargement…', 'loading');
        fallbackStartTimer = later(() => startWhenReady(true), 10_000);
      });
      hls.on(window.Hls.Events.FRAG_BUFFERED, () => startWhenReady(false));
      later(() => {
        if (!started) {
          startupExpired = true;
          window.clearTimeout(fallbackStartTimer);
          hls.stopLoad();
          mark('Démarrage trop lent · réessayez', 'error');
        }
      }, 90_000);
      hls.on(window.Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls.levels?.[Number(data?.level)];
        const badge = tile?.querySelector('[data-tv-safe-multi-quality-badge]');
        if (badge && level?.height && !/stable$/i.test(badge.textContent || '')) badge.textContent = `${level.height}p`;
      });
      const onWaiting = () => {
        mark('Mise en mémoire…', 'loading');
        const now = Date.now();
        hls._noctraMultiStalls = now - hls._noctraMultiLastStall < 35_000 ? hls._noctraMultiStalls + 1 : 1;
        hls._noctraMultiLastStall = now;
        if (hls._noctraMultiStalls >= 2 && now - hls._noctraMultiLastDowngrade > 25_000) {
          if (lowerTvSafeMultiCap(hls, tile)) {
            hls._noctraMultiLastDowngrade = now;
            hls._noctraMultiStalls = 0;
            mark('Qualité réduite pour stabiliser…', 'loading');
          }
        }
      };
      listen(video,'waiting', onWaiting);
      listen(video,'stalled', onWaiting);
      listen(video,'playing', () => mark('En direct', 'playing'));
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && hls._noctraMultiNetworkRecoveries < 3) {
          hls._noctraMultiNetworkRecoveries += 1;
          mark('Reconnexion au même flux…', 'loading');
          later(() => { try { if (/^manifest/i.test(data.details || '')) hls.loadSource(slot.streamUrl); else hls.startLoad(); } catch {} }, Math.min(1800, 450 * hls._noctraMultiNetworkRecoveries));
          return;
        }
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && hls._noctraMultiMediaRecoveries < 2) {
          hls._noctraMultiMediaRecoveries += 1;
          mark('Récupération du média…', 'loading');
          try { hls.recoverMediaError(); } catch {}
          return;
        }
        mark('Flux interrompu', 'error');
      });
      hls.loadSource(slot.streamUrl);
      hls.attachMedia(video);
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = slot.streamUrl;
      video.play().then(() => mark('En direct', 'playing')).catch(() => mark('Touchez pour lire', 'idle'));
      return;
    }
    mark('Non compatible', 'error');
  }


  function tvSafeMultiviewGeometry(count) {
    const safeCount = Math.max(2, Math.min(TV_SAFE_MULTI_MAX, Number(count) || 2));
    const columns = safeCount <= 4 ? 2 : safeCount <= 9 ? 3 : safeCount <= 16 ? 4 : 5;
    const rows = Math.ceil(safeCount / columns);
    const mobileColumns = safeCount === 2 ? 1 : 2;
    return { columns, rows, mobileColumns };
  }

  function renderTvSafeMultiview() {
    if (tvSafeExtras.slots.length < 2) return toast('Ajoute au moins deux chaînes au multiview.');
    closeTvSafeToolsMenu();
    destroyTvSafeMultiviewPlayers();
    document.querySelector('[data-tv-safe-multiview]')?._noctraResizeObserver?.disconnect();
    document.querySelector('[data-tv-safe-multiview]')?.remove();

    suspendTvSafeMainPlaybackForMulti();
    document.body.classList.add('noctra-tv-multiview-open');

    const slots = tvSafeExtras.slots.slice(0, TV_SAFE_MULTI_MAX);
    const geometry = tvSafeMultiviewGeometry(slots.length);
    const generation = ++tvSafeExtras.multiGeneration;
    const layer = document.createElement('section');
    layer.className = 'noctra-tv-safe-multiview';
    layer.dataset.tvSafeMultiview = 'true';
    layer.dataset.count = String(slots.length);
    layer.style.setProperty('--tv-safe-multi-touch-rows', String(Math.ceil(slots.length / 2)));
    layer.dataset.dense = String(slots.length >= 10);
    layer.dataset.ultraDense = String(slots.length >= 17);
    layer.style.setProperty('--tv-safe-multi-cols', String(geometry.columns));
    layer.style.setProperty('--tv-safe-multi-rows', String(geometry.rows));
    layer.style.setProperty('--tv-safe-multi-mobile-cols', String(geometry.mobileColumns));
    const directCount = slots.filter(slot => slot.playbackType === 'stream').length;
    const webCount = slots.length - directCount;
    layer.innerHTML = `<header><div class="noctra-tv-safe-multi-title"><p class="noctra-eyebrow">NOCTRA MULTIVIEW</p><strong>${slots.length} chaînes simultanées</strong><small>${directCount} direct${directCount > 1 ? 's' : ''}${webCount ? ` · ${webCount} lecteur${webCount > 1 ? 's' : ''} web` : ''} · une seule sortie audio directe</small></div><div class="noctra-tv-safe-multi-controls"><label><span>Qualité multi</span><select data-tv-safe-multi-quality aria-label="Qualité multiview"><option value="stable" ${tvSafeExtras.multiQuality === 'stable' ? 'selected' : ''}>Auto stable</option><option value="0" ${tvSafeExtras.multiQuality === '0' ? 'selected' : ''}>Auto sans limite</option><option value="1080" ${tvSafeExtras.multiQuality === '1080' ? 'selected' : ''}>1080p max</option><option value="720" ${tvSafeExtras.multiQuality === '720' ? 'selected' : ''}>720p max</option><option value="480" ${tvSafeExtras.multiQuality === '480' ? 'selected' : ''}>480p max</option><option value="360" ${tvSafeExtras.multiQuality === '360' ? 'selected' : ''}>360p max</option></select></label><span data-tv-safe-multi-quality-label>${tvSafeExtras.multiQuality === 'stable' ? `Auto stable · ${tvSafeMultiTargetHeight()}p max` : (tvSafeExtras.multiQuality === '0' ? 'Auto · sans limite' : `${tvSafeExtras.multiQuality}p max`)}</span><button type="button" class="noctra-tv-safe-multi-fullscreen" data-tv-safe-multi-fullscreen aria-label="Plein écran Multiview" title="Plein écran Multiview">${icons.fullscreen}</button><button type="button" data-tv-safe-multi-close aria-label="Fermer" title="Fermer">×</button></div></header>
      <div class="noctra-tv-safe-multiview-grid">${slots.map(slot => `<article data-tv-safe-multi-tile="${escapeHtml(slot.id)}" data-tv-safe-multi-kind="${escapeHtml(slot.playbackType || 'stream')}"><div class="noctra-tv-safe-multi-screen">${slot.playbackType === 'embed' ? '<iframe data-tv-safe-multi-frame title="Lecteur TV multiview" loading="eager" allowfullscreen></iframe>' : '<video data-tv-safe-multi-video muted playsinline webkit-playsinline preload="metadata"></video>'}<button type="button" class="noctra-multi-retry" data-tv-safe-multi-retry="${escapeHtml(slot.id)}" hidden>Réessayer</button><div class="noctra-tv-safe-multi-overlay"><span data-tv-safe-multi-status data-state="loading">Connexion…</span><b data-tv-safe-multi-quality-badge>${slot.playbackType === 'embed' ? 'WEB' : 'Auto'}</b></div></div><footer><div>${slot.playbackType === 'embed' && /^(https?:|\/)/.test(slot.embedUrl || '') ? `<a href="${escapeHtml(slot.embedUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir le lecteur externe ↗</a>` : ''}<strong>${escapeHtml(slot.name)}</strong><small>${escapeHtml([slot.provider, slot.group].filter(Boolean).join(' · '))}</small></div><div><button type="button" data-tv-safe-multi-focus="${escapeHtml(slot.id)}" aria-label="Mettre en avant ${escapeHtml(slot.name)}" title="Mettre en avant" aria-pressed="false">☆</button><button type="button" data-tv-safe-multi-tile-fullscreen="${escapeHtml(slot.id)}" aria-label="Plein écran ${escapeHtml(slot.name)}" title="Plein écran du lecteur">${icons.fullscreen}</button><button type="button" data-tv-safe-multi-audio="${escapeHtml(slot.id)}" aria-label="Activer le son" aria-pressed="false" ${slot.playbackType === 'embed' ? 'title="Essayer de contrôler le son du lecteur externe"' : ''}>${icons.muted}</button><input type="range" data-tv-safe-multi-volume min="0" max="100" step="1" value="100" aria-label="Volume ${escapeHtml(slot.name)}" title="Volume"><button type="button" data-tv-safe-multi-remove="${escapeHtml(slot.id)}" aria-label="Retirer">×</button></div></footer></article>`).join('')}</div>`;
    document.body.appendChild(layer);
    bindTvSafeMultiviewChrome(layer);
    tvSafeExtras.multiOpen = true;
    tvSafeExtras.audioId = '';
    layer.setAttribute('role','dialog');
    layer.setAttribute('aria-modal','true');
    layer.setAttribute('aria-label','Multiview');
    updateTvSafeMultiviewLayout();
    layer.querySelector('[data-tv-safe-multi-close]')?.focus();
    // Évite de lancer jusqu'à 25 connexions HLS exactement dans la même frame.
    slots.forEach((slot, index) => {
      window.setTimeout(() => {
        if (!tvSafeExtras.multiOpen || tvSafeExtras.multiGeneration !== generation) return;
        void startTvSafeMultiviewStream(slot);
      }, Math.min(index * 260, 5200));
    });
  }

  function destroyTvSafeExtras() {
    closeTvSafeToolsMenu();
    closeTvSafeMultiview();
    tvSafeExtrasPanel()?.removeAttribute('data-tv-safe-theater');
    tvSafeExtras.theater = false;
    tvSafeExtras.slots = [];
    tvSafeExtras.audioId = '';
    const menu = document.querySelector('[data-tv-safe-tools-menu]');
    if (menu) menu.remove();
  }


  async function playTvDirectStream(channel, rawStreamUrl, statusLabel = '', playbackSequence = tvPlaybackSequence, optionIndex = -1, engineOverride = '') {
    const video = document.querySelector('#noctra-tv-video');
    const frame = document.querySelector('#noctra-tv-embed');
    frame?.closest('.noctra-tv-screen')?.removeAttribute('data-tv-web-page');
    frame?.closest('.noctra-tv-screen')?.querySelector('[data-tv-provider-notice]')?.remove();
    if (!video || playbackSequence !== tvPlaybackSequence) return;
    try { tvVideoEventsController?.abort?.(); } catch {}
    try { tvHls?.destroy?.(); } catch {}
    tvHls = null;
    tvVideoEventsController = new AbortController();
    const startSignal = tvVideoEventsController.signal;
    await tvShakaCleanup;
    if (startSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
    tvDirectRestart = () => {
      if (startSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
      return playTvDirectStream(channel, rawStreamUrl, statusLabel, playbackSequence, optionIndex);
    };
    window.clearTimeout(tvWaitingStatusTimer);
    tvWaitingStatusTimer = 0;
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    video.removeAttribute('crossorigin');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.load?.();
    if (frame) {
      frame.src = 'about:blank';
      frame.hidden = true;
    }
    video.hidden = false;
    const placeholder = video.parentElement?.querySelector('.noctra-tv-placeholder');
    if (placeholder) placeholder.hidden = true;
    const source = String(rawStreamUrl || '');
    if (!source) {
      setTvPlaybackStatus('Aucun flux lisible', 'error');
      if (placeholder) {
        placeholder.hidden = false;
        placeholder.querySelector('strong').textContent = 'Flux absent';
        placeholder.querySelector('small').textContent = 'Cette entrée ne contient pas de flux vidéo compatible.';
      }
      return;
    }
    const streamUrl = /^(?:https?:)?\/\//i.test(source) || (noctraBasePath && source.startsWith(`${noctraBasePath}/`))
      ? source
      : appPath(source);
    tvState.currentPlaybackType = 'stream';
    tvState.currentStreamUrl = streamUrl;
    window.NoctraServerChoice?.track({ ...channel, sourceId: tvState.sourceId }, tvState.resolvedEmbeds?.[optionIndex], video, startSignal);
    refreshTvDesktopLiveControls();
    refreshTvLiveEdgeControl();
    updateTvCastButton({ ...channel, playbackType: 'stream' });
    refreshTvSafeToolsMenu();
    setTvPlaybackStatus(statusLabel || 'Connexion au flux direct…', 'loading');
    if (tvLiveWatchRefreshSequence !== playbackSequence) {
      tvLiveWatchRefreshSequence = playbackSequence;
      tvLiveWatchRefreshCount = 0;
      tvLiveWatchLastRefreshAt = 0;
      tvLiveWatchRecoveryInFlight = false;
    }
    const playbackProvider = String(channel?.provider || 'TV');
    // The same live source needs the same protection when opened from Favorites or Sports.
    const channelContinuity = ['channels', 'favorites'].includes(tvState.section) || tvState.catalog?.source?.section === 'channels' || /^(?:LiveWatch|NorthTV|FrameTV|OHA|FSTV|WiTV|StreamSports99)$/.test(playbackProvider);
    const channelFamilyStream = /^(?:LiveWatch|NorthTV|FrameTV|OHA|FSTV|WiTV|StreamSports99)$/i.test(playbackProvider);
    const renewableResolvedStream = Boolean(channel?.resolverUrl)
      && Boolean(channel?.vipPlayback || channelFamilyStream || /^(?:RénéVéo|Northlive|Movix|FCTV33)$/i.test(playbackProvider));
    const bufferedResolvedStream = Boolean(channel?.vipPlayback) || /^(?:RénéVéo|Northlive|Movix|FCTV33)$/i.test(String(channel?.provider || ''))
      || channelFamilyStream || channelContinuity;
    const stabilitySensitiveStream = /^(?:LiveWatch|NorthTV|FrameTV|OHA|WiTV|StreamSports99)$/i.test(playbackProvider);
    const conservativePublicStream = /^(?:FSTV|WiTV)$/i.test(playbackProvider);
    recordTvDiagnostic('direct-stream-ready', {
      elapsedMs: tvPlaybackElapsedMs(),
      provider: playbackProvider,
      renewable: renewableResolvedStream,
      buffered: bufferedResolvedStream
    });
    const appleTouch = tvAppleTouchDevice();
    // Les segments NorthTV sont sensiblement plus gros que ceux de FrameTV.
    // WebKit natif peut commencer à les décoder pendant leur téléchargement,
    // alors que ManagedMediaSource attend davantage avant le premier rendu.
    const appleNativeFirst = appleTouch && /^NorthTV$/i.test(playbackProvider);
    const iosHlsJsPreferred = appleTouch
      && !appleNativeFirst
      && (Boolean(channel?.vipPlayback) || /^(?:LiveWatch|OHA)$/i.test(playbackProvider));
    let nativeFallbackStarted = false;
    let appleNativeHlsJsFallbackStarted = false;
    let startAppleNativeHlsJsFallback = () => false;
    let providerFallbackStarted = false;
    let providerFallbackTimer = 0;
    let playbackBecameActive = false;
    let playbackNeedsGesture = false;
    let firstPlayingRecorded = false;
    let waitingHistory = [];
    let waitingEpisodeActive = false;
    let waitingPosition = 0;
    let lastWaitingEpisodeAt = 0;
    let latestPlaylistDetails = null;
    let activeFragment = null;
    let startupLastProgressAt = 0;
    const startupAttemptAt = Date.now();
    let stallRecoveries = 0;
    let adaptiveRebuffering = false;
    let adaptiveRebufferTimer = 0;
    let adaptiveRebufferStartedAt = 0;
    let adaptiveRebufferCycles = 0;
    const adaptiveRebufferGoal = () => {
      const profile = tvConnectionProfile();
      const base = channelContinuity ? (profile.weak ? 24 : 20) : stabilitySensitiveStream
        ? (profile.weak ? 20 : 16)
        : conservativePublicStream
          ? (profile.weak ? 12 : 10)
          : (profile.weak ? 12 : 10);
      return tvAchievableBufferGoal(Math.min(28, base + Math.max(0, adaptiveRebufferCycles - 1) * 3), latestPlaylistDetails);
    };
    const cancelAdaptiveRebuffer = () => {
      adaptiveRebuffering = false;
      adaptiveRebufferStartedAt = 0;
      window.clearTimeout(adaptiveRebufferTimer);
      adaptiveRebufferTimer = 0;
    };
    const resumeAdaptiveRebuffer = (force = false) => {
      if (!adaptiveRebuffering || videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence || !video.isConnected) return false;
      const goal = adaptiveRebufferGoal();
      const range = tvForwardBufferedWindow(video);
      const current = Number(video.currentTime || 0);
      const ahead = Number(range?.ahead || 0);
      const elapsed = Date.now() - adaptiveRebufferStartedAt;
      const enough = Boolean(range && ahead >= goal);
      const forcedEnough = Boolean(force && range && ahead >= Math.min(goal, Math.max(6, goal * .7)) && elapsed >= 30_000);
      if (!enough && !forcedEnough) {
        window.clearTimeout(adaptiveRebufferTimer);
        adaptiveRebufferTimer = window.setTimeout(() => resumeAdaptiveRebuffer(true), 1_000);
        return false;
      }
      // Ne jamais rejouer la partie déjà regardée pour fabriquer une réserve.
      if (range.position > current) try { video.currentTime = range.position; } catch {}
      cancelAdaptiveRebuffer();
      waitingHistory = [];
      recordTvDiagnostic('adaptive-rebuffer-ready', {
        reserve: goal,
        bufferAhead: Number(tvBufferedAhead(video).toFixed(2)),
        forced: Boolean(force)
      });
      setTvPlaybackStatus(`Reprise du direct · réserve ${Math.floor(ahead)} s`, 'loading');
      void video.play().catch(error => {
        if (playbackSequence !== tvPlaybackSequence || benignTvPlayInterruption(error)) return;
        setTvPlaybackStatus('Appuie sur Lecture', 'idle');
      });
      return true;
    };
    const beginAdaptiveRebuffer = () => {
      if (adaptiveRebuffering || !tvHls || !bufferedResolvedStream || !playbackBecameActive || video.paused) return false;
      const now = Date.now();
      adaptiveRebufferCycles += 1;
      adaptiveRebuffering = true;
      adaptiveRebufferStartedAt = now;
      const goal = adaptiveRebufferGoal();
      recordTvDiagnostic('adaptive-rebuffer-start', {
        reserve: goal,
        bufferAhead: Number(tvBufferedAhead(video).toFixed(2)),
        cycle: adaptiveRebufferCycles
      });
      setTvPlaybackStatus(`Connexion ralentie · mise en mémoire de ${goal} s…`, 'loading');
      try { video.pause(); } catch {}
      adaptiveRebufferTimer = window.setTimeout(() => resumeAdaptiveRebuffer(true), 1_000);
      return true;
    };
    if (tvResolvedFallbackSequence !== playbackSequence) {
      tvResolvedFallbackSequence = playbackSequence;
      tvFailedOptionIndexes = new Set();
    }
    const videoEventSignal = tvVideoEventsController.signal;
    videoEventSignal.addEventListener('abort', () => {
      cancelAdaptiveRebuffer();
      window.clearTimeout(providerFallbackTimer);
      tvLiveWatchRecoveryInFlight = false;
    }, { once: true });
    const startResolvedOptionFallback = (reason = '') => {
      if (window.NoctraServerChoice?.isManual()) return false;
      const options = Array.isArray(tvState.resolvedEmbeds) ? tvState.resolvedEmbeds : [];
      if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence || providerFallbackStarted || options.length < 2) return false;
      if (Number.isInteger(optionIndex) && optionIndex >= 0) tvFailedOptionIndexes.add(optionIndex);
      const liveWatchFamily = /^(?:LiveWatch|NorthTV|FrameTV)$/i.test(playbackProvider);
      const candidates = options
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => index !== optionIndex
          && !tvFailedOptionIndexes.has(index)
          && !item?.manualOnly
          && Boolean(item?.streamUrl || item?.url || item?.resolveUrl));
      if (!candidates.length) return false;
      const rank = ({ item, index }) => {
        // WiTV : épuiser ses HLS avant un secours d'un autre fournisseur.
        if (/^WiTV$/i.test(playbackProvider)) {
          if (item?.providerFallback) return 10;
          if (item?.streamUrl || item?.resolveUrl) return index > optionIndex ? 0 : 1;
        }
        if (item?.streamUrl || item?.playbackType === 'stream') return index > optionIndex ? 0 : 1;
        if (item?.resolveUrl) return index > optionIndex ? 2 : 3;
        if (liveWatchFamily && item?.url && item?.officialClient && item?.vip !== false) return index > optionIndex ? 4 : 5;
        if (item?.url && !item?.fallback) return index > optionIndex ? 6 : 7;
        return index > optionIndex ? 8 : 9;
      };
      candidates.sort((left, right) => rank(left) - rank(right) || left.index - right.index);
      const alternative = candidates[0];
      if (!alternative) return false;
      providerFallbackStarted = true;
      window.clearTimeout(providerFallbackTimer);
      providerFallbackTimer = 0;
      recordTvDiagnostic('resolved-option-fallback-start', {
        provider: playbackProvider,
        optionIndex,
        fallbackIndex: alternative.index,
        reason
      });
      setTvPlaybackStatus(`${playbackProvider} · essai ${alternative.item?.label || `du serveur ${alternative.index + 1}`}…`, 'loading');
      void playTvResolvedOption(channel, alternative.item, alternative.index, playbackSequence).catch(error => {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        providerFallbackStarted = false;
        tvFailedOptionIndexes.add(alternative.index);
        if (!startResolvedOptionFallback(error?.message || 'serveur indisponible')) {
          setTvPlaybackStatus(`${playbackProvider} · aucun autre serveur compatible`, 'error');
        }
      });
      return true;
    };
    const onPlaying = () => {
      playbackNeedsGesture = false;
      waitingEpisodeActive = false;
      if (adaptiveRebuffering) cancelAdaptiveRebuffer();
      playbackBecameActive = true;
      waitingHistory = waitingHistory.filter(at => Date.now() - at < 90_000);
      window.clearTimeout(providerFallbackTimer);
      providerFallbackTimer = 0;
      window.clearTimeout(tvWaitingStatusTimer);
      tvWaitingStatusTimer = 0;
      // Après une période réellement stable, une ancienne récupération ne doit
      // pas épuiser le budget de toute la session (les URLs CDN peuvent expirer
      // plusieurs fois pendant un match de plusieurs heures).
      if (renewableResolvedStream && tvLiveWatchLastRefreshAt && Date.now() - tvLiveWatchLastRefreshAt > 25_000) {
        tvLiveWatchRefreshCount = 0;
      }
      if (playbackSequence === tvPlaybackSequence) setTvPlaybackStatus(statusLabel || 'Lecture en direct', 'playing');
      if (!firstPlayingRecorded) {
        firstPlayingRecorded = true;
        recordTvDiagnostic('first-playing', {
          elapsedMs: tvPlaybackElapsedMs(),
          engine: tvShaka ? 'shaka' : tvHls ? 'hls.js' : 'native',
          provider: playbackProvider
        });
      }
      refreshTvLiveEdgeControl();
      refreshTvDesktopLiveControls();
    };
    const onWaiting = () => {
      if (playbackSequence !== tvPlaybackSequence) return;
      const profile = tvConnectionProfile();
      const now = Date.now();
      // Shaka owns gap jumps and its live seek window. A generic buffered-range
      // jump can land beyond seekRange().end and discard the live reserve.
      if (playbackBecameActive && !tvShaka && tvSkipBufferedGap(video)) {
        setTvPlaybackStatus('Reprise du direct…', 'loading');
        recordTvDiagnostic('live-buffer-gap-skipped', { elapsedMs: tvPlaybackElapsedMs() });
        void video.play().catch(() => undefined);
        return;
      }
      waitingHistory = waitingHistory.filter(at => now - at < 90_000);
      // waiting + bufferStalledError peuvent décrire le même incident. Compter
      // uniquement une nouvelle interruption après une vraie reprise playing.
      if (!waitingEpisodeActive && playbackBecameActive) {
        // Réinitialiser après une vraie période sans coupure, pas simplement
        // trois minutes après la dernière reconstruction de réserve.
        if (lastWaitingEpisodeAt && now - lastWaitingEpisodeAt > 180_000) adaptiveRebufferCycles = 0;
        lastWaitingEpisodeAt = now;
        waitingHistory.push(now);
      }
      waitingEpisodeActive = true;
      waitingPosition = Number(video.currentTime || 0);
      const bufferAhead = tvBufferedAhead(video);
      // Les coupures espacées de 20–40 s nécessitent aussi une réserve renforcée.
      const repeatedStall = waitingHistory.length >= 3 && bufferAhead < 1.5;
      const prudentMode = !profile.desktop && profile.weak && (profile.veryWeak || repeatedStall);
      if (channelContinuity && playbackBecameActive && tvHls && repeatedStall) tvHls._noctraContinuity?.stall();
      if (!channelContinuity && profile.desktop && playbackBecameActive && tvHls && repeatedStall) {
        const activeLevel = Number(tvHls.nextAutoLevel >= 0 ? tvHls.nextAutoLevel : tvHls.currentLevel);
        if (activeLevel > 0 && tvHls.autoLevelEnabled) {
          const adaptingHls = tvHls;
          tvHls.nextAutoLevel = activeLevel - 1;
          tvHls.autoLevelCapping = activeLevel - 1;
          window.setTimeout(() => {
            if (!videoEventSignal.aborted && playbackSequence === tvPlaybackSequence && tvHls === adaptingHls && !adaptiveRebuffering) tvHls.autoLevelCapping = -1;
          }, 90_000);
        }
        recordTvDiagnostic('desktop-live-stall-adaptation', {
          bufferAhead: Number(bufferAhead.toFixed(2)),
          level: activeLevel
        });
      }
      if (repeatedStall && playbackBecameActive && adaptiveRebufferCycles >= 3
        && /^(?:LiveWatch|NorthTV|FrameTV|OHA|WiTV|StreamSports99)$/i.test(playbackProvider)
        && startResolvedOptionFallback('coupures répétées malgré la réserve de lecture')) return;
      if (repeatedStall && beginAdaptiveRebuffer()) {
        refreshTvLiveEdgeControl();
        return;
      }
      if (/^OHA$/i.test(playbackProvider) && playbackBecameActive && repeatedStall && !providerFallbackStarted && !providerFallbackTimer && optionIndex > 0) {
        const quieterServerIndex = tvState.resolvedEmbeds.findIndex((item, itemIndex) => (
          itemIndex < optionIndex && (item?.streamUrl || item?.playbackType === 'stream')
        ));
        if (quieterServerIndex >= 0) {
          providerFallbackTimer = window.setTimeout(() => {
            providerFallbackTimer = 0;
            if (playbackSequence !== tvPlaybackSequence || video.paused || video.readyState >= 3 || providerFallbackStarted) return;
            providerFallbackStarted = true;
            const alternative = tvState.resolvedEmbeds[quieterServerIndex];
            recordTvDiagnostic('oha-sustained-stall-fallback', { optionIndex, fallbackIndex: quieterServerIndex });
            setTvPlaybackStatus(`OHA · serveur irrégulier · essai ${alternative?.label || 'du serveur précédent'}…`, 'loading');
            void playTvResolvedOption(channel, alternative, quieterServerIndex, playbackSequence).catch(() => {
              if (playbackSequence === tvPlaybackSequence) setTvPlaybackStatus('OHA · serveur alternatif indisponible', 'error');
            });
          }, 35_000);
        }
      }
      setTvPlaybackStatus(!playbackBecameActive
        ? 'Préchargement du direct…'
        : prudentMode
          ? 'Mode réseau prudent · mise en mémoire…'
          : 'Mise en mémoire du direct…', 'loading');
      refreshTvLiveEdgeControl();
      window.clearTimeout(tvWaitingStatusTimer);
      tvWaitingStatusTimer = window.setTimeout(() => {
        if (playbackSequence !== tvPlaybackSequence || video.paused || video.readyState >= 3) return;
        const drift = tvLiveEdgeDrift(video);
        // Le lecteur natif iOS laisse le moteur HLS absorber les pauses réseau au
        // lieu de relancer ou déplacer la vidéo après quelques secondes. Noctra
        // n'intervient désormais que sur un retard réellement important.
        if (playbackBecameActive && !profile.weak && !bufferedResolvedStream && Number.isFinite(drift) && drift > 24) {
          if (returnTvToLiveEdge()) {
            recordTvDiagnostic('live-stall-severe-catchup', { drift: Number(drift.toFixed(2)), elapsedMs: tvPlaybackElapsedMs() });
            return;
          }
        }
        if (playbackBecameActive && tvHls) {
          if (/^StreamSports99$/i.test(playbackProvider)) {
            setTvPlaybackStatus('StreamSports99 · reprise du même serveur…', 'loading');
            try { tvHls.startLoad(-1); } catch {}
            void video.play().catch(() => undefined);
            recordTvDiagnostic('streamsports99-stall-restart', {
              drift: Number.isFinite(drift) ? Number(drift.toFixed(2)) : -1,
              elapsedMs: tvPlaybackElapsedMs()
            });
            return;
          }
          // Une attente ordinaire ne signifie pas que HLS.js a arrete son
          // chargeur. Le relancer au temps courant annule la marge accumulee.
          void video.play().catch(() => undefined);
          recordTvDiagnostic('live-stall-recovery', {
            drift: Number.isFinite(drift) ? Number(drift.toFixed(2)) : -1,
            elapsedMs: tvPlaybackElapsedMs()
          });
          return;
        }
        recordTvDiagnostic('live-stall-observed', {
          active: playbackBecameActive,
          drift: Number.isFinite(drift) ? Number(drift.toFixed(2)) : -1,
          elapsedMs: tvPlaybackElapsedMs()
        });
      }, /^StreamSports99$/i.test(playbackProvider) ? 20_000 : ((profile.weak || bufferedResolvedStream) ? 24_000 : 18_000));
    };
    const onError = () => {
      if (playbackSequence !== tvPlaybackSequence) return;
      recordTvDiagnostic('video-error', {
        active: playbackBecameActive,
        renewable: renewableResolvedStream,
        hls: Boolean(tvHls),
        code: Number(video.error?.code || 0)
      });
      if (!playbackBecameActive && startResolvedOptionFallback('erreur du flux direct')) return;
      if (!playbackBecameActive && startProviderWebFallback('erreur du flux direct')) return;
      if (appleNativeFirst && !playbackBecameActive && startAppleNativeHlsJsFallback()) return;
      // V126 : un event `error` de la balise vidéo peut précéder de quelques ms
      // la récupération HLS.js. Si LiveWatch jouait déjà, ne jamais afficher une
      // erreur terminale avant que le moteur ait tenté le renouvellement du même
      // direct Premium.
      if (renewableResolvedStream && playbackBecameActive && tvHls) {
        setTvPlaybackStatus(`${playbackProvider} · coupure détectée · récupération en cours…`, 'loading');
        recordTvDiagnostic('livewatch-video-error-recoverable', { readyState: Number(video.readyState || 0), networkState: Number(video.networkState || 0) });
        return;
      }
      if (renewableResolvedStream && playbackBecameActive && refreshResolvedStream(playbackProvider)) return;
      setTvPlaybackStatus(tvAppleTouchDevice() && /^(?:LiveWatch|OHA)$/i.test(playbackProvider)
        ? `${playbackProvider} · flux iOS indisponible · le serveur sélectionné reste actif`
        : 'Flux indisponible · le serveur sélectionné reste actif', 'error');
    };
    video.addEventListener('playing', onPlaying, { signal: videoEventSignal });
    video.addEventListener('waiting', onWaiting, { signal: videoEventSignal });
    video.addEventListener('stalled', () => {
      // stalled concerne le téléchargement ; une vidéo encore alimentée ne
      // doit pas être mise en pause ou comptée comme une nouvelle coupure.
      if (!video.paused && video.readyState >= 3 && tvBufferedAhead(video) > 2) return;
      onWaiting();
    }, { signal: videoEventSignal });
    video.addEventListener('timeupdate', () => {
      // Une reprise après une alerte HLS ne produit pas toujours « playing ».
      // Vérifier la progression réelle, pas seulement la présence de données.
      if (waitingEpisodeActive && !adaptiveRebuffering && !video.paused && !video.seeking
        && video.readyState >= 3 && Number(video.currentTime) > waitingPosition + .25) onPlaying();
      scheduleTvLiveEdgeControl();
    }, { signal: videoEventSignal });
    video.addEventListener('progress', scheduleTvLiveEdgeControl, { signal: videoEventSignal });
    video.addEventListener('seeking', scheduleTvLiveEdgeControl, { signal: videoEventSignal });
    video.addEventListener('play', refreshTvDesktopLiveControls, { signal: videoEventSignal });
    video.addEventListener('pause', refreshTvDesktopLiveControls, { signal: videoEventSignal });
    video.addEventListener('volumechange', refreshTvDesktopLiveControls, { signal: videoEventSignal });
    video.addEventListener('error', onError, { signal: videoEventSignal });
    video.addEventListener('loadedmetadata', () => {
      recordTvDiagnostic('metadata-ready', { elapsedMs: tvPlaybackElapsedMs(), engine: tvShaka ? 'shaka' : tvHls ? 'hls.js' : 'native' });
    }, { once: true, signal: videoEventSignal });
    video.addEventListener('canplay', () => {
      recordTvDiagnostic('can-play', { elapsedMs: tvPlaybackElapsedMs(), engine: tvShaka ? 'shaka' : tvHls ? 'hls.js' : 'native' });
    }, { once: true, signal: videoEventSignal });
    const screen = video.closest('.noctra-tv-screen');
    const controls = screen?.querySelector('[data-tv-desktop-live-controls]');
    for (const eventName of ['pointermove', 'pointerdown', 'touchstart']) {
      screen?.addEventListener(eventName, () => showTvDesktopLiveControls(true), { passive: true, signal: videoEventSignal });
    }
    screen?.addEventListener('keydown', () => showTvDesktopLiveControls(true), { signal: videoEventSignal });
    controls?.addEventListener('pointerenter', () => showTvDesktopLiveControls(true), { passive: true, signal: videoEventSignal });
    controls?.addEventListener('pointerleave', () => scheduleTvDesktopControlsHide(650), { passive: true, signal: videoEventSignal });
    controls?.addEventListener('focusin', () => showTvDesktopLiveControls(true), { signal: videoEventSignal });
    controls?.addEventListener('focusout', () => scheduleTvDesktopControlsHide(650), { signal: videoEventSignal });
    document.addEventListener('fullscreenchange', syncTvFullscreenUi, { signal: videoEventSignal });
    document.addEventListener('webkitfullscreenchange', syncTvFullscreenUi, { signal: videoEventSignal });

    const startNativeHls = (label = '') => {
      if (!video.canPlayType('application/vnd.apple.mpegurl')) return false;
      try { tvHls?.destroy?.(); } catch {}
      tvHls = null;
      nativeFallbackStarted = true;
      recordTvDiagnostic('native-player-started', { elapsedMs: tvPlaybackElapsedMs(), provider: playbackProvider });
      video.src = streamUrl;
      if (label) setTvPlaybackStatus(label, 'loading');
      video.play().catch(error => {
        if (playbackSequence !== tvPlaybackSequence || benignTvPlayInterruption(error)) return;
        if (error?.name === 'NotAllowedError') playbackNeedsGesture = true;
        setTvPlaybackStatus('Appuie sur Lecture', 'idle');
        if (error?.name !== 'NotAllowedError') toast(error.message || 'Le flux ne démarre pas.');
      });
      return true;
    };

    startAppleNativeHlsJsFallback = () => {
      if (!appleNativeFirst || appleNativeHlsJsFallbackStarted || playbackBecameActive) return false;
      appleNativeHlsJsFallbackStarted = true;
      setTvPlaybackStatus('NorthTV · reprise avec le lecteur HLS compatible iOS…', 'loading');
      void ensureHlsLibrary().then(() => {
        if (playbackSequence !== tvPlaybackSequence || playbackBecameActive) return;
        try { video.pause(); } catch {}
        video.removeAttribute('src');
        video.load?.();
        if (!startHlsJs()) setTvPlaybackStatus('NorthTV · flux iOS indisponible', 'error');
      }).catch(() => {
        if (playbackSequence === tvPlaybackSequence) setTvPlaybackStatus('NorthTV · flux iOS indisponible', 'error');
      });
      return true;
    };

    const startProviderWebFallback = (reason = '') => {
      if (window.NoctraServerChoice?.isManual()) return false;
      const liveWatchFamily = /^(?:LiveWatch|NorthTV|FrameTV)$/i.test(playbackProvider);
      if ((!liveWatchFamily && !/^WiTV$/i.test(playbackProvider)) || playbackBecameActive || providerFallbackStarted) return false;
      // Les iframes WiTV sont un choix manuel : leur HTTP 200 ne prouve pas
      // qu'elles lisent la chaîne. Le parcours automatique conserve les HLS.
      if (/^WiTV$/i.test(playbackProvider)) return startResolvedOptionFallback(reason);
      let fallbackIndex = liveWatchFamily
        ? tvState.resolvedEmbeds.findIndex((item, index) => index !== optionIndex
          && item?.url
          && item?.officialClient
          && item?.vip !== false)
        : -1;
      if (fallbackIndex < 0 && liveWatchFamily) {
        fallbackIndex = tvState.resolvedEmbeds.findIndex((item, index) => index !== optionIndex
          && item?.url
          && item?.fallback
          && item?.vip !== true
          && /public|pubs?|secours/i.test(String(item?.label || '')));
      }
      if (fallbackIndex < 0 && !liveWatchFamily) fallbackIndex = tvState.resolvedEmbeds.findIndex((item, index) => index > optionIndex && item?.url && item?.playbackType !== 'stream');
      if (fallbackIndex < 0) {
        fallbackIndex = tvState.resolvedEmbeds.findIndex((item, index) => index !== optionIndex
          && item?.url
          && item?.playbackType !== 'stream'
          && (!liveWatchFamily || item?.vip !== true));
      }
      if (fallbackIndex < 0) return false;
      providerFallbackStarted = true;
      window.clearTimeout(providerFallbackTimer);
      providerFallbackTimer = 0;
      recordTvDiagnostic('provider-web-fallback-start', { provider: playbackProvider, active: playbackBecameActive, hls: Boolean(tvHls), reason });
      setTvPlaybackStatus(liveWatchFamily
        ? `${playbackProvider} · direct trop lent · ouverture du lecteur officiel…`
        : 'WiTV · flux direct indisponible · ouverture du lecteur web…', 'loading');
      void playTvResolvedOption(channel, tvState.resolvedEmbeds[fallbackIndex], fallbackIndex, playbackSequence)
        .catch(error => {
          if (playbackSequence !== tvPlaybackSequence) return;
          setTvPlaybackStatus(`${playbackProvider} · lecteur de secours indisponible`, 'error');
          if (error?.message) recordTvDiagnostic('provider-web-fallback-failed', { provider: playbackProvider, message: error.message });
        });
      return true;
    };

    const refreshResolvedStream = (provider, beforeStart = false) => {
      // A resolver may silently substitute another server. Manual selection
      // retains the exact stream; the user can retry or choose another option.
      if (window.NoctraServerChoice?.isManual()) return false;
      if (videoEventSignal.aborted || !renewableResolvedStream || (!playbackBecameActive && !beforeStart)) return false;
      if (!playbackBecameActive && tvLiveWatchRefreshCount >= 1) return false;
      const now = Date.now();
      if (tvLiveWatchRefreshCount >= 8 && now - tvLiveWatchLastRefreshAt > 45_000) tvLiveWatchRefreshCount = 0;
      const canRefresh = !tvLiveWatchRecoveryInFlight
        && tvLiveWatchRefreshCount < 8
        && (!tvLiveWatchLastRefreshAt || now - tvLiveWatchLastRefreshAt >= 2_500);
      if (canRefresh) {
        tvLiveWatchRecoveryInFlight = true;
        tvLiveWatchRefreshCount += 1;
        tvLiveWatchLastRefreshAt = now;
        // Laisser le tampon existant se lire/remplir pendant la résolution.
        // Arrêter le chargeur ici provoquait une coupure avant même la relève.
        setTvPlaybackStatus(`${provider} · reconnexion ${tvLiveWatchRefreshCount}/8…`, 'loading');
        const previousOption = tvState.resolvedEmbeds?.[optionIndex] || {};
        const selectedResolver = previousOption.resolveUrl || channel.resolverUrl;
        const separator = String(selectedResolver).includes('?') ? '&' : '?';
        const refreshUrl = `${selectedResolver}${separator}refresh=1&_=${Date.now()}`;
        void api(refreshUrl, {
          signal: videoEventSignal,
          timeoutMs: Math.max(channel?.vipPlayback ? 90_000 : (/^(?:OHA|WiTV|StreamSports99)$/i.test(provider) ? 55_000 : 30_000), Number(tvConnectionProfile().resolverTimeout || 0)),
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' }
        }).then(async result => {
          if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
          const freshOptions = Array.isArray(result?.options) ? result.options : [];
          const previousServer = Number(previousOption.serverIndex ?? previousOption.index);
          const previousLabel = String(previousOption.label || '').trim();
          let directIndex = freshOptions.findIndex(item => item?.streamUrl
            && item?.playbackType === 'stream'
            && item?.vip !== false
            && ((Number.isFinite(previousServer) && Number(item.serverIndex ?? item.index) === previousServer)
              || (previousLabel && String(item.label || '').trim() === previousLabel)));
          if (directIndex < 0) directIndex = freshOptions.findIndex(item => item?.streamUrl && item?.playbackType === 'stream' && item?.vip !== false);
          if (directIndex < 0) throw new Error(`${provider} ne fournit plus de direct pour cette chaîne.`);
          // Le résolveur ciblé WiTV renouvelle un seul lecteur : conserver les
          // autres choix et secours, sinon ils disparaissent après la reprise.
          const keepWiTvChoices = /^WiTV$/i.test(provider) && freshOptions.length === 1
            && Array.isArray(tvState.resolvedEmbeds) && optionIndex >= 0 && optionIndex < tvState.resolvedEmbeds.length;
          const playbackOptions = keepWiTvChoices
            ? tvState.resolvedEmbeds.map((item, index) => index === optionIndex ? { ...item, ...freshOptions[directIndex] } : item)
            : freshOptions;
          const playbackIndex = keepWiTvChoices ? optionIndex : directIndex;
          tvState.resolvedEmbeds = playbackOptions;
          renderTvStreamOptions(playbackOptions, playbackIndex);
          tvLiveWatchRecoveryInFlight = false;
          await playTvDirectStream(channel, playbackOptions[playbackIndex].streamUrl, `${provider} · direct repris`, playbackSequence, playbackIndex);
        }).catch(error => {
          if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
          tvLiveWatchRecoveryInFlight = false;
          if (playbackSequence !== tvPlaybackSequence) return;
          if (error?.message) recordTvDiagnostic('livewatch-refresh-failed', { message: error.message, attempt: tvLiveWatchRefreshCount });
          if (startResolvedOptionFallback('le renouvellement du serveur a échoué')) return;
          if (tvLiveWatchRefreshCount < 8) {
            setTvPlaybackStatus(`${provider} · réseau instable · nouvelle tentative…`, 'loading');
            window.setTimeout(() => {
              if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
              if (tvHls) {
                try { tvHls.startLoad(-1); } catch {}
              } else {
                refreshResolvedStream(provider);
              }
            }, Math.min(4_000, Math.max(2_600, 900 + tvLiveWatchRefreshCount * 450)));
            return;
          }
          if (!nativeFallbackStarted && video.canPlayType('application/vnd.apple.mpegurl')) {
            startNativeHls('Compatibilité iOS · reprise du même flux…');
            return;
          }
          setTvPlaybackStatus(`${provider} · direct interrompu · appuie sur Lecture pour réessayer`, 'idle');
        });
        return true;
      }
      if (tvLiveWatchRecoveryInFlight) {
        setTvPlaybackStatus(`${provider} · renouvellement du direct en cours…`, 'loading');
        return true;
      }
      return false;
    };

    // Restore the retry budget only after actual uninterrupted progress, never a seek.
    let continuityPosition = Number(video.currentTime || 0), continuitySeconds = 0;
    video.addEventListener('timeupdate', () => {
      const position = Number(video.currentTime || 0), delta = position - continuityPosition;
      continuityPosition = position;
      if (video.paused || video.seeking || delta < 0 || delta > 5) { continuitySeconds = 0; return; }
      continuitySeconds += delta;
      if (continuitySeconds >= 60) {
        stallRecoveries = 0;
        if (tvHls) tvHls._noctraMediaRecoveries = 0;
        continuitySeconds = 0;
      }
    }, { signal: videoEventSignal });
    video.addEventListener('waiting', () => { continuitySeconds = 0; }, { signal: videoEventSignal });

    watchTvPlaybackProgress({
      video, signal: videoEventSignal,
      isCurrent: () => playbackSequence === tvPlaybackSequence,
      isActive: () => playbackBecameActive && !providerFallbackStarted,
      isManagedPause: () => adaptiveRebuffering,
      downloadedBytes: () => Number(activeFragment?.stats?.loaded || 0) || tvBufferedSpan(video) * 1000,
      bufferedAhead: () => tvBufferedAhead(video),
      stallDelay: () => Math.max(tvConnectionProfile().weak ? 45_000 : 30_000, Number(latestPlaylistDetails?.targetduration || 0) * 3_000),
      onStall: () => {
        if (tvLiveWatchRecoveryInFlight) return true;
        const ahead = tvBufferedAhead(video);
        recordTvDiagnostic('playback-progress-stalled', { bufferAhead: Number(ahead.toFixed(2)), attempt: stallRecoveries + 1 });
        if (!tvShaka && tvSkipBufferedGap(video)) { void video.play().catch(() => undefined); return true; }
        const wasManagedPause = adaptiveRebuffering;
        cancelAdaptiveRebuffer();
        if (wasManagedPause) void video.play().catch(() => undefined);
        stallRecoveries += 1;
        if (stallRecoveries <= 3) {
          if (ahead >= 2 && tvShaka && stallRecoveries === 1 && tvShakaBufferedRecoverySequence !== playbackSequence) {
            tvShakaBufferedRecoverySequence = playbackSequence;
            recordTvDiagnostic('shaka-buffered-freeze-restart', { bufferAhead: Number(ahead.toFixed(2)) });
            void tvDirectRestart?.()?.catch(() => {
              if (playbackSequence === tvPlaybackSequence) setTvPlaybackStatus('Shaka · reprise impossible · réessaie ce serveur', 'error');
            });
            return true;
          }
          // Un décodeur figé avec des données disponibles ne justifie pas de
          // renouveler immédiatement l'URL ou de changer de chaîne.
          if (ahead >= 2 && tvHls && !tvHls._noctraMediaRecoveries) {
            tvHls._noctraMediaRecoveries = 1;
            try { tvHls.recoverMediaError(); } catch {}
            void video.play().catch(() => undefined);
            return true;
          }
          if (tvHls && stallRecoveries === 1) {
            try { tvHls.startLoad(-1); } catch {}
            void video.play().catch(() => undefined);
            return true;
          }
        }
        if (stallRecoveries <= 3 && refreshResolvedStream(playbackProvider)) return true;
        if (startResolvedOptionFallback('lecture figée sans nouvelles données')) return false;
        setTvPlaybackStatus(`${playbackProvider} · flux interrompu · relance la chaîne ou choisis un autre serveur`, 'error');
        return false;
      }
    });

    if (/^(?:LiveWatch|NorthTV|FrameTV|WiTV|OHA)$/i.test(playbackProvider) || /^(?:StreamSports99|FSTV|Movix|RénéVéo|Northlive)$/i.test(playbackProvider)) {
      providerFallbackTimer = window.setTimeout(function checkStartupFallback() {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence || playbackBecameActive || playbackNeedsGesture) return;
        if (tvStartupStillProgressing(Date.now(), startupAttemptAt, startupLastProgressAt, tvBufferedSpan(video))) {
          recordTvDiagnostic('startup-progress-grace', {bufferAhead: Number(tvBufferedAhead(video).toFixed(2))});
          providerFallbackTimer = window.setTimeout(checkStartupFallback, 10_000);
          return;
        }
        providerFallbackTimer = 0;
        // Un direct sans première image doit essayer les variantes HLS déjà
        // préparées avant le lecteur web. C'est particulièrement important pour
        // FrameTV, dont l'embed officiel peut rester noir sans signaler d'erreur.
        const directFallbackStarted = startResolvedOptionFallback('aucun média reçu avant le délai');
        if (!directFallbackStarted && !startProviderWebFallback('aucun média reçu avant le délai')) {
          if (/^(?:OHA|WiTV|StreamSports99|FSTV)$/i.test(playbackProvider)) {
            try { tvHls?.destroy?.(); } catch {}
            tvHls = null;
            tvVideoEventsController?.abort?.();
            try { video.pause(); } catch {}
            setTvPlaybackStatus(`${playbackProvider} · aucune image reçue · sélectionne un autre serveur`, 'error');
          } else setTvPlaybackStatus(`${playbackProvider} · le direct continue de charger…`, 'loading');
        }
      }, tvConnectionProfile().weak ? 120_000 : 90_000);
    }

    const startHlsJs = () => {
      if (!window.Hls?.isSupported?.()) return false;
      // V85 : sur iPhone/iPad récents, HLS.js utilise ManagedMediaSource. Cela
      // évite de confier directement au moteur HLS natif certains flux LiveWatch
      // et OHA que Safari annonce compatibles mais laisse pourtant bloqués.
      const networkProfile = tvConnectionProfile();
      const desktopLive = !appleTouch && window.matchMedia?.('(min-width: 761px)')?.matches;
      const stableDesktopLive = desktopLive && !networkProfile.weak;
      const hlsOptions = {
        enableWorker: true,
        // v173 : profil proche du lecteur Jellyfin Web, avec une marge live
        // bornee par la fenetre reelle des playlists courtes.
        lowLatencyMode: false,
        // Preserve downloaded media during recovery instead of seeking into
        // an empty live position and discarding the benefit of rebuffering.
        liveSyncMode: 'buffered',
        liveDurationInfinity: true,
        liveSyncDurationCount: networkProfile.weak ? 4 : 3,
        liveMaxLatencyDurationCount: networkProfile.weak ? 6 : 5,
        liveSyncOnStallIncrease: 1,
        maxLiveSyncPlaybackRate: 1,
        liveMaxUnchangedPlaylistRefresh: 4,
        // Le moteur adapte aussi ce délai aux segments et à la réserve disponible.
        appendTimeout: 30_000,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 45,
        maxBufferSize: 96 * 1000 * 1000,
        maxBufferHole: .5,
        maxStarvationDelay: 8,
        maxLoadingDelay: 10,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: .1,
        nudgeMaxRetry: 5,
        startFragPrefetch: true,
        manifestLoadingTimeOut: networkProfile.manifestTimeout,
        fragLoadingTimeOut: networkProfile.fragmentTimeout,
        manifestLoadingMaxRetry: networkProfile.weak ? 6 : 4,
        levelLoadingMaxRetry: networkProfile.weak ? 6 : 4,
        fragLoadingMaxRetry: networkProfile.weak ? 8 : 5,
        manifestLoadingRetryDelay: 900,
        manifestLoadingMaxRetryTimeout: 8_000,
        levelLoadingRetryDelay: 900,
        levelLoadingMaxRetryTimeout: 8_000,
        fragLoadingRetryDelay: 650,
        fragLoadingMaxRetryTimeout: 10_000,
        abrBandWidthFactor: networkProfile.veryWeak ? .5 : (networkProfile.weak ? .6 : .72),
        abrBandWidthUpFactor: networkProfile.veryWeak ? .35 : (networkProfile.weak ? .48 : .55),
        capLevelToPlayerSize: true,
        startLevel: networkProfile.weak ? 0 : -1,
        abrEwmaDefaultEstimate: networkProfile.veryWeak ? 450_000 : (networkProfile.weak ? 900_000 : (stableDesktopLive ? 4_000_000 : 5_000_000))
      };
      // Les resolvers gardent davantage de reprises reseau, sans modifier le
      // tampon commun de la vue Chaines.
      if (bufferedResolvedStream) {
        hlsOptions.manifestLoadingMaxRetry = Math.max(hlsOptions.manifestLoadingMaxRetry, 6);
        hlsOptions.levelLoadingMaxRetry = Math.max(hlsOptions.levelLoadingMaxRetry, 6);
        hlsOptions.fragLoadingMaxRetry = Math.max(hlsOptions.fragLoadingMaxRetry, 12);
        hlsOptions.liveSyncDurationCount = Math.max(hlsOptions.liveSyncDurationCount, 4);
        hlsOptions.liveMaxLatencyDurationCount = Math.max(hlsOptions.liveMaxLatencyDurationCount, 9);
        hlsOptions.backBufferLength = Math.max(hlsOptions.backBufferLength, 60);
        hlsOptions.maxBufferLength = Math.max(hlsOptions.maxBufferLength, 75);
        hlsOptions.maxMaxBufferLength = Math.max(hlsOptions.maxMaxBufferLength, 120);
        hlsOptions.maxBufferSize = Math.max(hlsOptions.maxBufferSize, 192 * 1000 * 1000);
        hlsOptions.maxBufferHole = Math.max(hlsOptions.maxBufferHole, .8);
        hlsOptions.maxStarvationDelay = Math.max(hlsOptions.maxStarvationDelay, 12);
        hlsOptions.maxLoadingDelay = Math.max(hlsOptions.maxLoadingDelay, 14);
        hlsOptions.fragLoadingTimeOut = Math.max(hlsOptions.fragLoadingTimeOut, 45_000);
        hlsOptions.nudgeMaxRetry = Math.max(hlsOptions.nudgeMaxRetry, 8);
        hlsOptions.appendErrorMaxRetry = 5;
      }
      if (stabilitySensitiveStream) {
        hlsOptions.liveSyncDurationCount = Math.max(hlsOptions.liveSyncDurationCount, 5);
        hlsOptions.liveMaxLatencyDurationCount = Math.max(hlsOptions.liveMaxLatencyDurationCount, 12);
        hlsOptions.backBufferLength = 90;
        hlsOptions.maxBufferLength = 90;
        hlsOptions.maxMaxBufferLength = 150;
        hlsOptions.maxBufferSize = 224 * 1000 * 1000;
        hlsOptions.maxStarvationDelay = 15;
        hlsOptions.maxLoadingDelay = 18;
        hlsOptions.fragLoadingMaxRetry = Math.max(hlsOptions.fragLoadingMaxRetry, 12);
      }
      if (bufferedResolvedStream && stableDesktopLive) {
        hlsOptions.abrBandWidthFactor = .68;
        hlsOptions.abrBandWidthUpFactor = .5;
        hlsOptions.startLevel = 0;
        hlsOptions.abrEwmaDefaultEstimate = 2_500_000;
      }
      if (iosHlsJsPreferred) {
        hlsOptions.preferManagedMediaSource = true;
        hlsOptions.liveDurationInfinity = true;
      }
      Object.assign(hlsOptions, tvHlsLoadPolicies(networkProfile));
      if (channelContinuity) {
        hlsOptions.maxBufferLength = Math.max(hlsOptions.maxBufferLength, 60);
        hlsOptions.maxMaxBufferLength = Math.max(hlsOptions.maxMaxBufferLength, 90);
        // Une réserve en secondes reste utile avec des segments de 1 ou 2 s.
        // Une grande capacité de tampon seule ne crée pas ce retard au direct.
        delete hlsOptions.liveSyncDurationCount;
        delete hlsOptions.liveMaxLatencyDurationCount;
        hlsOptions.liveSyncDuration = desktopLive ? 30 : (networkProfile.weak ? 18 : 12);
        hlsOptions.liveMaxLatencyDuration = networkProfile.weak ? 100 : 90;
        hlsOptions.startLevel = 0;
        hlsOptions.abrBandWidthFactor = Math.min(hlsOptions.abrBandWidthFactor, .60);
        hlsOptions.abrBandWidthUpFactor = Math.min(hlsOptions.abrBandWidthUpFactor, .48);
      }
      // Large live reserves can exhaust mobile MSE memory and interrupt playback.
      // Preserve forward buffering, trimming old data first on constrained devices.
      const memoryGb = Number(navigator.deviceMemory || 0);
      const compactMemory = appleTouch || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (memoryGb > 0 && memoryGb <= 4);
      if (compactMemory) {
        hlsOptions.backBufferLength = 15;
        hlsOptions.maxBufferSize = Math.min(hlsOptions.maxBufferSize, 64 * 1024 * 1024);
        hlsOptions.maxBufferLength = Math.min(hlsOptions.maxBufferLength, 45);
        hlsOptions.maxMaxBufferLength = Math.min(hlsOptions.maxMaxBufferLength, 60);
      }
      recordTvDiagnostic('hls-player-started', {
        elapsedMs: tvPlaybackElapsedMs(),
        profile: stableDesktopLive ? 'stable-desktop-live' : (networkProfile.weak ? 'conservative' : 'standard'),
        startLevel: hlsOptions.startLevel,
        syncSegments: hlsOptions.liveSyncDurationCount,
        syncSeconds: hlsOptions.liveSyncDuration,
        maxBuffer: hlsOptions.maxBufferLength
      });
      let firstFragmentRecorded = false;
      let lastBufferedFragmentAt = 0;
      let startupPlayRequested = false;
      let startupFallbackTimer = 0;
      const startupBufferGoal = channelContinuity ? (networkProfile.weak ? 10 : 8) : networkProfile.weak ? 12 : (stabilitySensitiveStream ? 10 : 8);
      let protectedStartupBufferGoal = startupBufferGoal;
      const protectedStartupFallbackDelay = networkProfile.weak ? 12_000 : 6_000;
      const requestStartupPlayback = (force = false) => {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence || playbackBecameActive || startupPlayRequested) return false;
        const bufferedWindow = tvLatestBufferedWindow(video, force ? 0 : protectedStartupBufferGoal);
        const buffered = Number(bufferedWindow?.duration || 0);
        // Seed the paused MSE playhead as soon as media arrives. Otherwise it
        // may remain near the live edge while older downloaded data is ignored.
        if (desktopLive && !startupPlayRequested && bufferedWindow && buffered > .5) {
          tvSeekIntoBufferedWindow(video, bufferedWindow, protectedStartupBufferGoal);
        }
        const minimumReserve = channelContinuity
          ? Math.min(protectedStartupBufferGoal, networkProfile.weak ? 6 : 4)
          : bufferedResolvedStream ? 5 : 3.5;
        if ((!force && buffered < protectedStartupBufferGoal) || (force && buffered < minimumReserve)) {
          if (force) startupFallbackTimer = window.setTimeout(() => requestStartupPlayback(true), 4_000);
          return false;
        }
        const repositioned = tvSeekIntoBufferedWindow(video, bufferedWindow, protectedStartupBufferGoal);
        if (tvBufferedAhead(video) < (force ? minimumReserve : protectedStartupBufferGoal) - .2) {
          if (force) startupFallbackTimer = window.setTimeout(() => requestStartupPlayback(true), 1000);
          return false;
        }
        startupPlayRequested = true;
        window.clearTimeout(startupFallbackTimer);
        recordTvDiagnostic('hls-startup-buffer-ready', {
          bufferAhead: Number(tvBufferedAhead(video).toFixed(2)),
          bufferedSpan: Number(buffered.toFixed(2)),
          target: protectedStartupBufferGoal,
          forced: Boolean(force),
          repositioned
        });
        video.play().catch(error => {
          startupPlayRequested = false;
          if (playbackSequence !== tvPlaybackSequence || benignTvPlayInterruption(error)) return;
          if (error?.name === 'NotAllowedError') playbackNeedsGesture = true;
          setTvPlaybackStatus('Appuie sur Lecture', 'idle');
        });
        return true;
      };
      videoEventSignal.addEventListener('abort', () => window.clearTimeout(startupFallbackTimer), { once: true });
      tvHls = new window.Hls(hlsOptions);
      tvHls._noctraChannelAuto = ['channels', 'favorites'].includes(tvState.section) || tvState.catalog?.source?.section === 'channels';
      if (channelContinuity) {
        const continuity = createTvContinuityGuard(tvHls, {
          bufferAhead: () => tvBufferedAhead(video), reserveGoal: () => tvAchievableBufferGoal(networkProfile.weak ? 20 : 16, latestPlaylistDetails),
          onAction: recordTvDiagnostic
        });
        tvHls._noctraContinuity = continuity;
        const pendingGuardTimer = window.setInterval(() => {
          if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence || !playbackBecameActive || video.paused) return;
          const stats = activeFragment?.stats?.loading;
          if (!stats?.start || stats.end > 0) return;
          continuity.pending({level:Number(activeFragment.level),duration:Number(activeFragment.duration),
            type:activeFragment.type || 'main',elapsedMs:performance.now()-stats.start});
        }, 1_000);
        videoEventSignal.addEventListener('abort', () => window.clearInterval(pendingGuardTimer), { once:true });
        videoEventSignal.addEventListener('abort', continuity.release, { once: true });
      }
      tvHls.loadSource(streamUrl);
      tvHls.attachMedia(video);
      tvHls.on(window.Hls.Events.FRAG_LOADING, (_event, data) => {
        if (!videoEventSignal.aborted && playbackSequence === tvPlaybackSequence) activeFragment = data?.frag || null;
      });
      tvHls.on(window.Hls.Events.MANIFEST_LOADED, (_event, data) => {
        if (playbackSequence !== tvPlaybackSequence) return;
        recordTvDiagnostic('hls-manifest-loaded', {
          elapsedMs: tvPlaybackElapsedMs(),
          levels: Number(data?.levels?.length || 0)
        });
      });
      tvHls.on(window.Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (playbackSequence !== tvPlaybackSequence) return;
        recordTvDiagnostic('hls-manifest-parsed', {
          elapsedMs: tvPlaybackElapsedMs(),
          levels: Number(data?.levels?.length || 0),
          level: Number(hlsOptions.startLevel)
        });
        applyTvChannelAutoQuality(tvHls);
        populateTvQualitySelector(tvHls);
        setTvPlaybackStatus(`Préchargement du direct · ${protectedStartupBufferGoal} s…`, 'loading');
        startupFallbackTimer = window.setTimeout(() => requestStartupPlayback(true), protectedStartupFallbackDelay);
      });
      tvHls.on(window.Hls.Events.LEVEL_UPDATED, (_event, data) => {
        if (playbackSequence !== tvPlaybackSequence) return;
        latestPlaylistDetails = data?.details || latestPlaylistDetails;
        protectedStartupBufferGoal = tvAchievableBufferGoal(startupBufferGoal, latestPlaylistDetails);
        if (channelContinuity && tvHls && latestPlaylistDetails?.live !== false) {
          const desired = Math.max(desktopLive ? 30 : (networkProfile.weak ? 18 : 12), Number(latestPlaylistDetails?.targetduration || 0) * 2.5);
          tvHls.config.liveSyncDuration = tvAchievableBufferGoal(desired, latestPlaylistDetails);
          tvHls.config.liveMaxLatencyDuration = Math.max(networkProfile.weak ? 100 : 90, tvHls.config.liveSyncDuration * 3);
        }
        requestStartupPlayback(false);
        scheduleTvLiveEdgeControl();
      });
      tvHls.on(window.Hls.Events.FRAG_BUFFERED, (_event, data) => {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        scheduleTvLiveEdgeControl();
        lastBufferedFragmentAt = Date.now();
        startupLastProgressAt = lastBufferedFragmentAt;
        if (tvHls && (playbackBecameActive || !/^(?:OHA|WiTV)$/i.test(playbackProvider))) tvHls._noctraNetworkRestarts = 0;
        const loading = data?.stats?.loading || data?.frag?.stats?.loading;
        const level = Number(tvHls?.currentLevel ?? -1);
        const loadMs = Number(loading?.end || 0) - Number(loading?.start || 0);
        if (playbackBecameActive && channelContinuity) tvHls?._noctraContinuity?.sample({
          level: Number(data?.frag?.level ?? level), duration: Number(data?.frag?.duration || 0), loadMs, type: data?.frag?.type || 'main'
        });
        if (!channelContinuity && playbackBecameActive && tvShouldDownshift(tvBufferedAhead(video), Number(data?.frag?.duration || 0), loadMs, tvHls?.autoLevelEnabled, level)) {
          // Agir avant l'épuisement du tampon, sans pause, sans seek et sans
          // toucher à une qualité choisie manuellement par l'utilisateur.
          tvHls.nextAutoLevel = level - 1;
          recordTvDiagnostic('hls-low-buffer-downshift', { level, nextLevel: level - 1, loadMs });
        }
        requestStartupPlayback(false);
        if (adaptiveRebuffering) resumeAdaptiveRebuffer(false);
        if (firstFragmentRecorded || playbackSequence !== tvPlaybackSequence) return;
        firstFragmentRecorded = true;
        recordTvDiagnostic('hls-first-fragment', {
          elapsedMs: tvPlaybackElapsedMs(),
          level: Number(data?.frag?.level ?? -1),
          duration: Number(Number(data?.frag?.duration || 0).toFixed(2))
        });
      });
      tvHls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        if (!data?.fatal) {
          if (playbackBecameActive && /bufferStalled/i.test(String(data?.details || ''))) onWaiting();
          return;
        }
        const provider = String(channel?.provider || 'TV');
        recordTvDiagnostic('hls-fatal', {
          type: String(data.type || ''),
          details: String(data.details || '') + (/levelParsingError/i.test(data.details || '') ?
            (/sequence mismatch/i.test(data.reason || data.error?.message || '') ? ' (séquence incohérente)' : /Target Duration/i.test(data.reason || data.error?.message || '') ? ' (durée absente)' :
              /EXTM3U/i.test(data.reason || data.error?.message || '') ? ' (format absent)' :
                /more than once/i.test(data.reason || data.error?.message || '') ? ' (balise dupliquée)' :
                  /before the first/i.test(data.reason || data.error?.message || '') ? ' (ordre des balises)' : ' (structure invalide)') : ''),
          fatal: true,
          responseFormat: (() => { try {
            const body = data.response?.data ?? data.networkDetails?.responseText;
            return typeof body !== 'string' ? '' : /^#EXTM3U/.test(body) ? 'HLS' : /^\s+#EXTM3U/.test(body) ? 'HLS avec préfixe' : /^\s*</.test(body) ? 'HTML' : body ? 'autre' : 'vide';
          } catch { return ''; } })(),
          active: playbackBecameActive,
          renewable: renewableResolvedStream,
          hls: Boolean(tvHls),
          code: Number(data?.response?.code || data?.networkDetails?.status || 0)
        });
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          const retries = Number(tvHls?._noctraNetworkRestarts || 0);
          const failure = tvHlsFailurePolicy(data, playbackBecameActive, provider);
          const signedUrlExpired = failure.expired;
          // Les CDN live peuvent perdre un segment sans que l'URL signée soit
          // expirée. Reconstruire tout le direct à ce moment créait davantage
          // de coupures que le lecteur LiveWatch officiel. On ne renouvelle le
          // resolver immédiatement que sur un vrai refus d'autorisation.
          const restartLimit = Math.max(failure.limit, 5);
          if (!signedUrlExpired && !failure.invalid && retries < restartLimit) {
            tvHls._noctraNetworkRestarts = retries + 1;
            const retryDelay = Math.min(8_000, 1000 * (2 ** Math.min(3, retries)));
            setTvPlaybackStatus(`Reconnexion au même flux dans ${Math.max(1, Math.ceil(retryDelay / 1000))} s…`, 'loading');
            const recoveringHls = tvHls;
            window.setTimeout(() => {
              if (playbackSequence !== tvPlaybackSequence || tvHls !== recoveringHls) return;
              try { recoveringHls.startLoad(-1); } catch {}
            }, retryDelay);
            return;
          }
          if (failure.invalid && startResolvedOptionFallback('playlist absente ou invalide')) return;
          if (signedUrlExpired && refreshResolvedStream(provider, true)) return;
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          const recoveries = Number(tvHls?._noctraMediaRecoveries || 0);
          if (recoveries < 1) {
            tvHls._noctraMediaRecoveries = recoveries + 1;
            setTvPlaybackStatus('Récupération du média…', 'loading');
            try { tvHls.recoverMediaError(); } catch {}
            return;
          }
        }

        // V126 : un flux Premium signé peut expirer ou changer de CDN en plein
        // direct. Tant que la chaîne avait réellement démarré, on renouvelle le
        // MEME direct via son resolver et on reprend sans changer de chaîne,
        // serveur ou fournisseur. Plusieurs renouvellements sont permis pendant
        // une longue session, mais jamais en rafale.
        if (/^FrameTV$/i.test(provider) && startResolvedOptionFallback('serveur FrameTV interrompu')) return;
        if (refreshResolvedStream(provider)) return;

        if (/^StreamSports99$/i.test(provider)
          && playbackBecameActive
          && lastBufferedFragmentAt
          && Date.now() - lastBufferedFragmentAt < 60_000) {
          setTvPlaybackStatus('StreamSports99 · reprise du même serveur…', 'loading');
          try { tvHls?.startLoad?.(-1); } catch {}
          return;
        }

        if (startResolvedOptionFallback(data?.details || data?.type || 'échec HLS')) return;

        if (!playbackBecameActive && startProviderWebFallback('échec HLS avant démarrage')) return;

        if (/^WiTV$/i.test(provider)) {
          setTvPlaybackStatus('WiTV · aucun serveur compatible disponible', 'error');
          return;
        }

        // Démarrage impossible (ou autre fournisseur) : même URL, autre moteur.
        if (iosHlsJsPreferred && !nativeFallbackStarted && video.canPlayType('application/vnd.apple.mpegurl')) {
          startNativeHls('Compatibilité iOS · essai du moteur HLS natif…');
          return;
        }
        try { tvHls?.destroy?.(); } catch {}
        tvHls = null;
        const finalStatus = data.type === window.Hls.ErrorTypes.NETWORK_ERROR
          ? 'Erreur réseau · aucun autre serveur compatible'
          : `Flux incompatible${data?.details ? ` · ${data.details}` : ''}`;
        setTvPlaybackStatus(finalStatus, 'error');
        toast('Ce flux ne peut pas être lu dans ce navigateur et aucun autre serveur compatible n’est disponible.');
      });
      return true;
    };

    // Un flux TS continu n'est pas une playlist HLS, même s'il contient du HEVC.
    if (channel.transport === 'mpegts') {
      const engine = await ensureMpegTsLibrary();
      if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
      if (!engine.isSupported()) throw new Error('Le navigateur ne prend pas en charge ce flux MPEG-TS.');
      const player = engine.createPlayer({ type: 'mpegts', isLive: true, url: streamUrl }, {
        enableWorker: true, stashInitialSize: 1024 * 1024,
        liveBufferLatencyChasing: false, autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 30, autoCleanupMinBackwardDuration: 15
      });
      videoEventSignal.addEventListener('abort', () => { try { player.destroy(); } catch {} }, { once: true });
      player.on(engine.Events.ERROR, (type) => {
        if (videoEventSignal.aborted) return;
        if (type === engine.ErrorTypes.NETWORK_ERROR && refreshResolvedStream(playbackProvider, true)) return;
        setTvPlaybackStatus(type === engine.ErrorTypes.MEDIA_ERROR
          ? 'Format vidéo non pris en charge par ce navigateur'
          : 'Flux interrompu · réessaye la chaîne', 'error');
      });
      player.attachMediaElement(video);
      player.load();
      await player.play().catch(error => { if (!benignTvPlayInterruption(error)) throw error; });
      return;
    }

    if ((engineOverride || tvEnginePreference) === 'shaka') {
      let startupTimer = 0;
      const reportShakaFailure = reason => {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        window.clearTimeout(startupTimer);
        recordTvDiagnostic('shaka-manual-recovery', { reason });
        setTvPlaybackStatus('Shaka · réessaie ou choisis HLS.js dans Outils TV', 'error');
      };
      startupTimer = window.setTimeout(() => {
        if (!playbackBecameActive && !playbackNeedsGesture) {
          recordTvDiagnostic('shaka-startup-slow', {});
          setTvPlaybackStatus('Shaka · source lente, chargement en cours… · moteur modifiable dans Outils TV', 'loading');
        }
      }, 30000);
      videoEventSignal.addEventListener('abort', () => window.clearTimeout(startupTimer), { once: true });
      video.addEventListener('playing', () => window.clearTimeout(startupTimer), { once: true, signal: videoEventSignal });
      setTvPlaybackStatus('Shaka · chargement du direct…', 'loading');
      try {
        const engine = await ensureShakaLibrary();
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        engine.polyfill.installAll();
        if (!engine.Player.isBrowserSupported()) throw new Error('Navigateur non compatible');
        const player = new engine.Player();
        tvShaka = player;
        videoEventSignal.addEventListener('abort', () => {
          if (tvShaka === player) tvShaka = null;
          tvShakaCleanup = player.destroy().catch(() => undefined);
        }, { once: true });
        player.configure({
          // Prioritize the first playable segment; parallel prefetch only helps
          // continuity once playback has started on a constrained connection.
          // 200.0.108 : une requête figée (aucun octet reçu) est relancée après
          // 10 s au lieu de 15, tout en laissant 45 s aux gros segments qui
          // progressent. Les variantes écartées reviennent plus vite.
          streaming: { bufferingGoal: 45, rebufferingGoal: 3, bufferBehind: 15, segmentPrefetchLimit: 1,
            lowLatencyMode: false, maxDisabledTime: 15,
            retryParameters: { maxAttempts: 5, baseDelay: 500, backoffFactor: 1.5, timeout: 45000, stallTimeout: 10000, connectionTimeout: 10000 } },
          // Les horodatages PROGRAM-DATE-TIME des flux IPTV sont souvent
          // incohérents : l'alignement par numéro de séquence évite trous et
          // sauts, et contourne la mise à jour PDT fragile de Shaka 5.2.
          // Mode séquence : les segments sont enchaînés bout à bout, sans suivre
          // leurs horodatages internes. Sur les flux IPTV dont les PTS sautent de
          // ~2 s tous les 5 segments, le mode par segments faisait sauter la
          // lecture en avant (~2,2 s toutes les 52 s) jusqu'à épuiser la réserve.
          // Après une erreur fatale, la relance repasse en mode par segments.
          manifest: { defaultPresentationDelay: 30,
            hls: { ignoreManifestProgramDateTime: true, sequenceMode: !video._noctraShakaSegmentsMode },
            retryParameters: { maxAttempts: 4, baseDelay: 500, backoffFactor: 1.5, timeout: 20000, stallTimeout: 8000, connectionTimeout: 10000 } },
          // ABR plus prudent : montée en qualité seulement avec une vraie marge
          // de débit, et pas plus d'un changement toutes les 12 s.
          abr: { enabled: true, defaultBandwidthEstimate: 1000000, switchInterval: 12, bandwidthUpgradeTarget: 0.7, bandwidthDowngradeTarget: 0.9 }
        });
        video.addEventListener('playing', () => {
          if (videoEventSignal.aborted || tvShaka !== player) return;
          player.configure({ streaming: { segmentPrefetchLimit: 2 } });
          recordTvDiagnostic('shaka-continuity-prefetch', { segments: 2 });
        }, { once: true, signal: videoEventSignal });
        // Keep download failures before Shaka exhausts its own retries. Never
        // copy request URLs, response bodies or error.data into the diagnostic.
        let lastSegmentAt = 0;
        let lastManifestAt = 0;
        player.addEventListener('downloadcompleted', event => {
          if (videoEventSignal.aborted) return;
          if (event.requestType === 1) lastSegmentAt = Date.now();
          if (event.requestType === 0) lastManifestAt = Date.now();
        });
        player.addEventListener('downloadfailed', event => {
          if (videoEventSignal.aborted) return;
          // In Shaka 5.2, aborted=true means its connection/stall timer
          // expired; ordinary operation cancellation has code 7001 instead.
          const timedOut = event.aborted === true || event.error?.code === 1003;
          recordTvDiagnostic(!timedOut && event.error?.code === 7001 ? 'shaka-download-cancelled' : 'shaka-download-failed', {
            requestType: Number.isFinite(event.requestType) ? event.requestType : null,
            code: Number.isFinite(event.error?.code) ? event.error.code : null,
            category: Number.isFinite(event.error?.category) ? event.error.category : null,
            httpStatus: Number.isFinite(event.httpResponseCode) ? event.httpResponseCode : null,
            timedOut
          });
        });
        video.addEventListener('seeking', () => {
          const range = player.seekRange?.();
          recordTvDiagnostic('shaka-seeking', {
            seekStart: Number.isFinite(range?.start) ? range.start : null,
            seekEnd: Number.isFinite(range?.end) ? range.end : null,
            liveDistance: Number.isFinite(range?.end) ? Number((range.end - Number(video.currentTime || 0)).toFixed(2)) : null,
            sequenceMode: player.getConfiguration?.()?.manifest?.hls?.sequenceMode === true,
            lastSegmentAgeMs: lastSegmentAt ? Date.now() - lastSegmentAt : null
          });
        }, { signal: videoEventSignal });
        player.addEventListener('mediasourcerecovered', () => {
          if (!videoEventSignal.aborted) recordTvDiagnostic('shaka-media-source-recovered', {});
        });
        let lastErrorSignature = '', lastErrorRecordedAt = 0, repeatedErrors = 0;
        player.addEventListener('error', event => {
          if (videoEventSignal.aborted) return;
          const error = event.detail;
          const details = {
            code: Number.isFinite(error?.code) ? error.code : null,
            category: Number.isFinite(error?.category) ? error.category : null,
            severity: Number.isFinite(error?.severity) ? error.severity : null,
            fatal: error?.severity === 2,
            // Native parser exceptions have no Shaka code. Keep only a known
            // exception class, never its message/stack (which can contain URLs).
            errorName: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'DOMException'].includes(error?.name) ? error.name : null
          };
          const signature = JSON.stringify(details);
          repeatedErrors = signature === lastErrorSignature ? repeatedErrors + 1 : 1;
          if (signature !== lastErrorSignature || Date.now() - lastErrorRecordedAt >= 10000 || details.fatal) {
            recordTvDiagnostic('shaka-error', { ...details, repeated: repeatedErrors });
            lastErrorRecordedAt = Date.now();
          }
          lastErrorSignature = signature;
          if (error?.severity === 2) {
            if (playbackBecameActive && error.category === 1 && refreshResolvedStream(playbackProvider, true)) return;
            // 200.0.108 : une erreur fatale après démarrage (décodeur, MSE,
            // manifeste) relance d'abord le même flux, au plus 2 fois en 5 min,
            // sans changer de moteur ni de serveur.
            if (playbackBecameActive && typeof tvDirectRestart === 'function') {
              const now = Date.now();
              const recent = (video._noctraShakaFatalRestarts || []).filter(at => now - at < 300000);
              if (recent.length < 2) {
                video._noctraShakaFatalRestarts = [...recent, now];
                if (error.category === 3) video._noctraShakaSegmentsMode = true;
                recordTvDiagnostic('shaka-fatal-restart', { code: details.code, category: details.category, attempt: recent.length + 1 });
                setTvPlaybackStatus('Shaka · reprise du direct…', 'loading');
                void Promise.resolve(tvDirectRestart()).catch(() => reportShakaFailure('restart-' + (error?.code || 0)));
                return;
              }
            }
            reportShakaFailure('error-' + (error?.code || 0));
          }
        });
        installTvShakaContinuity(player, video, videoEventSignal, 3, reserve => recordTvDiagnostic('shaka-reserve-adjusted', { reserve }));
        player.addEventListener('buffering', event => {
          if (videoEventSignal.aborted) return;
          recordTvDiagnostic('shaka-buffering', {
            active: Boolean(event.buffering),
            lastSegmentAgeMs: lastSegmentAt ? Date.now() - lastSegmentAt : null,
            lastManifestAgeMs: lastManifestAt ? Date.now() - lastManifestAt : null
          });
          if (event.buffering) setTvPlaybackStatus('Shaka · mise en mémoire…', 'loading');
          else if (playbackBecameActive && !video.paused) onPlaying();
        });
        player.addEventListener('trackschanged', () => {
          if (videoEventSignal.aborted) return;
          populateTvQualitySelector({ levels: player.getVariantTracks().map(t => ({ height: t.height, width: t.width, bitrate: t.bandwidth })) });
        });
        recordTvDiagnostic('shaka-library-ready', { elapsedMs: tvPlaybackElapsedMs() });
        await player.attach(video);
        if (videoEventSignal.aborted) return;
        recordTvDiagnostic('shaka-player-started', { engine: engine.Player.version });
        await player.load(streamUrl, undefined, 'application/x-mpegurl');
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        refreshTvSafeToolsMenu();
        await video.play().catch(error => {
          if (videoEventSignal.aborted || benignTvPlayInterruption(error)) return;
          playbackNeedsGesture = error?.name === 'NotAllowedError';
          setTvPlaybackStatus('Appuie sur Lecture', 'idle');
        });
      } catch (error) {
        if (videoEventSignal.aborted || playbackSequence !== tvPlaybackSequence) return;
        recordTvDiagnostic('shaka-load-failed', { code: error?.code || 0 });
        window.clearTimeout(providerFallbackTimer);
        reportShakaFailure('load-' + (error?.code || 0));
      }
      return;
    }

    // iOS 17.1+ dispose de ManagedMediaSource et HLS.js sait l'utiliser. Sur
    // LiveWatch/OHA on privilégie donc le même moteur JavaScript que sur desktop,
    // puis WebKit natif uniquement en secours. WiTV conserve son comportement.
    if (appleNativeFirst && startNativeHls(`${playbackProvider} · lecteur HLS natif iOS…`)) return;

    if (iosHlsJsPreferred) {
      try { await ensureHlsLibrary(); } catch {}
      if (playbackSequence !== tvPlaybackSequence) return;
      if (startHlsJs()) {
        setTvPlaybackStatus(`${String(channel?.provider || 'TV')} · lecteur HLS compatible iOS…`, 'loading');
        return;
      }
      if (startNativeHls('Compatibilité iOS · lecteur HLS natif…')) return;
    }

    // Sur desktop, certains moteurs annoncent HLS natif mais restent bloqués
    // après le premier segment. iPhone/iPad conservent leur chemin WebKit ; les
    // autres plateformes essaient d'abord HLS.js puis le natif en secours.
    if (appleTouch && startNativeHls()) return;

    try { await ensureHlsLibrary(); } catch (error) {
      if (playbackSequence !== tvPlaybackSequence) return;
      video.src = streamUrl;
      video.play().catch(playError => {
        if (playbackSequence !== tvPlaybackSequence || benignTvPlayInterruption(playError)) return;
        setTvPlaybackStatus('Format non pris en charge', 'error');
        toast(error.message);
      });
      return;
    }
    if (playbackSequence !== tvPlaybackSequence) return;
    if (startHlsJs()) return;
    if (startNativeHls()) return;
    video.src = streamUrl;
    video.play().catch(error => {
      if (playbackSequence !== tvPlaybackSequence || benignTvPlayInterruption(error)) return;
      setTvPlaybackStatus('Format non pris en charge', 'error');
      toast('Ce navigateur ne prend pas en charge ce format de flux.');
    });
  }

  async function playTvResolvedOption(channel, option, index = 0, playbackSequence = tvPlaybackSequence, manual = false) {
    if (!manual && window.NoctraServerChoice?.isManual()) return;
    if (playbackSequence !== tvPlaybackSequence) return;
    document.querySelectorAll('[data-tv-embed-option]').forEach(button => {
      button.dataset.active = String(Number(button.dataset.tvEmbedOption) === Number(index));
    });
    const optionSequence = ++tvOptionSequence;
    let resolvedOption = option;
    if (option?.resolveUrl && !option.streamUrl && !option.url) {
      setTvPlaybackStatus(`${channel.provider || 'TV'} · connexion ${option.label || `Serveur ${Number(index) + 1}`}…`, 'loading');
      const nestedTimeout = /^(?:OHA|WiTV|StreamSports99)$/i.test(String(channel?.provider || ''))
        ? Math.max(55_000, Number(tvConnectionProfile().resolverTimeout || 0))
        : tvConnectionProfile().resolverTimeout;
      const result = await api(option.resolveUrl, { timeoutMs: nestedTimeout, signal: tvResolverController.signal });
      if (playbackSequence !== tvPlaybackSequence || optionSequence !== tvOptionSequence) return;
      resolvedOption = Array.isArray(result?.options)
        ? result.options[0]
        : (result?.streamUrl || result?.url ? result : null);
      if (!resolvedOption) throw new Error(result?.message || `${channel.provider || 'TV'} ne fournit aucun flux sur ${option.label || `ce serveur`}.`);
      tvState.resolvedEmbeds[index] = { ...option, ...resolvedOption, label: option.label || resolvedOption.label };
      if (channel.provider === 'Streamed' && result.options?.length > 1) {
        const known = new Set(tvState.resolvedEmbeds.map(item => item.url).filter(Boolean));
        tvState.resolvedEmbeds.push(...result.options.slice(1).filter(item => item.url && !known.has(item.url)));
        renderTvStreamOptions(tvState.resolvedEmbeds, index);
      }
    }
    const label = `${channel.provider || 'TV'} · ${resolvedOption?.label || option?.label || `Serveur ${Number(index) + 1}`}`;
    if (resolvedOption?.streamUrl || resolvedOption?.playbackType === 'stream') {
      await playTvDirectStream({ ...channel, transport: resolvedOption.transport || 'hls' }, resolvedOption.streamUrl, label, playbackSequence, index);
      return;
    }
    if (resolvedOption?.url) playTvEmbedUrl(channel, resolvedOption.url, label, { compatPage: Boolean(resolvedOption.compatPage), optionIndex: index }, playbackSequence);
  }

  async function resolveAndPlayTvChannel(channel, playbackSequence = tvPlaybackSequence) {
    const provider = String(channel?.provider || 'TV').trim() || 'TV';
    const resolverStartedAt = performance.now();
    recordTvDiagnostic('resolver-requested', { provider, elapsedMs: tvPlaybackElapsedMs() });
    // Le moteur est téléchargé en parallèle de la résolution distante. Au
    // premier direct de la session, cette anticipation retire un aller-retour
    // séquentiel sans modifier le choix du fournisseur ni du serveur.
    void ensureHlsLibrary().catch(() => undefined);
    setTvPlaybackStatus(`Recherche du lecteur ${provider}…`, 'loading');
    const resolverProfile = tvConnectionProfile();
    const resolverTimeout = channel.vipPlayback
      ? Math.max(90_000, Number(resolverProfile.resolverTimeout || 0))
      : /^(?:OHA|WiTV|StreamSports99)$/i.test(provider)
        ? Math.max(55_000, Number(resolverProfile.resolverTimeout || 0))
        : resolverProfile.resolverTimeout;
    const result = await api(channel.resolverUrl, { timeoutMs: resolverTimeout, signal: tvResolverController.signal });
    if (playbackSequence !== tvPlaybackSequence) return;
    recordTvDiagnostic('resolver-ready', {
      provider,
      elapsedMs: tvPlaybackElapsedMs(),
      resolverMs: Math.max(0, Math.round(performance.now() - resolverStartedAt)),
      options: Number(Array.isArray(result?.options) ? result.options.length : 0)
    });
    const returnedOptions = Array.isArray(result.options)
      ? result.options.filter(item => item?.url || item?.streamUrl || item?.resolveUrl)
      : Array.isArray(result.embeds)
        ? result.embeds.filter(item => item?.url)
        : [];
    let options = provider === 'WiTV' && !returnedOptions.length && result.externalUrl
      ? [{ label: 'Page WiTV', url: result.externalUrl, playbackType: 'embed', compatPage: true }]
      : returnedOptions.map((item, index) => ({ ...item, label: item.label || `Serveur ${index + 1}` }));

    if (channel.vipPlayback && result.vipFailed) {
      setTvPlaybackStatus('LiveWatch · VIP non transmis · secours public', 'error');
      if (result.warning) toast(`LiveWatch VIP : ${result.warning}`);
    } else if (channel.vipPlayback && result.vipActive) {
      setTvPlaybackStatus(`LiveWatch · VIP Premium · ${provider}…`, 'loading');
    } else if (provider === 'OHA' && result.warning) {
      const upstreamUnavailable = /(?:HTTP\s*(?:451|501)|fournisseur)/i.test(`${result.warning} ${result.detail || ''}`);
      setTvPlaybackStatus(upstreamUnavailable ? 'OHA · fournisseur indisponible' : 'OHA · serveur natif indisponible', upstreamUnavailable ? 'error' : 'loading');
      toast(result.detail || result.warning);
    }

    // OHA V70 : un flux natif reste prioritaire, mais si les résolveurs OHA
    // ne répondent pas assez vite le lecteur web officiel prend le relais. Les
    // serveurs natifs restent alors accessibles manuellement sans bloquer l'UI.
    if (provider === 'OHA' && Array.isArray(result.serverChoices) && result.serverChoices.length) {
      const active = options[0] || null;
      if (Number.isInteger(result.activeServer) && active && !active.fallback) {
        const activeServer = result.activeServer;
        options = result.serverChoices.map(choice => Number(choice.index) === Number(activeServer)
          ? { ...choice, ...active, label: choice.label || active.label }
          : { ...choice, label: choice.label || `Serveur ${Number(choice.index) + 1}` });
        tvState.resolvedEmbeds = options;
        renderTvStreamOptions(options, Math.max(0, options.findIndex(item => Number(item.index ?? item.serverIndex) === Number(activeServer))));
      } else if (active?.fallback) {
        const webFallbacks = options.filter(item => item?.url);
        options = [...webFallbacks, ...result.serverChoices.map(choice => ({ ...choice, label: choice.label || `Serveur ${Number(choice.index) + 1}` }))];
        tvState.resolvedEmbeds = options;
        renderTvStreamOptions(options, 0);
        setTvPlaybackStatus('OHA · lecteur officiel', 'loading');
      } else {
        tvState.resolvedEmbeds = options;
        renderTvStreamOptions(options, 0);
      }
    } else {
      tvState.resolvedEmbeds = options;
      renderTvStreamOptions(options, 0);
    }
    const external = document.querySelector('[data-tv-open-external]');
    if (external) {
      external.hidden = !(result.externalUrl || channel.externalUrl);
      external.dataset.tvOpenExternal = result.externalUrl || channel.externalUrl || '';
      external.href = external.dataset.tvOpenExternal;
    }
    if (!options.length) {
      setTvPlaybackStatus('Aucun serveur disponible', 'error');
      throw new Error(`${provider} ne fournit actuellement aucun serveur vidéo exploitable pour cette chaîne.`);
    }
    if (provider === 'OHA' && result.nativeUnavailable) {
      setTvPlaybackStatus('OHA · aucun HLS vérifiable · lecteur officiel disponible manuellement', 'error');
      return;
    }
    if (provider === 'WiTV' && result.nativeFailures?.length) {
      recordTvDiagnostic('witv-native-unavailable', { failures: result.nativeFailures });
    }
    let initialOptionIndex = provider === 'OHA' && Number.isInteger(result.activeServer)
      ? Math.max(0, options.findIndex(item => Number(item.index ?? item.serverIndex) === Number(result.activeServer)))
      : options.findIndex(item => !item.manualOnly);
    if (initialOptionIndex < 0) {
      setTvPlaybackStatus(`${provider} · aucun lecteur propre disponible · secours manuels uniquement`, 'error');
      return;
    }
    if (tvState.section === 'channels' && window.NoctraServerChoice && options.length > 1) {
      setTvPlaybackStatus('Vérification rapide des serveurs… · choix manuel disponible', 'loading');
      initialOptionIndex = await window.NoctraServerChoice.choose({ ...channel, sourceId: tvState.sourceId }, options, initialOptionIndex, {
        signal: tvResolverController.signal,
        current: () => playbackSequence === tvPlaybackSequence,
        resolve: (url, signal) => api(url, { signal, timeoutMs: 4000 }),
        normalize: url => /^(?:https?:)?\/\//i.test(url) || (noctraBasePath && url.startsWith(`${noctraBasePath}/`)) ? url : appPath(url)
      });
      if (playbackSequence !== tvPlaybackSequence) return;
      tvState.resolvedEmbeds = options;
      renderTvStreamOptions(options, initialOptionIndex);
      recordTvDiagnostic('server-auto-selected', { optionIndex: initialOptionIndex });
    }
    await playTvResolvedOption(channel, options[initialOptionIndex] || options[0], initialOptionIndex, playbackSequence);
  }

  function updateTvCastButton(channel) {
    const button = document.querySelector('[data-tv-cast]');
    const video = document.querySelector('#noctra-tv-video');
    if (!button) return;
    const direct = channel?.playbackType === 'stream';
    const airPlay = Boolean(video && typeof video.webkitShowPlaybackTargetPicker === 'function');
    const remotePlayback = Boolean(video?.remote && typeof video.remote.prompt === 'function');
    button.hidden = !(direct && (airPlay || remotePlayback));
    button.disabled = !direct;
    button.title = direct
      ? 'Envoyer ce flux direct vers un appareil compatible'
      : 'Les lecteurs web intégrés LiveWatch/WiTV/OHA ne peuvent pas être transmis directement par le navigateur.';
  }

  async function castCurrentTv() {
    const channel = tvState.catalog?.channels?.[tvState.currentChannelIndex];
    const video = document.querySelector('#noctra-tv-video');
    if (!channel || !video || tvState.currentPlaybackType !== 'stream') {
      toast('Le cast direct est disponible pour les flux vidéo/HLS. Les lecteurs web intégrés restent dans leur iframe.');
      return;
    }
    try {
      if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
        video.webkitShowPlaybackTargetPicker();
        return;
      }
      if (video.remote && typeof video.remote.prompt === 'function') {
        await video.remote.prompt();
        return;
      }
      toast('Ce navigateur ne fournit pas de sélecteur AirPlay/Remote Playback pour ce flux.');
    } catch (error) {
      if (error?.name !== 'NotAllowedError') toast(error?.message || 'Impossible d’ouvrir le sélecteur de diffusion.');
    }
  }

  function tvFullscreenTarget() {
    return document.querySelector('.noctra-tv-player-card');
  }

  function tvConnectionProfile() {
    let connection = null;
    try { connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null; } catch {}
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    const transport = String(connection?.type || '').toLowerCase();
    const downlink = Number(connection?.downlink || 0);
    const rtt = Number(connection?.rtt || 0);
    const saveData = Boolean(connection?.saveData);
    const appleConservative = tvAppleTouchDevice();
    const desktop = !appleConservative && Boolean(window.matchMedia?.('(min-width: 761px)')?.matches);
    // Prefer continuity when measured throughput is low, including on desktop.
    const veryWeak = saveData
      || /(?:^|-)2g$/.test(effectiveType)
      || ((downlink > 0 && downlink < 0.9) || rtt > 900);
    // Safari iOS n'expose généralement pas navigator.connection. On applique
    // donc un profil conservateur sur iPhone/iPad : il ajoute un peu de délai
    // mais évite les boucles de reconnexion sur 4G faible.
    const weak = appleConservative
      || veryWeak
      // Desktop may also use Wi-Fi or mobile tethering with limited throughput.
      || effectiveType === '3g'
      || ((downlink > 0 && downlink < 2.5) || rtt > 450);
    return {
      weak,
      veryWeak,
      desktop,
      transport,
      effectiveType,
      downlink,
      rtt,
      resolverTimeout: veryWeak ? 55_000 : weak ? 42_000 : 28_000,
      manifestTimeout: veryWeak ? 55_000 : weak ? 42_000 : 24_000,
      fragmentTimeout: veryWeak ? 65_000 : weak ? 52_000 : 30_000,
      embedSoftTimeout: veryWeak ? 55_000 : weak ? 42_000 : 30_000,
      embedHardTimeout: veryWeak ? 150_000 : weak ? 120_000 : 90_000
    };
  }

  function tvAppleTouchDevice() {
    const platform = String(navigator.platform || '');
    const agent = String(navigator.userAgent || '');
    return /iPad|iPhone|iPod/i.test(agent) || (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  }

  function exitTvPseudoFullscreen() {
    document.body.classList.remove('noctra-tv-pseudo-fullscreen');
    document.querySelector('.noctra-tv-player-card[data-tv-pseudo-fullscreen="true"]')?.removeAttribute('data-tv-pseudo-fullscreen');
    syncTvFullscreenUi();
  }

  function enterTvPseudoFullscreen(target) {
    if (!target) return;
    document.body.classList.add('noctra-tv-pseudo-fullscreen');
    target.setAttribute('data-tv-pseudo-fullscreen', 'true');
    showTvDesktopLiveControls(true);
    window.requestAnimationFrame(() => target.querySelector('.noctra-tv-screen-fullscreen')?.focus?.({ preventScroll: true }));
  }

  function enterTvNativeVideoFullscreen(video) {
    if (!video) return false;
    // Safari/iOS : Apple expose le plein écran natif sur HTMLVideoElement.
    // Plusieurs générations de WebKit ont conservé des variantes de nom ; on
    // les tente sans jamais déplacer/recharger la vidéo en cours de lecture.
    try {
      if (typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
        return true;
      }
      if (typeof video.webkitEnterFullScreen === 'function') {
        video.webkitEnterFullScreen();
        return true;
      }
      if (typeof video.webkitSetPresentationMode === 'function' && (!video.webkitSupportsPresentationMode || video.webkitSupportsPresentationMode('fullscreen'))) {
        video.webkitSetPresentationMode('fullscreen');
        return true;
      }
    } catch {}
    return false;
  }

  function tvVisibleVideo() {
    return document.querySelector('#noctra-tv-video:not([hidden])');
  }

  function tvStandalonePwa() {
    try {
      return Boolean(navigator.standalone) || Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
    } catch { return Boolean(navigator.standalone); }
  }

  function tvPictureInPictureSupported(video = tvVisibleVideo()) {
    return tvPictureInPictureCapability(video).supported;
  }

  function tvPictureInPictureCapability(video = tvVisibleVideo()) {
    if (!video) return { supported: false, mode: '', reason: 'no-video' };
    let webkitSupported = false;
    try {
      webkitSupported = Boolean(typeof video.webkitSupportsPresentationMode === 'function'
        && video.webkitSupportsPresentationMode('picture-in-picture'));
    } catch {}
    if (webkitSupported) return { supported: true, mode: 'webkit', reason: '' };
    // iOS standalone currently reports the standard API as enabled even when
    // every PiP request is rejected. The WebKit presentation probe is reliable.
    if (tvAppleTouchDevice() && tvStandalonePwa()) return { supported: false, mode: '', reason: 'ios-standalone' };
    const standard = Boolean(document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function');
    return { supported: standard, mode: standard ? 'standard' : '', reason: standard ? '' : 'unsupported' };
  }

  async function enterTvPictureInPicture({ automatic = false } = {}) {
    const video = tvVisibleVideo();
    if (!video || video.readyState < 1 || video.paused) {
      if (!automatic) toast('Lance d’abord le direct pour utiliser le Picture in Picture.');
      return false;
    }
    const capability = tvPictureInPictureCapability(video);
    if (capability.reason === 'ios-standalone') {
      if (!automatic) toast('La PWA installée depuis Safari fonctionne en mode app autonome. iOS y bloque actuellement le PiP. Ouvre l’adresse Noctra dans un onglet Safari pour utiliser le PiP natif.');
      return false;
    }
    try {
      if (capability.mode === 'webkit' && typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode('picture-in-picture');
        if (video.webkitPresentationMode === 'picture-in-picture') return true;
      }
      if (document.pictureInPictureElement === video) return true;
      if ((capability.mode === 'standard' || capability.mode === 'webkit')
          && document.pictureInPictureEnabled
          && typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        return document.pictureInPictureElement === video || video.webkitPresentationMode === 'picture-in-picture';
      }
    } catch (error) {
      if (!automatic) toast(error?.message || 'Le Picture in Picture natif n’est pas disponible ici.');
      return false;
    }
    if (!automatic) toast('Le Picture in Picture natif n’est pas disponible pour ce lecteur.');
    return false;
  }


  async function toggleTvFullscreen() {
    const card = tvFullscreenTarget();
    const screen = document.querySelector('.noctra-tv-screen');
    if (!card || !screen) return;

    // Le pseudo-fullscreen Noctra est un véritable état basculant : un second
    // clic doit toujours le fermer au lieu de tenter une nouvelle API native.
    if (document.body.classList.contains('noctra-tv-pseudo-fullscreen')) {
      exitTvPseudoFullscreen();
      return;
    }

    const standardFullscreen = document.fullscreenElement;
    const webkitFullscreen = document.webkitFullscreenElement;
    if (standardFullscreen || webkitFullscreen) {
      try {
        if (typeof document.exitFullscreen === 'function') await document.exitFullscreen();
        else if (typeof document.webkitExitFullscreen === 'function') document.webkitExitFullscreen();
      } catch {}
      return;
    }

    const video = document.querySelector('#noctra-tv-video:not([hidden])');
    const frame = document.querySelector('#noctra-tv-embed:not([hidden])');
    const appleTouch = tvAppleTouchDevice();
    const mobile = appleTouch || window.matchMedia?.('(pointer: coarse)').matches;
    // Keep the native request in the original user gesture, without awaiting play.
    if (video && mobile) {
      if (video.readyState < 1) {
        toast('Le direct charge encore. Touchez à nouveau Plein écran dès que l’image apparaît.');
        return;
      }
      try { if (video.paused) void video.play().catch(() => undefined); } catch {}
      if (appleTouch && enterTvNativeVideoFullscreen(video)) return;
      try {
        if (typeof video.requestFullscreen === 'function') {
          await video.requestFullscreen({ navigationUI: 'hide' });
          return;
        }
      } catch {}
      video.controls = true;
      enterTvPseudoFullscreen(card);
      return;
    }
    if (frame && appleTouch) {
      // iOS may not expose element fullscreen for cross-origin players.
      // Expand the existing card without moving or reloading its iframe.
      enterTvPseudoFullscreen(card);
      return;
    }

    // Navigateurs modernes desktop/Android : on place le viewport vidéo complet
    // dans l'API Fullscreen native du navigateur. L'iframe garde ainsi son état
    // et son bouton allowfullscreen sans être déplacée/rechargée.
    try {
      if (typeof screen.requestFullscreen === 'function') {
        await screen.requestFullscreen({ navigationUI: 'hide' });
        showTvDesktopLiveControls(true);
        return;
      }
      if (typeof screen.webkitRequestFullscreen === 'function') {
        screen.webkitRequestFullscreen();
        showTvDesktopLiveControls(true);
        return;
      }
      if (frame && typeof frame.requestFullscreen === 'function') {
        await frame.requestFullscreen();
        return;
      }
    } catch (error) {
      if (error?.name && !['NotAllowedError', 'TypeError'].includes(error.name)) toast(error.message || 'Impossible d’activer le plein écran natif.');
    }

    toast('Le plein écran natif n’est pas pris en charge par ce navigateur pour ce lecteur.');
  }


  function tryTvAutoPictureInPicture() {
    if (document.visibilityState !== 'hidden' || (tvAppleTouchDevice() && tvStandalonePwa())) return;
    const video = tvVisibleVideo();
    if (!video || video.paused || video.ended || tvState.currentPlaybackType !== 'stream') return;
    void enterTvPictureInPicture({ automatic: true });
  }

  function renderTvGuideForChannel(channel) {
    const programme = document.querySelector('[data-tv-now-programme]');
    const nextProgramme = document.querySelector('[data-tv-next-programme]');
    const nextRow = document.querySelector('[data-tv-next-row]');
    const guideNote = document.querySelector('[data-tv-guide-note]');
    if (programme) {
      programme.textContent = channel.now?.title
        ? `${channel.now.title}${channel.now.stop ? ` · jusqu’à ${tvClock(channel.now.stop)}` : ''}`
        : channel.description || 'Programme non renseigné par la source.';
      programme.closest('.noctra-tv-guide-row')?.setAttribute('data-state', channel.now?.title ? 'available' : 'missing');
    }
    if (nextProgramme) {
      const next = channel.next?.title ? `${channel.next.title}${channel.next.start ? ` · ${tvClock(channel.next.start)}` : ''}` : '';
      nextProgramme.textContent = next;
      if (nextRow) nextRow.hidden = !next;
    }
    if (guideNote) {
      const hasGuide = Boolean(channel.now?.title || channel.next?.title);
      guideNote.textContent = hasGuide
        ? (channel.guideProvider ? `Guide programmes · ${channel.guideProvider}` : 'Guide programmes synchronisé.')
        : channel.iptvOrgId
          ? 'Recherche automatique du guide programmes…'
          : (channel.provider === 'LiveWatch'
            ? 'Aucun EPG n’est fourni directement par LiveWatch. Noctra tente un rapprochement avec un guide public lorsqu’il reconnaît la chaîne.'
            : 'Aucun guide de programmes n’est associé à cette chaîne.');
    }
  }

  async function hydrateTvGuide(channel, index) {
    if (!channel?.iptvOrgId || channel.now?.title) return;
    try {
      const data = await cachedApi(`/api/tv/programme?id=${encodeURIComponent(channel.iptvOrgId)}`, 2 * 60_000, { timeoutMs: 12_000 });
      if (Number(tvState.currentChannelIndex) !== Number(index)) return;
      if (data?.now) channel.now = data.now;
      if (data?.next) channel.next = data.next;
      tvSearchBlobCache.delete(channel);
      if (data?.provider) channel.guideProvider = data.provider;
      renderTvGuideForChannel(channel);
    } catch {
      if (Number(tvState.currentChannelIndex) !== Number(index)) return;
      const note = document.querySelector('[data-tv-guide-note]');
      if (note) note.textContent = 'Guide programmes indisponible pour cette chaîne pour le moment.';
    }
  }

  const LIVEWATCH_OFFICIAL_EMBED_SOURCES = new Set([
    'livewatch-north',
    'livewatch-frame',
    'livewatch-sports',
    'livewatch-football',
    'livewatch-bosstv',
    'livewatch-jacktv',
    'livewatch-daily'
  ]);

  function currentTvSource() {
    return (tvState.sources || []).find(source => source.id === tvState.sourceId) || tvState.catalog?.source || null;
  }

  function liveWatchOfficialEmbedSource() {
    return LIVEWATCH_OFFICIAL_EMBED_SOURCES.has(String(tvState.sourceId || ''));
  }

  function officialLiveWatchEmbedUrl(channel) {
    const candidates = [channel?.vipFallbackUrl, channel?.externalUrl, channel?.embedUrl];
    return String(candidates.find(value => /^https?:\/\//i.test(String(value || '').trim())) || '').trim();
  }

  function documentedLiveWatchEmbedReference(value) {
    try {
      const url = new URL(String(value || ''), window.location.origin);
      if (!['livewatch.top', 'www.livewatch.top'].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/embed\/(?:(north|frame)\/)?([^/]+)\/?$/i);
      if (!match) return null;
      return { kind: String(match[1] || 'main').toLowerCase(), id: decodeURIComponent(match[2]) };
    } catch {
      return null;
    }
  }

  async function playDocumentedLiveWatchEmbed(channel, index, playbackSequence) {
    if (!liveWatchOfficialEmbedSource()) return false;
    if (channel?.playbackType === 'resolver' && channel?.resolverUrl) return false;
    const officialUrl = officialLiveWatchEmbedUrl(channel);
    if (!officialUrl) return false;
    const source = currentTvSource();
    const sourceId = String(tvState.sourceId || '');
    const provider = String(source?.name || channel?.provider || 'LiveWatch').trim() || 'LiveWatch';
    const reference = documentedLiveWatchEmbedReference(officialUrl);
    const northSameOrigin = sourceId === 'livewatch-north'
      && reference?.kind === 'north'
      && Boolean(channel?.liveWatchSameOriginBridge || tvState.catalog?.liveWatchVip?.active);
    let playbackUrl = officialUrl;
    if (northSameOrigin) {
      setTvPlaybackStatus(`${provider} · préparation du lecteur sécurisé…`, 'loading');
      try {
        const prepared = await api(`/api/tv/livewatch/prepare/north/${encodeURIComponent(reference.id)}`, { timeoutMs: 15_000 });
        if (playbackSequence !== tvPlaybackSequence) return true;
        playbackUrl = String(prepared?.embedUrl || '');
        if (!playbackUrl) throw new Error('Le relais NorthTV n’a pas fourni de lecteur.');
      } catch (error) {
        if (playbackSequence !== tvPlaybackSequence) return true;
        setTvPlaybackStatus(`${provider} · lecteur sécurisé indisponible`, 'error');
        toast(error.message || 'Le lecteur NorthTV ne peut pas être préparé.');
        return true;
      }
    }
    const mandatoryGate = !northSameOrigin && sourceId.startsWith('livewatch-') && sourceId !== 'livewatch-curated';
    const safeChannel = {
      ...channel,
      provider,
      playbackType: 'embed',
      embedUrl: playbackUrl,
      externalUrl: officialUrl,
      resolverUrl: '',
      vipPlayback: northSameOrigin,
      vipFallbackUrl: northSameOrigin ? officialUrl : '',
      liveWatchDocsEmbed: !northSameOrigin,
      liveWatchMandatoryAd: mandatoryGate,
      liveWatchSameOriginBridge: northSameOrigin
    };
    // Défense côté client V125 : la famille sélectionnée gagne toujours sur les
    // champs de lecture éventuellement hérités d'un ancien catalogue Safari/PWA.
    // Même si l'objet contient encore vipPlayback/resolverUrl, Daddy/North/Frame
    // et les wrappers Sports repartent de leur embed_url officiel exact.
    if (tvState.catalog?.channels?.[Number(index)]) tvState.catalog.channels[Number(index)] = safeChannel;
    tvState.resolvedEmbeds = [{
      label: northSameOrigin ? `${provider} · relais officiel` : (mandatoryGate ? `${provider} · lecteur officiel` : `${provider} · embed officiel`),
      url: playbackUrl,
      playbackType: 'embed',
      compatPage: northSameOrigin,
      officialClient: true
    }];
    renderTvStreamOptions(tvState.resolvedEmbeds, 0);
    setTvPlaybackStatus(northSameOrigin
      ? `${provider} · ouverture du lecteur officiel sécurisé…`
      : mandatoryGate
        ? `${provider} · lecteur officiel · étape intégrée`
        : `${provider} · lecteur officiel…`, 'loading');
    playTvEmbedUrl(safeChannel, playbackUrl, '', { compatPage: northSameOrigin, optionIndex: 0 }, playbackSequence);
    return true;
  }

  async function playTvChannel(index) {
    const channel = tvState.catalog?.channels?.[Number(index)];
    const video = document.querySelector('#noctra-tv-video');
    const frame = document.querySelector('#noctra-tv-embed');
    if (!channel || !video) return;
    if (tvEnginePreference === 'shaka') void ensureShakaLibrary().catch(() => {});
    destroyTvPlayback();
    window.NoctraServerChoice?.begin(tvState.section === 'channels');
    tvPlaybackStartedAt = performance.now();
    const playbackSequence = tvPlaybackSequence;
    const placeholder = video.parentElement?.querySelector('.noctra-tv-placeholder');
    if (placeholder) placeholder.hidden = true;
    const title = document.querySelector('[data-tv-now-title]');
    const group = document.querySelector('[data-tv-now-group]');
    const score = document.querySelector('[data-tv-now-score]');
    const logo = document.querySelector('[data-tv-now-logo]');
    renderTvGuideForChannel(channel);
    void hydrateTvGuide(channel, index);
    if (title) title.textContent = channel.name || 'Chaîne TV';
    if (group) group.textContent = [channel.provider, channel.group].filter(Boolean).join(' · ') || 'TV en direct';
    if (score) {
      score.textContent = channel.score || '';
      score.hidden = !channel.score;
    }
    if (logo) {
      logo.dataset.tvLogoLabel = channel.name || 'TV';
      logo.dataset.tvLogoState = 'idle';
      logo.innerHTML = tvLogoMarkup(channel, '', true);
    }
    const badges = document.querySelector('[data-tv-now-badges]');
    if (badges) badges.innerHTML = tvChannelMeta(channel).map(value => `<span>${escapeHtml(value)}</span>`).join('');
    const external = document.querySelector('[data-tv-open-external]');
    if (external) {
      const externalUrl = channel.externalUrl || channel.embedUrl || '';
      external.hidden = !externalUrl;
      external.dataset.tvOpenExternal = externalUrl;
      external.href = externalUrl;
    }
    tvState.currentChannelIndex = Number(index);
    const profile = tvConnectionProfile();
    recordTvDiagnostic('channel-requested', {
      playbackSequence,
      playbackType: String(channel.playbackType || ''),
      profile: profile.weak ? 'conservative' : 'standard',
      effectiveType: profile.effectiveType || 'unknown'
    });
    ensureTvChannelVisible(index);
    if (usesCompactLayout()) setTvMobileView('player');
    updateTvCastButton(channel);
    tvState.resolvedEmbeds = [];
    renderTvStreamOptions([]);
    document.querySelectorAll('[data-tv-channel-index]').forEach(button => button.dataset.active = String(Number(button.dataset.tvChannelIndex) === Number(index)));
    setTvPlaybackStatus('Connexion…', 'loading');

    // V121 : Daddy/North/Frame et les univers Sports LiveWatch utilisent leurs
    // embed_url officiels. Ce garde-fou client corrige aussi un catalogue ancien
    // encore présent dans le cache Safari/PWA et empêche « initialisation VIP… ».
    if (await playDocumentedLiveWatchEmbed(channel, index, playbackSequence)) return;

    if (channel.playbackType === 'resolver' && channel.resolverUrl) {
      try { await resolveAndPlayTvChannel(channel, playbackSequence); }
      catch (error) {
        if (playbackSequence !== tvPlaybackSequence) return;
        const provider = channel.provider || 'TV';
        if (Number(error?.status) === 410) {
          setTvPlaybackStatus(`${provider} · actualisation du lecteur…`, 'loading');
          const wantedName = channel.name;
          try {
            clearApiCache('/api/tv');
            await openTv(tvState.sourceId, tvState.ref, { force: true });
            const refreshedIndex = (tvState.catalog?.channels || []).findIndex(item => item.name === wantedName);
            if (refreshedIndex >= 0) { await playTvChannel(refreshedIndex); return; }
          } catch {}
        }
        setTvPlaybackStatus(`Lecteur ${provider} indisponible`, 'error');
        toast(error.message || `Le lecteur ${provider} n’est pas disponible.`);
      }
      return;
    }

    if (channel.playbackType === 'embed' && channel.embedUrl) {
      const compatPage = Boolean(channel.compatPage) || channel.provider === 'WiTV';
      const statusLabel = channel.provider === 'WiTV'
        ? 'Page WiTV chargée'
        : channel.liveWatchMandatoryAd
          ? `${channel.provider || 'LiveWatch'} · lecteur officiel chargé · débloque la chaîne dans le lecteur`
          : channel.vipPlayback
            ? `LiveWatch · VIP Premium · ${channel.provider || 'LiveWatch'}`
            : channel.provider === 'LiveWatch' ? 'Lecteur LiveWatch chargé' : '';
      if (channel.liveWatchMandatoryAd) {
        tvState.resolvedEmbeds = [
          { label: 'LiveWatch officiel · étape publicitaire', url: channel.embedUrl, playbackType: 'embed', compatPage: false }
        ];
        renderTvStreamOptions(tvState.resolvedEmbeds, 0);
      } else if (channel.vipPlayback) {
        tvState.resolvedEmbeds = [
          { label: 'VIP Premium', url: channel.embedUrl, playbackType: 'embed', compatPage: true, vip: true },
          ...(channel.vipFallbackUrl ? [{ label: 'Public · 2 pubs (secours)', url: channel.vipFallbackUrl, playbackType: 'embed', fallback: true }] : [])
        ];
        renderTvStreamOptions(tvState.resolvedEmbeds, 0);
      }
      playTvEmbedUrl(channel, channel.embedUrl, statusLabel, { compatPage: channel.vipPlayback ? true : compatPage }, playbackSequence);
      // V77 : avec un VIP actif, cette iframe est le bridge authentifié
      // Noctra. Le lecteur public avec publicités n'est jamais sélectionné
      // automatiquement ; il reste un secours manuel explicite.
      return;
    }

    if (channel.vipPlayback && channel.streamUrl) {
      const vipOptions = [
        { label: 'VIP Premium', streamUrl: channel.streamUrl, playbackType: 'stream', vip: true },
        ...(channel.vipFallbackUrl || channel.embedUrl
          ? [{ label: 'Lecteur public (secours)', url: channel.vipFallbackUrl || channel.embedUrl, playbackType: 'embed', compatPage: false, fallback: true }]
          : [])
      ];
      tvState.resolvedEmbeds = vipOptions;
      renderTvStreamOptions(vipOptions, 0);
      setTvPlaybackStatus('LiveWatch · connexion VIP Premium…', 'loading');
      await playTvResolvedOption(channel, vipOptions[0], 0, playbackSequence);
      return;
    }

    await playTvDirectStream(channel, channel.streamUrl, '', playbackSequence);
  }

  function setTvMobileView(view) {
    const nextView = view === 'player' ? 'player' : 'channels';
    tvState.mobileView = nextView;
    const shell = document.querySelector('.noctra-tv-shell');
    if (shell) shell.dataset.tvMobileView = nextView;
    document.querySelectorAll('[data-tv-mobile-view]').forEach(button => {
      button.dataset.active = String(button.dataset.tvMobileView === nextView);
    });
    if (nextView === 'player' && usesCompactLayout()) {
      window.requestAnimationFrame(() => {
        const card = document.querySelector('.noctra-tv-player-card');
        const body = card?.closest('.noctra-panel-body');
        if (card && body) body.scrollTop = Math.max(0, body.scrollTop + card.getBoundingClientRect().top - body.getBoundingClientRect().top - 12);
      });
    }
  }

  async function zapTvChannel(direction) {
    const matches = filteredTvChannels();
    if (!matches.length) return;
    const currentPosition = matches.findIndex(item => Number(item.index) === Number(tvState.currentChannelIndex));
    const offset = Number(direction) < 0 ? -1 : 1;
    const nextPosition = currentPosition < 0
      ? 0
      : (currentPosition + offset + matches.length) % matches.length;
    await playTvChannel(matches[nextPosition].index);
  }

  function applyTvChannelFilters({ resetLimit = true } = {}) {
    const searchInput = document.querySelector('[data-tv-search]');
    const groupInput = document.querySelector('[data-tv-group-filter]');
    tvState.search = searchInput?.value || '';
    tvState.group = groupInput?.value || 'Toutes';
    renderTvChannelList({ resetLimit });
  }

  function scheduleTvChannelFilters() {
    window.clearTimeout(tvFilterTimer);
    const delay = desktopPerformanceProfile() ? 105 : 55;
    tvFilterTimer = window.setTimeout(() => requestAnimationFrame(() => applyTvChannelFilters({ resetLimit: true })), delay);
  }

  function torrentMatchesFilter(item) {
    const query = normalizedText(downloadsUiState.search || '');
    if (query && !normalizedText(`${item.name} ${item.category} ${item.tags} ${item.stateLabel}`).includes(query)) return false;
    if (downloadsUiState.filter === 'downloading') return !item.completed && item.active && !item.errored;
    if (downloadsUiState.filter === 'seeding') return item.completed && item.active && !item.errored;
    if (downloadsUiState.filter === 'paused') return !item.active && !item.errored;
    if (downloadsUiState.filter === 'error') return item.errored;
    return true;
  }

  function downloadsPageSize() {
    return window.matchMedia?.('(max-width: 760px)')?.matches ? 30 : 60;
  }

  function visibleDownloadTorrents(data) {
    const matches = (Array.isArray(data?.torrents) ? data.torrents : []).filter(torrentMatchesFilter);
    if (!Number(downloadsUiState.visibleLimit)) downloadsUiState.visibleLimit = downloadsPageSize();
    return { matches, visible: matches.slice(0, downloadsUiState.visibleLimit) };
  }

  function downloadListRenderKey(visible) {
    return `${downloadsUiState.filter}|${downloadsUiState.search}|${downloadsUiState.visibleLimit}|${visible.map(item => item.hash).join(',')}`;
  }

  function torrentSeedStatus(item) {
    if (item?.errored) return { state: 'error', label: 'Seed indisponible' };
    if (!item?.completed) return { state: 'pending', label: 'Pas encore en seed' };
    if (item?.active) return { state: 'active', label: 'En seed' };
    return { state: 'stopped', label: 'Seed arrêté' };
  }

  function torrentFileSeedStatus(file, torrent) {
    if (Number(file?.priority || 0) <= 0) return { state: 'ignored', label: 'Ignoré' };
    if (Number(file?.progress || 0) < .999999) return { state: 'pending', label: 'À télécharger' };
    const torrentStatus = torrentSeedStatus(torrent);
    return torrentStatus.state === 'active'
      ? torrentStatus
      : { state: torrentStatus.state === 'error' ? 'error' : 'stopped', label: torrentStatus.state === 'error' ? 'Seed indisponible' : 'Complet, seed arrêté' };
  }

  function torrentRow(item) {
    const progress = Math.max(0, Math.min(100, Number(item.progress || 0) * 100));
    const stateClass = item.errored ? 'error' : item.completed ? 'complete' : item.active ? 'active' : 'paused';
    const seedStatus = torrentSeedStatus(item);
    const eta = item.completed ? 'Terminé' : formatDuration(item.eta);
    const peers = `${item.seeds}/${item.seedsTotal || '—'} seeds · ${item.peers}/${item.peersTotal || '—'} pairs`;
    return `
      <article class="noctra-torrent-card" data-download-hash="${escapeHtml(item.hash)}" data-state="${stateClass}">
        <header>
          <div class="noctra-torrent-title">
            <span class="noctra-torrent-state-dot"></span>
            <div><h3 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3><p data-download-state-label>${escapeHtml(item.stateLabel || item.state)}${item.category ? ` · ${escapeHtml(item.category)}` : ''}</p><span class="noctra-torrent-seed-status" data-download-seed-status data-state="${seedStatus.state}">${escapeHtml(seedStatus.label)}</span></div>
          </div>
          <strong class="noctra-torrent-percent" data-download-percent>${progress.toFixed(progress < 10 ? 1 : 0)}%</strong>
        </header>
        <div class="noctra-progress noctra-progress--torrent"><i data-download-progress style="width:${progress}%"></i></div>
        <div class="noctra-torrent-stats">
          <span><small>Réception</small><strong data-download-stat="download">${formatSpeed(item.downloadSpeed)}</strong></span>
          <span><small>Émission</small><strong data-download-stat="upload">${formatSpeed(item.uploadSpeed)}</strong></span>
          <span><small>Restant</small><strong data-download-stat="remaining">${formatBytes(item.remaining)}</strong></span>
          <span><small>ETA</small><strong data-download-stat="eta">${eta}</strong></span>
          <span><small>Ratio</small><strong data-download-stat="ratio">${Number(item.ratio || 0).toFixed(2)}</strong></span>
          <span><small>Sources</small><strong data-download-stat="peers">${escapeHtml(peers)}</strong></span>
        </div>
        <div class="noctra-torrent-meta">
          <span data-download-meta="size">${formatBytes(item.downloaded)} / ${formatBytes(item.size)}</span>
          ${item.availability >= 0 ? `<span data-download-meta="availability">Disponibilité ${Number(item.availability).toFixed(2)}</span>` : ''}
          <span>Ajouté ${formatTimestamp(item.addedOn)}</span>
        </div>
        <div class="noctra-torrent-actions">
          <button class="noctra-button" type="button" data-torrent="${escapeHtml(item.hash)}"
            data-torrent-action="${item.active ? 'pause' : 'resume'}">${item.active ? 'Pause' : 'Reprendre'}</button>
          <button class="noctra-button" type="button" data-download-details="${escapeHtml(item.hash)}" data-download-name="${escapeHtml(item.name)}">${icons.info}<span>Détails</span></button>
          <button class="noctra-icon-button" type="button" data-torrent-maintenance="reannounce" data-torrent-hash="${escapeHtml(item.hash)}" title="Réannoncer" aria-label="Réannoncer">${icons.announce}</button>
          <button class="noctra-icon-button" type="button" data-torrent-maintenance="recheck" data-torrent-hash="${escapeHtml(item.hash)}" title="Revérifier" aria-label="Revérifier">${icons.verify}</button>
          <button class="noctra-icon-button noctra-icon-button--danger" type="button"
            data-delete-torrent="${escapeHtml(item.hash)}" data-delete-name="${escapeHtml(item.name)}"
            aria-label="Supprimer">${icons.trash}</button>
        </div>
      </article>`;
  }

  function downloadTrackerRenderKey(trackers) {
    return trackers.slice(0, 15).map(item => [item.host, item.uploaded, item.downloaded, item.torrents, item.active, item.peers].join(':')).join('|');
  }

  function downloadRatio(value) {
    return Number(value) < 0 ? '∞' : Number(value || 0).toFixed(2);
  }

  function downloadTrackerRows(trackers) {
    return trackers.slice(0, 15).map(item => `<tr>
      <td><strong>${escapeHtml(item.host || 'Sans tracker')}</strong><small>${Number(item.active || 0)} actif${Number(item.active || 0) > 1 ? 's' : ''}</small></td>
      <td>${formatBytes(item.uploaded)}</td>
      <td>${formatBytes(item.downloaded)}</td>
      <td>${downloadRatio(item.ratio)}</td>
      <td data-state="${Number(item.balance || 0) >= 0 ? 'positive' : 'negative'}">${Number(item.balance || 0) >= 0 ? '+' : '−'}${formatBytes(Math.abs(Number(item.balance || 0)))}</td>
      <td>${Number(item.torrents || 0)}</td>
      <td>${formatBytes(item.size)}</td>
    </tr>`).join('');
  }

  function downloadInstanceDashboard(data) {
    const dashboard = data.dashboard || {};
    const trackers = Array.isArray(dashboard.trackers) ? dashboard.trackers : [];
    const app = dashboard.app || {};
    return `<section class="noctra-qbit-instance" aria-label="Tableau de bord qBittorrent">
      <header class="noctra-qbit-instance-head"><div><p class="noctra-eyebrow">INSTANCE QBITTORRENT</p><h4>Statistiques du serveur</h4></div><span data-download-app-version>${escapeHtml([app.version && `qBit ${app.version}`, app.webApiVersion && `API ${app.webApiVersion}`, app.libtorrent && `libtorrent ${app.libtorrent}`].filter(Boolean).join(' · ') || 'Version indisponible')}</span></header>
      <div class="noctra-qbit-instance-metrics">
        <span><small>Téléchargé</small><strong data-download-dashboard="downloaded">${formatBytes(dashboard.allTimeDownloaded)}</strong></span>
        <span><small>Envoyé</small><strong data-download-dashboard="uploaded">${formatBytes(dashboard.allTimeUploaded)}</strong></span>
        <span><small>Ratio global</small><strong data-download-dashboard="ratio">${downloadRatio(dashboard.globalRatio)}</strong></span>
        <span><small>Taille suivie</small><strong data-download-dashboard="size">${formatBytes(dashboard.totalSize)}</strong></span>
        <span><small>En partage</small><strong data-download-dashboard="active-size">${formatBytes(dashboard.activeSize)}</strong></span>
        <span><small>Pairs actifs</small><strong data-download-dashboard="peers">${Number(dashboard.activePeers || 0)}</strong></span>
      </div>
      <div class="noctra-qbit-trackers">
        <header><div><p class="noctra-eyebrow">RÉPARTITION PAR TRACKER</p><h4>Activité de partage</h4></div><span><strong data-download-tracker-count>${Number(dashboard.trackerCount || trackers.length)}</strong> trackers</span></header>
        <div class="noctra-qbit-tracker-table"><table><thead><tr><th>Tracker</th><th>Envoyé</th><th>Téléchargé</th><th>Ratio</th><th>Solde</th><th>Torrents</th><th>Taille</th></tr></thead><tbody data-download-trackers data-download-tracker-key="${escapeHtml(downloadTrackerRenderKey(trackers))}">${downloadTrackerRows(trackers)}</tbody></table></div>
      </div>
    </section>`;
  }

  function downloadsMarkup(data) {
    const allTorrents = Array.isArray(data.torrents) ? data.torrents : [];
    const { matches: torrents, visible } = visibleDownloadTorrents(data);
    const counts = data.counts || {};
    const statusLabel = data.connectionStatus === 'connected' ? 'Connecté' : data.connectionStatus || 'État inconnu';
    return `
      <section class="noctra-download-dashboard">
        <div class="noctra-download-hero">
          <div><p class="noctra-eyebrow">QBITTORRENT · TEMPS RÉEL</p><h3>Centre de téléchargements</h3><p data-download-connection>${escapeHtml(statusLabel)} · ${formatBytes(data.freeSpace)} libres</p></div>
          <div class="noctra-download-transfer">
            <span><small>↓ Réception</small><strong data-download-metric="download">${formatSpeed(data.downloadSpeed)}</strong><em>${data.downloadLimit ? `limite ${formatSpeed(data.downloadLimit)}` : 'illimitée'}</em></span>
            <span><small>↑ Émission</small><strong data-download-metric="upload">${formatSpeed(data.uploadSpeed)}</strong><em>${data.uploadLimit ? `limite ${formatSpeed(data.uploadLimit)}` : 'illimitée'}</em></span>
          </div>
        </div>
        <div class="noctra-download-counts">
          ${[['all','Total',counts.total || allTorrents.length],['downloading','En cours',counts.downloading || 0],['seeding','Partage',counts.seeding || 0],['paused','Pause',counts.paused || 0],['error','Erreurs',counts.error || 0]].map(([id,label,count]) => `<button type="button" data-download-filter="${id}" data-active="${downloadsUiState.filter === id}"><small>${label}</small><strong data-download-count="${id}">${count}</strong></button>`).join('')}
        </div>
        ${downloadInstanceDashboard(data)}
        <div class="noctra-download-toolbar">
          <label>${icons.search}<input type="search" data-download-search value="${escapeHtml(downloadsUiState.search)}" placeholder="Filtrer par nom, catégorie ou état"></label>
          <div class="noctra-download-toolbar-actions"><span data-download-summary>${visible.length}${visible.length < torrents.length ? ` sur ${torrents.length}` : ''} affiché${visible.length > 1 ? 's' : ''} · ${formatBytes(data.downloaded)} reçus · ${formatBytes(data.uploaded)} envoyés</span><div class="noctra-download-toolbar-buttons"><button class="noctra-button noctra-download-add-button" type="button" data-download-add-torrent>${icons.plus}<span>Ajouter un .torrent</span></button><button class="noctra-button noctra-download-relink-button" type="button" data-download-relink-all>${icons.relink}<span>Relocaliser pour le seed</span></button></div></div>
        </div>
        <div class="noctra-download-relink-status" data-download-relink-status hidden></div>
        <div id="noctra-download-detail"></div>
        <div class="noctra-download-list" data-download-list data-download-render-key="${escapeHtml(downloadListRenderKey(visible))}">${visible.map(torrentRow).join('') || '<div class="noctra-empty">Aucun torrent pour ce filtre.</div>'}${visible.length < torrents.length ? `<button class="noctra-button noctra-download-load-more" type="button" data-download-load-more><strong>Afficher plus</strong><span>${visible.length} sur ${torrents.length}</span></button>` : ''}</div>
      </section>`;
  }

  function downloadRelinkStatusMarkup(status) {
    const total = Math.max(0, Number(status?.total || 0));
    const processed = Math.max(0, Number(status?.processed || 0));
    const progress = total ? Math.min(100, Math.round((processed / total) * 100)) : (status?.phase === 'complete' ? 100 : 0);
    const running = Boolean(status?.running);
    const title = running
      ? (status.phase === 'scan' ? 'Analyse des sources de seed' : status.phase === 'verify' ? 'Revérification qBittorrent sans téléchargement' : 'Relocalisation en cours')
      : (status?.phase === 'failed' ? 'Relocalisation interrompue' : 'Relocalisation terminée');
    const resultItems = (Array.isArray(status?.results) ? status.results : []).slice(-5).reverse();
    return `<div class="noctra-download-relink-head"><span>${icons.relink}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(status?.message || 'Préparation…')}${status?.current ? ` · ${escapeHtml(status.current)}` : ''}</small></div><b>${running && total ? `${progress}%` : `${Number(status?.relinked || 0)} relocalisé${Number(status?.relinked || 0) > 1 ? 's' : ''}`}</b></div>
      <div class="noctra-download-relink-progress" aria-label="Progression de la relocalisation"><i style="width:${progress}%"></i></div>
      <div class="noctra-download-relink-metrics"><span><small>Traités</small><strong>${processed} / ${total || '—'}</strong></span><span><small>Relocalisés</small><strong>${Number(status?.relinked || 0)}</strong></span><span><small>Vérifiés à 100 %</small><strong>${Number(status?.verified || 0)}</strong></span><span><small>Remis en partage</small><strong>${Number(status?.reseeded || 0)}</strong></span><span><small>Ignorés</small><strong>${Number(status?.skipped || 0)}</strong></span><span><small>Non vérifiés</small><strong>${Number(status?.verificationFailed || 0) + Number(status?.verificationPending || 0)}</strong></span></div>
      ${resultItems.length ? `<div class="noctra-download-relink-results">${resultItems.map(item => `<span data-state="${escapeHtml(item.status || '')}"><strong>${escapeHtml(item.name || 'Torrent')}</strong><small>${escapeHtml(item.message || '')}</small></span>`).join('')}</div>` : ''}`;
  }

  function stopDownloadRelinkPolling() {
    window.clearTimeout(downloadRelinkTimer);
    downloadRelinkTimer = null;
  }

  function renderDownloadRelinkStatus(status) {
    const target = document.querySelector('[data-download-relink-status]');
    if (!target) return;
    lastDownloadRelinkStatus = status;
    downloadRelinkFailures = 0;
    const visible = Boolean(status?.running || ['complete', 'failed'].includes(status?.phase));
    target.hidden = !visible;
    if (visible) {
      target.dataset.state = status.phase || 'idle';
      target.innerHTML = downloadRelinkStatusMarkup(status);
    }
    const button = document.querySelector('[data-download-relink-all]');
    if (button) {
      button.disabled = Boolean(status?.running);
      button.dataset.busy = String(Boolean(status?.running));
      const label = button.querySelector('span');
      if (label) label.textContent = status?.running ? 'Relocalisation en cours' : 'Relocaliser pour le seed';
    }
  }

  function downloadRelinkHtmlResponse(error) {
    return error?.code === 'NOCTRA_HTML_RESPONSE' || /page HTML|réponse API non JSON/i.test(String(error?.message || ''));
  }

  async function readDownloadsApi(path, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const retryPath = attempt
        ? `${path}${path.includes('?') ? '&' : '?'}proxyRetry=${Date.now()}-${attempt}`
        : path;
      try {
        return await api(retryPath, options);
      } catch (error) {
        lastError = error;
        if (!downloadRelinkHtmlResponse(error) || attempt === 2) throw error;
        await wait(450 + attempt * 500);
      }
    }
    throw lastError;
  }

  async function requestDownloadRelinkStatus() {
    try {
      return await readDownloadsApi(`/api/downloads/relink/status?live=${Date.now()}`, { cache: 'no-store', timeoutMs: 8_000 });
    } catch (error) {
      if (!downloadRelinkHtmlResponse(error)) throw error;
      const snapshot = await readDownloadsApi(`/api/downloads?relink=${Date.now()}`, { cache: 'no-store', timeoutMs: 12_000 });
      if (!snapshot?.relink) throw error;
      lastDownloadsData = snapshot;
      return snapshot.relink;
    }
  }

  async function refreshDownloadRelinkStatus() {
    if (!downloadsPanelIsOpen()) {
      stopDownloadRelinkPolling();
      return;
    }
    try {
      const status = await requestDownloadRelinkStatus();
      renderDownloadRelinkStatus(status);
      if (status.running) {
        downloadRelinkTimer = window.setTimeout(refreshDownloadRelinkStatus, 1_200);
      } else {
        stopDownloadRelinkPolling();
        const completionKey = `${status.finishedAt || ''}|${status.phase || ''}`;
        if (status.finishedAt && completionKey !== downloadRelinkCompletion) {
          downloadRelinkCompletion = completionKey;
          toast(status.message || (status.phase === 'complete' ? 'Relocalisation terminée.' : 'La relocalisation a échoué.'));
          scheduleDownloadsLive(350);
        }
      }
    } catch (error) {
      downloadRelinkFailures += 1;
      const target = document.querySelector('[data-download-relink-status]');
      if (target && lastDownloadRelinkStatus?.running) {
        target.hidden = false;
        target.dataset.state = 'retrying';
        target.innerHTML = downloadRelinkStatusMarkup({
          ...lastDownloadRelinkStatus,
          message: `${lastDownloadRelinkStatus.message || 'Relocalisation en cours'} · reconnexion du suivi…`
        });
      } else if (target && !downloadRelinkHtmlResponse(error)) {
        target.hidden = false;
        target.dataset.state = 'failed';
        target.innerHTML = `<div class="noctra-error noctra-error--compact">${escapeHtml(error.message || 'Suivi de la relocalisation indisponible.')}</div>`;
      }
      if (downloadsPanelIsOpen() && (lastDownloadRelinkStatus?.running || downloadRelinkFailures < 4)) {
        downloadRelinkTimer = window.setTimeout(refreshDownloadRelinkStatus, Math.min(6_000, 1_800 + downloadRelinkFailures * 700));
      } else stopDownloadRelinkPolling();
    }
  }

  async function startDownloadRelink() {
    const button = document.querySelector('[data-download-relink-all]');
    if (button) { button.disabled = true; button.dataset.busy = 'true'; }
    stopDownloadsLive();
    try {
      // Some reverse proxies only forward /api/downloads and return index.html
      // for nested API paths. This alias keeps the relink operation on the
      // working qBittorrent route.
      const preview = await readDownloadsApi(`/api/downloads?relinkPreview=${Date.now()}`, { cache: 'no-store', timeoutMs: 15_000 });
      if (preview.running) {
        await refreshDownloadRelinkStatus();
        return;
      }
      if (!Number(preview.candidates || 0)) {
        toast('Aucun torrent terminé rattaché à Trash ou marqué comme manquant.');
        return;
      }
      const confirmed = window.confirm(`${preview.candidates} torrent${Number(preview.candidates) > 1 ? 's' : ''} peuvent être traités : ${preview.readyToReseed || 0} sont déjà confirmés à 100 % et seront remis en partage, ${preview.relinkCandidates ?? preview.candidates} doivent retrouver leurs fichiers, dont ${preview.missing} en erreur et ${preview.pausedIncomplete || 0} incomplet${Number(preview.pausedIncomplete || 0) > 1 ? 's' : ''} arrêté${Number(preview.pausedIncomplete || 0) > 1 ? 's' : ''}.\n\nNoctra utilisera uniquement des fichiers de même taille dont le nom correspond dans les médiathèques ou les seeds existants. Les annexes absentes seront désélectionnées. Chaque torrent incomplet restera arrêté pendant sa revérification et ne sera remis en partage qu'après confirmation à 100 %. Aucun téléchargement ne sera lancé. Continuer ?`);
      if (!confirmed) return;
      const status = await api(`/api/downloads?relinkStart=${Date.now()}`, { method: 'POST', timeoutMs: 15_000 });
      renderDownloadRelinkStatus(status);
      stopDownloadRelinkPolling();
      downloadRelinkTimer = window.setTimeout(refreshDownloadRelinkStatus, 600);
    } catch (error) {
      toast(error.message || 'La relocalisation n’a pas pu démarrer.');
    } finally {
      if (button && !downloadRelinkTimer) {
        button.disabled = false;
        button.dataset.busy = 'false';
      }
      if (!downloadRelinkTimer) scheduleDownloadsLive(500);
    }
  }

  function downloadsPanelIsOpen() {
    const backdrop = document.querySelector('#noctra-backdrop');
    return backdrop?.dataset.open === 'true' && Boolean(document.querySelector('#noctra-downloads-view'));
  }

  function updateDownloadsView(data) {
    const view = document.querySelector('#noctra-downloads-view');
    if (!view) return;
    const allTorrents = Array.isArray(data.torrents) ? data.torrents : [];
    const { matches, visible } = visibleDownloadTorrents(data);
    const panelBody = view.closest('.noctra-panel-body');
    const scroll = panelBody?.scrollTop || 0;
    const setText = (selector, value) => {
      const node = view.querySelector(selector);
      if (node && node.textContent !== String(value)) node.textContent = String(value);
    };
    const counts = data.counts || {};
    const statusLabel = data.connectionStatus === 'connected' ? 'Connecté' : data.connectionStatus || 'État inconnu';
    setText('[data-download-connection]', `${statusLabel} · ${formatBytes(data.freeSpace)} libres`);
    setText('[data-download-metric="download"]', formatSpeed(data.downloadSpeed));
    setText('[data-download-metric="upload"]', formatSpeed(data.uploadSpeed));
    setText('[data-download-count="all"]', counts.total || allTorrents.length);
    setText('[data-download-count="downloading"]', counts.downloading || 0);
    setText('[data-download-count="seeding"]', counts.seeding || 0);
    setText('[data-download-count="paused"]', counts.paused || 0);
    setText('[data-download-count="error"]', counts.error || 0);
    setText('[data-download-summary]', `${visible.length}${visible.length < matches.length ? ` sur ${matches.length}` : ''} affiché${visible.length > 1 ? 's' : ''} · ${formatBytes(data.downloaded)} reçus · ${formatBytes(data.uploaded)} envoyés`);
    const dashboard = data.dashboard || {};
    const app = dashboard.app || {};
    setText('[data-download-dashboard="downloaded"]', formatBytes(dashboard.allTimeDownloaded));
    setText('[data-download-dashboard="uploaded"]', formatBytes(dashboard.allTimeUploaded));
    setText('[data-download-dashboard="ratio"]', downloadRatio(dashboard.globalRatio));
    setText('[data-download-dashboard="size"]', formatBytes(dashboard.totalSize));
    setText('[data-download-dashboard="active-size"]', formatBytes(dashboard.activeSize));
    setText('[data-download-dashboard="peers"]', Number(dashboard.activePeers || 0));
    setText('[data-download-tracker-count]', Number(dashboard.trackerCount || 0));
    setText('[data-download-app-version]', [app.version && `qBit ${app.version}`, app.webApiVersion && `API ${app.webApiVersion}`, app.libtorrent && `libtorrent ${app.libtorrent}`].filter(Boolean).join(' · ') || 'Version indisponible');
    const trackerBody = view.querySelector('[data-download-trackers]');
    const trackerRows = Array.isArray(dashboard.trackers) ? dashboard.trackers : [];
    const trackerKey = downloadTrackerRenderKey(trackerRows);
    if (trackerBody && trackerBody.dataset.downloadTrackerKey !== trackerKey) {
      trackerBody.dataset.downloadTrackerKey = trackerKey;
      trackerBody.innerHTML = downloadTrackerRows(trackerRows);
    }
    if (data.relink) renderDownloadRelinkStatus(data.relink);

    const list = view.querySelector('[data-download-list]');
    const renderKey = downloadListRenderKey(visible);
    if (list && list.dataset.downloadRenderKey !== renderKey) {
      list.dataset.downloadRenderKey = renderKey;
      list.innerHTML = `${visible.map(torrentRow).join('') || '<div class="noctra-empty">Aucun torrent pour ce filtre.</div>'}${visible.length < matches.length ? `<button class="noctra-button noctra-download-load-more" type="button" data-download-load-more><strong>Afficher plus</strong><span>${visible.length} sur ${matches.length}</span></button>` : ''}`;
    } else {
      visible.forEach(item => {
        const card = list?.querySelector(`[data-download-hash="${CSS.escape(String(item.hash || ''))}"]`);
        if (!card) return;
        const progress = Math.max(0, Math.min(100, Number(item.progress || 0) * 100));
        const stateClass = item.errored ? 'error' : item.completed ? 'complete' : item.active ? 'active' : 'paused';
        const eta = item.completed ? 'Terminé' : formatDuration(item.eta);
        const peers = `${item.seeds}/${item.seedsTotal || '—'} seeds · ${item.peers}/${item.peersTotal || '—'} pairs`;
        card.dataset.state = stateClass;
        const cardText = (selector, value) => {
          const node = card.querySelector(selector);
          if (node && node.textContent !== String(value)) node.textContent = String(value);
        };
        cardText('[data-download-state-label]', `${item.stateLabel || item.state}${item.category ? ` · ${item.category}` : ''}`);
        const seedStatus = torrentSeedStatus(item);
        const seedNode = card.querySelector('[data-download-seed-status]');
        if (seedNode) {
          seedNode.dataset.state = seedStatus.state;
          if (seedNode.textContent !== seedStatus.label) seedNode.textContent = seedStatus.label;
        }
        cardText('[data-download-percent]', `${progress.toFixed(progress < 10 ? 1 : 0)}%`);
        cardText('[data-download-stat="download"]', formatSpeed(item.downloadSpeed));
        cardText('[data-download-stat="upload"]', formatSpeed(item.uploadSpeed));
        cardText('[data-download-stat="remaining"]', formatBytes(item.remaining));
        cardText('[data-download-stat="eta"]', eta);
        cardText('[data-download-stat="ratio"]', Number(item.ratio || 0).toFixed(2));
        cardText('[data-download-stat="peers"]', peers);
        cardText('[data-download-meta="size"]', `${formatBytes(item.downloaded)} / ${formatBytes(item.size)}`);
        cardText('[data-download-meta="availability"]', `Disponibilité ${Number(item.availability || 0).toFixed(2)}`);
        const progressBar = card.querySelector('[data-download-progress]');
        if (progressBar) progressBar.style.width = `${progress}%`;
        const action = card.querySelector('[data-torrent]');
        if (action && !action.disabled) {
          action.dataset.torrentAction = item.active ? 'pause' : 'resume';
          action.textContent = item.active ? 'Pause' : 'Reprendre';
        }
      });
    }
    if (panelBody) panelBody.scrollTop = Math.min(scroll, Math.max(0, panelBody.scrollHeight - panelBody.clientHeight));
  }

  function stopDownloadsLive() {
    window.clearTimeout(downloadsLiveTimer);
    downloadsLiveTimer = null;
  }

  function scheduleDownloadsLive(delay = 1100) {
    stopDownloadsLive();
    if (!downloadsPanelIsOpen()) return;
    downloadsLiveTimer = window.setTimeout(refreshDownloadsLive, delay);
  }

  async function refreshDownloadsLive() {
    if (!downloadsPanelIsOpen()) {
      stopDownloadsLive();
      return;
    }
    if (downloadsLiveRequest) {
      scheduleDownloadsLive(450);
      return;
    }
    downloadsLiveRequest = readDownloadsApi(`/api/downloads?live=${Date.now()}`, { cache: 'no-store', timeoutMs: 8_000 });
    try {
      lastDownloadsData = await downloadsLiveRequest;
      updateDownloadsView(lastDownloadsData);
    } catch (error) {
      if (downloadsPanelIsOpen()) {
        const view = document.querySelector('#noctra-downloads-view');
        if (view) view.dataset.liveError = error.message;
      }
    } finally {
      downloadsLiveRequest = null;
      if (downloadsPanelIsOpen()) scheduleDownloadsLive();
    }
  }

  async function showTorrentDetails(hash, name) {
    stopDownloadsLive();
    downloadsUiState.detailHash = String(hash || '');
    downloadsUiState.detailName = String(name || 'Torrent');
    const target = document.querySelector('#noctra-download-detail');
    if (!target) return;
    target.innerHTML = '<div class="noctra-loading noctra-loading--inline"><i></i><span>Chargement des détails…</span></div>';
    try {
      const data = await readDownloadsApi(`/api/downloads/${encodeURIComponent(hash)}/details`, { timeoutMs: 10_000 });
      const properties = data.properties || {};
      const torrent = (lastDownloadsData?.torrents || []).find(item => String(item.hash || '') === String(hash || '')) || null;
      target.innerHTML = `<section class="noctra-download-detail-card">
        <header><div><p class="noctra-eyebrow">DÉTAIL DU TORRENT</p><h3>${escapeHtml(name)}</h3></div><button class="noctra-close-inline" type="button" data-download-details-close>×</button></header>
        <div class="noctra-download-detail-grid">
          <span><small>Chemin</small><strong>${escapeHtml(properties.savePath || '—')}</strong></span>
          <span><small>Ratio</small><strong>${Number(properties.shareRatio || 0).toFixed(2)}</strong></span>
          <span><small>Temps actif</small><strong>${formatDuration(properties.timeElapsed)}</strong></span>
          <span><small>Gaspillé</small><strong>${formatBytes(properties.totalWasted)}</strong></span>
          <span><small>Pièces</small><strong>${properties.piecesHave || 0} / ${properties.piecesNum || 0}</strong></span>
          <span><small>Taille des pièces</small><strong>${formatBytes(properties.pieceSize)}</strong></span>
        </div>
        <div class="noctra-download-detail-columns">
          <div><h4>Trackers</h4>${(data.trackers || []).map(item => `<p><strong>${escapeHtml(item.status || '')}</strong> ${escapeHtml(item.url)}${item.message ? `<small>${escapeHtml(item.message)}</small>` : ''}</p>`).join('') || '<p>Aucun tracker détaillé.</p>'}</div>
          <div><h4>Fichiers</h4>${(data.files || []).slice(0, 24).map(item => { const seed = torrentFileSeedStatus(item, torrent); return `<p><strong>${Math.round(Number(item.progress || 0) * 100)}%</strong> ${escapeHtml(item.name)} <small>${formatBytes(item.size)} · <b class="noctra-file-seed-status" data-state="${seed.state}">${escapeHtml(seed.label)}</b></small></p>`; }).join('') || '<p>Aucun fichier détaillé.</p>'}</div>
        </div>
      </section>`;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      target.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`;
    } finally {
      if (downloadsPanelIsOpen()) scheduleDownloadsLive(1_500);
    }
  }

  function torrentFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
      reader.onerror = () => reject(new Error('Lecture du fichier .torrent impossible.'));
      reader.readAsDataURL(file);
    });
  }

  async function openDiscoveryDownloadDialog(button) {
    const confirm = document.querySelector('#noctra-confirm');
    const downloadId = button.dataset.discoveryDownload;
    const title = button.dataset.downloadTitle || 'Torrent';
    window.clearTimeout(discoveryTorrentLiveTimer);
    confirm.innerHTML = `<form id="noctra-discovery-download-form" class="noctra-confirm-card noctra-torrent-upload-card" role="dialog" aria-modal="true" aria-label="Télécharger un torrent" data-download-id="${escapeHtml(downloadId)}">
      <p class="noctra-eyebrow">QBITTORRENT · DEPUIS LES TRACKERS</p><h2>Télécharger</h2><p class="noctra-download-release-title">${escapeHtml(title)}</p>
      <label class="noctra-torrent-upload-field"><span>Destination</span><select name="savePath"><option value="">Destination par défaut de qBittorrent</option></select></label>
      <label class="noctra-torrent-upload-field"><span>Catégorie</span><input name="category" maxlength="64" placeholder="Facultative"></label>
      <label class="noctra-torrent-upload-check"><input type="checkbox" name="startNow" checked><span>Démarrer immédiatement</span></label>
      <p class="noctra-confirm-error" data-download-error hidden></p><div class="noctra-confirm-actions"><button class="noctra-button" type="button" data-confirm-cancel>Annuler</button><button class="noctra-button noctra-button--primary" type="submit">${icons.download}<span>Ajouter à qBittorrent</span></button></div></form>`;
    confirm.dataset.open = 'true';
    const form = confirm.querySelector('form');
    try {
      const data = await cachedApi('/api/discovery/download-options', 30000);
      if (!form.isConnected) return;
      form.querySelector('[name="savePath"]').insertAdjacentHTML('beforeend', data.destinations.map(item => `<option value="${escapeHtml(item.path)}">${escapeHtml(item.path)}</option>`).join(''));
    } catch (error) {
      const note = form.querySelector('[data-download-error]');
      note.hidden = false;
      note.textContent = error.message;
    }
  }

  async function submitDiscoveryDownload(form) {
    const button = form.querySelector('[type="submit"]');
    const errorNode = form.querySelector('[data-download-error]');
    if (button.disabled) return;
    button.disabled = true;
    errorNode.hidden = true;
    const fields = new FormData(form);
    try {
      const result = await api('/api/discovery/grab', { method: 'POST', headers: { 'content-type': 'application/json' }, timeoutMs: 35000,
        body: JSON.stringify({ downloadId: form.dataset.downloadId, category: fields.get('category'), savePath: fields.get('savePath'), startPaused: !fields.has('startNow') }) });
      closeConfirm();
      toast(result.alreadyPresent ? 'Ce torrent est déjà présent. Aucun doublon ajouté.' : 'Torrent ajouté à qBittorrent.');
      clearApiCache('/api/downloads');
    } catch (error) {
      errorNode.hidden = false;
      errorNode.textContent = error.message;
      button.disabled = false;
    }
  }

  function indexerFieldMarkup(field) {
    const name = `field:${field.name}`;
    const value = field.value ?? '';
    let input;
    if (field.type === 'checkbox') input = `<input type="checkbox" name="${escapeHtml(name)}" ${value === true ? 'checked' : ''}>`;
    else if (field.options.length && !field.secret) input = `<select name="${escapeHtml(name)}" ${field.type === 'select' ? '' : 'multiple'}>${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${(Array.isArray(value) ? value : [value]).map(String).includes(String(option.value)) ? 'selected' : ''}>${escapeHtml(option.name)}</option>`).join('')}</select>`;
    else input = `<input name="${escapeHtml(name)}" type="${field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'}" ${field.type === 'number' ? 'step="any"' : ''} autocomplete="off" value="${escapeHtml(value)}" placeholder="${field.secret && field.hasValue ? 'Inchangé si vide' : ''}">`;
    return `<label class="${field.type === 'checkbox' ? 'noctra-torrent-upload-check' : 'noctra-torrent-upload-field'}"><span>${escapeHtml(field.label)}</span>${input}</label>`;
  }

  async function openIndexerEditor(id = '', schemaId = '') {
    const confirm = document.querySelector('#noctra-confirm');
    confirm.dataset.open = 'true';
    confirm.innerHTML = '<div class="noctra-confirm-card"><div class="noctra-loading"><i></i><span>Chargement des indexeurs…</span></div><button class="noctra-button" data-confirm-cancel>Annuler</button></div>';
    const loading = confirm.firstElementChild;
    try {
      const data = await api(`/api/prowlarr/indexer-context?${new URLSearchParams({ id, schema: schemaId })}`);
      if (!loading.isConnected) return;
      const item = data.indexer || data.template;
      if (!item) throw new Error('Aucun type d’indexeur disponible.');
      indexerEditorContext = { ...data, item };
      const fields = item.fields || [];
      confirm.innerHTML = `<form id="noctra-indexer-form" class="noctra-confirm-card noctra-indexer-card" role="dialog" aria-modal="true" aria-label="${id ? 'Modifier' : 'Ajouter'} un indexeur">
        <header><div><p class="noctra-eyebrow">PROWLARR</p><h2>${id ? 'Modifier' : 'Ajouter'} un indexeur</h2></div><button class="noctra-icon-button" type="button" data-confirm-cancel aria-label="Fermer">×</button></header>
        <div class="noctra-indexer-fields">
        ${!id ? `<label class="noctra-torrent-upload-field"><span>Type d’indexeur</span><select data-indexer-schema>${data.schemas.map(schema => `<option value="${schema.schemaId}" ${schema.schemaId === item.schemaId ? 'selected' : ''}>${escapeHtml(schema.name)} · ${escapeHtml(schema.protocol)}</option>`).join('')}</select></label>` : ''}
        <label class="noctra-torrent-upload-field"><span>Nom</span><input name="name" required maxlength="150" value="${escapeHtml(item.name)}"></label>
        <label class="noctra-torrent-upload-check"><input type="checkbox" name="enable" ${item.enable ? 'checked' : ''}><span>Actif</span></label>
        <label class="noctra-torrent-upload-field"><span>Profil de synchronisation</span><select name="appProfileId">${data.profiles.map(profile => `<option value="${profile.id}" ${profile.id === item.appProfileId ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('')}</select></label>
        ${fields.filter(field => !field.advanced).map(indexerFieldMarkup).join('')}
        <details><summary>Réglages avancés</summary><label class="noctra-torrent-upload-field"><span>Priorité</span><input type="number" name="priority" min="1" max="50" value="${item.priority}"></label>
        <label class="noctra-torrent-upload-field"><span>Client de téléchargement</span><select name="downloadClientId"><option value="0">Par défaut</option>${data.clients.map(client => `<option value="${client.id}" ${client.id === item.downloadClientId ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('')}</select></label>
        ${fields.filter(field => field.advanced).map(indexerFieldMarkup).join('')}</details>
        </div><p class="noctra-confirm-error" data-indexer-message hidden></p><footer class="noctra-confirm-actions"><button class="noctra-button" type="button" data-indexer-test>${icons.verify}<span>Tester</span></button><button class="noctra-button noctra-button--primary" type="submit">${icons.check}<span>Enregistrer</span></button></footer></form>`;
    } catch (error) {
      if (loading.isConnected) loading.innerHTML = `<p class="noctra-error">${escapeHtml(error.message)}</p><button class="noctra-button" data-confirm-cancel>Fermer</button>`;
    }
  }

  async function submitIndexer(form, testOnly = false) {
    if (form.dataset.busy === 'true') return;
    if (!form.reportValidity()) return;
    const context = indexerEditorContext;
    const data = new FormData(form);
    const fields = {};
    context.item.fields.forEach(field => {
      const name = `field:${field.name}`;
      fields[field.name] = field.type === 'checkbox' ? data.has(name) : field.options.length && field.type !== 'select' ? data.getAll(name) : data.get(name);
    });
    const note = form.querySelector('[data-indexer-message]');
    note.hidden = true;
    form.dataset.busy = 'true';
    form.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      await api(`/api/prowlarr/indexer${testOnly ? '/test' : ''}`, { method: 'POST', timeoutMs: 35000, headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        id: context.item.id, schemaId: context.item.schemaId, name: data.get('name'), enable: data.has('enable'), priority: Number(data.get('priority')), appProfileId: Number(data.get('appProfileId')), downloadClientId: Number(data.get('downloadClientId')), fields
      }) });
    if (testOnly) { note.hidden = false; note.dataset.state = 'success'; note.textContent = 'Connexion validée par Prowlarr.'; }
      else { closeConfirm(); clearApiCache('/api/prowlarr'); void loadAutomation('prowlarr'); toast('Indexeur enregistré.'); }
    } catch (error) { note.hidden = false; note.dataset.state = 'error'; note.textContent = error.message; }
    finally { form.dataset.busy = 'false'; form.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  }

  function openTorrentUploadDialog() {
    stopDownloadsLive();
    const confirm = document.querySelector('#noctra-confirm');
    const categories = [...new Set((lastDownloadsData?.categories || []).map(value => String(value || '').trim()).filter(Boolean))];
    const destinations = (lastDownloadsData?.destinations || []).filter(item => item?.path);
    confirm.innerHTML = `
      <form class="noctra-confirm-card noctra-torrent-upload-card" id="noctra-torrent-upload-form" role="dialog" aria-modal="true" aria-label="Ajouter un torrent">
        <span class="noctra-confirm-icon">${icons.plus}</span>
        <p class="noctra-eyebrow">QBITTORRENT · AJOUT MANUEL</p>
        <h2>Ajouter un .torrent</h2>
        <label class="noctra-torrent-file-picker"><input type="file" name="torrent" accept=".torrent,application/x-bittorrent" required><span>${icons.folder}<strong data-torrent-file-name>Choisir un fichier .torrent</strong><small>8 Mo maximum</small></span></label>
        <label class="noctra-torrent-upload-field"><span>Catégorie <small>facultative</small></span><input type="text" name="category" list="noctra-torrent-categories" maxlength="64" placeholder="Ex. Films"><datalist id="noctra-torrent-categories">${categories.map(category => `<option value="${escapeHtml(category)}"></option>`).join('')}</datalist></label>
        <label class="noctra-torrent-upload-field"><span>Destination <small>dossiers qBittorrent connus</small></span><select name="savePath"><option value="">Destination par défaut de qBittorrent</option>${destinations.map(destination => `<option value="${escapeHtml(destination.path)}">${escapeHtml(destination.path)}${destination.isDefault ? ' · par défaut' : destination.torrents ? ` · ${destination.torrents} torrent${destination.torrents > 1 ? 's' : ''}` : ''}</option>`).join('')}</select></label>
        <label class="noctra-torrent-upload-check"><input type="checkbox" name="startNow" checked><span>Démarrer immédiatement</span></label>
        <p class="noctra-confirm-error" data-torrent-upload-error hidden></p>
        <div class="noctra-confirm-actions"><button class="noctra-button" type="button" data-confirm-cancel>Annuler</button><button class="noctra-button noctra-button--primary" type="submit">${icons.plus}<span>Ajouter à qBittorrent</span></button></div>
      </form>`;
    confirm.dataset.open = 'true';
    const input = confirm.querySelector('input[type="file"]');
    input?.addEventListener('change', () => {
      const name = confirm.querySelector('[data-torrent-file-name]');
      if (name) name.textContent = input.files?.[0]?.name || 'Choisir un fichier .torrent';
    });
    const cancel = confirm.querySelector('[data-confirm-cancel]');
    if (cancel) cancel.onclick = event => {
      event.preventDefault();
      closeConfirm();
      scheduleDownloadsLive(250);
    };
  }

  async function submitTorrentUploadRequest(payload) {
    const request = path => api(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 35_000
    });
    try {
      return await request('/api/downloads/add');
    } catch (error) {
      if (error?.code !== 'NOCTRA_HTML_RESPONSE') throw error;
      await wait(1_000);
      return request(`/api/downloads/add?retry=${Date.now()}`);
    }
  }

  async function submitTorrentUpload(form) {
    const file = form.querySelector('input[type="file"]')?.files?.[0];
    const errorNode = form.querySelector('[data-torrent-upload-error]');
    const submit = form.querySelector('[type="submit"]');
    if (errorNode) { errorNode.hidden = true; errorNode.textContent = ''; }
    if (!file || !/\.torrent$/i.test(file.name) || file.size < 16 || file.size > 8 * 1024 * 1024) {
      if (errorNode) { errorNode.hidden = false; errorNode.textContent = 'Sélectionne un fichier .torrent valide de moins de 8 Mo.'; }
      return;
    }
    if (submit) { submit.disabled = true; submit.dataset.busy = 'true'; }
    try {
      const fields = new FormData(form);
      const dataBase64 = await torrentFileBase64(file);
      const result = await submitTorrentUploadRequest({
        name: file.name,
        dataBase64,
        category: String(fields.get('category') || '').trim(),
        savePath: String(fields.get('savePath') || '').trim(),
        startPaused: !fields.has('startNow')
      });
      closeConfirm();
      toast(result.alreadyPresent
        ? `${file.name} est déjà présent dans qBittorrent, aucun doublon créé.`
        : `${file.name} ajouté à qBittorrent.`);
      await openDownloads();
    } catch (error) {
      if (errorNode) { errorNode.hidden = false; errorNode.textContent = error.message || 'L’ajout du torrent a échoué.'; }
      if (submit) { submit.disabled = false; submit.dataset.busy = 'false'; }
    }
  }

  async function openDownloads() {
    setLoading('Téléchargements', 'QBITTORRENT · CENTRE DE CONTRÔLE', true);
    downloadsUiState.detailHash = '';
    downloadsUiState.detailName = '';
    downloadsUiState.visibleLimit = downloadsPageSize();
    try {
      const data = await readDownloadsApi(`/api/downloads?live=${Date.now()}`, { cache: 'no-store', timeoutMs: 8_000 });
      lastDownloadsData = data;
      // setPanelBody écrit au prochain requestAnimationFrame. Planifier le polling
      // avant cet update faisait croire que le panneau était fermé et annulait
      // donc le temps réel. On l'arme uniquement après insertion du DOM.
      setPanelBody(`<div id="noctra-downloads-view" aria-live="polite">${downloadsMarkup(data)}</div>`, {
        preserveScroll: false,
        afterUpdate: () => {
          if (data.relink) renderDownloadRelinkStatus(data.relink);
          scheduleDownloadsLive(700);
          void refreshDownloadRelinkStatus();
        }
      });
    } catch (error) {
      if (downloadRelinkHtmlResponse(error) && lastDownloadsData) {
        const data = lastDownloadsData;
        setPanelBody(`<div id="noctra-downloads-view" aria-live="polite">${downloadsMarkup(data)}</div>`, {
          preserveScroll: false,
          afterUpdate: () => {
            if (data.relink) renderDownloadRelinkStatus(data.relink);
            scheduleDownloadsLive(1_200);
            void refreshDownloadRelinkStatus();
          }
        });
        toast('Connexion au centre de téléchargements rétablie en arrière-plan. Dernier état conservé.');
      } else showError(error);
    }
  }

  async function executePendingTorrentDelete(deleteMode) {
    if (!pendingDelete) return;
    const snapshot = { ...pendingDelete };
    const confirm = document.querySelector('#noctra-confirm');
    const buttons = [...(confirm?.querySelectorAll('[data-delete-mode]') || [])];
    buttons.forEach(button => { button.disabled = true; });
    const errorNode = confirm?.querySelector('[data-delete-error]');
    if (errorNode) { errorNode.hidden = true; errorNode.textContent = ''; }
    try {
      const deleteFiles = String(deleteMode || '') === 'files';
      await api(`/api/downloads/${encodeURIComponent(snapshot.hash)}/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleteFiles })
      });
      closeConfirm();
      toast(deleteFiles ? 'Torrent et fichiers supprimés.' : 'Torrent supprimé, fichiers conservés.');
      await openDownloads();
    } catch (error) {
      buttons.forEach(button => { button.disabled = false; });
      if (errorNode) {
        errorNode.hidden = false;
        errorNode.textContent = error?.message || 'La suppression a échoué.';
      }
      toast(error?.message || 'La suppression a échoué.');
    }
  }

  function confirmTorrentDelete(hash, name) {
    pendingDelete = { hash, name };
    const confirm = document.querySelector('#noctra-confirm');
    confirm.innerHTML = `
      <div class="noctra-confirm-card" role="alertdialog" aria-modal="true" aria-label="Supprimer le torrent">
        <span class="noctra-confirm-icon">${icons.trash}</span>
        <p class="noctra-eyebrow">ACTION IRRÉVERSIBLE</p>
        <h2>Supprimer ce torrent ?</h2>
        <p class="noctra-confirm-name">${escapeHtml(name)}</p>
        <p>Choisis précisément ce que Noctra doit supprimer.</p>
        <p class="noctra-confirm-error" data-delete-error hidden></p>
        <div class="noctra-confirm-actions">
          <button class="noctra-button" type="button" data-confirm-cancel>Annuler</button>
          <button class="noctra-button" type="button" data-delete-mode="torrent">Torrent uniquement</button>
          <button class="noctra-button noctra-button--danger" type="button" data-delete-mode="files">Torrent + fichiers</button>
        </div>
      </div>`;
    confirm.dataset.open = 'true';
    // V124 : les actions sont liées directement aux boutons. Cela évite les
    // pertes de clic/tap observées sur Safari iOS quand le panneau principal
    // est simultanément rafraîchi par le polling qBittorrent.
    const cancelButton = confirm.querySelector('[data-confirm-cancel]');
    if (cancelButton) cancelButton.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      closeConfirm();
    };
    confirm.querySelectorAll('[data-delete-mode]').forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        void executePendingTorrentDelete(button.dataset.deleteMode);
      };
    });
  }

  function closeConfirm() {
    window.clearTimeout(fileDuplicateTimer);
    fileDuplicateTimer = null;
    fileDuplicateSequence += 1;
    window.clearTimeout(completenessTimer);
    completenessTimer = null;
    completenessSequence += 1;
    const confirm = document.querySelector('#noctra-confirm');
    if (!confirm) return;
    confirm.dataset.open = 'false';
    confirm.innerHTML = '';
    pendingDelete = null;
  }

  function calendarRows(data, type) {
    return (data.calendar || []).map(item => {
      const name = type === 'sonarr' ? item.series?.title || item.title : item.title || item.movie?.title;
      const date = item.airDateUtc || item.digitalRelease || item.physicalRelease || item.inCinemas;
      return `<article class="noctra-row"><div><h3>${escapeHtml(name || 'À venir')}</h3><p>${escapeHtml(formatDate(date))}</p></div></article>`;
    }).join('') || '<div class="noctra-empty">Aucun élément prévu dans les 14 prochains jours.</div>';
  }

  function queueRows(data) {
    return (data.queue || []).map(item => {
      const name = item.title || item.series?.title || item.movie?.title || 'Élément en attente';
      return `<article class="noctra-row"><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(item.status || item.trackedDownloadStatus || 'En attente')}</p></div></article>`;
    }).join('') || '<div class="noctra-empty">File d’attente vide.</div>';
  }

  async function searchArrCatalog(type, query) {
    const target = document.querySelector('#noctra-arr-results');
    if (!target) return;
    target.innerHTML = '<div class="noctra-loading"><i></i><span>Recherche dans la bibliothèque…</span></div>';
    try {
      const data = await api(`/api/servarr/catalog?type=${type}&q=${encodeURIComponent(query)}`);
      const rows = data.items.map(item => `
        <article class="noctra-row">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.year || 'Année inconnue')} · ${item.monitored ? 'Surveillé' : 'Non surveillé'} · ${item.hasFile ? 'Fichier présent' : 'À télécharger'}</p>
          </div>
          <button class="noctra-button noctra-button--primary" type="button"
            data-release-type="${type}" data-release-id="${item.id}"
            data-release-title="${escapeHtml(item.title)}">Rechercher</button>
        </article>`).join('');
      target.innerHTML = `<div class="noctra-list">${rows || '<div class="noctra-empty">Aucun résultat.</div>'}</div>`;
    } catch (error) {
      target.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderEpisodeSeason(seasonNumber) {
    if (!episodePickerData) return;
    const target = document.querySelector('#noctra-episode-results');
    if (!target) return;
    document.querySelectorAll('[data-season-number]').forEach(button => {
      button.dataset.active = String(Number(button.dataset.seasonNumber) === Number(seasonNumber));
    });
    const rows = episodePickerData.episodes
      .filter(item => item.seasonNumber === Number(seasonNumber))
      .map(item => `
        <article class="noctra-row noctra-episode">
          <div>
            <h3>S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')} · ${escapeHtml(item.title)}</h3>
            <p>${item.hasFile ? 'Fichier déjà présent' : 'Fichier absent'} · ${item.monitored ? 'Surveillé' : 'Non surveillé'} · ${escapeHtml(formatDate(item.airDate))}</p>
          </div>
          <button class="noctra-button noctra-button--primary" type="button"
            data-episode-release="${item.id}"
            data-episode-title="${escapeHtml(`S${item.seasonNumber}E${item.episodeNumber} · ${item.title}`)}">
            Chercher les releases
          </button>
        </article>`).join('');
    const seriesId = Number(lastSeriesContext?.id || episodePickerData.seriesId || 0);
    target.innerHTML = `
      <div class="noctra-season-search-actions">
        <div><strong>Saison ${Number(seasonNumber)}</strong><span>Sonarr interrogera tous les indexeurs actifs, dont C411 s’il est configuré dans Prowlarr.</span></div>
        <div>
          <button class="noctra-button noctra-button--primary" type="button" data-season-release="${seriesId}" data-season-release-number="${Number(seasonNumber)}">${icons.search}<span>Pack saison complète</span></button>
        </div>
      </div>
      <div class="noctra-list">${rows || '<div class="noctra-empty">Aucun épisode dans cette saison.</div>'}</div>`;
  }

  async function openEpisodePicker(seriesId, title) {
    lastSeriesContext = { id: Number(seriesId), title };
    setLoading(title, 'SONARR · CHOISIR UN ÉPISODE', true, { kind: 'automation' });
    try {
      episodePickerData = await api(`/api/servarr/episodes?seriesId=${encodeURIComponent(seriesId)}`);
      const seasons = episodePickerData.seasons || [];
      const initialSeason = seasons[0];
      setPanelBody(`
        <div class="noctra-release-toolbar noctra-series-search-actions">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span>${seasons.length} saison${seasons.length > 1 ? 's' : ''}</span>
          </div>
          <div class="noctra-series-search-buttons">
            <button class="noctra-button noctra-button--primary" type="button" data-series-release-all="${Number(seriesId)}">${icons.search}<span>Intégrales / toutes saisons</span></button>
            <button class="noctra-button" type="button" data-back-automation="sonarr">← Retour à Sonarr</button>
          </div>
        </div>
        <div class="noctra-tabs noctra-season-tabs">
          ${seasons.map(season => `
            <button class="noctra-tab" type="button" data-season-number="${season}"
              data-active="${season === initialSeason}">Saison ${season}</button>`).join('')}
        </div>
        <div id="noctra-episode-results"></div>`, {
        preserveScroll: false,
        afterUpdate: () => {
          if (initialSeason !== undefined) renderEpisodeSeason(initialSeason);
          else document.querySelector('#noctra-episode-results').innerHTML = '<div class="noctra-empty">Aucune saison répertoriée.</div>';
        }
      });
    } catch (error) {
      showError(error);
    }
  }

  function releaseRow(item, type) {
    return `
      <article class="noctra-release">
        <div class="noctra-release-main">
          <div class="noctra-release-title">
            <h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            <span class="noctra-quality">${escapeHtml(item.quality)}</span>
          </div>
          <div class="noctra-release-meta">
            <span>${formatBytes(item.size)}</span>
            <span>${escapeHtml(item.languages.join(', ') || 'Langue inconnue')}</span>
            <span>${escapeHtml(item.indexer)}</span>
            ${item.seeders !== null ? `<span>${item.seeders} seeders</span>` : ''}
            ${item.packKind === 'integral' ? '<span>Intégrale / multi-saisons</span>' : item.seriesPack ? `<span>Saison complète${item.seasonNumber || item.requestedSeason ? ` · S${String(item.seasonNumber || item.requestedSeason).padStart(2, '0')}` : ''}</span>` : ''}
          </div>
        </div>
        <button class="noctra-button noctra-button--primary" type="button"
          data-grab-type="${type}" data-grab-guid="${escapeHtml(item.guid)}"
          data-grab-indexer="${item.indexerId}">
          Télécharger
        </button>
      </article>`;
  }

  async function openReleaseSearch(type, id, title, options = {}) {
    setLoading(title, `${type === 'sonarr' ? 'SONARR' : 'RADARR'} · RECHERCHE INTERACTIVE`, true, { kind: 'automation' });
    const sequence = ++releaseSearchSequence;
    const panelElement = document.querySelector('#noctra-panel');
    releaseSearchContext = { type, id, title, options };
    releaseSearchView = { type, data: null, filter: '', limit: 100 };
    try {
      const params = new URLSearchParams({ type, progress: '1' });
      if (options.seriesId) params.set('seriesId', String(options.seriesId));
      if (options.seasonNumber) params.set('seasonNumber', String(options.seasonNumber));
      if (options.allSeasons) params.set('allSeasons', '1');
      if (!options.seriesId && id) params.set('id', String(id));
      if (options.force) params.set('force', '1');
      let previous = '';
      const deadline = Date.now() + 60 * 60_000;
      while (sequence === releaseSearchSequence && panelElement?.isConnected && Date.now() < deadline) {
      const data = await api(`/api/servarr/releases?${params.toString()}`, { timeoutMs: 12_000 });
      params.delete('force');
      if (sequence !== releaseSearchSequence || !panelElement?.isConnected) return;
      const signature = JSON.stringify(data);
      if (signature !== previous) {
      previous = signature;
      releaseSearchView.data = data;
      renderReleaseSearch();
      }
      if (!data.running) return;
      await wait(1000);
      }
    } catch (error) {
      if (sequence === releaseSearchSequence && panelElement?.isConnected) showError(error);
    }
  }

  function renderReleaseSearch() {
    const view = releaseSearchView;
    if (!view?.data) return;
    const { data, type } = view;
    const filter = view.filter || data.packMode || '';
    const releases = sortTorrentsBySize(data.releases || []).filter(item => data.searchKind !== 'series' || !filter || item.packKind === filter);
    const description = data.searchKind === 'series' && !data.integralCount
      ? `${data.running ? 'Recherche des intégrales en cours' : 'Aucune intégrale trouvée'} · ${data.seasonPackCount || 0} packs de saisons complètes`
      : 'Taille croissante · du plus léger au plus lourd';
    setPanelBody(`
        <div class="noctra-release-toolbar">
          <div>
            <strong>${releases.length} releases trouvées${data.running ? ' · recherche en cours' : ''}</strong>
            <span>${data.running ? (data.total > 1 ? `${data.completed}/${data.total} saisons interrogées` : 'Interrogation des indexeurs…') : description}</span>
          </div>
          <button class="noctra-button" type="button" data-release-refresh ${data.running ? 'disabled' : ''}>${icons.refresh}<span>Actualiser</span></button>
          ${type === 'sonarr' && lastSeriesContext ? `
            <button class="noctra-button" type="button" data-back-series="${lastSeriesContext.id}">← Retour aux épisodes</button>` : `
            <button class="noctra-button" type="button" data-back-automation="${type}">← Retour à ${type === 'sonarr' ? 'Sonarr' : 'Radarr'}</button>`}
        </div>
        ${data.error ? `<div class="noctra-error">${escapeHtml(data.error)}</div>` : ''}
        ${data.warnings?.length ? `<div class="noctra-access-note">${data.warnings.map(escapeHtml).join('<br>')}</div>` : ''}
        ${data.searchKind === 'series' ? `<div class="noctra-tabs"><button class="noctra-tab" data-release-pack-filter="integral" data-active="${filter === 'integral'}" ${!data.integralCount ? 'disabled' : ''}>Intégrales (${data.integralCount || 0})</button><button class="noctra-tab" data-release-pack-filter="season" data-active="${filter === 'season'}">Saisons complètes (${data.seasonPackCount || 0})</button></div>` : ''}
        <div class="noctra-release-list">${releases.slice(0, view.limit).map(item => releaseRow(item, type)).join('')
          || (data.running ? '<div class="noctra-loading"><i></i><span>Recherche en cours…</span></div>' : '<div class="noctra-empty">Aucune release trouvée.</div>')}</div>
        ${releases.length > view.limit ? `<button class="noctra-button" data-release-more>Afficher plus (${view.limit}/${releases.length})</button>` : ''}`);
  }

  function arrNav(type, active) {
    const views = [
      ['overview', 'Vue d’ensemble'],
      ['library', type === 'sonarr' ? 'Séries' : 'Films'],
      ['wanted', 'Manquants'],
      ['calendar', 'Calendrier'],
      ['queue', 'File d’attente'],
      ['history', 'Historique'],
      ['add', 'Ajouter']
    ];
    return `<div class="noctra-arr-nav">${views.map(([id, label]) => `<button class="noctra-tab" type="button" data-arr-view="${id}" data-active="${id === active}">${label}</button>`).join('')}</div>`;
  }

  function arrMediaCard(item, type, wanted = false) {
    const serviceId = item.serviceId || item.id;
    const releaseButton = type === 'sonarr' && item.episodeId
      ? `<button class="noctra-button noctra-button--primary" type="button" data-episode-release="${escapeHtml(item.episodeId)}" data-episode-title="${escapeHtml(item.title)}">Releases</button>`
      : `<button class="noctra-button noctra-button--primary" type="button" data-release-type="${type}" data-release-id="${escapeHtml(serviceId)}" data-release-title="${escapeHtml(item.title)}">Releases</button>`;
    return `<article class="noctra-arr-card">
      <div class="noctra-arr-poster">${item.poster ? `<img src="${escapeHtml(item.poster)}" alt="" loading="lazy">` : '<span>N</span>'}</div>
      <div class="noctra-arr-card-body">
        <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(String(item.year || ''))}${item.status ? ` · ${escapeHtml(item.status)}` : ''}</p></div>
        <div class="noctra-arr-badges">
          <span data-tone="${item.monitored ? 'good' : 'muted'}">${item.monitored ? 'Surveillé' : 'Non surveillé'}</span>
          <span data-tone="${item.missing ? 'warn' : 'good'}">${item.missing ? `${item.missing} manquant${item.missing > 1 ? 's' : ''}` : 'Complet'}</span>
        </div>
        ${item.progress !== undefined ? `<div class="noctra-progress"><i style="width:${Math.max(0, Math.min(100, Number(item.progress || 0)))}%"></i></div>` : ''}
        <div class="noctra-arr-actions">
          ${releaseButton}
          ${item.id ? `<button class="noctra-button" type="button" data-arr-monitor-id="${item.id}" data-arr-monitor-value="${!item.monitored}">${item.monitored ? 'Ne plus surveiller' : 'Surveiller'}</button>` : ''}
          ${item.id ? `<button class="noctra-icon-button" type="button" data-arr-command="${type === 'sonarr' ? 'RescanSeries' : 'RescanMovie'}" data-arr-item-id="${item.id}" aria-label="Analyser">${icons.refresh}</button>` : ''}
        </div>
      </div>
    </article>`;
  }

  function arrQueueMarkup(items) {
    return `<div class="noctra-list">${(items || []).map(item => {
      const progress = item.size > 0 ? Math.max(0, Math.min(100, ((item.size - item.sizeleft) / item.size) * 100)) : 0;
      return `<article class="noctra-row noctra-arr-queue"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.status || 'En attente')} · ${formatBytes(item.sizeleft)} restants${item.timeleft ? ` · ${escapeHtml(item.timeleft)}` : ''}</p><div class="noctra-progress"><i style="width:${progress}%"></i></div></div></article>`;
    }).join('') || '<div class="noctra-empty">File d’attente vide.</div>'}</div>`;
  }

  function arrCalendarMarkup(items, type) {
    return `<div class="noctra-arr-calendar">${(items || []).map(item => `<article class="noctra-arr-calendar-item"><time>${escapeHtml(formatDate(item.date))}</time><div><h3>${escapeHtml(item.title)}</h3><p>${item.hasFile ? 'Fichier présent' : 'À venir ou manquant'} · ${item.monitored ? 'Surveillé' : 'Non surveillé'}</p></div>${item.serviceId ? (type === 'sonarr' && item.episodeId
      ? `<button class="noctra-icon-button" type="button" data-episode-release="${escapeHtml(item.episodeId)}" data-episode-title="${escapeHtml(item.title)}">${icons.search}</button>`
      : `<button class="noctra-icon-button" type="button" data-release-type="${type}" data-release-id="${escapeHtml(item.serviceId)}" data-release-title="${escapeHtml(item.title)}">${icons.search}</button>`) : ''}</article>`).join('') || '<div class="noctra-empty">Aucune sortie sur cette période.</div>'}</div>`;
  }

  function arrHistoryMarkup(items) {
    return `<div class="noctra-list">${(items || []).map(item => `<article class="noctra-row"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.eventType || 'Événement')} · ${escapeHtml(formatDate(item.date))}${item.quality ? ` · ${escapeHtml(item.quality)}` : ''}${item.indexer ? ` · ${escapeHtml(item.indexer)}` : ''}</p></div></article>`).join('') || '<div class="noctra-empty">Historique vide.</div>'}</div>`;
  }

  function arrSettingsOptions(settings) {
    return {
      roots: (settings.rootFolders || []).map(folder => `<option value="${escapeHtml(folder.path)}">${escapeHtml(folder.path)} · ${formatBytes(folder.freeSpace)} libres</option>`).join(''),
      profiles: (settings.qualityProfiles || []).map(profile => `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`).join('')
    };
  }

  function renderArrCenter(data) {
    const content = document.querySelector('#noctra-automation-content');
    if (!content) return;
    const type = data.type;
    const view = data.view;
    let markup = arrNav(type, view);
    if (view === 'overview') {
      markup += `<div class="noctra-arr-hero"><div><p class="noctra-eyebrow">${type.toUpperCase()} · ${escapeHtml(data.version || '')}</p><h3>${type === 'sonarr' ? 'Centre des séries' : 'Centre des films'}</h3><p>Une interface Noctra complète pour surveiller, rechercher et gérer ta collection.</p></div><div class="noctra-arr-quick-actions"><button class="noctra-button noctra-button--primary" data-arr-command="RssSync">Synchroniser RSS</button><button class="noctra-button" data-arr-command="RefreshMonitoredDownloads">Actualiser les téléchargements</button></div></div>
      <div class="noctra-metrics noctra-arr-metrics">
        <div class="noctra-metric"><small>Total</small><strong>${data.metrics.total}</strong></div>
        <div class="noctra-metric"><small>Surveillés</small><strong>${data.metrics.monitored}</strong></div>
        <div class="noctra-metric"><small>Manquants</small><strong>${data.metrics.missing}</strong></div>
        <div class="noctra-metric"><small>En attente</small><strong>${data.metrics.queue}</strong></div>
        <div class="noctra-metric"><small>Espace libre</small><strong>${formatBytes(data.metrics.freeSpace)}</strong></div>
      </div>
      ${data.metrics.health ? `<div class="noctra-access-note" data-tone="warn"><strong>${data.metrics.health} alerte${data.metrics.health > 1 ? 's' : ''}</strong><span>${(data.health || []).map(item => item.message || item.source).filter(Boolean).slice(0, 3).map(escapeHtml).join(' · ') || 'Consulte le service pour plus de détails.'}</span></div>` : ''}
      <div class="noctra-section-heading"><div><p class="noctra-eyebrow">AJOUTS RÉCENTS</p><h3>Collection</h3></div></div>
      <div class="noctra-arr-grid">${(data.recent || []).map(item => arrMediaCard(item, type)).join('')}</div>
      <div class="noctra-arr-columns"><section><p class="noctra-eyebrow">CALENDRIER</p>${arrCalendarMarkup(data.calendar, type)}</section><section><p class="noctra-eyebrow">FILE D’ATTENTE</p>${arrQueueMarkup(data.queue)}</section></div>`;
    } else if (view === 'library' || view === 'wanted') {
      markup += `<form class="noctra-search noctra-arr-filter" id="noctra-arr-library-search" data-arr-type="${type}" data-arr-view="${view}"><input name="query" value="${escapeHtml(data.query || '')}" placeholder="Filtrer la collection…"><button class="noctra-button noctra-button--primary" type="submit">${icons.search}<span>Filtrer</span></button></form>
      <div class="noctra-release-toolbar"><div><strong>${data.totalRecords} résultat${data.totalRecords > 1 ? 's' : ''}</strong><span>${view === 'wanted' ? 'Éléments surveillés sans fichier complet.' : 'Collection complète et état de surveillance.'}</span></div></div>
      <div class="noctra-arr-grid">${(data.items || []).map(item => arrMediaCard(item, type, view === 'wanted')).join('') || '<div class="noctra-empty">Aucun élément.</div>'}</div>`;
    } else if (view === 'calendar') {
      markup += `<div class="noctra-release-toolbar"><div><strong>Calendrier sur 30 jours</strong><span>Sorties, épisodes et fichiers attendus.</span></div></div>${arrCalendarMarkup(data.items, type)}`;
    } else if (view === 'queue') {
      markup += `<div class="noctra-release-toolbar"><div><strong>${data.totalRecords} élément${data.totalRecords > 1 ? 's' : ''} dans la file</strong><span>Progression remontée directement par ${type === 'sonarr' ? 'Sonarr' : 'Radarr'}.</span></div></div>${arrQueueMarkup(data.items)}`;
    } else if (view === 'history') {
      markup += `<div class="noctra-release-toolbar"><div><strong>Historique récent</strong><span>Téléchargements, imports, suppressions et échecs.</span></div></div>${arrHistoryMarkup(data.items)}`;
    } else if (view === 'add') {
      const options = arrSettingsOptions(data.settings || {});
      markup += `<div class="noctra-arr-add-layout"><section><p class="noctra-eyebrow">AJOUTER À ${type.toUpperCase()}</p><h3>Rechercher un nouveau ${type === 'sonarr' ? 'programme' : 'film'}</h3><form class="noctra-search" id="noctra-arr-lookup" data-arr-type="${type}"><input name="query" placeholder="Titre ou identifiant…" autocomplete="off"><button class="noctra-button noctra-button--primary">${icons.search}<span>Rechercher</span></button></form><div id="noctra-arr-lookup-results" class="noctra-arr-lookup-results"></div></section><aside class="noctra-arr-add-settings"><label class="noctra-field"><span>Dossier racine</span><select data-arr-add-root>${options.roots}</select></label><label class="noctra-field"><span>Profil qualité</span><select data-arr-add-profile>${options.profiles}</select></label><label class="noctra-toggle"><input type="checkbox" data-arr-add-search checked><span>Rechercher immédiatement après l’ajout</span></label></aside></div>`;
    }
    content.innerHTML = markup;
  }

  async function loadAutomation(type = arrCenterState.type, view = arrCenterState.view, options = {}) {
    const sequence = ++automationLoadSequence;
    const contextChanged = type !== arrCenterState.type || view !== arrCenterState.view;
    activeAutomation = type;
    arrCenterState = { ...arrCenterState, type, view, ...options };
    const content = document.querySelector('#noctra-automation-content');
    if (!content) return;
    content.dataset.loading = 'true';
    if (contextChanged || !content.innerHTML.trim()) content.innerHTML = `<div class="noctra-loading"><i></i><span>Chargement de ${type === 'sonarr' ? 'Sonarr' : type === 'radarr' ? 'Radarr' : 'Prowlarr'}…</span></div>`;
    try {
      if (type === 'prowlarr') {
        const data = await cachedApi('/api/prowlarr', 20_000);
        if (sequence !== automationLoadSequence || !content.isConnected) return;
        content.innerHTML = `<div class="noctra-metrics"><div class="noctra-metric"><small>Version</small><strong>${escapeHtml(data.version)}</strong></div><div class="noctra-metric"><small>Indexeurs actifs</small><strong>${data.indexers.filter(item => item.enabled).length}</strong></div><div class="noctra-metric"><small>Santé</small><strong>${data.health.length ? `${data.health.length} alerte(s)` : 'OK'}</strong></div></div><div class="noctra-indexer-toolbar"><button class="noctra-button noctra-button--primary" type="button" data-indexer-add>${icons.plus}<span>Ajouter un indexeur</span></button></div><div class="noctra-list">${data.indexers.map(item => `<article class="noctra-row"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.protocol)} · ${item.enabled ? 'Actif' : 'Désactivé'}</p></div><button class="noctra-button" type="button" data-indexer-edit="${item.id}" aria-label="Modifier ${escapeHtml(item.name)}">${icons.edit}<span>Modifier</span></button></article>`).join('')}</div>`;
        return;
      }
      const params = new URLSearchParams({ type, view, page: String(arrCenterState.page || 1), pageSize: '40' });
      if (arrCenterState.query) params.set('q', arrCenterState.query);
      const data = await cachedApi(`/api/servarr/center?${params}`, view === 'overview' ? 15_000 : 10_000);
      if (sequence !== automationLoadSequence || !content.isConnected) return;
      renderArrCenter(data);
    } catch (error) {
      if (sequence === automationLoadSequence && content.isConnected) content.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`;
    } finally {
      if (sequence === automationLoadSequence && content.isConnected) content.dataset.loading = 'false';
    }
  }

  function openAutomation(type = 'radarr', view = 'overview') {
    arrCenterState = { type, view, page: 1, query: '', lookup: [] };
    panel('Automatisation', 'RADARR · SONARR · PROWLARR', `<div class="noctra-tabs noctra-service-tabs"><button class="noctra-tab" type="button" data-arr="radarr" data-active="${type === 'radarr'}">Radarr</button><button class="noctra-tab" type="button" data-arr="sonarr" data-active="${type === 'sonarr'}">Sonarr</button><button class="noctra-tab" type="button" data-arr="prowlarr" data-active="${type === 'prowlarr'}">Prowlarr</button></div><div id="noctra-automation-content"></div>`, { wide: true });
    loadAutomation(type, view);
  }

  function renderArrLookupResults(results, type) {
    const target = document.querySelector('#noctra-arr-lookup-results');
    if (!target) return;
    arrCenterState.lookup = results || [];
    target.innerHTML = `<div class="noctra-arr-grid">${(results || []).map((item, index) => `<article class="noctra-arr-card noctra-arr-lookup-card"><div class="noctra-arr-poster">${item.poster ? `<img src="${escapeHtml(item.poster)}" alt="" loading="lazy">` : '<span>N</span>'}</div><div class="noctra-arr-card-body"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(String(item.year || ''))}${item.network ? ` · ${escapeHtml(item.network)}` : item.studio ? ` · ${escapeHtml(item.studio)}` : ''}</p></div><p class="noctra-arr-overview">${escapeHtml(item.overview || 'Aucun résumé.')}</p><button class="noctra-button noctra-button--primary" type="button" data-arr-add-index="${index}" data-arr-add-type="${type}">Ajouter</button></div></article>`).join('') || '<div class="noctra-empty">Aucun résultat.</div>'}</div>`;
  }

  function mount() {
    if (document.querySelector('#noctra-dock')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <button id="noctra-back" type="button" aria-label="Retour" title="Retour">
        ${icons.back}<span>Retour</span>
      </button>
      <nav id="noctra-dock" aria-label="Navigation Noctra">
        <button class="noctra-brand" type="button" aria-label="Navigation Noctra" aria-expanded="true">
          <i><img src="../noctra-mark.svg" alt=""></i><span><strong>NOCTRA</strong><small>MEDIA CLIENT</small></span>
        </button>
        <button id="noctra-install-app" class="noctra-install-app" type="button"
          data-noctra="install" hidden aria-label="Installer Noctra">
          ${icons.install}<span>Installer Noctra</span>
        </button>
        <div class="noctra-dock-items">
          <button class="noctra-dock-button" type="button" data-noctra="home" aria-label="Accueil" title="Accueil">${icons.home}<span>Accueil</span></button>
          <button class="noctra-dock-button" type="button" data-noctra="library" aria-label="Médiathèques" title="Médiathèques">${icons.library}<span>Média<wbr>thèques</span></button>
          <button class="noctra-dock-button" type="button" data-noctra="request" aria-label="Demandes" title="Demandes">${icons.request}<span>Demandes</span></button>
          <button class="noctra-dock-button" type="button" data-noctra="roulette" aria-label="Roulette" title="Roulette Jellyfin">${icons.sparkle}<span>Roulette</span></button>
          <button class="noctra-dock-button" type="button" data-noctra="tv" aria-label="TV" title="TV">${icons.tv}<span>TV</span></button>
          <button class="noctra-dock-button noctra-more-button" type="button" data-noctra="more" aria-label="Plus" aria-haspopup="dialog" aria-expanded="false">${icons.more}<span>Plus</span></button>
        </div>
      </nav>
      <div id="noctra-backdrop" aria-live="polite"></div>
      <div id="noctra-confirm"></div>
      <div id="noctra-toast" role="status"></div>`);

    const dock = document.querySelector('#noctra-dock');
    applyAuthContext();
    const brand = dock.querySelector('.noctra-brand');
    const setExpanded = (expanded, force = false) => {
      window.clearTimeout(dockCloseTimer);
      const resolved = true;
      dock.dataset.expanded = String(resolved);
      dock.dataset.persistent = 'true';
      brand.setAttribute('aria-expanded', String(resolved));
    };
    const scheduleDockClose = () => {
      window.clearTimeout(dockCloseTimer);
      if (!document.body.classList.contains('noctra-playing')) {
        setExpanded(true, true);
        return;
      }
      dockCloseTimer = window.setTimeout(() => setExpanded(false, true), 260);
    };
    brand.addEventListener('pointerenter', () => { if (dock.dataset.role !== 'user') setExpanded(true); }, { passive: true });
    brand.addEventListener('click', () => {
      if (document.body.classList.contains('noctra-playing')) {
        setExpanded(dock.dataset.expanded !== 'true', true);
      } else {
        setExpanded(true, true);
      }
    });
    dock.addEventListener('pointerenter', () => { if (dock.dataset.role !== 'user') window.clearTimeout(dockCloseTimer); }, { passive: true });
    dock.addEventListener('pointerleave', () => { if (dock.dataset.role !== 'user') scheduleDockClose(); }, { passive: true });
    dock.addEventListener('focusin', () => { if (dock.dataset.role !== 'user') setExpanded(true); });
    dock.addEventListener('focusout', event => {
      if (dock.dataset.role !== 'user' && !dock.contains(event.relatedTarget)) scheduleDockClose();
    });
    setExpanded(true, true);
    const installButton = document.querySelector('#noctra-install-app');
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.navigator.standalone === true;
    if (installButton) installButton.hidden = standalone || !pwaInstallPrompt;
    applyAuthContext();
  }


  document.addEventListener('load', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-tv-logo-image]')) return;
    const holder = image.closest('.noctra-tv-channel-logo, .noctra-tv-now-logo');
    if (!holder || !image.naturalWidth) return;
    image.dataset.tvLogoLoaded = 'true';
    const priority = Number(image.dataset.tvLogoPriority || 0);
    const currentPriority = Number(holder.dataset.tvLogoPriority ?? Number.POSITIVE_INFINITY);
    if (priority <= currentPriority) {
      holder.querySelectorAll('img[data-tv-logo-image]').forEach(candidate => { candidate.hidden = candidate !== image; });
      holder.dataset.tvLogoPriority = String(priority);
      holder.dataset.tvLogoState = 'ready';
    } else {
      image.hidden = true;
    }
  }, true);

  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-tv-logo-image]')) return;
    image.hidden = true;
    const holder = image.closest('.noctra-tv-channel-logo, .noctra-tv-now-logo');
    const pendingSecondary = holder?.querySelector('img[data-tv-logo-src]');
    if (pendingSecondary) {
      pendingSecondary.hidden = false;
      pendingSecondary.src = pendingSecondary.dataset.tvLogoSrc;
      delete pendingSecondary.dataset.tvLogoSrc;
      return;
    }
    const backup = holder ? [...holder.querySelectorAll('img[data-tv-logo-image][data-tv-logo-loaded="true"]')]
      .filter(candidate => candidate !== image)
      .sort((left, right) => Number(left.dataset.tvLogoPriority || 0) - Number(right.dataset.tvLogoPriority || 0))[0] : null;
    if (backup && holder) {
      backup.hidden = false;
      holder.dataset.tvLogoPriority = backup.dataset.tvLogoPriority || '1';
      holder.dataset.tvLogoState = 'ready';
      return;
    }
    if (holder && !holder.querySelector('img[data-tv-logo-image]:not([hidden])')) {
      const fallback = holder.querySelector('[data-tv-logo-fallback]') || document.createElement('span');
      fallback.dataset.tvLogoFallback = 'true';
      fallback.className = 'noctra-tv-logo-fallback';
      fallback.textContent = tvLogoMonogram(holder.dataset.tvLogoLabel || 'TV');
      if (!fallback.isConnected) holder.append(fallback);
      fallback.hidden = false;
      holder.dataset.tvLogoState = 'fallback';
    }
  }, true);

  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-duplicate-file], [data-duplicate-select-all]')) {
      if (event.target.matches('[data-duplicate-select-all]')) {
        document.querySelectorAll('#noctra-confirm [data-duplicate-file]').forEach(input => {
          input.checked = event.target.checked;
        });
      }
      duplicateSelectionSummary();
      return;
    }
    const mobileProvider = event.target.closest?.('[data-tv-source-select]');
    if (mobileProvider) { tvState.group='Toutes'; tvState.search=''; void openTv(mobileProvider.value, ''); return; }
    const provider = event.target.closest?.('[data-discovery-provider]');
    if (provider) {
      openDiscoveries(discoveryState.category, provider.value || '', discoveryState.mediaType, discoveryState.mode, discoveryState.genre);
      return;
    }
    const mediaType = event.target.closest?.('[data-discovery-media-type]');
    if (mediaType) {
      openDiscoveries(discoveryState.category, discoveryState.provider, mediaType.value || 'all', discoveryState.mode, discoveryState.genre);
      return;
    }
    const discoveryGenre = event.target.closest?.('[data-discovery-genre]');
    if (discoveryGenre) {
      openDiscoveries(discoveryState.category, discoveryState.provider, discoveryState.mediaType, discoveryState.mode, discoveryGenre.value || '');
      return;
    }
    const discoveryMode = event.target.closest?.('[data-discovery-mode]');
    if (event.target.matches?.('[data-indexer-schema]')) {
      void openIndexerEditor('', event.target.value);
      return;
    }
    if (discoveryMode) {
      openDiscoveries(discoveryState.category, discoveryState.provider, discoveryState.mediaType, discoveryMode.value || 'balanced', discoveryState.genre);
      return;
    }
    if (event.target.matches?.('[data-request-media-filter]')) {
      requestHistoryState.mediaType = event.target.value || 'all';
      applyRequestHistoryFilters();
      return;
    }
    if (event.target.matches?.('[data-tv-group-filter]')) applyTvChannelFilters({ resetLimit: true });
  });

  document.addEventListener('input', event => {
    if (event.target.matches?.('[data-tv-source-search]')) {
      const picker = event.target.closest('.noctra-tv-source-picker');
      const query = String(event.target.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      let visible = 0;
      picker.querySelectorAll('[data-tv-source]').forEach(button => {
        button.hidden = !button.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
        if (!button.hidden) visible++;
      });
      picker.querySelector('.noctra-tv-source-no-result').hidden = visible > 0;
      return;
    }
    if (event.target.matches?.('[data-tv-live-volume]')) {
      const video = document.querySelector('#noctra-tv-video:not([hidden])');
      if (video) {
        video.volume = Math.max(0, Math.min(1, Number(event.target.value || 0)));
        video.muted = video.volume <= .001;
        refreshTvDesktopLiveControls();
      }
      return;
    }
    if (event.target.matches?.('[data-request-history-search]')) {
      requestHistoryState.query = event.target.value || '';
      applyRequestHistoryFilters();
      return;
    }
    if (event.target.matches?.('[data-tv-search]')) {
      const clear = event.target.closest('label')?.querySelector('[data-tv-clear-search]');
      if (clear) clear.hidden = !event.target.value;
      scheduleTvChannelFilters();
      return;
    }
    if (event.target.matches?.('[data-download-search]')) {
      downloadsUiState.search = event.target.value || '';
      downloadsUiState.visibleLimit = downloadsPageSize();
      if (lastDownloadsData) updateDownloadsView(lastDownloadsData);
    }
  });

  document.addEventListener('visibilitychange', () => {
    // iOS suspend les timers quand la PWA/Safari passe en arrière-plan. Dès le
    // retour au premier plan, le centre qBittorrent reprend immédiatement.
    if (document.visibilityState === 'visible' && downloadsPanelIsOpen()) scheduleDownloadsLive(120);
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'noctra-discovery-download-form' || form.id === 'noctra-indexer-form') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (form.id === 'noctra-indexer-form') void submitIndexer(form);
      else void submitDiscoveryDownload(form);
      return;
    }
    if (form.id === 'noctra-duplicate-form') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void deleteSelectedDuplicates(form);
      return;
    }
    if (form.id === 'noctra-torrent-upload-form') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void submitTorrentUpload(form);
      return;
    }
    if (form.id === 'noctra-livewatch-vip-form') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const submit = form.querySelector('[type="submit"]');
      const fields = new FormData(form);
      const payload = { email: String(fields.get('email') || '').trim(), password: String(fields.get('password') || '') };
      if (submit) { submit.disabled = true; submit.textContent = 'Connexion sécurisée…'; }
      api('/api/tv/livewatch/session', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 25_000
      }).then(() => {
        form.reset();
        clearApiCache('/api/tv');
        toast('LiveWatch VIP est maintenant partagé avec les comptes Noctra.');
        return openTv(tvState.sourceId, tvState.ref);
      }).catch(error => {
        const password = form.querySelector('input[name="password"]');
        if (password) password.value = '';
        toast(error.message);
        if (submit) { submit.disabled = false; submit.innerHTML = `${icons.sparkle}<span>Réessayer</span>`; }
      });
      return;
    }
    if (form.id === 'noctra-tv-source-form') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const submit = form.querySelector('[type="submit"]');
      const payload = Object.fromEntries(new FormData(form));
      if (submit) { submit.disabled = true; submit.textContent = 'Analyse…'; }
      api('/api/tv/sources', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
      }).then(result => {
        clearApiCache('/api/tv');
        toast('Source TV ajoutée.');
        return openTv(result.source?.id || '');
      }).catch(error => {
        toast(error.message);
        if (submit) { submit.disabled = false; submit.innerHTML = `${icons.tv}<span>Analyser et ajouter</span>`; }
      });
      return;
    }
    if (form.id === 'noctra-identify-panel-search') {
      event.preventDefault();
      event.stopImmediatePropagation();
      searchIdentifyPanel(form);
      return;
    }
    if (form.id === 'noctra-identify-panel-apply') {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyIdentifyPanel(form);
      return;
    }
    if (form.matches?.('.popupIdentifyForm')) {
      const dialog = form.closest('.identifyDialog');
      const itemId = currentDetailItemId();
      if (!dialog || !itemId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      searchIdentification(dialog, form, itemId);
      return;
    }
    if (form.matches?.('.identifyOptionsForm') && form.closest('.identifyDialog')?.dataset.noctraIdentifyManaged === 'true') {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyIdentification(form.closest('.identifyDialog'), form);
    }
  }, true);

  document.addEventListener('visibilitychange', tryTvAutoPictureInPicture);
  window.addEventListener('pagehide', tryTvAutoPictureInPicture);

  document.addEventListener('pointerdown', event => {
    rememberMediaContext(event.target, true);
  }, true);

  document.addEventListener('focusin', event => {
    rememberMediaContext(event.target, true);
  }, true);

  document.addEventListener('contextmenu', event => {
    rememberMediaContext(event.target);
  }, true);

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('.headerCastButton, .headerSyncButton');
    if (!trigger) return;
    const requestedKind = trigger.matches('.headerSyncButton') ? 'syncplay' : 'cast';
    headerActionMenuIntent = requestedKind;
    // Cast et SyncPlay peuvent attendre plusieurs secondes la réponse Jellyfin.
    // Garde l'ancrage actif jusqu'à l'arrivée réelle de leur feuille d'actions.
    headerActionMenuIntentUntil = Date.now() + 8_000;
    const settleHeaderMenu = () => {
      if (headerActionMenuIntent !== requestedKind || headerActionMenuIntentUntil <= Date.now()) return;
      syncHeaderActionMenus();
      repairHeaderMenuIcons(document, headerActionMenuIntent);
      window.setTimeout(settleHeaderMenu, 90);
    };
    window.setTimeout(settleHeaderMenu, 0);
  }, true);

  document.addEventListener('click', event => {
    const trigger = identifyMenuTrigger(event.target);
    if (!trigger) {
      rememberMediaContext(event.target, true);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (authContext && !authContext.isAdmin) {
      toast('L’identification est réservée aux administrateurs.');
      return;
    }
    const itemId = currentDetailItemId(trigger);
    if (!itemId) {
      toast('Noctra ne parvient pas à retrouver l’identifiant de ce média.');
      return;
    }
    dismissNativeEditorMenu(trigger);
    // Laisse Jellyfin terminer la fermeture de sa feuille d’actions avant de
    // déplacer le focus dans le panneau Noctra.
    window.requestAnimationFrame(() => openIdentifyPanel(itemId));
  }, true);

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href*="topParentId="]');
    const route = libraryHashFromLink(link);
    if (!route) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateToLibrary(route);
  }, true);

  window.addEventListener('click', event => {
    const carouselButton = event.target.closest('.emby-scrollbuttons-button, .emby-scrollbuttons .scrollbutton');
    if (!carouselButton) return;
    const carousel = getHomeCarousel(carouselButton);
    if (!carousel) return;
    if (boundHomeCarouselButtons.has(carouselButton)) return;
    const nativeScrollerReady = typeof carousel.scroller.addScrollEventListener === 'function'
      && typeof carousel.scroller.getScrollSize === 'function'
      && typeof carousel.scroller.scrollToPosition === 'function';
    carouselButton.dataset.noctraCarouselEngine = nativeScrollerReady ? 'jellyfin-api' : 'dom-fallback';
    event.preventDefault();
    event.stopImmediatePropagation();
    moveHomeCarousel(carouselButton);
  }, true);

  document.addEventListener('submit', event => {
    const keyForm = event.target.closest('[data-tv-provider-key-form]');
    if (keyForm) {
      event.preventDefault();
      const button = keyForm.querySelector('button');
      if (button.disabled) return;
      button.disabled = true;
      const status = keyForm.querySelector('[data-key-status]');
      status.textContent = 'Vérification de l’accès…';
      const key = new FormData(keyForm).get('key');
      api('/api/tv/provider-keys', {method:'POST', body:JSON.stringify({provider:keyForm.dataset.tvProviderKeyForm,key}), timeoutMs:30_000})
        .then(() => { keyForm.reset(); status.textContent = 'Accès activé pour Noctra.'; clearApiCache('/api/tv'); })
        .catch(error => { status.textContent = error.message; })
        .finally(() => { button.disabled = false; });
      return;
    }
    if (event.target.id !== 'noctra-roulette-form') return;
    event.preventDefault(); void spinRoulette(event.target);
  });
  document.addEventListener('input', event => {
    if (event.target.matches('[data-tv-bouquet-search]')) {
      const needle = normalizedText(event.target.value);
      let visible = 0;
      document.querySelectorAll('.noctra-tv-groups > *').forEach(card => {
        card.hidden = !normalizedText(card.textContent).includes(needle);
        if (!card.hidden) visible++;
      });
      const empty = document.querySelector('[data-tv-bouquet-empty]');
      if (empty) empty.hidden = visible > 0;
    }
    if (event.target.matches('#noctra-roulette-form [name="rating"]')) {
      document.querySelector('[data-roulette-rating]').textContent = `${event.target.value}/10`;
    }
  });
  document.addEventListener('click', async event => {
    const platformScroll = event.target.closest('[data-platform-scroll]');
    if (platformScroll) {
      const rail = platformScroll.closest('.noctra-platform-carousel')?.querySelector('.noctra-platform-rail');
      rail?.scrollBy({ left: Number(platformScroll.dataset.platformScroll) * Math.max(160, rail.clientWidth * .8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    const platform = event.target.closest('[data-platform-id]');
    if (platform) { await openDiscoveries('streaming', platform.dataset.platformId, 'all', 'balanced', ''); return; }
    if (event.target.closest('[data-tv-provider-keys]')) { await openTvProviderKeys(); return; }
    const rouletteItem = event.target.closest('[data-roulette-item]');
    if (rouletteItem) {
      const id = rouletteItem.dataset.rouletteItem;
      closePanel(); location.hash = `#/details?id=${encodeURIComponent(id)}`;
      return;
    }
    if (event.target.closest('#noctra-back')) {
      const playerBack = document.querySelector(
        '.videoPlayerContainer:not(.hide) .btnBack, .videoPlayerContainer:not(.hide) .btnClose, .videoPlayerContainer:not(.hide) [data-action="back"]'
      );
      if (playerBack) playerBack.click();
      else navigateNoctraBack();
      return;
    }

    const dockButton = event.target.closest('[data-noctra]');
    if (dockButton) {
      const action = dockButton.dataset.noctra;
      if (action === 'more') { openMobileMore(); return; }
      document.querySelector('#noctra-mobile-more[open]')?.close();
      document.querySelectorAll('.noctra-dock-button').forEach(button => button.dataset.active = String(button.dataset.noctra === action || (button.dataset.noctra === 'more' && ['roulette', 'download', 'tools', 'dashboard', 'users', 'refresh'].includes(action))));
      if (['download', 'tools', 'dashboard', 'refresh', 'users'].includes(action) && !authContext?.isAdmin) {
        dockButton.dataset.active = 'false';
        toast('Cette fonction est réservée aux administrateurs.');
        return;
      }
      if (action === 'install') {
        dockButton.dataset.active = 'false';
        if (!pwaInstallPrompt) {
          toast('Utilise le menu du navigateur puis « Installer Noctra » ou « Ajouter à l’écran d’accueil ».');
          return;
        }
        pwaInstallPrompt.prompt();
        pwaInstallPrompt.userChoice.finally(() => {
          pwaInstallPrompt = null;
          dockButton.hidden = true;
        });
        return;
      }
      if (action === 'home') goHome();
      if (action === 'library') openLibraries();
      if (action === 'request') openRequests();
      if (action === 'tv') openTv();
      if (action === 'roulette') openRoulette();
      if (action === 'download') openDownloads();
      if (action === 'tools') openAutomation();
      if (action === 'dashboard') {
        closePanel();
        location.hash = '#/dashboard';
      }
      if (action === 'refresh') refreshLibraries(dockButton);
      if (action === 'users') {
        closePanel();
        location.hash = '#/dashboard/users';
      }
      return;
    }

    if (event.target.matches('#noctra-backdrop') || event.target.closest('[data-noctra-close]')) {
      closePanel();
      return;
    }

    const panelIdentifyResult = event.target.closest('[data-noctra-panel-identify-result]');
    if (panelIdentifyResult && identifyPanelState) {
      identifyPanelState.selected = identifyPanelState.results[
        Number(panelIdentifyResult.dataset.noctraPanelIdentifyResult)
      ] || null;
      renderIdentifyPanelChoice();
      return;
    }

    if (event.target.closest('[data-noctra-panel-identify-back]')) {
      renderIdentifyPanelSearch();
      return;
    }

    if (event.target.closest('[data-noctra-panel-identify-results-back]')) {
      renderIdentifyPanelResults();
      return;
    }

    const identifyResult = event.target.closest('[data-noctra-identify-result]');
    if (identifyResult) {
      selectIdentificationResult(identifyResult);
      return;
    }

    const identifyBack = event.target.closest('[data-noctra-identify-back]');
    if (identifyBack) {
      const dialog = identifyBack.closest('.identifyDialog');
      dialog?.querySelector('.identificationSearchResults')?.classList.add('hide');
      dialog?.querySelector('.identifyOptionsForm')?.classList.add('hide');
      dialog?.querySelector('.popupIdentifyForm')?.classList.remove('hide');
      dialog?.querySelector('.dialogContentInner')?.classList.add('dialog-content-centered');
      dialog?.querySelector('#txtLookupName')?.focus();
      return;
    }


    if (event.target.closest('[data-open-files]')) {
      await openFileExplorer();
      return;
    }

    if (event.target.closest('[data-file-duplicates]')) {
      await openDuplicateDialog();
      return;
    }

    if (event.target.closest('[data-file-completeness], [data-completeness-restart]')) {
      await openCompletenessDialog(event.target.closest('[data-file-completeness]')?.dataset.fileCompleteness || completenessKind, Boolean(event.target.closest('[data-completeness-restart]')));
      return;
    }
    if (event.target.closest('[data-completeness-close]')) {
      closeConfirm();
      document.querySelector(`[data-file-completeness="${completenessKind}"]`)?.focus({ preventScroll: true });
      return;
    }
    const completenessMore = event.target.closest('[data-completeness-more]');
    if (completenessMore) {
      await loadCompletenessGroup(completenessMore.closest('[data-completeness-group]'), Number(completenessMore.dataset.completenessMore));
      return;
    }

    if (event.target.closest('[data-duplicate-close]')) {
      closeDuplicateDialog();
      return;
    }

    if (event.target.closest('[data-duplicate-rescan]')) {
      await openDuplicateDialog();
      return;
    }

    if (event.target.closest('[data-open-discovery]')) {
      await openDiscoveries('smart', '', 'all', 'balanced', '');
      return;
    }

    if (event.target.closest('[data-files-back-libraries]') || event.target.closest('[data-discovery-back-libraries]')) {
      await openLibraries();
      return;
    }

    const fileRoot = event.target.closest('[data-file-root]');
    if (fileRoot) {
      await openFileExplorer(fileRoot.dataset.fileRoot, '');
      return;
    }

    const fileOpen = event.target.closest('[data-file-open]');
    if (fileOpen && !fileOpen.disabled) {
      await openFileExplorer(fileExplorerState.root, fileOpen.dataset.fileOpen || '');
      return;
    }

    if (event.target.closest('[data-file-empty-trash]')) {
      if (!window.confirm('Vider définitivement tout le dossier Trash ? Cette action est irréversible.')) return;
      try {
        const result = await api('/api/files/empty-trash', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: fileExplorerState.root || 'trash' })
        });
        clearApiCache('/api/files');
        toast(result.message || 'Dossier Trash vidé.');
        await openFileExplorer(fileExplorerState.root || 'trash', '');
      } catch (error) {
        toast(error.message);
      }
      return;
    }

    if (event.target.closest('[data-file-mkdir]')) {
      const name = window.prompt('Nom du nouveau dossier :');
      if (!name) return;
      try {
        await api('/api/files/mkdir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: fileExplorerState.root, path: fileExplorerState.path, name })
        });
        clearApiCache('/api/files');
        toast('Dossier créé.');
        await openFileExplorer(fileExplorerState.root, fileExplorerState.path);
      } catch (error) {
        toast(error.message);
      }
      return;
    }

    const fileRename = event.target.closest('[data-file-rename]');
    if (fileRename) {
      const name = window.prompt('Nouveau nom :', fileRename.dataset.fileName || '');
      if (!name || name === fileRename.dataset.fileName) return;
      try {
        await api('/api/files/rename', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: fileExplorerState.root, path: fileRename.dataset.fileRename, name })
        });
        clearApiCache('/api/files');
        toast('Élément renommé.');
        await openFileExplorer(fileExplorerState.root, fileExplorerState.path);
      } catch (error) {
        toast(error.message);
      }
      return;
    }

    const fileTrash = event.target.closest('[data-file-trash]');
    if (fileTrash) {
      if (!window.confirm(`Déplacer « ${fileTrash.dataset.fileName || 'cet élément'} » dans la corbeille Noctra ?`)) return;
      try {
        const result = await api('/api/files/trash', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: fileExplorerState.root, path: fileTrash.dataset.fileTrash })
        });
        clearApiCache('/api/files');
        toast(result.message || 'Élément déplacé dans la corbeille.');
        await openFileExplorer(fileExplorerState.root, fileExplorerState.path);
      } catch (error) {
        toast(error.message);
      }
      return;
    }

    const discoveryCategory = event.target.closest('[data-discovery-category]');
    if (discoveryCategory) {
      await openDiscoveries(discoveryCategory.dataset.discoveryCategory, discoveryCategory.dataset.discoveryCategory === 'streaming' ? discoveryState.provider : '', discoveryState.mediaType, discoveryState.mode, discoveryState.genre);
      return;
    }

    const libraryRefresh = event.target.closest('[data-library-refresh]');
    if (libraryRefresh) {
      if (!authContext?.isAdmin) {
        toast('L’actualisation des médiathèques est réservée aux administrateurs.');
        return;
      }
      await refreshLibraries(libraryRefresh);
      return;
    }

    const library = event.target.closest('[data-library-id]');
    if (library) {
      const collectionType = library.dataset.libraryType === 'tvshows' ? 'tvshows' : 'movies';
      const route = collectionType === 'tvshows' ? 'tv' : 'movies';
      navigateToLibrary(
        `#/${route}?topParentId=${encodeURIComponent(library.dataset.libraryId)}&collectionType=${collectionType}`
      );
      return;
    }

    if (event.target.closest('[data-media-detail-close]')) {
      closeMediaDetail();
      return;
    }

    if (event.target.closest('[data-media-detail-refresh]')) {
      await loadMediaDetail(true);
      return;
    }

    const mediaDetailTarget = event.target.closest('[data-media-detail]');
    if (mediaDetailTarget && !event.target.closest('button,a,input,select,label,summary,[data-no-media-detail]')) {
      openMediaDetail(mediaDetailTarget);
      return;
    }

    const requestStatusFilter = event.target.closest('[data-request-status-filter]');
    if (requestStatusFilter) {
      requestHistoryState.status = requestStatusFilter.dataset.requestStatusFilter || 'all';
      applyRequestHistoryFilters();
      return;
    }

    const clearPendingRequests = event.target.closest('[data-clear-pending-requests]');
    if (clearPendingRequests) {
      clearPendingRequests.disabled = true;
      try {
        const result = await api('/api/jellyseerr/requests/clear-pending', { method: 'POST' });
        toast(result.message || 'Demandes en attente supprimées.');
        clearApiCache('/api/jellyseerr/requests');
        await showRequestHistory();
      } catch (error) { clearPendingRequests.disabled = false; toast(error.message); }
      return;
    }

    const requestAdminStatus = event.target.closest('[data-request-admin-status]');
    if (requestAdminStatus) {
      requestAdminStatus.disabled = true;
      try {
        await api(`/api/jellyseerr/request/${encodeURIComponent(requestAdminStatus.dataset.requestAdminId)}/${encodeURIComponent(requestAdminStatus.dataset.requestAdminStatus)}`, { method: 'POST' });
        toast(requestAdminStatus.dataset.requestAdminStatus === 'approve' ? 'Demande approuvée.' : 'Demande refusée.');
        clearApiCache('/api/jellyseerr/requests');
        await showRequestHistory();
      } catch (error) { requestAdminStatus.disabled = false; toast(error.message); }
      return;
    }

    const requestDelete = event.target.closest('[data-request-delete-id]');
    if (requestDelete) {
      requestDelete.disabled = true;
      try {
        await api(`/api/jellyseerr/request/${encodeURIComponent(requestDelete.dataset.requestDeleteId)}`, { method: 'DELETE' });
        toast(authContext?.isAdmin ? 'Demande supprimée.' : 'Demande annulée.');
        clearApiCache('/api/jellyseerr/requests');
        await showRequestHistory();
      } catch (error) { requestDelete.disabled = false; toast(error.message); }
      return;
    }

    const requestView = event.target.closest('[data-request-view]');
    if (requestView) {
      document.querySelectorAll('[data-request-view]').forEach(button => button.dataset.active = String(button === requestView));
      if (requestView.dataset.requestView === 'history') showRequestHistory();
      if (requestView.dataset.requestView === 'discover') openRequests();
      return;
    }

    const request = event.target.closest('[data-request-id]');
    if (request) {
      closeMediaDetail();
      openRequestDestination(request);
      return;
    }

    const discoveryFeedback = event.target.closest('[data-discovery-feedback]');
    if (discoveryFeedback) {
      discoveryFeedback.disabled = true;
      try {
        const genreIds = String(discoveryFeedback.dataset.feedbackGenres || '').split(',').map(Number).filter(Number.isInteger);
        const action = discoveryFeedback.dataset.discoveryFeedback;
        await api('/api/discovery/feedback', {
          method: 'POST',
          body: JSON.stringify({
            id: Number(discoveryFeedback.dataset.feedbackId),
            mediaType: discoveryFeedback.dataset.feedbackType,
            title: discoveryFeedback.dataset.feedbackTitle || '',
            genreIds,
            action
          })
        });
        clearApiCache('/api/discovery');
        const card = discoveryFeedback.closest('.noctra-discovery-card');
        if (action === 'less') {
          card?.animate?.([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.98)' }], { duration: 160, fill: 'forwards' });
          window.setTimeout(() => card?.remove(), 170);
          toast('Compris : ce type de suggestion sera moins proposé.');
        } else {
          discoveryFeedback.textContent = 'Pris en compte ✓';
          toast('Compris : Noctra renforcera ce type de contenu.');
        }
      } catch (error) { discoveryFeedback.disabled = false; toast(error.message); }
      return;
    }

    if (event.target.closest('[data-discovery-refresh], [data-discovery-profile-retry]')) {
      clearApiCache('/api/discovery');
      await openDiscoveries(discoveryState.category, discoveryState.provider, discoveryState.mediaType, discoveryState.mode, discoveryState.genre, true);
      return;
    }

    const downloadRelease = event.target.closest('[data-discovery-download]');
    if (downloadRelease) { event.preventDefault(); await openDiscoveryDownloadDialog(downloadRelease); return; }
    const editIndexer = event.target.closest('[data-indexer-edit]');
    if (editIndexer) { await openIndexerEditor(editIndexer.dataset.indexerEdit); return; }
    if (event.target.closest('[data-indexer-add]')) { await openIndexerEditor(); return; }
    if (event.target.closest('[data-indexer-test]')) { await submitIndexer(event.target.closest('form'), true); return; }
    if (event.target.closest('[data-release-refresh]') && releaseSearchContext) {
      const context = releaseSearchContext;
      await openReleaseSearch(context.type, context.id, context.title, { ...context.options, force: true });
      return;
    }
    const torrentLiveButton = event.target.closest('[data-discovery-torrents]');
    if (torrentLiveButton) {
      openDiscoveryTorrentLive(torrentLiveButton);
      return;
    }
    if (event.target.closest('[data-discovery-torrents-refresh]')) {
      window.clearTimeout(discoveryTorrentLiveTimer);
      discoveryTorrentLiveTimer = 0;
      await refreshDiscoveryTorrentLive(true);
      return;
    }
    if (event.target.closest('[data-discovery-torrents-close]')) {
      closeDiscoveryTorrentLive();
      return;
    }

    const trackerRetry = event.target.closest('[data-tracker-retry]');
    if (trackerRetry) {
      const status = trackerRetry.closest('[data-tracker-status]');
      if (status) { status.dataset.trackerQueued = 'false'; queueTrackerAvailability(status, true); }
      return;
    }

    const tvSportsToggle = event.target.closest('[data-tv-toggle-sports]');
    if (tvSportsToggle) {
      const nextSection = tvState.section === 'sports' ? 'channels' : 'sports';
      tvState.section = nextSection;
      tvState.showSports = nextSection === 'sports';
      tvState.group = 'Toutes';
      tvState.search = '';
      try { window.localStorage?.setItem('noctra-tv-sports-visible', tvState.showSports ? '1' : '0'); } catch {}
      const firstSource = tvState.sources.find(source => tvSourceSection(source) === nextSection);
      await openTv(firstSource?.id || '', '', { preferSection: true });
      return;
    }

    // Le shell porte lui aussi data-tv-mobile-view pour piloter le responsive.
    // Le sélecteur générique interceptait donc tous les clics du centre TV et
    // empêchait chaînes, sources, recherche et plein écran de fonctionner.
    const tvMobileView = event.target.closest('button[data-tv-mobile-view]');
    if (tvMobileView) {
      setTvMobileView(tvMobileView.dataset.tvMobileView);
      return;
    }

    if (event.target.closest('[data-tv-clear-search]')) {
      const input = document.querySelector('[data-tv-search]');
      if (input) {
        input.value = '';
        input.focus();
      }
      tvState.search = '';
      renderTvChannelList({ resetLimit: true });
      event.target.closest('[data-tv-clear-search]').hidden = true;
      return;
    }

    if (event.target.closest('[data-tv-live-edge]')) {
      returnTvToLiveEdge();
      return;
    }

    if (event.target.closest('[data-tv-live-toggle]')) {
      const video = document.querySelector('#noctra-tv-video:not([hidden])');
      if (video) {
        if (video.paused) await video.play().catch(error => toast(error?.message || 'Le direct ne peut pas démarrer.'));
        else video.pause();
        refreshTvDesktopLiveControls();
      }
      return;
    }

    if (event.target.closest('[data-tv-custom-live-edge]')) {
      returnTvToLiveEdge();
      return;
    }

    if (event.target.closest('[data-tv-live-mute]')) {
      const video = document.querySelector('#noctra-tv-video:not([hidden])');
      if (video) {
        video.muted = !video.muted;
        refreshTvDesktopLiveControls();
      }
      return;
    }

    if (event.target.closest('[data-tv-live-pip]')) {
      await enterTvPictureInPicture();
      return;
    }

    if (event.target.closest('[data-tv-live-fullscreen]')) {
      await toggleTvFullscreen();
      return;
    }

    const tvZap = event.target.closest('[data-tv-zap]');
    if (tvZap) {
      await zapTvChannel(tvZap.dataset.tvZap);
      return;
    }

    const tvSection = event.target.closest('[data-tv-section]');
    if (tvSection) {
      tvState.section = tvSection.dataset.tvSection || 'channels';
      tvState.group = 'Toutes';
      tvState.search = '';
      if (tvState.section === 'favorites') {
        renderTvFavoritesWorkspace();
        return;
      }
      const firstSource = tvState.sources.find(source => tvSourceSection(source) === tvState.section);
      await openTv(firstSource?.id || '', '', { preferSection: true });
      return;
    }

    if (event.target.closest('[data-tv-portal-reload]')) {
      const frame = document.querySelector('#noctra-tv-embed');
      if (frame?.src) frame.src = frame.src;
      return;
    }

    if (event.target.closest('[data-tv-safe-tools-launcher]')) {
      if (tvSafeExtras.menuOpen) closeTvSafeToolsMenu(); else openTvSafeToolsMenu();
      return;
    }
    if (event.target.closest('[data-tv-safe-tools-close]')) { closeTvSafeToolsMenu(); return; }
    // L'attribut data-tv-safe-theater existe aussi sur le panneau comme état de
    // layout. Seuls les vrais boutons doivent basculer le mode : sinon tout clic
    // dans le lecteur remonte jusqu'au panneau et ferme involontairement le cinéma.
    if (event.target.closest('button[data-tv-safe-theater]')) { setTvSafeTheater(!tvSafeExtras.theater); return; }
    const safeQualityStep = event.target.closest('[data-tv-safe-quality-step]');
    if (safeQualityStep) { stepTvSafeQuality(safeQualityStep.dataset.tvSafeQualityStep); return; }
    if (event.target.closest('[data-tv-safe-multi-add]')) { addTvSafeMultiviewCurrent(); return; }
    if (event.target.closest('[data-tv-safe-multi-open]')) { renderTvSafeMultiview(); return; }
    if (event.target.closest('[data-tv-safe-multi-clear]')) { clearTvSafeMultiviewSelection(); return; }
    if (event.target.closest('[data-tv-safe-diagnostics]')) { closeTvSafeToolsMenu(); openTvDiagnosticsPanel(); return; }
    if (event.target.closest('[data-tv-diagnostics-close]')) { closeTvDiagnosticsPanel(); return; }
    if (event.target.closest('[data-tv-diagnostics-refresh]')) { refreshTvDiagnosticsPanel(); return; }
    if (event.target.closest('[data-tv-diagnostics-copy]')) { await copyTvDiagnostics(); return; }
    if (event.target.closest('[data-tv-diagnostics-clear]')) { tvDiagnostics.length = 0; recordTvDiagnostic('diagnostic-cleared'); refreshTvDiagnosticsPanel(); return; }
    const multiRetry = event.target.closest('[data-tv-safe-multi-retry]');
    if (multiRetry) { retryTvSafeMultiviewSlot(multiRetry.dataset.tvSafeMultiRetry); return; }
    if (event.target.closest('[data-tv-safe-multi-close]')) { closeTvSafeMultiview(); return; }
    const multiFocus = event.target.closest('[data-tv-safe-multi-focus]');
    if (multiFocus) { focusTvSafeMultiviewTile(multiFocus.dataset.tvSafeMultiFocus); return; }
    const multiFullscreen = event.target.closest('[data-tv-safe-multi-tile-fullscreen]');
    if (multiFullscreen) { await toggleTvSafeMultiviewFullscreen(multiFullscreen.dataset.tvSafeMultiTileFullscreen); return; }
    if (event.target.closest('[data-tv-safe-multi-fullscreen]')) { await toggleTvSafeMultiviewFullscreen(); return; }
    const safeMultiAudio = event.target.closest('[data-tv-safe-multi-audio]');
    if (safeMultiAudio) { setTvSafeMultiviewAudio(safeMultiAudio.dataset.tvSafeMultiAudio); return; }
    const safeMultiRemove = event.target.closest('[data-tv-safe-multi-remove]');
    if (safeMultiRemove) { removeTvSafeMultiviewSlot(safeMultiRemove.dataset.tvSafeMultiRemove); return; }

    if (event.target.closest('[data-tv-safe-pip]')) {
      await enterTvPictureInPicture();
      refreshTvSafeToolsMenu();
      return;
    }

    if (event.target.closest('[data-tv-portal-fullscreen], [data-tv-screen-fullscreen]')) {
      await toggleTvFullscreen();
      return;
    }

    if (event.target.closest('[data-tv-cast]')) {
      await castCurrentTv();
      return;
    }

    const tvExternal = event.target.closest('[data-tv-open-external]');
    if (tvExternal?.dataset.tvOpenExternal) {
      if (tvExternal.tagName !== 'A') window.open(tvExternal.dataset.tvOpenExternal, '_blank', 'noopener,noreferrer');
      return;
    }

    const tvSource = event.target.closest('[data-tv-source]');
    if (tvSource) {
      tvState.group = 'Toutes';
      tvState.search = '';
      await openTv(tvSource.dataset.tvSource, '');
      return;
    }

    if (event.target.closest('[data-livewatch-vip-disconnect]')) {
      if (!window.confirm('Déconnecter le compte LiveWatch VIP partagé de Noctra ?')) return;
      try {
        await api('/api/tv/livewatch/session', { method: 'DELETE' });
        clearApiCache('/api/tv');
        toast('Session LiveWatch VIP supprimée.');
        await openTv(tvState.sourceId, tvState.ref);
      } catch (error) { toast(error.message); }
      return;
    }

    const tvGroup = event.target.closest('[data-tv-group-ref]');
    if (tvGroup) {
      tvState.group = 'Toutes';
      tvState.search = '';
      await openTv(tvState.sourceId, tvGroup.dataset.tvGroupRef);
      return;
    }

    if (event.target.closest('[data-tv-show-source-form]')) {
      const form = document.querySelector('#noctra-tv-source-form');
      if (form) {
        form.hidden = false;
        form.querySelector('input')?.focus({ preventScroll: false });
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    if (event.target.closest('[data-tv-cancel-source]')) {
      const form = document.querySelector('#noctra-tv-source-form');
      if (form) { form.reset(); form.hidden = true; }
      return;
    }

    const tvDelete = event.target.closest('[data-tv-delete-source]');
    if (tvDelete) {
      if (!window.confirm('Supprimer cette source TV de Noctra ?')) return;
      try {
        await api(`/api/tv/sources/${encodeURIComponent(tvDelete.dataset.tvDeleteSource)}`, { method: 'DELETE' });
        clearApiCache('/api/tv');
        tvState.sourceId = '';
        tvState.ref = '';
        try { window.localStorage.removeItem('noctra-tv-last-source'); } catch {}
        toast('Source TV supprimée.');
        await openTv('', '', {preferSection:true,force:true});
      } catch (error) { toast(error.message); }
      return;
    }

    if (event.target.closest('[data-tv-retry]')) {
      await openTv(tvState.sourceId, tvState.ref, { force: true });
      return;
    }

    const tvEmbedOption = event.target.closest('[data-tv-embed-option]');
    if (tvEmbedOption) {
      const optionIndex = Number(tvEmbedOption.dataset.tvEmbedOption);
      const option = tvState.resolvedEmbeds?.[optionIndex];
      const channel = tvState.catalog?.channels?.[tvState.currentChannelIndex];
      if (option && channel) {
        window.NoctraServerChoice?.manual();
        renderTvStreamOptions(tvState.resolvedEmbeds, optionIndex);
        const playbackSequence = ++tvPlaybackSequence;
        recordTvDiagnostic('server-manual-selected', { optionIndex });
        await playTvResolvedOption(channel, option, optionIndex, playbackSequence, true);
      }
      return;
    }

    if (event.target.closest('[data-tv-load-more]')) {
      tvState.visibleLimit = Math.min((tvState.visibleLimit || 120) + 160, filteredTvChannels().length);
      renderTvChannelList({ resetLimit: false });
      return;
    }

    const tvFavoriteToggle = event.target.closest('[data-tv-favorite-toggle]');
    if (tvFavoriteToggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const explicitKey = tvFavoriteToggle.dataset.tvFavoriteKey || '';
      const index = Number(tvFavoriteToggle.dataset.tvFavoriteIndex);
      const channel = Number.isInteger(index) ? tvState.catalog?.channels?.[index] : null;
      if (explicitKey || channel) toggleTvFavorite(channel, tvState.sourceId, explicitKey);
      if (tvState.section === 'favorites') renderTvFavoritesWorkspace();
      else renderTvChannelList({ resetLimit: false });
      return;
    }

    const tvFavoriteOpen = event.target.closest('[data-tv-favorite-open]');
    if (tvFavoriteOpen) {
      await openTvFavorite(tvFavoriteOpen.dataset.tvFavoriteOpen);
      return;
    }

    const tvChannel = event.target.closest('[data-tv-channel-index]');
    if (tvChannel) {
      playTvChannel(tvChannel.dataset.tvChannelIndex);
      return;
    }

    if (event.target.closest('[data-download-relink-all]')) {
      await startDownloadRelink();
      return;
    }

    if (event.target.closest('[data-download-add-torrent]')) {
      openTorrentUploadDialog();
      return;
    }

    const downloadFilter = event.target.closest('[data-download-filter]');
    if (downloadFilter) {
      downloadsUiState.filter = downloadFilter.dataset.downloadFilter || 'all';
      downloadsUiState.visibleLimit = downloadsPageSize();
      if (lastDownloadsData) updateDownloadsView(lastDownloadsData);
      return;
    }

    if (event.target.closest('[data-download-load-more]')) {
      downloadsUiState.visibleLimit += downloadsPageSize();
      if (lastDownloadsData) updateDownloadsView(lastDownloadsData);
      return;
    }

    const downloadDetails = event.target.closest('[data-download-details]');
    if (downloadDetails) {
      downloadDetails.disabled = true;
      downloadDetails.dataset.busy = 'true';
      try {
        await showTorrentDetails(downloadDetails.dataset.downloadDetails, downloadDetails.dataset.downloadName || 'Torrent');
      } finally {
        const current = document.querySelector(`[data-download-details="${CSS.escape(String(downloadDetails.dataset.downloadDetails || ''))}"]`);
        if (current) { current.disabled = false; current.dataset.busy = 'false'; }
      }
      return;
    }

    if (event.target.closest('[data-download-details-close]')) {
      const target = document.querySelector('#noctra-download-detail');
      if (target) target.innerHTML = '';
      downloadsUiState.detailHash = '';
      downloadsUiState.detailName = '';
      scheduleDownloadsLive(300);
      return;
    }

    const torrentMaintenance = event.target.closest('[data-torrent-maintenance]');
    if (torrentMaintenance) {
      torrentMaintenance.disabled = true;
      try {
        await api(`/api/downloads/${encodeURIComponent(torrentMaintenance.dataset.torrentHash)}/${encodeURIComponent(torrentMaintenance.dataset.torrentMaintenance)}`, { method: 'POST' });
        toast(torrentMaintenance.dataset.torrentMaintenance === 'recheck' ? 'Vérification du torrent lancée.' : 'Réannonce envoyée aux trackers.');
        scheduleDownloadsLive(250);
      } catch (error) { toast(error.message); } finally { torrentMaintenance.disabled = false; }
      return;
    }

    const torrent = event.target.closest('[data-torrent]');
    if (torrent) {
      torrent.disabled = true;
      try {
        await api(`/api/downloads/${encodeURIComponent(torrent.dataset.torrent)}/${encodeURIComponent(torrent.dataset.torrentAction)}`, { method: 'POST' });
        toast(torrent.dataset.torrentAction === 'pause' ? 'Téléchargement mis en pause.' : 'Téléchargement repris.');
        openDownloads();
      } catch (error) {
        torrent.disabled = false;
        toast(error.message);
      }
      return;
    }

    const deleteTorrent = event.target.closest('[data-delete-torrent]');
    if (deleteTorrent) {
      confirmTorrentDelete(deleteTorrent.dataset.deleteTorrent, deleteTorrent.dataset.deleteName);
      return;
    }

    if (event.target.closest('[data-confirm-cancel]')) {
      closeConfirm();
      return;
    }

    const deleteMode = event.target.closest('[data-delete-mode]');
    if (deleteMode && pendingDelete) {
      await executePendingTorrentDelete(deleteMode.dataset.deleteMode);
      return;
    }

    const arrTab = event.target.closest('[data-arr]');
    if (arrTab) {
      document.querySelectorAll('[data-arr]').forEach(button => button.dataset.active = String(button === arrTab));
      loadAutomation(arrTab.dataset.arr, 'overview', { page: 1, query: '' });
      return;
    }


    const arrView = event.target.closest('[data-arr-view]');
    if (arrView) {
      await loadAutomation(arrCenterState.type, arrView.dataset.arrView, { page: 1, query: '' });
      return;
    }

    const monitorButton = event.target.closest('[data-arr-monitor-id]');
    if (monitorButton) {
      monitorButton.disabled = true;
      try {
        await api('/api/servarr/monitor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: arrCenterState.type, id: Number(monitorButton.dataset.arrMonitorId), monitored: monitorButton.dataset.arrMonitorValue === 'true' }) });
        clearApiCache('/api/servarr');
        toast('Surveillance mise à jour.');
        await loadAutomation(arrCenterState.type, arrCenterState.view);
      } catch (error) { monitorButton.disabled = false; toast(error.message); }
      return;
    }

    const commandButton = event.target.closest('[data-arr-command]');
    if (commandButton) {
      commandButton.disabled = true;
      try {
        const itemId = Number(commandButton.dataset.arrItemId || 0);
        await api('/api/servarr/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: arrCenterState.type, name: commandButton.dataset.arrCommand, ...(arrCenterState.type === 'sonarr' && itemId ? { seriesId: itemId } : {}), ...(arrCenterState.type === 'radarr' && itemId ? { movieId: itemId } : {}) }) });
        toast('Commande envoyée.');
        clearApiCache('/api/servarr');
      } catch (error) { toast(error.message); } finally { commandButton.disabled = false; }
      return;
    }

    const addArr = event.target.closest('[data-arr-add-index]');
    if (addArr) {
      const item = arrCenterState.lookup[Number(addArr.dataset.arrAddIndex)];
      const rootFolderPath = document.querySelector('[data-arr-add-root]')?.value || '';
      const qualityProfileId = Number(document.querySelector('[data-arr-add-profile]')?.value || 0);
      const search = document.querySelector('[data-arr-add-search]')?.checked !== false;
      if (!item) return;
      addArr.disabled = true;
      addArr.textContent = 'Ajout…';
      try {
        await api('/api/servarr/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: addArr.dataset.arrAddType, item: item.raw, rootFolderPath, qualityProfileId, monitored: true, search }) });
        clearApiCache('/api/servarr');
        toast(`« ${item.title} » a été ajouté.`);
        await loadAutomation(addArr.dataset.arrAddType, 'library', { query: item.title, page: 1 });
      } catch (error) { addArr.disabled = false; addArr.textContent = 'Réessayer'; toast(error.message); }
      return;
    }

    const releaseSearch = event.target.closest('[data-release-id]');
    if (releaseSearch) {
      closeMediaDetail();
      if (releaseSearch.dataset.releaseType === 'sonarr') {
        openEpisodePicker(releaseSearch.dataset.releaseId, releaseSearch.dataset.releaseTitle);
      } else {
        openReleaseSearch('radarr', releaseSearch.dataset.releaseId, releaseSearch.dataset.releaseTitle);
      }
      return;
    }

    const season = event.target.closest('[data-season-number]');
    if (season) {
      renderEpisodeSeason(Number(season.dataset.seasonNumber));
      return;
    }

    const seasonRelease = event.target.closest('[data-season-release]');
    if (seasonRelease) {
      const seasonNumber = Number(seasonRelease.dataset.seasonReleaseNumber);
      openReleaseSearch('sonarr', 0, `${lastSeriesContext?.title || 'Série'} · Saison ${seasonNumber}`, {
        seriesId: Number(seasonRelease.dataset.seasonRelease),
        seasonNumber
      });
      return;
    }

    const packFilter = event.target.closest('[data-release-pack-filter]');
    if (packFilter && releaseSearchView) {
      releaseSearchView.filter = packFilter.dataset.releasePackFilter;
      releaseSearchView.limit = 100;
      renderReleaseSearch();
      return;
    }
    if (event.target.closest('[data-release-more]') && releaseSearchView) {
      releaseSearchView.limit += 100;
      renderReleaseSearch();
      return;
    }
    const allSeasonsRelease = event.target.closest('[data-series-release-all]');
    if (allSeasonsRelease) {
      openReleaseSearch('sonarr', 0, `${lastSeriesContext?.title || 'Série'} · Intégrales`, {
        seriesId: Number(allSeasonsRelease.dataset.seriesReleaseAll),
        allSeasons: true
      });
      return;
    }

    const episode = event.target.closest('[data-episode-release]');
    if (episode) {
      openReleaseSearch('sonarr', episode.dataset.episodeRelease, episode.dataset.episodeTitle);
      return;
    }

    const grab = event.target.closest('[data-grab-guid]');
    if (grab) {
      grab.disabled = true;
      grab.textContent = 'Envoi…';
      try {
        await api('/api/servarr/grab', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: grab.dataset.grabType,
            guid: grab.dataset.grabGuid,
            indexerId: Number(grab.dataset.grabIndexer)
          })
        });
        grab.textContent = 'Envoyée';
        toast('Release envoyée au client de téléchargement.');
      } catch (error) {
        grab.disabled = false;
        grab.textContent = 'Réessayer';
        toast(error.message);
      }
      return;
    }

    const back = event.target.closest('[data-back-automation]');
    if (back) {
      openAutomation(back.dataset.backAutomation);
      return;
    }

    const backSeries = event.target.closest('[data-back-series]');
    if (backSeries && lastSeriesContext) {
      openEpisodePicker(lastSeriesContext.id, lastSeriesContext.title);
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-tv-engine]')) {
      tvEnginePreference = event.target.value === 'shaka' ? 'shaka' : 'hls';
      try { window.localStorage?.setItem('noctra-tv-engine', tvEnginePreference); } catch {}
      closeTvSafeToolsMenu();
      if (tvState.currentPlaybackType === 'stream') {
        void tvDirectRestart?.()?.catch(() => setTvPlaybackStatus('Impossible de relancer le lecteur', 'error'));
      } else toast('Choix enregistré pour les prochains flux directs compatibles.');
      return;
    }
    if (event.target.matches('[data-tv-safe-quality-select]')) {
      setTvSafeQuality(event.target.value);
      return;
    }
    if (event.target.matches('[data-tv-safe-multi-quality]')) {
      tvSafeExtras.multiQuality = String(event.target.value || 'stable');
      refreshTvSafeMultiQuality();
      return;
    }
    if (event.target.matches('[data-tv-quality]')) {
      if (tvShaka) { setTvSafeQuality(event.target.value); return; }
      if (tvHls) {
        const level = Number(event.target.value);
        tvHls._noctraContinuity?.release();
        applyTvChannelAutoQuality(tvHls, !Number.isInteger(level) || level < 0);
        tvHls.loadLevel = Number.isInteger(level) ? level : -1;
        setTvPlaybackStatus(level < 0 ? 'Qualité automatique' : `Qualité ${event.target.selectedOptions?.[0]?.textContent || ''}`, 'playing');
      }
      return;
    }
    if (event.target.matches('[data-request-download-mode]')) {
      renderRequestMode(event.target.value === 'manual' ? 'manual' : 'auto');
      return;
    }
    if (event.target.matches('[data-request-server]')) {
      renderDestinationFields(event.target.value);
    }
  });

  document.addEventListener('submit', async event => {
    if (event.target.id === 'noctra-request-confirm') {
      event.preventDefault();
      if (!pendingRequest) return;
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      const fields = new FormData(form);
      submit.disabled = true;
      submit.textContent = 'Ajout en cours…';
      try {
        const result = await api('/api/jellyseerr/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mediaId: pendingRequest.mediaId,
            mediaType: pendingRequest.mediaType,
            title: pendingRequest.title,
            year: pendingRequest.year,
            serverId: Number(fields.get('serverId')),
            profileId: Number(fields.get('profileId')),
            rootFolder: fields.get('rootFolder'),
            selectionMode: fields.get('selectionMode') === 'manual' ? 'manual' : 'auto'
          })
        });
        const requested = { ...pendingRequest };
        clearApiCache('/api/jellyseerr/requests');
        clearApiCache('/api/discovery');
        pendingRequest = null;
        requestDestinations = null;
        closePanel();
        const manualSelection = result.selectionMode === 'manual';
        toast(manualSelection
          ? `« ${requested.title} » a été ajouté sans recherche automatique. Choisis maintenant la release.`
          : `« ${requested.title} » a été envoyé vers le dossier choisi.`);
        const serviceId = result.resolvedServiceId || result.media?.externalServiceId;
        if (manualSelection) {
          if (serviceId) {
            if (requested.mediaType === 'tv') openEpisodePicker(serviceId, requested.title);
            else openReleaseSearch('radarr', serviceId, requested.title);
          } else {
            toast('La demande est enregistrée. Le choix de release sera disponible dès que Radarr/Sonarr aura créé le média.');
          }
        }
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Réessayer';
        toast(error.message);
      }
      return;
    }

    if (event.target.id === 'noctra-seerr-search') {
      event.preventDefault();
      const query = new FormData(event.target).get('query')?.trim();
      if (query) searchJellyseerr(query);
    }

    if (event.target.id === 'noctra-arr-library-search') {
      event.preventDefault();
      const query = new FormData(event.target).get('query')?.trim() || '';
      await loadAutomation(event.target.dataset.arrType, event.target.dataset.arrView, { query, page: 1 });
      return;
    }
    if (event.target.id === 'noctra-arr-lookup') {
      event.preventDefault();
      const query = new FormData(event.target).get('query')?.trim() || '';
      const target = document.querySelector('#noctra-arr-lookup-results');
      if (target) target.innerHTML = '<div class="noctra-loading"><i></i><span>Recherche dans le catalogue…</span></div>';
      try {
        const data = await api(`/api/servarr/lookup?type=${encodeURIComponent(event.target.dataset.arrType)}&q=${encodeURIComponent(query)}`);
        renderArrLookupResults(data.results || [], event.target.dataset.arrType);
      } catch (error) { if (target) target.innerHTML = `<div class="noctra-error">${escapeHtml(error.message)}</div>`; }
      return;
    }

    if (event.target.id === 'noctra-arr-search') {
      event.preventDefault();
      const query = new FormData(event.target).get('query')?.trim() || '';
      searchArrCatalog(event.target.dataset.arrType, query);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && tvSafeExtras.multiOpen) {
      const layer = document.querySelector('[data-tv-safe-multiview]');
      const focusable = [...layer?.querySelectorAll('button:not([disabled]):not([hidden]),select,iframe') || []].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (first && (!layer.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
      return;
    }
    if (event.key !== 'Escape') return;
    if (document.querySelector('#noctra-confirm')?.dataset.open === 'true') { closeConfirm(); return; }
    if (document.querySelector('[data-discovery-torrent-live]')) { closeDiscoveryTorrentLive(); return; }
    if (tvSafeExtras.fullscreenFallback) { void toggleTvSafeMultiviewFullscreen(); return; }
    if (tvSafeExtras.multiOpen) {
      // En fullscreen natif le navigateur traite lui-même Échap. On ne ferme
      // pas derrière le panneau TV dans le même keydown.
      if (!document.fullscreenElement && !document.webkitFullscreenElement) closeTvSafeMultiview();
      return;
    }
    if (tvSafeExtras.menuOpen) { closeTvSafeToolsMenu(); return; }
    const sourcePicker = document.querySelector('.noctra-tv-source-picker[open]');
    if (sourcePicker) { event.preventDefault(); sourcePicker.open = false; sourcePicker.querySelector('summary')?.focus(); return; }
    if (document.querySelector('#noctra-backdrop')?.dataset.open === 'true') closePanel();
  });


  let mobileDetailCompactFrame;
  const mobileDetailSectionObservers = new Map();

  function syncMobileDetailFinishing() {
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const compact = width <= 1024
      && document.body.classList.contains('noctra-detail-mobile')
      && document.body.classList.contains('noctra-detail-ready');

    if (!compact) {
      document.body.style.removeProperty('--noctra-detail-header-offset');
      document.querySelectorAll('.trackSelections.noctra-track-empty').forEach(panel => {
        panel.classList.remove('noctra-track-empty');
      });
      return;
    }

    const header = document.querySelector('.headerTop:not(.hide), .skinHeader:not(.hide)');
    const headerHeight = header ? Math.max(0, Math.ceil(header.getBoundingClientRect().height)) : 0;
    document.body.style.setProperty('--noctra-detail-header-offset', `${headerHeight}px`);

    const page = document.querySelector('.itemDetailPage:not(.hide), .itemDetailsPage:not(.hide)');
    page?.querySelectorAll('.trackSelections').forEach(panel => {
      const panelHiddenByJellyfin = panel.classList.contains('hide')
        || panel.hidden
        || panel.getAttribute('aria-hidden') === 'true';
      const rows = [...panel.querySelectorAll('.trackSelectionFieldContainer, .selectContainer')];
      const visibleRows = rows.filter(row => {
        if (row.classList.contains('hide') || row.hidden || row.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(row);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      const hasUsefulControl = visibleRows.some(row => {
        const select = row.querySelector('select, .emby-select');
        if (!select) return false;
        if (select.classList.contains('hide') || select.hidden || select.disabled && !select.options?.length) return false;
        return Boolean(select.options?.length)
          || String(select.value || '').trim().length > 0
          || String(select.textContent || '').trim().length > 1;
      });
      panel.classList.toggle('noctra-track-empty', panelHiddenByJellyfin || !hasUsefulControl);
    });
  }

  function clearMobileDetailSectionHeights() {
    mobileDetailSectionObservers.forEach(observer => observer.disconnect());
    mobileDetailSectionObservers.clear();
    document.querySelectorAll(
      '.nextUpSection, #childrenCollapsible, #listChildrenCollapsible, .moreFromSeasonSection, #castCollapsible, #guestCastCollapsible, #similarCollapsible'
    ).forEach(section => {
      section.style.removeProperty('height');
      section.style.removeProperty('min-height');
      section.style.removeProperty('max-height');
      section.style.removeProperty('margin-bottom');
      section.style.removeProperty('overflow');
      section.querySelectorAll(
        'div[is="emby-scroller"], .nextUpItems, #childrenContent, .itemsContainer'
      ).forEach(container => {
        container.style.removeProperty('height');
        container.style.removeProperty('min-height');
        container.style.removeProperty('max-height');
      });
    });
  }

  function compactMobileDetailSections() {
    cancelAnimationFrame(mobileDetailCompactFrame);
    mobileDetailCompactFrame = requestAnimationFrame(() => {
      const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
      const page = document.querySelector('.itemDetailPage:not(.hide), .itemDetailsPage:not(.hide)');
      const enabled = width <= 1024
        && Boolean(page)
        && document.body.classList.contains('noctra-detail-ready');
      if (!enabled) {
        clearMobileDetailSectionHeights();
        return;
      }

      page.querySelectorAll(
        '.nextUpSection, #childrenCollapsible, #listChildrenCollapsible, .moreFromSeasonSection, #castCollapsible, #guestCastCollapsible, #similarCollapsible'
      ).forEach(section => {
        if (section.classList.contains('hide') || getComputedStyle(section).display === 'none') return;

        const measureRoot = section.querySelector('div[is="emby-scroller"]')
          || section.querySelector('.nextUpItems')
          || section.querySelector('#childrenContent')
          || section.querySelector('.itemsContainer');
        const items = measureRoot?.matches('.itemsContainer, .nextUpItems')
          ? measureRoot
          : measureRoot?.querySelector('.itemsContainer, .nextUpItems') || measureRoot;
        if (!measureRoot || !items) return;

        const candidates = [...items.children].filter(child => {
          if (!child || child.matches?.('script, style, template')) return false;
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 8
            && rect.height > 8;
        });
        if (!candidates.length) return;

        section.style.minHeight = '0px';
        section.style.height = 'auto';
        section.style.maxHeight = 'none';
        measureRoot.style.minHeight = '0px';
        measureRoot.style.maxHeight = 'none';
        items.style.minHeight = '0px';
        items.style.maxHeight = 'none';

        const rootRect = measureRoot.getBoundingClientRect();
        const bottom = Math.max(...candidates.map(item => item.getBoundingClientRect().bottom));
        const measuredHeight = Math.max(1, Math.ceil(bottom - rootRect.top + 2));
        if (Math.abs((parseFloat(measureRoot.style.height) || 0) - measuredHeight) > 1) {
          measureRoot.style.height = `${measuredHeight}px`;
        }
        if (items !== measureRoot) items.style.height = 'auto';

        // V47 : Jellyfin conserve parfois une hauteur globale prévue pour
        // plusieurs éléments dans À suivre, même lorsque la liste n'en contient
        // qu'un. On borne donc la section complète au dernier élément réellement
        // visible, titre inclus, afin que Saisons remonte immédiatement dessous.
        if (section.classList.contains('nextUpSection')) {
          const sectionRect = section.getBoundingClientRect();
          const visibleGeometry = [
            section.querySelector('.sectionTitle:not(.hide)'),
            ...candidates
          ].filter(Boolean).filter(node => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && rect.width > 8
              && rect.height > 8;
          });
          if (visibleGeometry.length) {
            const sectionBottom = Math.max(...visibleGeometry.map(node => node.getBoundingClientRect().bottom));
            const sectionHeight = Math.max(1, Math.ceil(sectionBottom - sectionRect.top + 10));
            section.style.height = `${sectionHeight}px`;
            section.style.minHeight = '0px';
            section.style.maxHeight = `${sectionHeight}px`;
            section.style.marginBottom = '12px';
            section.style.overflow = 'visible';
          }
        }

        if (!mobileDetailSectionObservers.has(items) && 'ResizeObserver' in window) {
          const observer = new ResizeObserver(() => compactMobileDetailSections());
          observer.observe(items);
          candidates.forEach(item => observer.observe(item));
          mobileDetailSectionObservers.set(items, observer);
        }
      });
    });
  }

  let routeFrame;
  let playerVisibilityObserver = null;
  let observedPlayerVisibility = null;

  function observePlayerVisibility(player) {
    if (player === observedPlayerVisibility) return;
    playerVisibilityObserver?.disconnect();
    observedPlayerVisibility = player || null;
    playerVisibilityObserver = player ? new MutationObserver(() => syncRouteState()) : null;
    playerVisibilityObserver?.observe(player, {
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style'],
      childList: true,
      subtree: true
    });
  }

  let playerIconFontPromise = null;

  function ensurePlayerIconFont() {
    if (!document.fonts?.load) return Promise.resolve();
    if (!playerIconFontPromise) {
      playerIconFontPromise = Promise.all([
        document.fonts.load('400 24px "Material Icons"', '\ue034'),
        document.fonts.load('400 24px "Material Icons"', '\ue5d0')
      ]).catch(() => {
        playerIconFontPromise = null;
      });
    }
    return playerIconFontPromise;
  }

  let nativePlayerControlsTimer = 0;
  let nativePlayerControlsLastMove = 0;
  const stabilizedJellyfinVideos = new WeakSet();

  function jellyfinVodBufferedAhead(video) {
    if (!video || !Number.isFinite(Number(video.currentTime))) return 0;
    try {
      for (let index = 0; index < video.buffered.length; index += 1) {
        const start = Number(video.buffered.start(index));
        const end = Number(video.buffered.end(index));
        if (video.currentTime >= start - .12 && video.currentTime <= end + .12) return Math.max(0, end - video.currentTime);
      }
    } catch {}
    return 0;
  }

  function stabilizeJellyfinVodPlayback(player) {
    const video = player?.querySelector('video.htmlvideoplayer, video');
    if (!video || stabilizedJellyfinVideos.has(video)) return;
    stabilizedJellyfinVideos.add(video);
    video.preload = 'auto';
  }

  function revealNativePlayerControls(event) {
    const target = event.target instanceof Element ? event.target : null;
    const player = target?.closest('.videoPlayerContainer:not(.hide)');
    if (!player) return;
    const now = performance.now();
    if (event.type === 'pointermove' && now - nativePlayerControlsLastMove < 160) return;
    nativePlayerControlsLastMove = now;
    document.body.classList.add('noctra-player-controls-visible');
    window.clearTimeout(nativePlayerControlsTimer);
    nativePlayerControlsTimer = window.setTimeout(() => {
      document.body.classList.remove('noctra-player-controls-visible');
    }, 3_200);
  }

  function restoreAuthenticatedMobileHeader(playing = false) {
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    if (width > 760 || !authContext || playing) return;
    const header = document.querySelector('.skinHeader');
    const headerTop = header?.querySelector('.headerTop') || document.querySelector('.headerTop');
    [header, headerTop].filter(Boolean).forEach(node => {
      node.classList.remove('hide');
      node.hidden = false;
      node.removeAttribute('aria-hidden');
      node.style.removeProperty('display');
      node.style.removeProperty('visibility');
      node.style.removeProperty('opacity');
    });
  }

  function syncRouteState() {
    cancelAnimationFrame(routeFrame);
    routeFrame = requestAnimationFrame(() => {
      const rawRoute = location.hash;
      const route = rawRoute.toLowerCase();
      const mountedPlayer = document.querySelector('.videoPlayerContainer');
      const videoRoute = /^#\/video(?:[?&]|$)/.test(route);
      observePlayerVisibility(mountedPlayer);
      const mountedPlayerStyle = mountedPlayer ? getComputedStyle(mountedPlayer) : null;
      const mountedVideo = mountedPlayer?.querySelector('video.htmlvideoplayer, video') || null;
      const playerSuppressed = Boolean(mountedPlayer && (
        mountedPlayer.hidden
        || mountedPlayer.classList.contains('hide')
        || mountedPlayerStyle?.display === 'none'
        || mountedPlayerStyle?.visibility === 'hidden'
      ));
      const playerHasMedia = Boolean(mountedVideo
        && !mountedVideo.ended
        && (mountedVideo.currentSrc || mountedVideo.getAttribute('src') || mountedVideo.readyState > 0));
      const playerVisible = Boolean(mountedPlayer
        && (playerHasMedia || (!playerSuppressed && (mountedPlayer.getClientRects().length || videoRoute))));
      const player = (playerVisible || videoRoute) ? mountedPlayer : null;
      const playing = route.includes('nowplaying') || videoRoute || playerVisible;
      const playerActive = Boolean(mountedPlayer && mountedVideo && playerHasMedia && !playerSuppressed);
      if (playing) {
        void ensurePlayerIconFont();
        stabilizeJellyfinVodPlayback(player);
        observeNativePlayerIcons(player);
      }
      else {
        window.clearTimeout(nativePlayerControlsTimer);
        document.body.classList.remove('noctra-player-controls-visible');
        nativePlayerIconObserver?.disconnect();
        nativePlayerIconObserver = null;
        nativePlayerIconRoots = [];
        cancelAnimationFrame(nativePlayerIconFrame);
        nativePlayerIconFrame = 0;
      }
      const activeDetailPage = document.querySelector('.itemDetailPage:not(.hide), .itemDetailsPage:not(.hide)');
      const detail = /details|itemdetail/.test(route) || Boolean(activeDetailPage);
      const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
      const compactDetail = detail && viewportWidth <= 1024;
      const detailReady = Boolean(activeDetailPage && (
        String(activeDetailPage.querySelector('.itemName:not(.originalTitle), h1.itemName')?.textContent || '').trim()
        || String(activeDetailPage.querySelector('.overview')?.textContent || '').trim().length > 20
        || activeDetailPage.querySelector('.mainDetailButtons .detailButton, .mainDetailButtons button')
      ));
      const home = !route || route === '#/' || /^#\/home(?:\.html)?(?:[?&]|$)/.test(route);
      const dashboard = route.includes('/dashboard');
      const hasBack = playing && !document.body.classList.contains('noctra-panel-open');
      document.title = 'Noctra';
      document.body.classList.add('noctra-ready');
      const playbackLayoutChanged = document.body.classList.contains('noctra-playing') !== playing;
      document.body.classList.toggle('noctra-playing', playing);
      if (playbackLayoutChanged) { syncMobileViewport(); window.setTimeout(syncMobileViewport, 300); window.setTimeout(syncMobileViewport, 1000); }
      document.body.classList.toggle('noctra-video-route', videoRoute || playerVisible);
      document.body.classList.toggle('noctra-player-active', playerActive);
      restoreAuthenticatedMobileHeader(playing);
      // Sur téléphone/tablette, les anciennes règles .noctra-detail ne sont
      // jamais appliquées pendant le chargement. Jellyfin garde ainsi la main
      // sur la création de la fiche et Noctra ne met en forme qu'une fiche
      // réellement peuplée.
      document.body.classList.toggle('noctra-detail', detail && !compactDetail);
      document.body.classList.toggle('noctra-detail-mobile', compactDetail);
      document.body.classList.toggle('noctra-detail-ready', compactDetail && detailReady);
      syncMobileDetailFinishing();
      if (compactDetail && detailReady) {
        window.setTimeout(compactMobileDetailSections, 0);
        window.setTimeout(compactMobileDetailSections, 240);
        window.setTimeout(compactMobileDetailSections, 900);
        window.setTimeout(syncMobileDetailFinishing, 0);
        window.setTimeout(syncMobileDetailFinishing, 240);
        window.setTimeout(syncMobileDetailFinishing, 900);
      } else {
        clearMobileDetailSectionHeights();
      }
      document.body.classList.toggle('noctra-home', home);
      document.body.classList.toggle('noctra-dashboard', dashboard);
      document.body.classList.toggle('noctra-has-back', hasBack);
      syncMobileAdminLayout();
      const dock = document.querySelector('#noctra-dock');
      const brand = dock?.querySelector('.noctra-brand');
      if (dock) {
        const persistent = !playing;
        dock.dataset.persistent = String(persistent);
        if (lastDockPlayingState !== playing) {
          if (playing) {
            delete dock.dataset.expanded;
            brand?.setAttribute('aria-expanded', 'false');
          } else {
            dock.dataset.expanded = 'true';
            brand?.setAttribute('aria-expanded', 'true');
          }
          lastDockPlayingState = playing;
        }
        if (brand) {
          brand.setAttribute('aria-label', 'Navigation Noctra');
        }
      }
      const back = document.querySelector('#noctra-back');
      if (back) back.dataset.visible = String(hasBack);
      if (home && !playing) scheduleHomeEnhancement();
      else premiereHomeController?.destroy();
      repairAuthenticatedViewState();
      repairMaterialIconFallbacks();
      if (detail && !compactDetail) bindDetailBanner();
      else unbindDetailBanner();
      if (compactDetail && !detailReady) {
        window.clearTimeout(syncRouteState.detailRetryTimer);
        syncRouteState.detailRetryTimer = window.setTimeout(syncRouteState, 180);
      }
      const layoutRelevant = home || /(?:movies|tv|collections|favorites)/.test(route);
      if (layoutRelevant) balanceLibraryGrids();
      if (viewportWidth <= 1024 && layoutRelevant) repairMobileLibraryLayout();
      const libraryRoute = canonicalLibraryHash(rawRoute);
      if (libraryRoute && libraryRecovery.route !== libraryRoute) {
        scheduleLibraryRecovery(libraryRoute, true);
      } else if (!libraryRoute && !libraryBridgeTarget && libraryRecovery.route) {
        clearLibraryRecovery();
      }
      syncAuthContext();
      if (viewportWidth <= 760) syncMobileDrawerState();
    });
  }

  let mutationSyncTimer = 0;
  const routeMutationSelector = [
    '.mainAnimatedPage',
    '.pageContainer',
    '[data-role="page"]',
    '.videoPlayerContainer',
    '.itemDetailPage',
    '.itemDetailsPage',
    '.skinHeader',
    '.headerTop'
  ].join(',');
  const detailMutationSelector = '.itemName, .overview, .mainDetailButtons, .detailPageContent';
  const homeMutationSelector = '.homePage .homeSectionsContainer, .homePage .verticalSection, .homePage .sectionTitle, .homePage .emby-scrollbuttons';
  const headerMenuSelector = '.actionSheet.actionsheet-not-fullscreen, #app-sync-play-menu, #app-sync-play-menu .MuiPaper-root';

  function mutationElement(node) {
    return node instanceof Element ? node : node?.parentElement || null;
  }

  function mutationAddsStructure(mutations, selector) {
    return mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
      const element = mutationElement(node);
      return Boolean(element && (element.matches(selector) || element.querySelector(selector)));
    }));
  }

  function mutationTargetsSelector(mutations, selector) {
    return mutations.some(mutation => mutationElement(mutation.target)?.closest(selector));
  }

  function mutationRootsForSelector(mutations, selector) {
    const roots = new Set();
    mutations.forEach(mutation => [...mutation.addedNodes].forEach(node => {
      const element = mutationElement(node);
      if (!element?.isConnected) return;
      if (element.matches?.(selector)) roots.add(element.parentElement?.parentElement || element.parentElement || element);
      else if (element.querySelector?.(selector)) roots.add(element);
    }));
    return [...roots];
  }

  const observer = new MutationObserver(mutations => {
    mutations = mutations.filter(mutation => !mutationElement(mutation.target)?.closest('#noctra-backdrop, #noctra-toast, #noctra-confirm, #noctra-dock, .noctra-media-detail-layer'));
    if (!mutations.length) return;
    if (document.body.classList.contains('noctra-panel-open') && mutations.every(mutation => mutationElement(mutation.target)?.closest('#reactRoot'))) return;
    const headerSelector = '.skinHeader, .headerTop, .headerRight, button.headerButton, .headerSyncButton, .headerCastButton';
    const scrollSelector = '.emby-scrollbuttons, .emby-scrollbuttons-button, .scrollbutton';
    const materialSelector = '.material-icons, .material-icons-round, .material-icons-outlined, .material-symbols-rounded, .material-symbols-outlined, .material-symbols-sharp';
    const headerRoots = mutationRootsForSelector(mutations, headerSelector);
    const scrollRoots = mutationRootsForSelector(mutations, scrollSelector);
    const menuRoots = mutationRootsForSelector(mutations, headerMenuSelector);
    const materialRoots = mutationRootsForSelector(mutations, materialSelector);
    headerRoots.forEach(root => repairHeaderIconButtons(root));
    scrollRoots.forEach(root => repairScrollArrowButtons(root));
    menuRoots.forEach(root => repairHeaderMenuIcons(root));
    materialRoots.forEach(root => repairMaterialIconFallbacks(root));
    const menuChanged = headerActionMenuIntentUntil > Date.now()
      || menuRoots.length > 0
      || mutationTargetsSelector(mutations, headerMenuSelector);
    if (menuChanged) {
      syncHeaderActionMenus();
    }
    // Pendant qu'un panneau Noctra plein écran est ouvert, les mutations du
    // ReactRoot Jellyfin placé derrière n'ont aucune raison de relancer les scans
    // de route/layout. On les reprendra à la fermeture du panneau.
    if (document.body.classList.contains('noctra-panel-open')) return;
    // Les cartes, progressions et libellés Jellyfin évoluent en permanence. Ils
    // ne nécessitent pas de rescanner toute la page : seuls un changement de page,
    // de lecteur ou le peuplement d'une fiche média relancent la synchronisation.
    const structural = mutationAddsStructure(mutations, routeMutationSelector);
    if (structural || mutationAddsStructure(mutations, '#loginPage')) repairAuthenticatedViewState();
    const detailContent = document.body.classList.contains('noctra-detail-mobile')
      && mutationTargetsSelector(mutations, detailMutationSelector);
    const homeContent = document.body.classList.contains('noctra-home')
      && (mutationAddsStructure(mutations, homeMutationSelector) || mutationTargetsSelector(mutations, '.homePage .homeSectionsContainer'));
    if (homeContent) scheduleHomeEnhancement();
    if (!structural && !detailContent) return;
    window.clearTimeout(mutationSyncTimer);
    mutationSyncTimer = window.setTimeout(() => {
      mutationSyncTimer = 0;
      syncRouteState();
    }, 72);
  });
  const installTvSafeExtrasObserver = () => {
    const backdrop = document.querySelector('#noctra-backdrop');
    if (!backdrop || tvSafeExtrasObserver) return;
    tvSafeExtrasObserver = new MutationObserver(() => {
      const panelNode = tvSafeExtrasPanel();
      if (!panelNode) {
        // Ne détruit les extras que lorsque la TV est réellement fermée. Pendant
        // un remplacement DOM transitoire, conserver theater/multiview évite que
        // le premier clic suivant fasse brutalement revenir le lecteur en petit.
        if (backdrop.dataset.open !== 'true' || backdrop.dataset.panelKind !== 'tv') destroyTvSafeExtras();
        return;
      }
      if (tvSafeExtras.theater && panelNode.getAttribute('data-tv-safe-theater') !== 'true') {
        panelNode.setAttribute('data-tv-safe-theater', 'true');
      }
      // Les changements de texte d'état du lecteur ne doivent plus remonter le
      // launcher en boucle. On ne remonte les extras que si leur ancre a disparu.
      const screen = panelNode.querySelector('.noctra-tv-screen');
      if (screen && (!screen.querySelector('[data-tv-safe-tools-launcher]') || !screen.querySelector('[data-tv-safe-status-hud]'))) {
        scheduleTvSafeExtrasMount();
      }
    });
    tvSafeExtrasObserver.observe(backdrop, { childList: true, subtree: true });
    if (tvSafeExtrasPanel()) scheduleTvSafeExtrasMount();
  };

  const titleObserver = new MutationObserver(() => {
    if (document.title !== 'Noctra') document.title = 'Noctra';
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pwaInstallPrompt = event;
    const installButton = document.querySelector('#noctra-install-app');
    if (installButton) installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    pwaInstallPrompt = null;
    const installButton = document.querySelector('#noctra-install-app');
    if (installButton) installButton.hidden = true;
    toast('Noctra Media Client est maintenant installé.');
  });

  let mobileAdminLayoutTimer = 0;

  function mobileAdminSafeTop() {
    /* Jellyfin 10.11 peut être servi dans une WebView/PWA dont le viewport n'a
       pas conservé viewport-fit=cover. Sans cela, env(safe-area-inset-top) vaut
       parfois 0 sur iPhone et l'AppBar se retrouve sous l'heure / le réseau. */
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head?.append(viewport);
    }
    const viewportValue = String(viewport?.content || 'width=device-width,initial-scale=1');
    if (viewport && !/viewport-fit\s*=\s*cover/i.test(viewportValue)) {
      viewport.content = `${viewportValue.replace(/\s*,?\s*$/, '')},viewport-fit=cover`;
    }

    let cssSafe = 0;
    try {
      const probe = document.createElement('i');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;inset:auto;padding-top:env(safe-area-inset-top);width:0;height:0;';
      document.documentElement.append(probe);
      cssSafe = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
    } catch {}

    const vvTop = Math.max(0, Math.round(window.visualViewport?.offsetTop || 0));
    const appleTouch = /iPhone|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1 && window.innerWidth <= 760);
    /* Sur certains iPhone installés en PWA, WebKit renvoie encore 0 pour les
       deux mesures pendant les premières frames. 44 px correspond au minimum
       utile de la zone statut d'un iPhone à encoche/Dynamic Island et n'est
       appliqué qu'à ce cas précis. */
    const fallback = appleTouch && cssSafe < 1 && vvTop < 1 ? 44 : 0;
    return Math.max(cssSafe, vvTop, fallback);
  }

  function syncMobileAdminLayout() {
    window.clearTimeout(mobileAdminLayoutTimer);
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const dashboard = document.body.classList.contains('noctra-dashboard');
    if (width > 760 || !dashboard) {
      document.body.removeAttribute('data-noctra-admin-page');
      document.documentElement.style.removeProperty('--noctra-admin-header-bottom');
      document.documentElement.style.removeProperty('--noctra-admin-safe-top');
      return;
    }

    const safeTop = mobileAdminSafeTop();
    document.documentElement.style.setProperty('--noctra-admin-safe-top', `${safeTop}px`);

    const visible = node => {
      if (!(node instanceof Element) || node.classList.contains('hide')) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2;
    };
    const activePage = [
      ...document.querySelectorAll('#userProfilesPage, #dashboardPage, .mainAnimatedPage[data-role="page"], div[data-role="page"].mainAnimatedPage')
    ].filter(visible).at(-1);
    const adminRoute = `${location.pathname || ''}${location.hash || ''}`.toLowerCase();
    const pageKind = activePage?.id === 'userProfilesPage' || /\/dashboard\/users(?:[/?#]|$)/.test(adminRoute)
      ? 'users'
      : activePage?.id === 'dashboardPage' || /\/dashboard(?:[/?#]|$)/.test(adminRoute) && !/\/dashboard\//.test(adminRoute.replace(/\/dashboard\/?$/, '/dashboard'))
        ? 'dashboard'
        : 'admin';
    document.body.dataset.noctraAdminPage = pageKind;

    /* Jellyfin 10.11 utilise désormais un AppBar React/MUI sur plusieurs pages
       admin alors que certaines pages historiques utilisent encore skinHeader.
       Mesurer le vrai bord inférieur évite tout padding fixe qui devient faux
       avec Dynamic Island, mode standalone ou changement d'orientation. */
    const headerCandidates = [
      ...document.querySelectorAll('header.MuiAppBar-root, .MuiAppBar-root, .skinHeader, .headerTop')
    ].filter(node => {
      if (!visible(node)) return false;
      const rect = node.getBoundingClientRect();
      const position = getComputedStyle(node).position;
      return rect.top < 32 && rect.bottom > 32 && /(fixed|sticky|absolute)/.test(position);
    });
    const measuredBottom = headerCandidates.reduce((max, node) => {
      const rect = node.getBoundingClientRect();
      return Math.max(max, Math.ceil(rect.bottom));
    }, 0);
    const headerBottom = Math.max(
      safeTop + 54,
      Math.min(safeTop + 92, measuredBottom || safeTop + 56)
    );
    document.documentElement.style.setProperty('--noctra-admin-header-bottom', `${headerBottom}px`);

    /* React monte parfois le contenu quelques frames après le changement de
       route. Un second passage après le layout final stabilise la mesure sans
       observer en boucle ni écrire des styles directement dans Jellyfin. */
    mobileAdminLayoutTimer = window.setTimeout(() => {
      const lateHeader = [...document.querySelectorAll('header.MuiAppBar-root, .MuiAppBar-root, .skinHeader, .headerTop')]
        .filter(node => {
          if (!visible(node)) return false;
          const rect = node.getBoundingClientRect();
          return rect.top < 32 && rect.bottom > 32;
        })
        .reduce((max, node) => Math.max(max, Math.ceil(node.getBoundingClientRect().bottom)), 0);
      if (lateHeader) {
        document.documentElement.style.setProperty('--noctra-admin-header-bottom', `${Math.max(safeTop + 54, Math.min(safeTop + 92, lateHeader))}px`);
      }
    }, 180);
  }

  function syncMobileViewport() {
    const viewport = window.visualViewport;
    if (viewport && Math.abs((viewport.scale || 1) - 1) > .05) return;
    const editing = document.activeElement?.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]');
    const keyboard = Boolean(editing && window.innerHeight - (viewport?.height || window.innerHeight) > 120);
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
    // Do not persist transient WebKit fullscreen viewport dimensions in pixels.
    // Installed apps have no browser toolbar: their shell uses the full viewport.
    const height = keyboard ? Math.round(viewport.height) + 'px' : standalone ? '100lvh' : '100dvh';
    const top = keyboard ? Math.max(0, Math.round(viewport.offsetTop || 0)) + 'px' : '0px';
    const root = document.documentElement;
    for (const [name, value] of [['--noctra-app-height', height], ['--noctra-app-top', top]]) {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    }
    document.body.classList.toggle('noctra-keyboard-open', keyboard);
  }

  function usesCompactLayout() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    return width <= 1180 || (width <= 1366 && (window.matchMedia?.('(pointer: coarse)')?.matches || Number(navigator.maxTouchPoints) > 1));
  }

  function syncViewportProfile() {
    syncMobileViewport();
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const height = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 1);
    const ratio = width / height;
    const ultrawide = width >= 1800 && ratio >= 2.4;
    const mobile = width <= 760;
    const tablet = width > 760 && usesCompactLayout();
    const performanceDesktop = width >= 1025;
    document.documentElement.classList.toggle('noctra-ultrawide', ultrawide);
    // V92 : on se rapproche du comportement mobile en laissant le navigateur
    // gérer l'inertie/scroll. L'ancien moteur JS de roue ajoutait une animation
    // supplémentaire et pouvait accentuer les ralentissements sur les pages riches.
    document.documentElement.classList.toggle('noctra-native-wheel', false);
    document.documentElement.classList.toggle('noctra-performance-desktop', performanceDesktop);
    document.documentElement.classList.toggle('noctra-mobile-viewport', mobile);
    document.documentElement.classList.toggle('noctra-tablet-viewport', tablet);
    document.documentElement.style.setProperty('--noctra-viewport-ratio', ratio.toFixed(3));
    document.documentElement.style.setProperty('--noctra-viewport-height', `${height}px`);
    syncMobileAdminLayout();
  }

  function smoothWheelStep(current, target, velocity, elapsedMs) {
    const dt = Math.max(0, Math.min(64, elapsedMs)) / 1000;
    const omega = 22;
    const displacement = current - target;
    const impulse = velocity + omega * displacement;
    const decay = Math.exp(-omega * dt);
    return {
      current: target + (displacement + impulse * dt) * decay,
      velocity: (velocity - omega * impulse * dt) * decay
    };
  }

  function installDesktopSmoothWheel() {
    if (window.__noctraDesktopSmoothWheelInstalled) return;
    if (document.documentElement.classList.contains('noctra-native-wheel')) {
      window.__noctraDesktopSmoothWheelInstalled = true;
      document.documentElement.classList.remove('noctra-smooth-wheel');
      return;
    }
    window.__noctraDesktopSmoothWheelInstalled = true;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const desktopPointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    const excludedSelector = [
      '.mainDrawer',
      '.touch-menu-la',
      '#noctra-panel',
      '.noctra-panel-body',
      '.dialogContainer',
      '.dialog',
      '.videoPlayerContainer',
      '.nowPlayingPage',
      '.paperList',
      '.listItem-border',
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]'
    ].join(',');

    let state = null;
    let frame = 0;
    let lastFrameAt = 0;
    let lastWritten = null;
    let writingScroll = false;

    const enabled = () => (
      desktopPointer?.matches === true
      && reducedMotion?.matches !== true
      && !document.documentElement.classList.contains('noctra-native-wheel')
      && !document.body.classList.contains('noctra-playing')
      && !document.body.classList.contains('noctra-drawer-open')
    );

    const isRoot = element => (
      element === document.scrollingElement
      || element === document.documentElement
      || element === document.body
    );

    const isVisible = element => {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < window.innerHeight;
    };

    const readScrollTop = element => isRoot(element)
      ? (document.scrollingElement?.scrollTop || window.scrollY || 0)
      : element.scrollTop;
    const viewportHeight = element => isRoot(element) ? window.innerHeight : element.clientHeight;
    const maxScrollTop = element => isRoot(element)
      ? Math.max(0, (document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight) - window.innerHeight)
      : Math.max(0, element.scrollHeight - element.clientHeight);

    const writeScrollTop = (element, value) => {
      writingScroll = true;
      lastWritten = value;
      if (isRoot(element)) {
        const root = document.scrollingElement || document.documentElement;
        root.scrollTop = value;
      } else {
        element.scrollTop = value;
      }
      writingScroll = false;
    };

    const overflowAllowsVerticalScroll = element => {
      if (isRoot(element)) return true;
      if (!(element instanceof Element) || !isVisible(element)) return false;
      const overflowY = getComputedStyle(element).overflowY;
      return /(auto|scroll|overlay)/.test(overflowY)
        || element.classList.contains('scrollY')
        || element.classList.contains('smoothScrollY');
    };

    const canConsume = (element, delta) => {
      if (!overflowAllowsVerticalScroll(element)) return false;
      const maximum = maxScrollTop(element);
      if (maximum <= 3 || viewportHeight(element) <= 48) return false;
      const current = readScrollTop(element);
      return delta < 0 ? current > .5 : current < maximum - .5;
    };

    const activePage = () => [...document.querySelectorAll(
      '.mainAnimatedPage:not(.hide), .pageContainer:not(.hide), div[data-role="page"]:not(.hide)'
    )].filter(isVisible).at(-1) || null;

    const resolveScroller = (target, delta = 1) => {
      if (target instanceof Element && target.closest(excludedSelector)) return null;

      /* Priorité absolue au premier véritable ancêtre vertical. Cela évite de
         capturer la molette sur .mainAnimatedPage alors que Jellyfin fait en
         réalité défiler son descendant .scrollY. */
      for (let element = target instanceof Element ? target : null;
        element && element !== document.documentElement;
        element = element.parentElement) {
        if (element.matches?.(excludedSelector)) return null;
        if (canConsume(element, delta)) return element;
      }

      const page = activePage();
      if (page) {
        const candidates = [
          ...(page.matches('.scrollY, .smoothScrollY') ? [page] : []),
          ...page.querySelectorAll('.scrollY, .smoothScrollY, [data-scroll="y"]')
        ].filter(element => canConsume(element, delta));

        if (candidates.length) {
          candidates.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            const aScore = Math.min(maxScrollTop(a), 8000) + Math.min(aRect.height, 1600) * 2;
            const bScore = Math.min(maxScrollTop(b), 8000) + Math.min(bRect.height, 1600) * 2;
            return bScore - aScore;
          });
          return candidates[0];
        }
      }

      const root = document.scrollingElement || document.documentElement;
      return canConsume(root, delta) ? root : null;
    };

    const cancel = () => {
      state?.element?.removeAttribute?.('data-noctra-wheel-active');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastFrameAt = 0;
      lastWritten = null;
      state = null;
    };

    const animate = now => {
      frame = 0;
      if (!state || !enabled() || (!isRoot(state.element) && !document.contains(state.element))) {
        cancel();
        return;
      }

      const actual = readScrollTop(state.element);
      if (!writingScroll && lastWritten !== null && Math.abs(actual - lastWritten) > 3) {
        state.current = actual;
        state.target = actual;
        state.velocity = 0;
      }

      const dt = lastFrameAt ? Math.min(34, Math.max(.25, now - lastFrameAt)) : 16;
      lastFrameAt = now;
      const distance = state.target - state.current;

      const step = smoothWheelStep(state.current, state.target, state.velocity || 0, dt);
      state.current = Math.max(0, Math.min(maxScrollTop(state.element), step.current));
      state.velocity = step.velocity;
      if (Math.abs(distance) < .3 && Math.abs(state.velocity) < 3 && now - state.lastWheelAt > 48) {
        writeScrollTop(state.element, state.target);
        cancel();
        return;
      }

      writeScrollTop(state.element, state.current);
      frame = requestAnimationFrame(animate);
    };

    const normalizeDelta = (event, element) => {
      let delta = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 36;
      else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= viewportHeight(element) * .88;

      // Preserve pixel precision; do not amplify small trackpad movements.
      return Math.max(-760, Math.min(760, delta));
    };

    const onWheel = event => {
      if (!enabled() || event.defaultPrevented || !event.cancelable) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (event.target instanceof Element && event.target.closest(excludedSelector)) return;

      const rawDirection = Math.sign(event.deltaY || 0);
      if (!rawDirection) return;
      const element = resolveScroller(event.target, rawDirection);
      if (!element) return; // Repli natif : surtout, ne pas avaler la molette.

      const current = readScrollTop(element);
      const maximum = maxScrollTop(element);
      const delta = normalizeDelta(event, element);
      if (!delta || maximum <= 0) return;
      if ((current <= .5 && delta < 0) || (current >= maximum - .5 && delta > 0)) return;

      event.preventDefault();
      event.stopPropagation(); // Only one handler owns a consumed vertical wheel event.
      const now = performance.now();

      if (!state || state.element !== element) {
        cancel();
        state = { element, current, target: current, velocity: 0, lastWheelAt: now };
        element.setAttribute('data-noctra-wheel-active', 'true');
      } else if (lastWritten === null || Math.abs(current - state.current) > 4) {
        state.current = current;
      }

      if (Math.sign(delta) !== Math.sign(state.target - state.current)) {
        state.target = current;
        state.velocity = 0;
      }
      const viewport = Math.max(1, viewportHeight(element));
      const maximumLead = Math.max(280, viewport * .8);
      const responseGain = Math.abs(delta) < 40 ? .98 : .9;
      state.target = Math.max(0, Math.min(maximum, state.target + delta * responseGain));
      state.target = Math.max(current - maximumLead, Math.min(current + maximumLead, state.target));
      state.lastWheelAt = now;

      if (!frame) frame = requestAnimationFrame(animate);
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('blur', cancel, { passive: true });
    window.addEventListener('resize', cancel, { passive: true });
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button === 0) cancel();
    }, { passive: true, capture: true });
    document.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancel();
    }, { passive: true, capture: true });

    window.__noctraSmoothWheel = {
      enabled,
      resolveScroller: () => resolveScroller(
        document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2),
        1
      ),
      cancel
    };
    document.documentElement.classList.add('noctra-smooth-wheel');
  }

  let drawerStateObserver = null;
  let observedDrawerNodes = [];

  function syncMobileDrawerState() {
    const mobile = (window.innerWidth || document.documentElement.clientWidth || 0) <= 760;
    const drawers = [...document.querySelectorAll('.mainDrawer, .touch-menu-la')];
    const masks = [...document.querySelectorAll('.tmla-mask, .drawerBackdrop, .mainDrawer-mask')];
    const classOrAriaOpen = drawers.some(drawer => (
      drawer.classList.contains('drawer-open')
      || drawer.classList.contains('open')
      || drawer.classList.contains('drawerOpened')
      || drawer.getAttribute('aria-hidden') === 'false'
    ));
    const visibleMask = masks.some(mask => {
      if (mask.classList.contains('hide') || mask.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(mask);
      const rect = mask.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > .02
        && rect.width > 2
        && rect.height > 2;
    });
    const open = mobile && (classOrAriaOpen || visibleMask);
    document.body.classList.toggle('noctra-drawer-open', open);

    const nodes = [...drawers, ...masks];
    const changed = nodes.length !== observedDrawerNodes.length
      || nodes.some((node, index) => node !== observedDrawerNodes[index]);
    if (changed) {
      drawerStateObserver?.disconnect();
      drawerStateObserver = new MutationObserver(() => requestAnimationFrame(syncMobileDrawerState));
      nodes.forEach(node => drawerStateObserver.observe(node, {
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-hidden']
      }));
      observedDrawerNodes = nodes;
    }
  }

  async function registerNoctraServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const serviceWorkerUrl = appPath('/noctra-sw.js?v=182');
      const scope = `${noctraBasePath || ''}/` || '/';
      await navigator.serviceWorker.register(serviceWorkerUrl, { scope });
    } catch (error) {
      console.warn('Noctra PWA : service worker indisponible.', error);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    syncViewportProfile();
    void ensurePlayerIconFont();
    mount();
    repairHeaderIconButtons();
    repairScrollArrowButtons();
    repairHeaderMenuIcons();
    repairMaterialIconFallbacks();
    repairAuthenticatedViewState();
    installTvSafeExtrasObserver();
    syncMobileDrawerState();
    installDesktopSmoothWheel();
    registerNoctraServiceWorker();
    syncRouteState();
    syncAuthContext(true);
    verifyNoctraBuild();
    // Desktop dialogs are portals mounted beside #reactRoot. Observe their
    // common parent too; the callback filters Noctra-owned workspaces and only
    // repairs added icon/menu roots, without a repeated full-document scan.
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    const title = document.querySelector('title');
    if (title) titleObserver.observe(title, { childList: true });
  });
  window.addEventListener('pageshow', () => { syncAuthContext(true); verifyNoctraBuild(); repairHeaderIconButtons(); repairScrollArrowButtons(); repairHeaderMenuIcons(); repairMaterialIconFallbacks(); repairAuthenticatedViewState(); }, { passive: true });
  window.addEventListener('focus', () => syncAuthContext(true), { passive: true });
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('noctra-page-hidden', document.visibilityState !== 'visible');
    if (document.visibilityState === 'visible') syncAuthContext(true);
  }, { passive: true });
  document.addEventListener('pointermove', revealNativePlayerControls, { passive: true, capture: true });
  document.addEventListener('pointerdown', revealNativePlayerControls, { passive: true, capture: true });
  document.addEventListener('touchstart', revealNativePlayerControls, { passive: true, capture: true });
  ['loadstart', 'loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'error'].forEach(type => {
    document.addEventListener(type, event => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement) || !target.closest('.videoPlayerContainer')) return;
      syncRouteState();
    }, { passive: true, capture: true });
  });

  let viewportResizeFrame = 0;
  window.addEventListener('resize', () => {
    if (viewportResizeFrame) return;
    viewportResizeFrame = window.requestAnimationFrame(() => {
      viewportResizeFrame = 0;
      syncViewportProfile();
      const tvList = document.querySelector('.noctra-tv-channel-list');
      if (tvList && (tvList.dataset.virtual === 'true') !== (desktopPerformanceProfile() && !usesCompactLayout() && filteredTvChannels().length > 70)) renderTvChannelList();
      balanceLibraryGrids();
      repairMobileLibraryLayout();
      syncMobileDrawerState();
      syncMobileDetailFinishing();
      syncMobileAdminLayout();
      syncHeaderActionMenus();
      syncRouteState();
    });
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    syncMobileAdminLayout();
    syncRouteState();
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { syncMobileViewport(); syncMobileAdminLayout(); }, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncMobileViewport, { passive: true });
  for (const event of ['fullscreenchange', 'webkitfullscreenchange', 'webkitendfullscreen', 'visibilitychange']) document.addEventListener(event, syncMobileViewport, true);
  window.addEventListener('pageshow', syncMobileViewport);
  document.addEventListener('focusin', syncMobileViewport, { passive: true });
  document.addEventListener('focusout', () => requestAnimationFrame(syncMobileViewport), { passive: true });

  document.addEventListener('keydown', event => {
    const favorite = event.target.closest?.('[data-tv-favorite-toggle]');
    if (!favorite || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    favorite.click();
  });

  document.addEventListener('load', event => {
    if (event.target instanceof HTMLImageElement && document.body.classList.contains('noctra-detail-mobile')) {
      compactMobileDetailSections();
      syncMobileDetailFinishing();
    }
  }, true);

  window.addEventListener('hashchange', syncRouteState, { passive: true });
  window.addEventListener('popstate', syncRouteState, { passive: true });
})();
