/* Nikki Wardrobe — private Google Sheets sync via Google Identity Services.
   OAuth access token lives in memory only. The public OAuth client ID is not a secret. */
(() => {
  'use strict';
  const SHEET_ID = '19TZeLB2-ua_KeogitgFomATC3Yik1xbMPqakxeNE0xc';
  const ROOT = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const KEY = 'nikki-google-oauth-client-id';
  const el = id => document.getElementById(id);
  const status = (message, bad=false) => {
    const node = el('cloud-status');
    node.textContent = message;
    node.style.color = bad ? '#a34561' : '#7d6484';
  };
  let token = null;
  let tokenClient = null;
  let connected = false;
  let busy = false;
  let queued = false;
  let lastRemote = '';
  let lastRows = 0;
  let stopped = false;
  const clientInput = el('cloud-client');
  clientInput.value = localStorage.getItem(KEY) || '';
  const rangeUrl = range => ROOT + encodeURIComponent(range);
  function rowsToItems(rows) {
    return rows.filter(row => row.some(v => String(v).trim())).map(row => {
      try {
        const json = row[11] && JSON.parse(row[11]);
        if (json && valid(json)) return json;
      } catch (_) {}
      return {
        id: String(row[0] || crypto.randomUUID()),
        name: String(row[1] || ''),
        slot: row[2], style: row[3], stars: Number(row[4]),
        labels: [row[5], row[6], row[7]].filter(Boolean),
        notes: String(row[9] || '')
      };
    }).filter(valid);
  }
  function itemsToRows(list) {
    return list.map(x => [
      x.id, x.name, x.slot, x.style, x.stars,
      x.labels[0] || '', x.labels[1] || '', x.labels[2] || '',
      '', x.notes || '', new Date().toISOString(), JSON.stringify(x)
    ]);
  }
  const signature = rows => JSON.stringify(rows.map(r => [r[0], r[11] || '', r[1] || '', r[2] || '', r[3] || '', r[4] || '', r[5] || '', r[6] || '', r[7] || '', r[9] || '']));
  async function api(url, init={}) {
    if (!token) throw Error('Нужно снова войти через Google.');
    const response = await fetch(url, {
      ...init,
      headers: {'Authorization':'Bearer ' + token,
        ...(init.body ? {'Content-Type':'application/json'} : {}),
        ...init.headers}
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error?.message || ('Ошибка Google API: ' + response.status);
      if (response.status === 401) { connected = false; status('Сессия истекла. Войди снова.', true); }
      throw Error(message);
    }
    return body;
  }
  async function readRows() {
    const data = await api(rangeUrl('Wardrobe!A2:L') + '?valueRenderOption=UNFORMATTED_VALUE');
    return data.values || [];
  }
  function renderAuth() {
    el('cloud-connect').textContent = connected ? '↻ Переподключить' : 'Войти через Google';
    el('cloud-reload').disabled = !connected;
    el('cloud-upload').disabled = !connected;
    el('cloud-signout').disabled = !token;
  }
  async function connect() {
    const clientId = clientInput.value.trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      status('Введи OAuth Client ID из Google Cloud.', true); return;
    }
    localStorage.setItem(KEY, clientId);
    if (!window.google?.accounts?.oauth2) {
      status('Не загрузилась библиотека Google. Проверь интернет или блокировщик.', true); return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: async response => {
        if (response.error) { status('Вход не выполнен: ' + response.error, true); return; }
        token = response.access_token;
        connected = true;
        stopped = false;
        renderAuth();
        try { await loadCloud(true); }
        catch (e) { status('Не удалось прочитать таблицу: ' + e.message, true); }
      },
      error_callback: e => status('Ошибка входа Google: ' + (e.message || e.type || 'неизвестная'), true)
    });
    tokenClient.requestAccessToken({prompt:token ? '' : 'consent'});
  }
  async function loadCloud(initial=false) {
    if (!connected) return;
    if (busy) {status('Сначала дождись окончания сохранения.',true);return}
    status('Читаю Google Таблицу…');
    const rows = await readRows();
    const remote = rowsToItems(rows);
    if (initial && items.length && JSON.stringify(items) !== JSON.stringify(remote)) {
      // Never silently overwrite local changes or the remote collection.
      const ok = confirm(
        'В Google Таблице: ' + remote.length + ' вещей. В этом браузере: ' +
        items.length + '.\n\nЗагрузить Google-коллекцию? Локальную можно заранее выгрузить через ↓ JSON.\n' +
        'Нажми «Отмена», если хочешь сначала сохранить локальную коллекцию.'
      );
      if (!ok) {
        connected = false;
        token = null;
        renderAuth();
        status('Вход отменён для защиты локальных данных. Сохрани JSON и войди снова.');
        return;
      }
    } else if (!initial && items.length && JSON.stringify(items) !== JSON.stringify(remote)) {
      if (!confirm('Загрузить актуальные данные из Google? Текущие локальные изменения будут заменены.')) {
        status('Загрузка отменена.'); return;
      }
    }
    items = remote;
    localStorage.setItem('nikki-wardrobe-v1', JSON.stringify(items));
    render();
    lastRemote = signature(rows);
    lastRows = rows.length;
    renderAuth();
    status('✓ Google подключён · ' + items.length + ' вещей');
  }
  async function uploadLocal() {
    if (!connected) return;
    if (busy) return;
    if (!confirm('Заменить содержимое вкладки Wardrobe (' + lastRows +
      ' строк) текущими ' + items.length + ' вещами? Это действие нельзя отменить из сайта.')) return;
    queued = true;
    await flush(true);
  }
  async function flush(force=false) {
    if (busy || !connected || stopped) return;
    busy = true;
    try {
      do {
        queued = false;
        status('Проверяю изменения в Google…');
        const before = await readRows();
        if (!force && signature(before) !== lastRemote) {
          stopped = true;
          status('⚠️ Таблица изменилась на другом устройстве. Экспортируй локальные данные в JSON и нажми «Загрузить из Google». Автосохранение остановлено.', true);
          return;
        }
        const snapshot = JSON.parse(JSON.stringify(items));
        const matrix = itemsToRows(snapshot);
        const height = Math.max(before.length, matrix.length, 1);
        while (matrix.length < height) matrix.push(Array(12).fill(''));
        status('Сохраняю ' + snapshot.length + ' вещей…');
        await api(rangeUrl('Wardrobe!A2:L' + (height + 1)) + '?valueInputOption=RAW', {
          method:'PUT',body:JSON.stringify({majorDimension:'ROWS',values:matrix})
        });
        const confirmed = await readRows();
        lastRemote = signature(confirmed);
        lastRows = confirmed.length;
        force = false;
      } while (queued);
      status('✓ Сохранено в Google · ' + items.length + ' вещей');
    } catch(e) {
      stopped = true;
      status('⚠️ Ошибка сохранения: ' + e.message + '. Экспортируй JSON, чтобы не потерять изменения.', true);
    } finally { busy = false; }
  }
  window.onWardrobeChanged = () => {
    if (!connected || stopped) return;
    queued = true;
    if (!busy) void flush();
  };
  el('cloud-connect').onclick = connect;
  el('cloud-reload').onclick = async () => {
    try { await loadCloud(false); stopped = false; }
    catch(e) { status('Ошибка загрузки: ' + e.message, true); }
  };
  el('cloud-upload').onclick = uploadLocal;
  el('cloud-signout').onclick = () => {
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
    token = null; connected = false; stopped = false; renderAuth();
    status('Отключено. Данные остались в локальном браузере.');
  };
  renderAuth();
})();