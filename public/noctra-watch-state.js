(() => {
  'use strict';

  const rows = new WeakMap();
  const clients = new WeakSet();
  const eventSources = new WeakSet();
  let account = null;
  let pendingRefresh = 0;

  function session(client = window.ApiClient) {
    try {
      const userId = client?.getCurrentUserId?.();
      const token = client?.accessToken?.();
      return userId && token ? { client, userId, token, serverId: client.serverId?.() } : null;
    } catch {
      return null;
    }
  }

  function sameAccount(left, right) {
    if (!left || !right) return left === right;
    return left.userId === right.userId && left.serverId === right.serverId && left.token === right.token;
  }

  function resetRow(row) {
    rows.delete(row);
    row.replaceChildren();
    row.parentContainer?.classList.add('hide');
  }

  function resumeItems(items, limit = Infinity) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(item => {
      const id = String(item?.Id || '');
      const userData = item?.UserData || {};
      const position = Number(userData.PlaybackPositionTicks);
      const runtime = Number(item?.RunTimeTicks);
      if (!id || seen.has(id) || !Number.isFinite(position) || position <= 0) return false;
      if (runtime > 0 ? position >= runtime * .99 : Number(userData.PlayedPercentage) >= 99) return false;
      seen.add(id);
      return true;
    }).slice(0, limit);
  }

  function nextUpCutoff(maxDays, now = Date.now()) {
    const configured = Number(maxDays);
    const days = Number.isFinite(configured) ? Math.max(0, Math.min(30, configured)) : 30;
    return new Date(now - days * 86_400_000).toISOString();
  }

  async function refreshRow(row, render) {
    const owner = session();
    if (!sameAccount(rows.get(row)?.owner || null, owner)) resetRow(row);
    if (!owner) return;
    const request = { owner };
    rows.set(row, request);
    const fetchData = row.fetchData;
    try {
      const result = await fetchData(owner);
      if (!row.isConnected || rows.get(row) !== request || row.fetchData !== fetchData || !sameAccount(owner, session())) return;
      if (row.dataset.noctraWatchRow === 'latest') {
        render(Array.isArray(result) ? result : []);
        return;
      }
      const entries = Array.isArray(result?.Items) ? result.Items : [];
      const items = row.dataset.noctraWatchRow === 'resume'
        ? resumeItems(entries)
        : entries.filter(item => item?.Id && item.UserData);
      render({ ...result, Items: items });
    } catch {
      // Une erreur transitoire garde le dernier rendu du même compte.
    }
  }

  function refreshHome(includeLatest = false) {
    if (document.hidden) return;
    const home = document.querySelector('.homePage:not(.hide)');
    home?.querySelectorAll('[data-noctra-watch-row]').forEach(row => {
      if (includeLatest || row.dataset.noctraWatchRow !== 'latest') void row.refreshItems?.();
    });
  }

  function notifyChange() {
    window.clearTimeout(pendingRefresh);
    pendingRefresh = window.setTimeout(() => {
      refreshHome();
      window.dispatchEvent(new Event('noctra:watch-state-changed'));
    }, 200);
  }

  function syncAccount() {
    const current = session();
    if (sameAccount(account, current)) return;
    account = current;
    document.querySelectorAll('[data-noctra-watch-row]').forEach(row => {
      if (!sameAccount(rows.get(row)?.owner || null, current)) resetRow(row);
    });
    refreshHome(true);
    window.dispatchEvent(new Event('noctra:watch-state-changed'));
  }

  function bind(client, events, serverEvents) {
    if (!client || clients.has(client) || !events || !serverEvents) return;
    clients.add(client);
    const mutations = new Map();

    for (const method of ['markPlayed', 'markUnplayed']) {
      const original = client[method];
      if (typeof original !== 'function') continue;
      client[method] = function(userId, itemId, ...args) {
        const owner = session(this);
        if (!owner || owner.userId !== userId || !sameAccount(owner, session())) return original.call(this, userId, itemId, ...args);
        const pending = mutations.get(itemId);
        const emit = data => {
          if (!sameAccount(owner, session()) || !data || typeof data.Played !== 'boolean') return;
          events.trigger(serverEvents, 'UserDataChanged', [this, { ...data, ItemId: itemId }]);
        };
        const change = (async () => {
          if (pending) await pending.catch(() => {});
          if (!sameAccount(owner, session())) return;
          try {
            const data = await original.call(this, userId, itemId, ...args);
            emit(data);
            return data;
          } catch (error) {
            if (sameAccount(owner, session())) {
              try { emit((await this.getItem(userId, itemId))?.UserData); } catch {}
            }
            throw error;
          } finally {
            if (sameAccount(owner, session())) notifyChange();
          }
        })();
        mutations.set(itemId, change);
        const clear = () => { if (mutations.get(itemId) === change) mutations.delete(itemId); };
        change.then(clear, clear);
        return change;
      };
    }

    const stop = client.reportPlaybackStopped;
    if (typeof stop === 'function') {
      client.reportPlaybackStopped = async function(...args) {
        const owner = session(this);
        const result = await stop.apply(this, args);
        if (owner && sameAccount(owner, session())) notifyChange();
        return result;
      };
    }

    const authenticate = client.setAuthenticationInfo;
    if (typeof authenticate === 'function') {
      client.setAuthenticationInfo = function(...args) {
        const result = authenticate.apply(this, args);
        if (this === window.ApiClient) syncAccount();
        return result;
      };
    }

    if (!eventSources.has(serverEvents)) {
      eventSources.add(serverEvents);
      events.on(serverEvents, 'UserDataChanged', (_event, source) => {
        if (source === window.ApiClient && session()) notifyChange();
      });
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !document.querySelector('.homePage:not(.hide)')) return;
    syncAccount();
    notifyChange();
  });

  window.NoctraWatchState = { session, sameAccount, resumeItems, nextUpCutoff, refreshRow, syncAccount, bind };
})();
