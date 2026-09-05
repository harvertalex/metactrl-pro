/**
 * Facebook Pixel → Ad Account Linker
 *
 * Bookmarklet for business.facebook.com that:
 *  1. Reads the access token embedded in the page source
 *  2. Asks for a Pixel ID
 *  3. Asks for a list of ad account IDs (one per line)
 *  4. Calls the Graph API POST /{pixelId}/shared_accounts for each account
 *
 * Usage: open business.facebook.com, then run this script (paste into console
 * or trigger via bookmarklet).
 *
 * Deobfuscated from base64-encoded bookmarklet. Original used array-rotation
 * obfuscation (string constants stored in a shuffled array, accessed by
 * hex-index). All index lookups have been replaced with their resolved values.
 */

(async () => {
  const GRAPH_VER = 'v23.0';   // keep in step with MetaCtrl CONFIG.VERSION (bookmarklet.js)

  // ─── 1. Create the floating UI panel ────────────────────────────────────────

  const panel = document.createElement('div');
  panel.style.position      = 'fixed';
  panel.style.top           = '50%';
  panel.style.left          = '50%';
  panel.style.transform     = 'translate(-50%, -50%)';
  panel.style.width         = '400px';
  panel.style.maxHeight     = '350px';
  panel.style.overflowY     = 'auto';
  panel.style.backgroundColor = 'white';
  panel.style.border        = '1px solid black';
  panel.style.padding       = '15px';
  panel.style.zIndex        = '10000';
  panel.style.fontFamily    = 'Arial, sans-serif';
  panel.style.fontSize      = '14px';
  document.body.appendChild(panel);

  // Close button (×) in the top-right corner
  const closeBtn = document.createElement('span');
  closeBtn.textContent       = '✖';
  closeBtn.style.position    = 'absolute';
  closeBtn.style.right       = '10px';
  closeBtn.style.cursor      = 'pointer';
  closeBtn.style.fontSize    = '16px';
  closeBtn.onclick           = () => document.body.removeChild(panel);
  panel.appendChild(closeBtn);

  // Log container — messages are appended here as <div> rows
  const logContainer = document.createElement('div');
  panel.appendChild(logContainer);

  /** Append a text row to the log panel */
  function log(message) {
    const row = document.createElement('div');
    row.textContent = message;
    logContainer.appendChild(row);
  }

  try {

    // ─── 2. Guard: must be on business.facebook.com ───────────────────────────

    if (!window.location.href.includes('business.facebook.com')) {
      log('[LOG] Перенаправление на business.facebook.com...');
      window.location.href =
        'https://business.facebook.com/latest/settings/ad_accounts/?business_id=';
      return;
    }

    // ─── 3. Resolve business_id ───────────────────────────────────────────────

    // Try prompt first; fall back to ?business_id= query param
    let businessId = prompt(
      'Введите ID БМ или оставьте пустым, если хотите использовать текущий БМ:'
    )?.trim();

    if (!businessId) {
      businessId = new URLSearchParams(window.location.search).get('business_id');
      if (!businessId) throw new Error('Не найден business_id в URL');
    }

    log('🆔 Используемый BM_ID: ' + businessId);

    // ─── 4. Extract access token from page source ─────────────────────────────

    // The token is embedded as  "apiAccessToken":"EAAG..."  or  "accessToken":"EAAG..."
    // in the page's inline scripts / JSON data.
    const tokenMatch = document.documentElement.innerHTML.match(
      /(?:apiAccessToken|accessToken)":"(EAAG[^"]+)/
    );
    if (!tokenMatch) throw new Error('Не найден accessToken в коде страницы');

    const accessToken = tokenMatch[1];
    log('🔑 Найден accessToken');

    // ─── 5. Ask for Pixel ID ──────────────────────────────────────────────────

    const pixelId = prompt('Введите PixelID:');
    if (!pixelId) throw new Error('PixelID не введен');

    log('📊 Введен PixelID: ' + pixelId);

    // Separator row (uses &nbsp; as spacer — preserved from original)
    const separator = document.createElement('div');
    separator.innerHTML = '&nbsp;';
    logContainer.appendChild(separator);

    // ─── 6. Ask for ad account IDs (one per line) ─────────────────────────────

    const rawInput = prompt(
      'Введите список account_id через\nновую строку:'
    );
    if (!rawInput) throw new Error('Список account_id не введен');

    // Split by newline, trim whitespace, drop empty lines
    const accountIds = rawInput
      .split('\n')
      .map(id => id.trim())
      .filter(id => id);

    log('📋 Количество account_id: ' + accountIds.length);

    // ─── 7. Create status row for each account ───────────────────────────────

    const statusRows = {};
    accountIds.forEach(accountId => {
      statusRows[accountId] = document.createElement('div');
      statusRows[accountId].textContent = '⏳ ' + accountId;
      logContainer.appendChild(statusRows[accountId]);
    });

    // ─── 8. POST to Graph API for each account ────────────────────────────────

    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];

      // Endpoint: POST https://graph.facebook.com/${GRAPH_VER}/{pixelId}/shared_accounts
      const apiUrl = `https://graph.facebook.com/${GRAPH_VER}/${pixelId}/shared_accounts`;

      const body = new URLSearchParams();
      body.append('method',        'POST');        // method override in body
      body.append('business',      businessId);    // BM that owns the pixel
      body.append('account_id',    accountId);     // ad account to link
      body.append('access_token',  accessToken);   // user/page access token

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          body: body,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':   navigator.userAgent,
          },
          mode:        'cors',
          credentials: 'include',
        });

        const data = await response.json();

        if (data.error) {
          // Show error message returned by the API
          statusRows[accountId].textContent =
            '❌ ' + accountId + ' (' + data.error.message + ')';
        } else {
          statusRows[accountId].textContent = '✅ ' + accountId;
        }

      } catch (fetchError) {
        statusRows[accountId].textContent =
          '❌ ' + accountId + ' (' + fetchError.message + ')';
      }
    }

  } catch (err) {

    // ─── Error handler: try to show in panel, else alert ─────────────────────

    const existingPanel = document.querySelector('div[style*="zIndex: 10000"]');
    if (existingPanel) {
      const errorContainer = existingPanel.querySelector('div');
      const errorRow = document.createElement('div');
      errorRow.textContent = '[ERROR] Ошибка: ' + err.message;
      errorContainer.appendChild(errorRow);
    } else {
      alert('[ERROR] Ошибка: ' + err.message);
    }
  }

})();
