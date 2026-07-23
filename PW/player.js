// ==================== VIDEO CONFIG — DECRYPT SENSITIVE FIELDS ====================
// Sensitive values are AES-256-CBC encrypted in PHP using the same key/IV.
// CryptoJS (already loaded) decrypts them before use.
(function() {
  const _EK = CryptoJS.SHA256("j@-5V@01+;zsTqltxp^OKPDJK9v@(')2");  // 32-byte key WordArray
  const _IV = CryptoJS.enc.Utf8.parse("VpK}59&KH}~hwmZy");           // 16-byte IV WordArray

  function decF(b64) {
    if (!b64) return '';
    try {
      const ct = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(b64) });
      const dec = CryptoJS.AES.decrypt(ct, _EK, { iv: _IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      return dec.toString(CryptoJS.enc.Utf8) || '';
    } catch(e) { return ''; }
  }

  function gv(id) { return document.getElementById(id)?.value || ''; }

  window.mediaConfig = {
    video_id:      gv('data-video-id'),
    batch_id:      gv('data-batch-id'),
    video_url:     decF(gv('data-video-url')),
    original_url:  decF(gv('data-original-url')),
    signed_url:    decF(gv('data-signed-url')),
    key_id:        decF(gv('data-key-id')),
    key_value:     decF(gv('data-key-value')),
    has_drm:       gv('data-has-drm') === '1',
    license_url:   decF(gv('data-license-url')),
    license_token: decF(gv('data-license-token')),
  };
})();

const mediaConfig = window.mediaConfig;
console.log('📋 Video config loaded (decrypted OK):', !!mediaConfig.video_url);

// ========================================
// ORIGIN PROTECTION - DO NOT REMOVE
// ========================================
(function () {
    const allowedOrigins = [
    'streamfiles.eu.org',
    'testfile.eu.org',
    'localhost',
    'secret-stripe.alfanso.info',
    'studyratna.cc',
    'stream.studyratna.cc',
    'darzwallah.vercel.app'
];
    const currentHost = window.location.hostname;

    // Check if current host is in allowed list
    const isAllowed = allowedOrigins.some(origin => currentHost === origin || currentHost.endsWith('.' + origin));

    if (!isAllowed) {
        // Create deprecation popup
        const deprecationPopup = document.createElement('div');
        deprecationPopup.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: Arial, sans-serif;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 20px; text-align: center; max-width: 500px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);">
                    <div style="font-size: 64px; margin-bottom: 20px;">🚫</div>
                    <h1 style="color: white; font-size: 32px; margin-bottom: 15px; font-weight: bold;">Access Denied</h1>
                    <h2 style="color: #ffeb3b; font-size: 24px; margin-bottom: 20px;">Code Deprecated</h2>
                    <p style="color: #ffffff; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
                        This code is no longer supported on this domain. Please use authorized domains only.
                    </p>
                    <div style="background: rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 15px; margin-top: 20px;">
                        <p style="color: #ffcccc; font-size: 14px; margin: 0;">
                            <strong>Error Code:</strong> ORIGIN_MISMATCH_403
                        </p>
                    </div>
                </div>
            </div>
        `;
        document.body.innerHTML = '';
        document.body.appendChild(deprecationPopup);

        // Stop all script execution
        throw new Error('Unauthorized origin detected. Code execution terminated.');
    }
})();
// ========================================
// END ORIGIN PROTECTION
// ==
// 
//======================================



// ==================== TOKEN MANAGEMENT ====================
const TOKEN_API_URL = '/api/token-manager';
const TOKEN_BUNDLE_KEY = 'sr_token_bundle';
const TOKEN_KEY = 'pw_auth_token'; // legacy fallback

// Set cookie helper
function setCookie(name, value, hours) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (hours * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

// Fetch and store token (Unified with radha.js)
async function fetchAndStoreToken() {
    try {
        const url = TOKEN_API_URL + '?_=' + Math.random().toString(36).slice(2);
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache',
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch token bundle');
        }
        
        const data = await response.json();
        if (data && data.success) {
            const bundle = {
                token:        data.token,
                access_token: data.access_token,
                enc_token:    data.enc_token,
                expires_at:   data.expires_at || (Math.floor(Date.now() / 1000) + 6 * 3600),
            };
            
            // Persist bundle
            localStorage.setItem(TOKEN_BUNDLE_KEY, JSON.stringify(bundle));
            
            // Set legacy cookie for compatibility
            const token = bundle.access_token || bundle.token;
            if (token) {
                setCookie(TOKEN_KEY, token, 1);
            }
            
            console.log('✅ Token stored and synced with sr_token_bundle');
            return token;
        } else {
            throw new Error(data?.error || 'Invalid token response');
        }
    } catch (error) {
        console.error('❌ Token fetch failed:', error);
        return localStorage.getItem(TOKEN_KEY) || null;
    }
}

// Get valid token (fetch new if expired, aligned with radha.js cache validation)
async function getValidToken() {
    try {
        const raw = localStorage.getItem(TOKEN_BUNDLE_KEY);
        if (raw) {
            const bundle = JSON.parse(raw);
            // Check if fresh (expiry - 60s threshold, exactly as in radha.js _FRESH_THRESHOLD)
            if (bundle && bundle.expires_at && (Date.now() < (bundle.expires_at * 1000 - 60000))) {
                const token = bundle.access_token || bundle.token;
                if (token) return token;
            }
        }
    } catch (e) {
        console.warn('[Token] Error reading sr_token_bundle:', e);
    }
    
    console.log('🔄 Fetching new token from token-manager.php...');
    return await fetchAndStoreToken();
}

// ==================== TIMELINE SLIDES ====================

let timelineSlides = []; // Will be loaded lazily when user clicks timeline icon
let timelineSlidesLoaded = false; // Track if slides have been fetched
let timelineSlidesLoading = false; // Prevent duplicate requests

let classNotes = [];       // Can be populated from API if needed
let practiceSheets = [];   // Can be populated from API if needed
const contentTitle = document.getElementById('data-title')?.value || 'Video Player';

console.log('📊 Timeline Slides: Will be loaded lazily when needed');

// ✅ Lazy load timeline slides when user opens timeline
async function loadTimelineSlides() {
    console.log('🎬 loadTimelineSlides() called');
    
    // If already loaded or loading, skip
    if (timelineSlidesLoaded || timelineSlidesLoading) {
        console.log('⏸️ Timeline slides already loaded or loading');
        return timelineSlides;
    }
    
    // Get IDs from hidden input fields (no PHP in JavaScript!)
    const videoId = document.getElementById('data-video-id')?.value || mediaConfig.video_id;
    const batchId = document.getElementById('data-batch-id')?.value || mediaConfig.batch_id;
    const subjectId = document.getElementById('data-subject-id')?.value || '';
    
    console.log('📊 Timeline params:', { videoId, batchId, subjectId });
    
    if (!videoId || !batchId || !subjectId) {
        console.warn('⚠️ Cannot load timeline: missing required IDs', { videoId, batchId, subjectId });
        timelineSlidesLoading = false;
        return timelineSlides;
    }
    
    timelineSlidesLoading = true;
    console.log('📡 Fetching timeline slides from API...');
    
    try {
        // Get valid token
        const token = await getValidToken();
        
        console.log('🔑 Token obtained:', token ? 'Yes' : 'No');
        
        if (!token) {
            throw new Error('No token available');
        }
        
        // Build API URL
        const apiUrl = `https://api.penpencil.co/v1/batches/${batchId}/subject/${subjectId}/schedule/${videoId}/slides`;
        
        console.log('📡 Timeline API URL:', apiUrl);
        
        // Fetch with Bearer token
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📡 Timeline API response status:', response.status);
        
        // Handle 403 - Token expired, refresh and retry
        if (response.status === 403) {
            console.log('🔄 Token expired (403), refreshing token...');
            await fetchAndStoreToken();
            
            // Retry with new token
            const newToken = await getValidToken();
            const retryResponse = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${newToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!retryResponse.ok) {
                throw new Error(`API returned status ${retryResponse.status}`);
            }
            
            const retryResult = await retryResponse.json();
            return processTimelineResponse(retryResult);
        }
        
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        
        const result = await response.json();
        return processTimelineResponse(result);
        
    } catch (error) {
        console.error('❌ Error loading timeline slides:', error);
        timelineSlidesLoading = false;
        return timelineSlides;
    }
}

// Process timeline API response
function processTimelineResponse(result) {
    console.log('✅ Timeline API response:', result);
    
    // Extract slides from response
    let slides = [];
    
    if (result.success && result.data && result.data.slides) {
        slides = result.data.slides;
    } else if (result.data && Array.isArray(result.data)) {
        slides = result.data;
    } else if (Array.isArray(result.slides)) {
        slides = result.slides;
    } else if (Array.isArray(result)) {
        slides = result;
    }
    
    console.log('📊 Found', slides.length, 'raw slides');
    
    // Filter only slides where slideForTimeline is true
    const timelineOnlySlides = slides.filter(slide => slide.slideForTimeline === true);
    console.log('📊 Filtered', timelineOnlySlides.length, 'timeline slides (slideForTimeline: true)');
    
    // Process slides
    timelineSlides = [];
    
    timelineOnlySlides.forEach(slide => {
        if (slide && typeof slide === 'object') {
            // Build image URL
            let imageUrl = '';
            if (slide.img && slide.img.baseUrl && slide.img.key) {
                imageUrl = slide.img.baseUrl + slide.img.key;
            } else if (slide.imageUrl) {
                // If imageUrl is relative, prepend base URL
                if (slide.imageUrl.startsWith('cdn')) {
                    imageUrl = 'https://static.pw.live/' + slide.imageUrl;
                } else {
                    imageUrl = slide.imageUrl;
                }
            }
            
            timelineSlides.push({
                id: slide._id || slide.id || '',
                image: imageUrl,
                name: slide.name || slide.title || `Slide ${slide.serialNumber || ''}`,
                timestamp: parseInt(slide.timeStamp || slide.timestamp || 0)
            });
        }
    });
    
    // Sort by timestamp
    timelineSlides.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log('✅ Processed', timelineSlides.length, 'timeline slides');
    if (timelineSlides.length > 0) {
        console.log('📊 First slide:', timelineSlides[0]);
        console.log('📊 Last slide:', timelineSlides[timelineSlides.length - 1]);
    }
    
    timelineSlidesLoaded = true;
    timelineSlidesLoading = false;
    
    return timelineSlides;
}

// ==================== DYNAMIC ATTACHMENTS ====================
let attachmentsData = null;
let attachmentsLoading = false;
let attachmentsLoaded = false;

async function loadAttachments() {
    console.log('📎 loadAttachments() called');
    if (attachmentsLoaded) {
        console.log('⏸️ Attachments already loaded, rendering from cache');
        renderAttachmentsList(classNotes, practiceSheets);
        return;
    }
    if (attachmentsLoading) {
        console.log('⏸️ Attachments already loading, skipping request');
        return;
    }
    
    const videoId = document.getElementById('data-video-id')?.value || mediaConfig.video_id;
    const batchId = document.getElementById('data-batch-id')?.value || mediaConfig.batch_id;
    const subjectId = document.getElementById('data-subject-id')?.value || '';
    
    console.log('📎 Attachments params:', { videoId, batchId, subjectId });
    
    if (!videoId || !batchId || !subjectId) {
        console.warn('⚠️ Cannot load attachments: missing required IDs', { videoId, batchId, subjectId });
        return;
    }
    
    attachmentsLoading = true;
    
    // Show loading spinner
    const containers = document.querySelectorAll('[data-p="att"]');
    containers.forEach(container => {
        container.innerHTML = `
            <div class="no-items" style="padding: 40px 20px; text-align: center;">
                <div class="loading-spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Loading attachments...</p>
            </div>
        `;
    });
    
    try {
        const token = await getValidToken();
        if (!token) {
            throw new Error('No auth token available');
        }
        
        // Fetch schedule-details
        const url = `https://api.penpencil.co/v1/batches/${batchId}/subject/${subjectId}/schedule/${videoId}/schedule-details`;
        console.log('📡 Fetching schedule details:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Client-Id': '5eb393ee95fab7468a79d189',
                'Client-Type': 'WEB',
                'Client-Version': '4.6.5',
                'Randomid': crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
                'Origin': 'https://www.pw.live',
                'Referer': 'https://www.pw.live/'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        
        const resJson = await response.json();
        const data = resJson?.data || {};
        
        // Helper: extract all attachments from homeworkIds style array or direct attachment array
        const extractAttachments = (list) => {
            const result = [];
            if (!list) return result;
            const arr = Array.isArray(list) ? list : [list];
            
            arr.forEach(item => {
                if (item && Array.isArray(item.attachmentIds)) {
                    item.attachmentIds.forEach(att => {
                        let downloadUrl = att.downloadUrl || att.url || '';
                        if (!downloadUrl && att.baseUrl && att.key) {
                            downloadUrl = att.baseUrl + att.key;
                        }
                        if (downloadUrl) {
                            result.push({
                                title: att.name || item.topic || item.note || 'Attachment',
                                url: downloadUrl
                            });
                        }
                    });
                } else if (item) {
                    let downloadUrl = item.downloadUrl || item.url || '';
                    if (!downloadUrl && item.baseUrl && item.key) {
                        downloadUrl = item.baseUrl + item.key;
                    }
                    if (downloadUrl) {
                        result.push({
                            title: item.name || item.title || item.topic || 'Attachment',
                            url: downloadUrl
                        });
                    }
                }
            });
            return result;
        };
        
        classNotes = extractAttachments(data.homeworkIds || data.classNotes);
        practiceSheets = [];
        if (data.dpp) {
            if (Array.isArray(data.dpp.homeworkIds)) {
                practiceSheets = extractAttachments(data.dpp.homeworkIds);
            } else {
                practiceSheets = extractAttachments(data.dpp);
            }
        }
        
        // Render attachments list
        renderAttachmentsList(classNotes, practiceSheets);
        attachmentsLoaded = true;
        
    } catch (error) {
        console.error('❌ Error loading attachments:', error);
        containers.forEach(container => {
            container.innerHTML = '<div class="no-items">Failed to load attachments<br><small>Please try again</small></div>';
        });
    } finally {
        attachmentsLoading = false;
    }
}

function renderAttachmentsList(notes, dpps) {
    const containers = document.querySelectorAll('[data-p="att"]');
    
    let attH = '';
    
    function makeGroup(items, label) {
        if(!items || !items.length) return '';
        let h = `<div style="margin-top: 14px; margin-bottom: 8px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; padding: 0 4px;">${label} (${items.length})</div>`;
        
        items.forEach((it, i) => {
            const nm = it.title || it.name || (label + ' ' + (i + 1));
            const safeUrl = (it.url || '').replace(/'/g, "\\'");
            const safeName = nm.replace(/'/g, "\\'");
            const sub = label === 'Notes' ? 'Class Notes' : 'Practice Sheet';
            h += `
            <div class="att-row">
              <div class="att-icon-box">
                <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span class="att-badge-tag">PDF</span>
              </div>
              <div class="att-info">
                <span class="att-title-text" title="${nm}">${nm}</span>
                <span class="att-meta-text">${sub}</span>
              </div>
              <div class="att-action-buttons">
                <button class="att-btn-circle" title="Preview PDF" onclick="openDocumentPreview('${safeUrl}','${safeName}')">
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="att-btn-circle" title="Open in new tab" onclick="window.open('${safeUrl}','_blank','noopener')">
                  <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
                <button class="att-btn-circle" title="Download" onclick="downloadDocument('${safeUrl}','${safeName}')">
                  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </div>
            </div>`;
        });
        return h;
    }
    
    attH += makeGroup(notes, 'Notes');
    attH += makeGroup(dpps, 'DPP');
    
    if(!attH) {
        attH = '<div class="no-items">No attachments available</div>';
    }
    
    containers.forEach(container => {
        container.innerHTML = attH;
    });
}

// Update page title
if (contentTitle) {
    document.title = contentTitle;
    const titleElement = document.getElementById('player-title');
    if (titleElement) titleElement.textContent = contentTitle;
}

// ==================== DRM & KEY UTILITIES ====================
// Convert base64 to Uint8Array
function base64ToUint8Array(base64) {
  const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert hex string to Uint8Array
function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Parse DRM keys - supports both base64 and hex formats
function parseDrmKeys(data) {
  const keys = {};
  
  // Check for PallyCon/Widevine DRM first (license_url + license_token)
  if (data.license_url || data.license_token) {
    console.log('✅ PallyCon/Widevine DRM detected');
    return keys; // Return empty keys object - will be handled by Widevine config
  }
  
  // Try base64 format (ClearKey DRM)
  if (data.key_id && data.key_value) {
    try {
      const keyId = base64ToUint8Array(data.key_id);
      const keyValue = base64ToUint8Array(data.key_value);
      
      // Convert to hex string for Shaka
      const keyIdHex = Array.from(keyId).map(b => b.toString(16).padStart(2, '0')).join('');
      const keyValueHex = Array.from(keyValue).map(b => b.toString(16).padStart(2, '0')).join('');
      
      keys[keyIdHex] = keyValueHex;
      console.log('✅ Parsed base64 ClearKey DRM keys:', keyIdHex);
      return keys;
    } catch (e) {
      console.warn('⚠️ Failed to parse base64 keys:', e);
    }
  }
  
  // Try hex format (fallback)
  if (data.keyId_value_hex && data.key_value_hex) {
    keys[data.keyId_value_hex] = data.key_value_hex;
    console.log('✅ Parsed hex ClearKey DRM keys:', data.keyId_value_hex);
    return keys;
  }
  
  // Try old format with keys array
  if (data.keys && Array.isArray(data.keys)) {
    data.keys.forEach(keyStr => {
      if (typeof keyStr === 'string' && keyStr.includes(':')) {
        const [kid, kval] = keyStr.split(':');
        if (kid && kval) keys[kid] = kval;
      }
    });
    if (Object.keys(keys).length > 0) {
      console.log('✅ Parsed array ClearKey DRM keys');
      return keys;
    }
  }
  
  console.warn('⚠️ No DRM keys found in data');
  return keys;
}

// Decrypt encrypted data (for PallyCon license)
function decryptData(encryptedData) {
  try {
    const key = CryptoJS.enc.Utf8.parse('j@-5V@01+;zsTqltxp^OKPDJK9v@(\')2');
    const keyHash = CryptoJS.SHA256(key);
    const keyBytes = CryptoJS.lib.WordArray.create(keyHash.words.slice(0, 8));
    const iv = CryptoJS.enc.Utf8.parse('VpK}59&KH}~hwmZy');
    
    const decrypted = CryptoJS.AES.decrypt(encryptedData, keyBytes, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('❌ Decryption failed:', e);
    return null;
  }
}

if(contentTitle) document.getElementById('player-title').textContent = contentTitle;

function fmt(s){
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
  const ss = (sc < 10 ? '0' : '') + sc;
  return h > 0 ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
}

function checkPortraitMode(){
  if(window.screen && window.screen.width <= window.screen.height) return true;
  return false;
}

function checkDesktopView(){
  if(document.fullscreenElement || document.webkitFullscreenElement) return true;
  if(window.screen && window.screen.width > window.screen.height) return true;
  if(window.screen && window.screen.width >= 768) return true;
  return false;
}

// ✅ OPTIMIZED: Use cached shell reference
let layoutUpdateTimer = null;
function updateLayoutMode(){
  if(checkDesktopView()){
    shell.classList.remove('layout-mobile');
    shell.classList.add('layout-desktop');
  } else {
    shell.classList.remove('layout-desktop');
    shell.classList.add('layout-mobile');
  }
  if(sidebarVisible) showSidebar(activeTabType);
}

function debouncedLayoutUpdate() {
  if (layoutUpdateTimer) clearTimeout(layoutUpdateTimer);
  layoutUpdateTimer = setTimeout(updateLayoutMode, 150);
}

window.addEventListener('resize', debouncedLayoutUpdate, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(updateLayoutMode, 100), { passive: true });
if(screen.orientation) screen.orientation.addEventListener('change', () => setTimeout(updateLayoutMode, 100));
document.addEventListener('fullscreenchange', () => setTimeout(updateLayoutMode, 50));
document.addEventListener('webkitfullscreenchange', () => setTimeout(updateLayoutMode, 50));

let sidebarVisible = false, activeTabType = 'tl';
updateLayoutMode();

function openDocumentPreview(url, name){
  if(!url){ alert('No file URL available.'); return; }
  window.currentPdfUrl = url;
  window.currentPdfName = name;
  currentPdfUrl = url;
  currentPdfName = name;
  const pi = checkDesktopView() ? document.getElementById('desktopPanelContent') : document.getElementById('mobilePanelContent');
  const mainBody = pi.querySelector('#mainPanelBody');
  const tabsArea = pi.querySelector('#panelTabsArea');
  const previewWrap = pi.querySelector('#pdfPreviewWrap');
  const titleEl = pi.querySelector('#pdfPreviewTitle');
  const frameContainer = pi.querySelector('#pdfFrameContainer');
  const hdrTitle = pi.querySelector('.panel-hdr-title');
  titleEl.textContent = name;
  if(hdrTitle) hdrTitle.textContent = 'Preview';
  if(mainBody) mainBody.style.display = 'none';
  if(tabsArea) tabsArea.style.display = 'none';
  previewWrap.style.display = 'flex';
  previewWrap.style.flexDirection = 'column';
  previewWrap.style.flex = '1';
  previewWrap.style.minHeight = '0';
  frameContainer.innerHTML = '<div class="pdf-loading"><div class="spinner"></div><p>Loading PDF…</p></div>';
  function renderWithPDFjs(){
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const loadingTask = pdfjsLib.getDocument({ url, cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', cMapPacked: true });
    loadingTask.promise.then(pdfDoc => {
      const totalPages = pdfDoc.numPages;
      frameContainer.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'pdf-canvas-wrap';
      frameContainer.appendChild(wrap);
      const containerW = frameContainer.clientWidth || window.innerWidth || 360;
      const dpr = window.devicePixelRatio || 1;
      function renderPage(pageNum){
        if(pageNum > totalPages) return;
        pdfDoc.getPage(pageNum).then(page => {
          const vpNatural = page.getViewport({ scale: 1 });
          const fitScale = (containerW - 16) / vpNatural.width;
          const vpRender = page.getViewport({ scale: fitScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          canvas.width = vpRender.width; canvas.height = vpRender.height;
          canvas.style.width = (vpRender.width / dpr) + 'px';
          canvas.style.height = (vpRender.height / dpr) + 'px';
          wrap.appendChild(canvas);
          page.render({ canvasContext: canvas.getContext('2d'), viewport: vpRender }).promise.then(() => renderPage(pageNum + 1));
        });
      }
      renderPage(1);
    }).catch(() => {
      frameContainer.innerHTML = `<div class="pdf-err"><p>Could not load PDF.</p><a href="${url}" target="_blank" rel="noopener">Open PDF ↗</a></div>`;
    });
  }
  if(window['pdfjs-dist/build/pdf']){
    renderWithPDFjs();
  } else {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = renderWithPDFjs;
    script.onerror = () => {
      frameContainer.innerHTML = `<div class="pdf-err"><p>PDF viewer failed to load.</p><a href="${url}" target="_blank" rel="noopener">Open PDF ↗</a></div>`;
    };
    document.head.appendChild(script);
  }
}

function closeDocumentPreview(pi){
  const mainBody = pi.querySelector('#mainPanelBody');
  const tabsArea = pi.querySelector('#panelTabsArea');
  const previewWrap = pi.querySelector('#pdfPreviewWrap');
  const hdrTitle = pi.querySelector('.panel-hdr-title');
  if(mainBody) mainBody.style.display = '';
  if(tabsArea) tabsArea.style.display = '';
  previewWrap.style.display = 'none';
  const activeTab = pi.querySelector('.ptab.active');
  if(hdrTitle && activeTab) hdrTitle.textContent = activeTab.dataset.tab === 'tl' ? 'Timeline' : 'Attachments';
  const fc = pi.querySelector('#pdfFrameContainer');
  if(fc) fc.innerHTML = '';
}

function downloadDocument(url, name){
  if(!url){ alert('No file URL available.'); return; }
  let fileName = name.trim();
  if(!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';
  fileName = fileName.replace(/:/g, ' -').replace(/[/\\?%*|"<>]/g, '-').replace(/ {2,}/g, ' ').trim();
  fetch(url)
    .then(r => { if(!r.ok) throw new Error('fetch failed'); return r.blob(); })
    .then(blob => {
      const burl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = burl; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(burl), 5000);
    })
    .catch(() => {
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
}

function generateSidebarContent(){
  let tlH = '<div class="tl-list type-slides-container">';
  
  // Show loading state if slides are being fetched
  if(timelineSlidesLoading){
    tlH += `
      <div class="no-items" style="padding: 40px 20px; text-align: center;">
        <div class="loading-spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Loading slides...</p>
      </div>
    `;
  }
  // Show slides if loaded
  else if(timelineSlides && timelineSlides.length){
    timelineSlides.forEach((s, i) => {
      tlH += `<div class="tl-card" data-idx="${i}" onclick="jumpToTimestamp(${s.timestamp})">
        <div class="tl-img-wrapper">
          ${s.image ? `<img class="tl-img" src="${s.image}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.background='#1c1c27'">` : '<div class="tl-img"></div>'}
        </div>
        <span class="tl-cur-badge">&#9654; Current</span>
        <span class="tl-slide-number-tag">Slide No. ${i + 1}</span>
        ${s.id ? `<button class="view-doubts-btn" onclick="event.stopPropagation(); openSlideDoubts('${s.id}', '${s.name || 'Slide ' + (i+1)}')">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          View Doubts
        </button>` : ''}
        <div class="tl-ov">
          <span class="tl-ts">${fmt(s.timestamp)}</span>
        </div>
      </div>`;
    });
  } 
  // Show empty state
  else { 
    tlH += '<div class="no-items">No slides available</div>'; 
  }
  tlH += '</div>';

  let attH = '';
  function grp(items, label){
    if(!items || !items.length) return '';
    let h = `<div style="margin-top: 14px; margin-bottom: 8px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; padding: 0 4px;">${label} (${items.length})</div>`;
    items.forEach((it, i) => {
      const nm = it.name || it.title || (label + ' ' + (i + 1));
      const safeUrl = (it.url || '').replace(/'/g, "\\'");
      const safeName = nm.replace(/'/g, "\\'");
      const sub = label === 'Notes' ? 'Class Notes' : 'Practice Sheet';
      h += `
      <div class="att-row">
        <div class="att-icon-box">
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <span class="att-badge-tag">PDF</span>
        </div>
        <div class="att-info">
          <span class="att-title-text" title="${nm}">${nm}</span>
          <span class="att-meta-text">${sub}</span>
        </div>
        <div class="att-action-buttons">
          <button class="att-btn-circle" title="Preview PDF" onclick="openDocumentPreview('${safeUrl}','${safeName}')">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="att-btn-circle" title="Open in new tab" onclick="window.open('${safeUrl}','_blank','noopener')">
            <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button class="att-btn-circle" title="Download" onclick="downloadDocument('${safeUrl}','${safeName}')">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </div>`;
    });
    return h;
  }
  
  if (attachmentsLoading) {
    attH = `
      <div class="no-items" style="padding: 40px 20px; text-align: center;">
        <div class="loading-spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Loading attachments...</p>
      </div>
    `;
  } else if (attachmentsLoaded) {
    attH += grp(classNotes, 'Notes');
    attH += grp(practiceSheets, 'DPP');
    if(!attH) attH = '<div class="no-items">No attachments available</div>';
  } else {
    attH = '<div class="no-items" style="padding: 40px 20px;">Loading attachments...</div>';
  }

  return `
    <div class="panel-hdr">
      <span class="panel-hdr-title" id="panelTitleTxt">Timeline</span>
      <button class="panel-close" onclick="hideSidebar()">
        <svg viewBox="0 0 24 24" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="panel-tabs" id="panelTabsArea">
      <button class="ptab active" data-tab="tl" onclick="switchTabView(this,'tl')">
        <svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="1.5" d="M3.167 5.583a.083.083 0 01.166 0v12.834a.083.083 0 01-.167 0V5.583zM5.667 17.333a1 1 0 001 1h10.666a1 1 0 001-1V6.667a1 1 0 00-1-1H6.667a1 1 0 00-1 1v10.666zm4.888-3.3V9.966L13.945 12l-3.39 2.034zM20.666 5.583a.083.083 0 11.167 0v12.834a.083.083 0 01-.166 0V5.583z"/></svg>
        Timeline
      </button>
      <button class="ptab" data-tab="att" onclick="switchTabView(this,'att')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attachments
      </button>
    </div>
    <div class="panel-body" id="mainPanelBody">
      <div class="ptab-panel active" data-p="tl">${tlH}</div>
      <div class="ptab-panel" data-p="playlist">
        <div id="playlistContent">
          <div class="no-items" style="padding: 40px 20px;">Loading playlist...</div>
        </div>
        <div id="playlistLoadMore" style="display:none; padding: 16px; text-align: center;">
          <button class="load-more-btn" onclick="loadMorePlaylist()">Load More</button>
        </div>
      </div>
      <div class="ptab-panel" data-p="att">
        ${attH}
      </div>
    </div>
    <div class="pdf-preview-wrap" id="pdfPreviewWrap" style="display:none;flex:1;min-height:0">
      <div class="pdf-preview-topbar">
        <button class="pdf-back-btn" onclick="closeDocumentPreview(this.closest('.panel-inner'))">
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>
        <span class="pdf-preview-title" id="pdfPreviewTitle"></span>
        <button class="pdf-fullscreen-btn" title="Fullscreen PDF" onclick="openPdfFullscreen()">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
      <div class="pdf-frame-container" id="pdfFrameContainer">
        <div class="pdf-loading"><div class="spinner"></div><p>Loading PDF…</p></div>
      </div>
    </div>`;
}

const PHTML = generateSidebarContent();
document.getElementById('desktopPanelContent').innerHTML = PHTML;
document.getElementById('mobilePanelContent').innerHTML = PHTML;

function switchTabView(btn, tab){
  console.log('🔄 switchTabView called with tab:', tab);
  const pi = btn.closest('.panel-inner');
  pi.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  pi.querySelectorAll('.ptab-panel').forEach(p => p.classList.toggle('active', p.dataset.p === tab));
  const tabsArea = pi.querySelector('#panelTabsArea');
  if (tabsArea) {
    if (tab === 'playlist') {
      tabsArea.style.display = 'none';
    } else {
      tabsArea.style.display = 'flex';
    }
  }
  
  const titleEl = pi.querySelector('.panel-hdr-title');
  if(titleEl) {
    if(tab === 'tl') titleEl.textContent = 'Timeline';
    else if(tab === 'playlist') titleEl.textContent = 'Batch Playlist';
    else titleEl.textContent = 'Attachments';
  }
  
  // Handle timeline tab
  if(tab === 'tl') {
    updateActiveSlide(true);
    
    // Check if timeline content exists in DOM
    const timelineList = pi.querySelector('.tl-list');
    const hasSlides = timelineList && timelineList.querySelectorAll('.tl-card').length > 0;
    
    console.log('📊 Timeline has slides in DOM:', hasSlides);
    
    // If no slides in DOM, load them
    if (!hasSlides) {
      console.log('📊 Timeline tab opened via tab button, loading slides...');
      loadTimelineSlides().then(() => {
        console.log('✅ Timeline slides loaded, regenerating content');
        // Regenerate sidebar content with loaded slides
        const PHTML = generateSidebarContent();
        document.getElementById('desktopPanelContent').innerHTML = PHTML;
        document.getElementById('mobilePanelContent').innerHTML = PHTML;
        
        // Re-activate the correct tab after regeneration
        const newPi = btn.closest('.panel-inner');
        newPi.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        newPi.querySelectorAll('.ptab-panel').forEach(p => p.classList.toggle('active', p.dataset.p === tab));
        
        // Scroll to active slide after content is loaded
        setTimeout(() => {
          console.log('📊 Timeline opened - scrolling to active slide');
          scrollToActiveSlide();
        }, 300);
      }).catch(err => {
        console.error('❌ Error in loadTimelineSlides:', err);
      });
    }
  }
  
  // Handle playlist tab
  if(tab === 'playlist') {
    console.log('🎵 Playlist tab opened via tab button');
    console.log('📊 Playlist data length:', playlistData.length);
    
    // Check if playlist content exists in DOM
    const playlistContainers = document.querySelectorAll('#playlistContent');
    const hasContent = Array.from(playlistContainers).some(container => 
      container.querySelector('.playlist-list')
    );
    
    console.log('📊 Has playlist content in DOM:', hasContent);
    
    // If we have data but no content in DOM, re-render
    if (playlistData.length > 0 && !hasContent) {
      console.log('🔄 Re-rendering existing playlist data');
      renderPlaylist();
    } 
    // If no data at all, load from API
    else if (playlistData.length === 0) {
      console.log('🔄 Loading playlist from API...');
      loadPlaylist();
    }
  }

  // Handle attachments tab
  if(tab === 'att') {
    console.log('📎 Attachments tab opened via tab button');
    loadAttachments();
  }
}

function showSidebar(tab){
  console.log('🎬 showSidebar() called with tab:', tab);
  
  activeTabType = tab || 'tl'; sidebarVisible = true;
  if(checkDesktopView()){
    document.getElementById('bottom-panel').classList.remove('open');
    const deskPi = document.getElementById('desktopPanelContent');
    const pw = deskPi.querySelector('#pdfPreviewWrap');
    if(pw && pw.style.display !== 'none') closeDocumentPreview(deskPi);
    setActiveTab(deskPi, activeTabType);
    document.getElementById('side-panel').classList.add('open');
  } else {
    document.getElementById('side-panel').classList.remove('open');
    const mobPi = document.getElementById('mobilePanelContent');
    const pw = mobPi.querySelector('#pdfPreviewWrap');
    if(pw && pw.style.display !== 'none') closeDocumentPreview(mobPi);
    setActiveTab(mobPi, activeTabType);
    document.getElementById('bottom-panel').classList.add('open');
  }
  
  // ✅ Load timeline slides lazily when timeline opens
  if(activeTabType === 'tl') {
    console.log('📊 Timeline tab opened, loading slides...');
    loadTimelineSlides().then(() => {
      console.log('✅ Timeline slides loaded, regenerating content');
      // Regenerate sidebar content with loaded slides
      const PHTML = generateSidebarContent();
      document.getElementById('desktopPanelContent').innerHTML = PHTML;
      document.getElementById('mobilePanelContent').innerHTML = PHTML;
      
      // Scroll to active slide after content is loaded
      setTimeout(() => {
        console.log('📊 Timeline opened - scrolling to active slide');
        scrollToActiveSlide();
      }, 300);
    }).catch(err => {
      console.error('❌ Error in loadTimelineSlides:', err);
    });
  }

  // ✅ Load attachments lazily when attachments opens
  if(activeTabType === 'att') {
    console.log('📎 Attachments tab opened, loading attachments...');
    loadAttachments();
  }
}

function hideSidebar(){
  sidebarVisible = false;
  document.getElementById('bottom-panel').classList.remove('open');
  document.getElementById('side-panel').classList.remove('open');
}

function setActiveTab(pi, tab){
  pi.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  pi.querySelectorAll('.ptab-panel').forEach(p => p.classList.toggle('active', p.dataset.p === tab));
  
  const tabsArea = pi.querySelector('#panelTabsArea');
  if (tabsArea) {
    if (tab === 'playlist') {
      tabsArea.style.display = 'none';
    } else {
      tabsArea.style.display = 'flex';
    }
  }
  
  const titleEl = pi.querySelector('.panel-hdr-title');
  if(titleEl) {
    if(tab === 'tl') titleEl.textContent = 'Timeline';
    else if(tab === 'playlist') titleEl.textContent = 'Batch Playlist';
    else titleEl.textContent = 'Attachments';
  }
}

document.getElementById('tlBtn').addEventListener('click', e => {
  e.stopPropagation();
  (sidebarVisible && activeTabType === 'tl') ? hideSidebar() : showSidebar('tl');
});

// ==================== PLAYLIST FUNCTIONALITY ====================
let playlistData = [];
let playlistPage = 1;
let playlistLoading = false;
let playlistHasMore = true;
let playlistVideoLoading = false; // Flag to prevent multiple clicks
const currentVideoId = document.getElementById('data-video-id')?.value || '';

document.getElementById('playlistBtn').addEventListener('click', e => {
  console.log('🎵 Playlist button clicked');
  e.stopPropagation();
  if (sidebarVisible && activeTabType === 'playlist') {
    console.log('🔄 Hiding sidebar');
    hideSidebar();
  } else {
    console.log('📂 Opening playlist panel');
    showSidebar('playlist');
    console.log('📊 Playlist data length:', playlistData.length);
    
    // Check if playlist content exists in DOM
    const playlistContainers = document.querySelectorAll('#playlistContent');
    const hasContent = Array.from(playlistContainers).some(container => 
      container.querySelector('.playlist-list')
    );
    
    console.log('📊 Has playlist content in DOM:', hasContent);
    
    // If we have data but no content in DOM, re-render
    if (playlistData.length > 0 && !hasContent) {
      console.log('🔄 Re-rendering existing playlist data');
      renderPlaylist();
    } 
    // If no data at all, load from API
    else if (playlistData.length === 0) {
      console.log('🔄 Loading playlist for first time...');
      loadPlaylist();
    }
  }
});

async function loadPlaylist(page = 1) {
  if (playlistLoading) return;
  
  const batchId = document.getElementById('data-batch-id')?.value || '';
  const subjectId = document.getElementById('data-subject-id')?.value || '';
  const topicId = document.getElementById('data-topic-id')?.value || '';
  
  console.log('📊 loadPlaylist called with:', { page, batchId, subjectId, topicId });
  
  if (!batchId || !subjectId || !topicId) {
    console.error('❌ Missing required parameters');
    const containers = document.querySelectorAll('#playlistContent');
    containers.forEach(container => {
      container.innerHTML = '<div class="no-items">Unable to load playlist<br><small>Missing required parameters</small></div>';
    });
    return;
  }
  
  playlistLoading = true;
  
  if (page > 1) {
    document.querySelectorAll('.load-more-btn').forEach(btn => {
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-btn-spinner"></span> Loading...';
    });
  }
  
  // Show loading state
  if (page === 1) {
    const containers = document.querySelectorAll('#playlistContent');
    containers.forEach(container => {
      container.innerHTML = '<div class="no-items" style="padding: 40px 20px;"><div class="spinner" style="margin: 0 auto 16px;"></div>Loading playlist...</div>';
    });
  }
  
  try {
    // Get valid token
    const token = await getValidToken();
    if (!token) {
      throw new Error('No auth token available');
    }
    
    // Fetch playlist from content API (Aligned with radha.js direct PW API)
    const url = `https://api.penpencil.co/v2/batches/634bd315ed7a360018558283/subject/${encodeURIComponent(subjectId)}/contents`
        + `?tag=${encodeURIComponent(topicId)}&contentType=videos&page=${page}`;
    
    console.log('📡 Fetching playlist:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Client-Id':      '5eb393ee95fab7468a79d189',
        'Client-Type':    'WEB',
        'Client-Version': '2.2.7',
        'Randomid':       crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        'Origin':         'https://www.pw.live',
        'Referer':        'https://www.pw.live/',
        'Accept':         'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Playlist data:', data);
    
    if (data.data && Array.isArray(data.data)) {
      // ✅ FIXED: Data structure is different - items are directly in data array
      const videos = data.data.filter(item => 
        item.isVideoLecture && 
        item.videoDetails && 
        item.videoDetails._id
      );
      
      console.log('📹 Filtered videos:', videos.length);
      
      if (page === 1) {
        playlistData = videos;
        renderPlaylist();
      } else {
        playlistData = [...playlistData, ...videos];
        appendPlaylist(videos);
      }
      
      // Check if there are more pages
      playlistHasMore = videos.length >= 20;
      const loadMoreBtns = document.querySelectorAll('#playlistLoadMore');
      loadMoreBtns.forEach(btn => {
        btn.style.display = playlistHasMore ? 'block' : 'none';
      });
      
      playlistPage = page;
    } else {
      if (page === 1) {
        const containers = document.querySelectorAll('#playlistContent');
        containers.forEach(container => {
          container.innerHTML = '<div class="no-items">No videos found in playlist</div>';
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Playlist error:', error);
    if (page === 1) {
      const containers = document.querySelectorAll('#playlistContent');
      containers.forEach(container => {
        container.innerHTML = '<div class="no-items">Failed to load playlist<br><small>Please try again</small></div>';
      });
    }
  } finally {
    playlistLoading = false;
    document.querySelectorAll('.load-more-btn').forEach(btn => {
      btn.disabled = false;
      btn.innerHTML = 'Load More';
    });
  }
}

function renderPlaylist() {
  const containers = document.querySelectorAll('#playlistContent');
  
  if (playlistData.length === 0) {
    containers.forEach(container => {
      container.innerHTML = '<div class="no-items">No videos in playlist</div>';
    });
    return;
  }
  
  const html = playlistData.map(item => createPlaylistItem(item)).join('');
  containers.forEach(container => {
    container.innerHTML = `<div class="playlist-list">${html}</div>`;
  });
}

function appendPlaylist(videos) {
  const lists = document.querySelectorAll('.playlist-list');
  if (!lists.length) return;
  
  const html = videos.map(item => createPlaylistItem(item)).join('');
  lists.forEach(list => {
    list.insertAdjacentHTML('beforeend', html);
  });
}

function createPlaylistItem(item) {
  // ✅ FIXED: Data structure - videoDetails is directly in item
  const videoId = item._id || '';
  const title = item.topic || 'Untitled Video';
  const poster = item.videoDetails?.image || '';
  const duration = formatDuration(item.videoDetails?.duration || 0);
  const isPlaying = videoId === currentVideoId;
  
  return `
    <div class="playlist-item ${isPlaying ? 'playing' : ''}" onclick="playPlaylistVideo('${videoId}', '${title.replace(/'/g, "\\'")}', '${poster}')">
      <div class="playlist-thumb">
        ${poster ? `<img src="${poster}" alt="${title}" loading="lazy">` : ''}
        <div class="playlist-duration">${duration}</div>
      </div>
      <div class="playlist-info">
        <div class="playlist-title">${title}</div>
        <div class="playlist-meta">
          ${isPlaying ? '<div class="playlist-playing-badge"><span class="playlist-playing-icon"></span>Now Playing</div>' : ''}
        </div>
      </div>
    </div>
  `;
}

function formatDuration(duration) {
  // Handle empty/null duration
  if (!duration) return '0:00';
  
  // If duration is already a string in HH:MM:SS or MM:SS format, return as is
  if (typeof duration === 'string') {
    // Check if it's in HH:MM:SS format
    if (duration.match(/^\d{2}:\d{2}:\d{2}$/)) {
      // Convert to H:MM:SS or MM:SS format (remove leading zero from hours)
      const parts = duration.split(':');
      const hours = parseInt(parts[0]);
      const mins = parts[1];
      const secs = parts[2];
      
      if (hours > 0) {
        return `${hours}:${mins}:${secs}`;
      } else {
        return `${parseInt(mins)}:${secs}`;
      }
    }
    // If already in MM:SS format, return as is
    if (duration.match(/^\d{1,2}:\d{2}$/)) {
      return duration;
    }
  }
  
  // If duration is a number (seconds), convert to MM:SS format
  if (typeof duration === 'number') {
    const mins = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  return '0:00';
}

function loadMorePlaylist() {
  if (!playlistLoading && playlistHasMore) {
    loadPlaylist(playlistPage + 1);
  }
}

function playPlaylistVideo(videoId, title, poster) {
  // Prevent multiple clicks - rate limit protection
  if (playlistVideoLoading) {
    console.log('⚠️ Video already loading, ignoring click');
    return;
  }
  
  console.log('🎬 Playing playlist video:', videoId);
  playlistVideoLoading = true;
  
  // Disable entire playlist section
  const playlistContainers = document.querySelectorAll('#playlistContent');
  playlistContainers.forEach(container => {
    container.style.pointerEvents = 'none';
    container.style.opacity = '0.6';
  });
  
  // Disable load more button
  const loadMoreBtns = document.querySelectorAll('#playlistLoadMore');
  loadMoreBtns.forEach(btn => {
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.6';
  });
  
  const batchId = document.getElementById('data-batch-id')?.value || '';
  const subjectId = document.getElementById('data-subject-id')?.value || '';
  const topicId = document.getElementById('data-topic-id')?.value || '';
  
  // Build URL
  const url = new URL('play.php', window.location.href);
  url.searchParams.append('video_id', videoId);
  url.searchParams.append('batch_id', batchId);
  url.searchParams.append('subject_id_original', subjectId);
  url.searchParams.append('topic_id', topicId);
  url.searchParams.append('title', title);
  if (poster) url.searchParams.append('poster', poster);
  // Forward slugs from current page so back button works on next video too
  const curParams = new URLSearchParams(window.location.search);
  const subjectSlug = curParams.get('subject_slug');
  const topicSlug   = curParams.get('topic_slug');
  if (subjectSlug) url.searchParams.append('subject_slug', subjectSlug);
  if (topicSlug)   url.searchParams.append('topic_slug', topicSlug);
  
  // Check if Turnstile security is active
  if (isTurnstileEnabled()) {
    playlistVideoLoading = true;
    
    // Disable entire playlist section
    document.querySelectorAll('#playlistContent').forEach(container => {
      container.style.pointerEvents = 'none';
      container.style.opacity = '0.6';
    });
    
    // Disable load more button
    document.querySelectorAll('#playlistLoadMore').forEach(btn => {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.6';
    });
    
    showTurnstileModal(url.toString());
    return;
  }
  
  // Show loading overlay if turnstile is not enabled
  const ovLoad = document.getElementById('ovLoad');
  const loadMsg = document.getElementById('loadMsg');
  if (ovLoad && loadMsg) {
    ovLoad.classList.remove('off');
    loadMsg.textContent = 'Loading video...';
  }
  
  console.log('🎬 Redirecting to:', url.toString());
  
  // Small delay to ensure UI updates are visible
  setTimeout(() => {
    window.location.replace(url.toString());
  }, 100);
}

// ==================== NEXT VIDEO POPUP ====================
let nextVideoData = null;

function showNextVideoPopup() {
  console.log('🎬 Video ended, checking for next video...');
  
  // Get next video from playlist
  if (playlistData.length === 0) {
    console.log('⚠️ No playlist data available');
    return;
  }
  
  const currentVideoId = document.getElementById('data-video-id')?.value || '';
  const currentIndex = playlistData.findIndex(item => item._id === currentVideoId);
  
  console.log('📊 Current video index:', currentIndex, 'Total videos:', playlistData.length);
  
  if (currentIndex === -1 || currentIndex >= playlistData.length - 1) {
    console.log('⚠️ No next video available (last video or not found)');
    return;
  }
  
  // Get next video
  const nextVideo = playlistData[currentIndex + 1];
  nextVideoData = nextVideo;
  
  console.log('✅ Next video found:', nextVideo.topic);
  
  // Update popup with next video info
  const popup = document.getElementById('nextVideoPopup');
  const titleEl = document.getElementById('nextVideoTitle');
  
  if (titleEl) {
    titleEl.textContent = nextVideo.topic || 'Next Video';
  }
  
  // Show popup
  if (popup) {
    popup.style.display = 'flex';
  }
}

function hideNextVideoPopup() {
  const popup = document.getElementById('nextVideoPopup');
  if (popup) {
    popup.style.display = 'none';
  }
  nextVideoData = null;
}

function playNextVideo() {
  if (!nextVideoData) {
    console.log('⚠️ No next video data available');
    return;
  }
  
  console.log('▶️ Playing next video:', nextVideoData.topic);
  
  const videoId = nextVideoData._id;
  const title = nextVideoData.topic || 'Untitled Video';
  const poster = nextVideoData.videoDetails?.image || '';
  
  // Hide popup
  hideNextVideoPopup();
  
  // Play the video using the same function as playlist
  playPlaylistVideo(videoId, title, poster);
}

// Event listeners for next video popup buttons
document.addEventListener('DOMContentLoaded', () => {
  const yesBtn = document.getElementById('nextVideoYes');
  const noBtn = document.getElementById('nextVideoNo');
  
  if (yesBtn) {
    yesBtn.addEventListener('click', () => {
      console.log('✅ User clicked Yes - playing next video');
      playNextVideo();
    });
  }
  
  if (noBtn) {
    noBtn.addEventListener('click', () => {
      console.log('❌ User clicked No - closing popup');
      hideNextVideoPopup();
    });
  }
  
  // Load playlist in background for next video feature
  console.log('📊 Loading playlist in background for next video feature...');
  setTimeout(() => {
    if (playlistData.length === 0) {
      loadPlaylist().catch(err => {
        console.log('⚠️ Failed to load playlist for next video feature:', err);
      });
    }
  }, 2000); // Load after 2 seconds to not interfere with video loading
});

function jumpToTimestamp(ts){
  console.log('🎯 Jump to timestamp:', ts);
  const v = window.mediaPlayer;
  
  if(!v) {
    console.error('❌ mediaPlayer not found');
    return;
  }
  
  if(!isFinite(v.duration)) {
    console.error('❌ Video duration not ready:', v.duration);
    return;
  }
  
  if(v.duration <= 0) {
    console.error('❌ Video duration is 0');
    return;
  }
  
  console.log('✅ Jumping to:', ts, 'seconds');
  v.currentTime = ts;
  v.play().catch(e => console.error('Play error:', e));
  
  // Force update and scroll immediately
  setTimeout(() => {
    scrollToActiveSlide();
  }, 200);
  
  // Don't hide sidebar on desktop
  if(!checkDesktopView()) {
    setTimeout(() => hideSidebar(), 500);
  }
}

function scrollToActiveSlide() {
  if(!timelineSlides || !timelineSlides.length || !window.mediaPlayer) return;
  
  const ct = window.mediaPlayer.currentTime;
  let idx = -1;
  
  // Find the correct slide index based on current time
  // Slide is active if: time >= slide.timestamp AND time < next_slide.timestamp
  for(let i = 0; i < timelineSlides.length; i++){
    const currentSlide = timelineSlides[i];
    const nextSlide = timelineSlides[i + 1];
    
    if (nextSlide) {
      // Check if time is between current and next slide
      if (ct >= currentSlide.timestamp && ct < nextSlide.timestamp) {
        idx = i;
        break;
      }
    } else {
      // Last slide - check if time >= timestamp
      if (ct >= currentSlide.timestamp) {
        idx = i;
        break;
      }
    }
  }
  
  // If no match found, use first slide
  if (idx === -1 && timelineSlides.length > 0) {
    idx = 0;
  }
  
  console.log('📊 Current time:', ct, '→ Slide index:', idx);
  
  // Update all cards
  const cards = document.querySelectorAll('.tl-card');
  cards.forEach((el, i) => {
    const isActive = i === idx;
    el.classList.toggle('cur', isActive);
  });
  
  // Find active panel and scroll
  const desktopPanel = document.getElementById('desktopPanelContent');
  const mobilePanel = document.getElementById('mobilePanelContent');
  const activePanel = checkDesktopView() ? desktopPanel : mobilePanel;
  
  if(activePanel && idx >= 0) {
    const curCard = cards[idx];
    
    if(curCard) {
      console.log('📜 Scrolling to slide', idx, 'at timestamp', timelineSlides[idx].timestamp);
      
      // Get the scrollable container
      const scrollContainer = activePanel.querySelector('.tl-list') || activePanel;
      
      // Use scrollIntoView with better options
      curCard.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }
}

function updateActiveSlide(doScroll){
  if(!timelineSlides || !timelineSlides.length || !window.mediaPlayer) return;
  
  const ct = window.mediaPlayer.currentTime;
  let idx = -1;
  
  // Find the correct slide index
  for(let i = 0; i < timelineSlides.length; i++){
    const currentSlide = timelineSlides[i];
    const nextSlide = timelineSlides[i + 1];
    
    if (nextSlide) {
      if (ct >= currentSlide.timestamp && ct < nextSlide.timestamp) {
        idx = i;
        break;
      }
    } else {
      if (ct >= currentSlide.timestamp) {
        idx = i;
        break;
      }
    }
  }
  
  if (idx === -1 && timelineSlides.length > 0) {
    idx = 0;
  }
  
  // Update all cards
  document.querySelectorAll('.tl-card').forEach((el, i) => {
    el.classList.toggle('cur', i === idx);
  });
  
  // Scroll if needed
  if(doScroll && idx >= 0){
    const activePI = checkDesktopView() ? document.getElementById('desktopPanelContent') : document.getElementById('mobilePanelContent');
    const cards = document.querySelectorAll('.tl-card');
    const curCard = cards[idx];
    
    if(curCard && activePI) {
      curCard.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }
}

(function(){
'use strict';

const vid        = document.getElementById('vid'); window.mediaPlayer = vid;
const overlay    = document.getElementById('ctrl-overlay');
const tapShield  = document.getElementById('tap-shield');
const playBtn    = document.getElementById('playBtn');
const iPlay      = document.getElementById('iPlay');
const iPause     = document.getElementById('iPause');
const rwBtn      = document.getElementById('rwBtn');
const fwBtn      = document.getElementById('fwBtn');
const muteBtn    = document.getElementById('muteBtn');
const volIcon    = document.getElementById('volIcon');
const volBar     = document.getElementById('volBar');
const seekBar    = document.getElementById('seekBar');
const barFill    = document.getElementById('barFill');
const barBuf     = document.getElementById('barBuf');
const barThumb   = document.getElementById('barThumb');
const curTime    = document.getElementById('curTime');
const durTime    = document.getElementById('durTime');
const spdBadge   = document.getElementById('spdBadge');
const liveBadge  = document.getElementById('liveBadge');
const settBtn    = document.getElementById('settBtn');
const settPanel  = document.getElementById('settPanel');
const settBd     = document.getElementById('settBd');
const sMain      = document.getElementById('sMain');
const sSpeedSub  = document.getElementById('sSpeedSub');
const sQualSub   = document.getElementById('sQualSub');
const sSpeedRow  = document.getElementById('sSpeedRow');
const sQualRow   = document.getElementById('sQualRow');
const sSpeedBack = document.getElementById('sSpeedBack');
const sQualBack  = document.getElementById('sQualBack');
const sSpeedVal  = document.getElementById('sSpeedVal');
const sQualVal   = document.getElementById('sQualVal');
const fsBtn      = document.getElementById('fsBtn');
const iFs        = document.getElementById('iFs');
const ovLoad     = document.getElementById('ovLoad');
const loadMsg    = document.getElementById('loadMsg');
const ovErr      = document.getElementById('ovErr');
const errMsg     = document.getElementById('errMsg');
const retryBtn   = document.getElementById('retryBtn');
const bufSpin    = document.getElementById('bufSpin');

let streamEngine = null, dashEngine = null, previousMediaConfig = null, playerReady = false;
let playing = false, seekInProgress = false, liveMode = false, settingsVisible = false;
let liveBadgeLocked = false; // Lock to prevent state changes during seeking
let playerControlsLocked = false;

vid.volume = 1; vid.muted = false; volBar.value = 100;

function refreshVolumeIcon(){
  const muted = vid.muted || vid.volume === 0;
  if(muted){
    volIcon.innerHTML = `<path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.25 9.75l4.5 4.5m0-4.5-4.5 4.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    volIcon.setAttribute('fill', 'none');
  } else if(vid.volume < 0.5){
    volIcon.innerHTML = `<path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" fill="white"/>`;
    volIcon.setAttribute('fill', 'white');
  } else {
    volIcon.innerHTML = `<path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"/><path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" fill="white"/>`;
    volIcon.setAttribute('fill', 'white');
  }
}

let controlsTimer = null;

function scheduleControlsHide(){
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(hideControlsOverlay, 4000);
}

function displayControls(){
  const lockOverlayShield = document.getElementById('lock-overlay-shield');
  if (playerControlsLocked) {
    if (lockOverlayShield) lockOverlayShield.classList.remove('hidden-fade');
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  overlay.classList.add('visible');
  tapShield.classList.remove('on');
  if (lockOverlayShield) lockOverlayShield.classList.remove('hidden-fade');
}

function hideControlsOverlay(){
  if(settingsVisible) return;
  overlay.classList.remove('visible');
  overlay.classList.add('hidden');
  tapShield.classList.add('on');
  
  const lockOverlayShield = document.getElementById('lock-overlay-shield');
  if (lockOverlayShield) {
    lockOverlayShield.classList.add('hidden-fade');
  }
}

let _lockFlashTimer = null;
function flashLockIcon() {
  const shield = document.getElementById('lock-overlay-shield');
  if (!shield) return;
  // Make visible
  shield.classList.remove('hidden-fade');
  // Trigger pulse animation
  shield.classList.remove('lock-flash');
  void shield.offsetWidth; // reflow to restart animation
  shield.classList.add('lock-flash');
  // Auto-hide after 2.5s
  clearTimeout(_lockFlashTimer);
  _lockFlashTimer = setTimeout(() => {
    shield.classList.remove('lock-flash');
    if (playerControlsLocked) {
      shield.classList.add('hidden-fade');
    }
  }, 2500);
}


function handleUserAction(){
  // Portrait mode: still show controls on tap — just don't auto-hide by mouse-move
  displayControls();
  scheduleControlsHide();
}

function handleScreenTap(e, fromTapShield) {
  if (playerControlsLocked) {
    flashLockIcon();
    return;
  }
  
  // Touch/mobile tap-shield → only show/hide controls, never toggle playback
  // Play/pause is done via the dedicated play button
  const isTouchDevice = 'ontouchstart' in window;
  const isDesktopMouseClick = e.type === 'click' && !isTouchDevice;
  
  // Toggle playback only on:
  // 1. Desktop mouse click anywhere, OR
  // 2. Tap on ctrl-mid (the centre button area) — fromTapShield=false
  if (isDesktopMouseClick || !fromTapShield) {
    togglePlayback();
  }
  // Mobile tap on tap-shield: just show controls (handleUserAction below handles it)
  
  handleUserAction();
}

tapShield.addEventListener('click', e => {
  e.stopPropagation(); e.preventDefault();
  handleScreenTap(e, true);
}, { passive: false });

tapShield.addEventListener('touchend', e => {
  e.stopPropagation(); e.preventDefault();
  handleScreenTap(e, true);
}, { passive: false });

document.getElementById('ctrl-mid').addEventListener('click', e => { 
  e.stopPropagation(); 
  handleScreenTap(e, false); 
});
document.getElementById('video-col').addEventListener('mousemove', e => {
  // Only trigger on mouse-move (not touch) — avoid firing in portrait touch devices
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  handleUserAction();
});

function updatePlayState(p){
  playing = p;
  iPlay.style.display = p ? 'none' : 'block';
  iPause.style.display = p ? 'block' : 'none';
  if(!checkPortraitMode()){
    displayControls();
    scheduleControlsHide();
  }
}

function togglePlayback(){ if(vid.paused) vid.play(); else vid.pause(); }

playBtn.addEventListener('click', e => { e.stopPropagation(); togglePlayback(); handleUserAction(); });

// Live badge click - go to live edge when behind
liveBadge.addEventListener('click', e => {
  e.stopPropagation();
  if (liveMode && liveBadge.classList.contains('behind') && !liveBadge.classList.contains('seeking')) {
    console.log('🔴 Going to live edge');
    
    // Lock the badge state to prevent changes during seeking
    liveBadgeLocked = true;
    
    // Show seeking state
    liveBadge.classList.add('seeking');
    liveBadge.classList.remove('behind');
    const liveText = liveBadge.querySelector('.live-text');
    const goLiveText = liveBadge.querySelector('.go-live-text');
    const seekingSpinner = liveBadge.querySelector('.seeking-spinner');
    const liveDot = liveBadge.querySelector('.live-dot');
    
    if (liveText) liveText.style.display = 'none';
    if (goLiveText) goLiveText.style.display = 'none';
    if (liveDot) liveDot.style.display = 'none';
    if (seekingSpinner) seekingSpinner.style.display = 'block';
    
    // Seek to live (4 seconds before max seekable live position)
    const livePosition = (vid.seekable && vid.seekable.length > 0) ? vid.seekable.end(vid.seekable.length - 1) : vid.duration;
    vid.currentTime = Math.max(0, (isFinite(livePosition) ? livePosition : vid.duration) - 4);
    
    // Wait for seeking to complete, then show LIVE state
    const onSeeked = () => {
      vid.removeEventListener('seeked', onSeeked);
      
      setTimeout(() => {
        liveBadge.classList.remove('seeking');
        if (liveText) liveText.style.display = 'block';
        if (goLiveText) goLiveText.style.display = 'none';
        if (liveDot) liveDot.style.display = 'block';
        if (seekingSpinner) seekingSpinner.style.display = 'none';
        
        // Unlock after a delay to ensure we're at live edge
        setTimeout(() => {
          liveBadgeLocked = false;
        }, 2000);
      }, 300);
    };
    
    vid.addEventListener('seeked', onSeeked);
    
    // Fallback timeout in case seeked event doesn't fire
    setTimeout(() => {
      if (liveBadgeLocked) {
        vid.removeEventListener('seeked', onSeeked);
        liveBadge.classList.remove('seeking');
        if (liveText) liveText.style.display = 'block';
        if (goLiveText) goLiveText.style.display = 'none';
        if (liveDot) liveDot.style.display = 'block';
        if (seekingSpinner) seekingSpinner.style.display = 'none';
        
        setTimeout(() => {
          liveBadgeLocked = false;
        }, 2000);
      }
    }, 3000);
  }
  handleUserAction();
});
vid.addEventListener('playing', () => { bufSpin.classList.remove('on'); updatePlayState(true); });
vid.addEventListener('pause',   () => updatePlayState(false));
vid.addEventListener('ended',   () => { 
  updatePlayState(false); 
  showNextVideoPopup();
});
vid.addEventListener('waiting', () => { if (ovLoad.classList.contains('off')) bufSpin.classList.add('on'); });
vid.addEventListener('canplay', () => bufSpin.classList.remove('on'));
vid.addEventListener('seeking', () => { if (ovLoad.classList.contains('off')) bufSpin.classList.add('on'); });
vid.addEventListener('seeked',  () => { bufSpin.classList.remove('on'); });

function adjustTime(s){ vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + s)); }
function playSeekAnimation(b, c){ b.classList.remove('anim-l', 'anim-r'); void b.offsetWidth; b.classList.add(c); setTimeout(() => b.classList.remove(c), 360); }

rwBtn.addEventListener('click', e => { e.stopPropagation(); adjustTime(-10); playSeekAnimation(rwBtn, 'anim-l'); handleUserAction(); });
fwBtn.addEventListener('click', e => { e.stopPropagation(); adjustTime(10);  playSeekAnimation(fwBtn, 'anim-r'); handleUserAction(); });

function refreshProgressBar(){
  if(!vid.duration) return;
  const p = vid.currentTime / vid.duration * 100;
  barFill.style.width = p + '%'; barThumb.style.left = p + '%';
  seekBar.value = Math.round(vid.currentTime / vid.duration * 1000);
  curTime.textContent = fmt(vid.currentTime);
}

seekBar.addEventListener('input', () => {
  seekInProgress = true; handleUserAction();
  if(vid.duration && isFinite(vid.duration)){
    const p = seekBar.value / 1000;
    vid.currentTime = p * vid.duration;
    barFill.style.width = (p * 100) + '%'; barThumb.style.left = (p * 100) + '%';
    curTime.textContent = fmt(vid.currentTime);
  }
});
seekBar.addEventListener('change', () => { seekInProgress = false; });

// ✅ OPTIMIZED: Throttled timeupdate for better performance + Progress Saving
let lastTimeUpdate = 0;
let lastProgressSave = 0;
const TIME_UPDATE_THROTTLE = 250; // Update every 250ms instead of every frame
const PROGRESS_SAVE_INTERVAL = 5000; // Save progress every 5 seconds

// ✅ Get video ID and metadata for progress tracking
const videoId = mediaConfig.video_id || '';
const batchId = mediaConfig.batch_id || '';
const videoTitle = contentTitle || 'Video';
const videoPoster = new URLSearchParams(window.location.search).get('poster') || '';
const topicId = new URLSearchParams(window.location.search).get('topic_id') || '';
const subjectId = new URLSearchParams(window.location.search).get('subject_id_original') || '';

// ✅ Function to save video progress with ALL parameters
function saveVideoProgress(currentTime, duration) {
  if (!videoId || !currentTime || !duration) return;
  
  const progressData = {
    video_id: videoId,
    batch_id: batchId,
    topic_id: topicId,
    subject_id: subjectId,
    title: videoTitle,
    poster: videoPoster,
    current_time: Math.floor(currentTime),
    duration: Math.floor(duration),
    percentage: Math.floor((currentTime / duration) * 100),
    timestamp: Date.now(),
    // Format duration for display
    duration_formatted: fmt(duration),
    current_time_formatted: fmt(currentTime)
  };
  
  // Save to localStorage
  const storageKey = `video_progress_${videoId}`;
  localStorage.setItem(storageKey, JSON.stringify(progressData));
  
  // Also save to a global progress list for continue watching
  const allProgress = JSON.parse(localStorage.getItem('all_video_progress') || '{}');
  allProgress[videoId] = progressData;
  
  // ✅ Limit to maximum 10 videos in continue watching
  const MAX_CONTINUE_WATCHING = 10;
  const progressArray = Object.values(allProgress);
  
  if (progressArray.length > MAX_CONTINUE_WATCHING) {
    // Sort by timestamp (oldest first)
    progressArray.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest videos
    const toRemove = progressArray.length - MAX_CONTINUE_WATCHING;
    for (let i = 0; i < toRemove; i++) {
      delete allProgress[progressArray[i].video_id];
      // Also remove individual progress entry
      localStorage.removeItem(`video_progress_${progressArray[i].video_id}`);
    }
    
    console.log(`🗑️ Removed ${toRemove} oldest videos from continue watching`);
  }
  
  localStorage.setItem('all_video_progress', JSON.stringify(allProgress));
  
  console.log('📊 Progress saved:', Math.floor(currentTime), 'seconds');
}

// ✅ Function to load saved progress
function loadVideoProgress() {
  if (!videoId) return null;
  
  const storageKey = `video_progress_${videoId}`;
  const saved = localStorage.getItem(storageKey);
  
  if (saved) {
    try {
      const data = JSON.parse(saved);
      console.log('✅ Found saved progress:', data.current_time, 'seconds');
      return data;
    } catch (e) {
      console.warn('⚠️ Failed to parse saved progress');
    }
  }
  
  return null;
}

vid.addEventListener('timeupdate', () => {
  if(seekInProgress) return;
  
  const now = Date.now();
  if (now - lastTimeUpdate < TIME_UPDATE_THROTTLE) return;
  lastTimeUpdate = now;
  
  refreshProgressBar();
  if(liveMode && isFinite(vid.duration)) durTime.textContent = fmt(vid.duration);
  updateActiveSlide(false);
  
  // ✅ Update live badge state for live streams (with lock to prevent glitching)
  if (liveMode && !liveBadge.classList.contains('seeking') && !liveBadgeLocked) {
    const livePosition = (vid.seekable && vid.seekable.length > 0) ? vid.seekable.end(vid.seekable.length - 1) : vid.duration;
    const timeBehindLive = isFinite(livePosition) ? (livePosition - vid.currentTime) : 0;
    
    const liveText = liveBadge.querySelector('.live-text');
    const goLiveText = liveBadge.querySelector('.go-live-text');
    const liveDot = liveBadge.querySelector('.live-dot');
    
    if (timeBehindLive <= 10) {
      // Switch back to LIVE state
      liveBadge.classList.remove('behind');
      if (liveText) liveText.style.display = 'block';
      if (goLiveText) goLiveText.style.display = 'none';
      if (liveDot) liveDot.style.display = 'block';
    } else {
      // Switch to GO LIVE state
      liveBadge.classList.add('behind');
      if (liveText) liveText.style.display = 'none';
      if (goLiveText) goLiveText.style.display = 'block';
      if (liveDot) liveDot.style.display = 'block';
    }
  }
  
  // ✅ Save progress every 5 seconds
  if (now - lastProgressSave >= PROGRESS_SAVE_INTERVAL && vid.currentTime > 0 && vid.duration > 0) {
    lastProgressSave = now;
    saveVideoProgress(vid.currentTime, vid.duration);
  }
}, { passive: true });
vid.addEventListener('loadedmetadata', () => { 
  if(isFinite(vid.duration) && vid.duration > 0) {
    durTime.textContent = fmt(vid.duration);
    
    // ✅ Auto-seek to last watched position
    const savedProgress = loadVideoProgress();
    if (savedProgress && savedProgress.current_time > 10 && savedProgress.current_time < vid.duration - 30) {
      console.log('⏩ Auto-seeking to', savedProgress.current_time, 'seconds');
      vid.currentTime = savedProgress.current_time;
    }
  }
}, { passive: true });
vid.addEventListener('progress', () => { if(vid.buffered.length && vid.duration) barBuf.style.width = (vid.buffered.end(vid.buffered.length - 1) / vid.duration * 100) + '%'; }, { passive: true });
function markLive(){ 
  if (liveMode) return;
  liveMode = true; 
  liveBadge.classList.add('on');
  liveBadge.style.display = 'flex';
  const liveText = liveBadge.querySelector('.live-text');
  const goLiveText = liveBadge.querySelector('.go-live-text');
  const liveDot = liveBadge.querySelector('.live-dot');
  if (liveText) liveText.style.display = 'block';
  if (goLiveText) goLiveText.style.display = 'none';
  if (liveDot) liveDot.style.display = 'block';
}

function updateVolumeSlider(){
  const v = volBar.value;
  volBar.style.background = `linear-gradient(to right,#fff ${v}%,rgba(255,255,255,.25) ${v}%)`;
}
volBar.addEventListener('input', () => { vid.volume = parseInt(volBar.value) / 100; vid.muted = false; updateVolumeSlider(); refreshVolumeIcon(); handleUserAction(); });
muteBtn.addEventListener('click', e => {
  e.stopPropagation();
  if(vid.muted || vid.volume === 0){ vid.muted = false; vid.volume = 1; volBar.value = 100; }
  else { vid.muted = true; volBar.value = 0; }
  updateVolumeSlider(); refreshVolumeIcon(); handleUserAction();
});

// Lock Button Toggle functionality
document.getElementById('lockBtn').addEventListener('click', e => {
  e.stopPropagation();
  playerControlsLocked = !playerControlsLocked;
  
  const lockIcon = document.getElementById('lockIcon');
  const lockOverlayShield = document.getElementById('lock-overlay-shield');
  
  const UNLOCKED_SVG = `
    <rect x="3" y="11" width="18" height="11" rx="3" ry="3" stroke="white" stroke-width="2.2" fill="none"/>
    <path d="M7 11V7a5 5 0 0 1 9.5-2" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="12" cy="16" r="1.5" fill="white"/>
  `;

  const LOCKED_SVG = `
    <rect x="3" y="11" width="18" height="11" rx="3" ry="3" stroke="white" stroke-width="2.2" fill="none"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="12" cy="16" r="1.5" fill="white"/>
  `;
  
  if (playerControlsLocked) {
    document.body.classList.add('player-locked');
    if (lockIcon) lockIcon.innerHTML = LOCKED_SVG;
    hideControlsOverlay();
    if (lockOverlayShield) lockOverlayShield.classList.remove('hidden-fade');
  } else {
    document.body.classList.remove('player-locked');
    if (lockIcon) lockIcon.innerHTML = UNLOCKED_SVG;
    displayControls();
    scheduleControlsHide();
  }
  handleUserAction();
});
vid.addEventListener('volumechange', refreshVolumeIcon);
vid.addEventListener('ratechange', () => {
  const currentSpeed = vid.playbackRate;
  const lbl = currentSpeed === 1 ? 'Normal' : currentSpeed + 'x';
  if (spdBadge) spdBadge.textContent = currentSpeed + 'x';
  if (sSpeedVal) sSpeedVal.textContent = lbl;
  localStorage.setItem('playerSpeed', currentSpeed.toString());
  const c = document.getElementById('sSpeedOpts');
  if (c) {
    c.querySelectorAll('.sopt').forEach(o => {
      const span = o.querySelector('span');
      if (span) {
        const text = span.textContent.trim();
        if (text === lbl || text === currentSpeed + 'x') {
          o.classList.add('active');
        } else {
          o.classList.remove('active');
        }
      }
    });
  }
});
updateVolumeSlider(); refreshVolumeIcon();

function displaySettingsView(v){ sMain.classList.toggle('off', v !== 'main'); sSpeedSub.classList.toggle('on', v === 'speed'); sQualSub.classList.toggle('on', v === 'quality'); }
function openSettingsPanel(){ settingsVisible = true; displaySettingsView('main'); settPanel.classList.add('on'); settBd.classList.add('on'); clearTimeout(controlsTimer); }
function closeSettingsPanel(){ settingsVisible = false; settPanel.classList.remove('on'); settBd.classList.remove('on'); displaySettingsView('main'); if(!checkPortraitMode()) scheduleControlsHide(); }

settBtn.addEventListener('click', e => { e.stopPropagation(); settingsVisible ? closeSettingsPanel() : openSettingsPanel(); });
settBd.addEventListener('click', closeSettingsPanel);
sSpeedRow.addEventListener('click', e => { e.stopPropagation(); displaySettingsView('speed'); });
sQualRow.addEventListener('click',  e => { e.stopPropagation(); displaySettingsView('quality'); });
sSpeedBack.addEventListener('click', e => { e.stopPropagation(); displaySettingsView('main'); });
sQualBack.addEventListener('click',  e => { e.stopPropagation(); displaySettingsView('main'); });

function generateSpeedOptions(){
  const c = document.getElementById('sSpeedOpts'); c.innerHTML = '';
  [0.25,0.5,0.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75,3,3.25,3.5,3.75,4,4.25,4.5,4.75,5,5.25,5.5,5.75,6].forEach(sp => {
    const lbl = sp === 1 ? 'Normal' : sp + 'x', d = document.createElement('div');
    d.className = 'sopt' + (sp === 1 ? ' active' : '');
    d.innerHTML = `<span>${lbl}</span><div class="radio"><div class="rdot"></div></div>`;
    d.onclick = e => { e.stopPropagation(); vid.playbackRate = sp; spdBadge.textContent = sp + 'x'; sSpeedVal.textContent = lbl; c.querySelectorAll('.sopt').forEach(o => o.classList.remove('active')); d.classList.add('active'); closeSettingsPanel(); };
    c.appendChild(d);
  });
}

function generateQualityOptions(levels){
  const c = document.getElementById('sQualOpts'); c.innerHTML = '';
  [{ label: 'Auto', value: -1 }, ...levels].forEach(lv => {
    const d = document.createElement('div'); d.className = 'sopt' + (lv.value === -1 ? ' active' : '');
    d.innerHTML = `<span>${lv.label}</span><div class="radio"><div class="rdot"></div></div>`;
    d.onclick = e => {
      e.stopPropagation(); sQualVal.textContent = lv.label;
      c.querySelectorAll('.sopt').forEach(o => o.classList.remove('active')); d.classList.add('active');
      if(streamEngine){ if(lv.value === -1){ streamEngine.autoLevelCapping = -1; streamEngine.nextLevel = -1; } else { streamEngine.autoLevelCapping = lv.value; streamEngine.nextLevel = lv.value; } }
      if(dashEngine){ try{ if(lv.value === -1) dashEngine.configure({ abr: { enabled: true } }); else { const t = dashEngine.getVariantTracks().find(t => t.id === lv.value); if(t){ dashEngine.configure({ abr: { enabled: false } }); dashEngine.selectVariantTrack(t, true); } } } catch {} }
      closeSettingsPanel();
    };
    c.appendChild(d);
  });
}
generateSpeedOptions(); generateQualityOptions([]);

fsBtn.addEventListener('click', e => {
  e.stopPropagation();
  const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if(fs)(document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else { const el = document.getElementById('shell'); if(el.requestFullscreen) el.requestFullscreen(); else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen(); }
});

function onFs(){
  const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if(fs){
    iFs.setAttribute('viewBox', '0 0 24 24'); iFs.setAttribute('fill', 'white');
    iFs.removeAttribute('stroke'); iFs.removeAttribute('stroke-width'); iFs.removeAttribute('stroke-linecap');
    iFs.innerHTML = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
    screen.orientation?.lock('landscape').catch(() => {});
  } else {
    iFs.setAttribute('viewBox', '0 0 24 24'); iFs.setAttribute('fill', 'none');
    iFs.setAttribute('stroke', 'white'); iFs.setAttribute('stroke-width', '2'); iFs.setAttribute('stroke-linecap', 'round');
    iFs.innerHTML = '<path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>';
  }
  setTimeout(updateLayoutMode, 50);
}
document.addEventListener('fullscreenchange', onFs);
document.addEventListener('webkitfullscreenchange', onFs);

function displayLoadingScreen(msg, stage){ bufSpin.classList.remove('on'); ovLoad.classList.remove('off'); loadMsg.textContent = msg + (stage ? ' — ' + stage : ''); ovErr.classList.remove('on'); }
function hideLoadingScreen(){ ovLoad.classList.add('off'); }
function displayErrorMessage(msg){ hideLoadingScreen(); errMsg.textContent = msg; ovErr.classList.add('on'); }

function extractSignatureParams(url){ try{ const u = new URL(url), p = new URLSearchParams(); u.searchParams.forEach((v,k) => { if(k.toLowerCase() !== 'start') p.append(k,v); }); return p.toString() ? '?' + p : ''; } catch { return ''; } }
function appendSignatureToUrl(target, sig){ if(!sig) return target; try{ const u = new URL(target); new URLSearchParams(sig.slice(1)).forEach((v,k) => { if(!u.searchParams.has(k)) u.searchParams.set(k,v); }); return u.toString(); } catch { return target; } }
function checkYouTubeUrl(u){ try{ return ['youtube.com','youtube-nocookie.com','youtu.be'].includes(new URL(u).hostname.replace('www.','')); } catch { return false; } }
function extractYouTubeId(u){ try{ const x = new URL(u); if(x.hostname.includes('youtu.be')) return x.pathname.slice(1).split('?')[0]; if(x.pathname.includes('/embed/')) return x.pathname.split('/embed/')[1].split(/[?/]/)[0]; if(x.searchParams.get('v')) return x.searchParams.get('v'); if(x.pathname.includes('/v/')) return x.pathname.split('/v/')[1].split(/[?/]/)[0]; } catch {} return ''; }
async function detectStreamType(url){ if(checkYouTubeUrl(url)) return 'youtube'; const lo = url.toLowerCase().split('?')[0]; if(lo.endsWith('.m3u8') || lo.includes('m3u8')) return 'hls'; if(lo.endsWith('.mpd') || lo.includes('.mpd')) return 'dash'; if(lo.endsWith('.mp4') || lo.endsWith('.webm') || lo.endsWith('.ogg')) return 'progressive'; try{ const r = await fetch(url, { method: 'HEAD', mode: 'no-cors' }); const ct = (r.headers?.get('Content-Type') || '').toLowerCase(); if(ct.includes('mpegurl')) return 'hls'; if(ct.includes('dash+xml')) return 'dash'; if(ct.includes('video/')) return 'progressive'; } catch {} return 'dash'; }

async function beginPlayback(){
  hideLoadingScreen();
  vid.volume = 1; vid.muted = false; volBar.value = 100; updateVolumeSlider(); refreshVolumeIcon();
  try { await vid.play(); updatePlayState(true); }
  catch {
    try { vid.muted = true; await vid.play(); vid.muted = false; vid.volume = 1; volBar.value = 100; updateVolumeSlider(); refreshVolumeIcon(); updatePlayState(true); }
    catch { refreshVolumeIcon(); }
  }
}

function loadYouTubePlayer(url){
  displayLoadingScreen('Loading…', 'YouTube');
  document.body.classList.add('yt-mode');
  vid.style.display = 'none'; overlay.style.display = 'none'; tapShield.style.display = 'none';
  let src;
  if(url.includes('/embed/')){ try { const u = new URL(url); u.searchParams.set('autoplay','1'); u.searchParams.set('playsinline','1'); src = u.toString(); } catch { src = url; } }
  else { const id = extractYouTubeId(url); if(!id) throw new Error('Invalid YouTube URL'); src = `https://www.youtube.com/embed/${id}?autoplay=1&controls=1&rel=0&modestbranding=1&playsinline=1`; }
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;position:absolute;inset:0;z-index:5;';
  iframe.src = src; iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture'; iframe.allowFullscreen = true;
  document.getElementById('vid-box').appendChild(iframe);
  iframe.onload = () => hideLoadingScreen();
  setTimeout(hideLoadingScreen, 1500);
}

function loadProgressiveVideo(url){
  displayLoadingScreen('Loading Video…', 'Preparing'); let started = false;
  vid.addEventListener('loadedmetadata', () => { if(!isFinite(vid.duration) || vid.duration === 0) markLive(); }, { once: true });
  vid.addEventListener('canplay', () => { if(started) return; started = true; beginPlayback(); }, { once: true });
  vid.addEventListener('error', e => { if(!started) displayErrorMessage(e.target.error?.message || 'Playback failed'); }, { once: true });
  vid.src = url; vid.load();
}

function loadHlsStream(url){
  displayLoadingScreen('Loading Video…', 'HLS stream');
  if(Hls.isSupported()){
    if(streamEngine){ streamEngine.destroy(); streamEngine = null; }
    streamEngine = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 60, maxMaxBufferLength: 120 });
    const sig = extractSignatureParams(url);
    if(sig) streamEngine.config.xhrSetup = (xhr, u) => xhr.open('GET', appendSignatureToUrl(u, sig), true);
    streamEngine.on(Hls.Events.ERROR, (_, data) => { if(!data.fatal) return; if(data.type === Hls.ErrorTypes.NETWORK_ERROR) streamEngine.startLoad(); else if(data.type === Hls.ErrorTypes.MEDIA_ERROR) streamEngine.recoverMediaError(); else displayErrorMessage('HLS playback failed.'); });
    streamEngine.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      if(data.levels?.some(l => l.details?.live)) markLive();
      const seen = new Set();
      const levels = data.levels.map((l,i) => ({ label: (l.height || parseInt(l.attrs?.RESOLUTION?.split('x')[1]) || 0) + 'p', value: i, height: l.height || parseInt(l.attrs?.RESOLUTION?.split('x')[1]) || 0 })).filter(l => { if(!l.height || seen.has(l.height)) return false; seen.add(l.height); return true; }).sort((a,b) => b.height - a.height);
      if(levels.length) generateQualityOptions(levels);
    });
    streamEngine.on(Hls.Events.LEVEL_LOADED, (_, data) => { if(data.details?.live) markLive(); });
    let started = false;
    vid.addEventListener('canplay', () => { if(started) return; started = true; beginPlayback(); }, { once: true });
    streamEngine.loadSource(url); streamEngine.attachMedia(vid);
    if(vid.readyState >= 3 && !started){ started = true; beginPlayback(); }
    return;
  }
  if(!vid.canPlayType('application/vnd.apple.mpegurl')) throw new Error('HLS not supported in this browser');
  let started = false, errTimer = null;
  function doStart(){ if(started) return; started = true; clearTimeout(errTimer); if(!isFinite(vid.duration) || vid.duration === 0) markLive(); beginPlayback(); }
  vid.addEventListener('loadedmetadata', doStart, { once: true });
  vid.addEventListener('canplay', doStart, { once: true });
  vid.addEventListener('canplaythrough', doStart, { once: true });
  vid.addEventListener('error', () => { if(started) return; const code = vid.error?.code; if(code === 1 || code === 4){ clearTimeout(errTimer); displayErrorMessage(vid.error?.message || 'HLS playback failed'); } });
  errTimer = setTimeout(() => { if(!started) displayErrorMessage('HLS stream did not start'); }, 12000);
  vid.src = url; vid.load();
}

async function loadDashStream(data){
  if(!shaka.Player.isBrowserSupported()) throw new Error('DASH (Shaka) not supported');
  displayLoadingScreen('Loading Video…', 'DASH stream');
  shaka.polyfill.installAll();
  if(dashEngine){ try { await dashEngine.destroy(); } catch {} dashEngine = null; }
  dashEngine = new shaka.Player();
  await dashEngine.attach(vid);
  window.dashEngine = dashEngine;
  
  // Parse DRM keys (supports base64 and hex formats)
  const drmKeys = parseDrmKeys(data);
  const hasDrmKeys = Object.keys(drmKeys).length > 0;
  
  // Check for PallyCon license (Widevine DRM)
  const hasWidevine = data.license_url || data.license_token;
  
  // Configure Shaka Player
  const config = {
    streaming: {
      rebufferingGoal: 8,
      bufferingGoal: 25,
      bufferBehind: 20,
      useNativeHlsOnSafari: false,
      lowLatencyMode: false
    },
    abr: {
      enabled: true,
      useNetworkInformation: true,
      defaultBandwidthEstimate: 3000000,
      switchInterval: 8,
      bandwidthUpgradeTarget: 0.85,
      bandwidthDowngradeTarget: 0.95
    }
  };
  
  // Add DRM configuration
  if (hasWidevine) {
    console.log('🔐 Widevine DRM detected - configuring PallyCon');
    let licenseUrl = data.license_url || 'https://license-global.pallycon.com/ri/licenseManager.do';
    
    console.log('📝 License URL:', licenseUrl);
    
    config.drm = {
      servers: {
        'com.widevine.alpha': licenseUrl
      },
      advanced: {
        'com.widevine.alpha': {
          videoRobustness: 'SW_SECURE_CRYPTO',
          audioRobustness: 'SW_SECURE_CRYPTO'
        }
      },
      retryParameters: {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffFactor: 2,
        fuzzFactor: 0.5,
        timeout: 30000
      }
    };
  } else if (hasDrmKeys) {
    console.log('🔑 ClearKey DRM detected - configuring keys');
    config.drm = { clearKeys: drmKeys };
  }
  
  // ✅ CONFIGURE FIRST - IMPORTANT!
  dashEngine.configure(config);
  
  // Extract query parameters for signed URLs
  let queryParams = '';
  const videoUrl = data.url || data.video_url;
  if (videoUrl && videoUrl.includes('?')) {
    queryParams = videoUrl.substring(videoUrl.indexOf('?'));
    console.log('📝 Extracted query params for signed URL');
  } else if (data.signed_url) {
    queryParams = data.signed_url;
    console.log('📝 Using signed_url from API');
  }
  
  // ✅ REGISTER REQUEST FILTER AFTER CONFIGURE
  dashEngine.getNetworkingEngine().registerRequestFilter((type, request) => {
    const requestType = shaka.net.NetworkingEngine.RequestType;
    
    console.log('🎯 Request filter triggered - Type:', type, 'URI:', request.uris[0]);
    
    // Add query params to segment and manifest requests
    if ((type === requestType.SEGMENT || type === requestType.MANIFEST) && queryParams) {
      request.uris = request.uris.map(uri => {
        if (uri.includes('sec-prod-mediacdn.pw.live') && !uri.includes('URLPrefix=')) {
          return uri + queryParams;
        }
        return uri;
      });
    }
    
    // Add headers for PW Live requests
    if (request.uris[0] && request.uris[0].includes('sec-prod-mediacdn.pw.live')) {
      request.headers['Origin'] = 'https://pw.live';
      request.headers['Referer'] = 'https://pw.live/';
    }
    
    // ✅ LICENSE REQUEST HANDLING - CRITICAL!
    if (type === requestType.LICENSE) {
      console.log('🔐 ===== LICENSE REQUEST INTERCEPTED =====');
      console.log('📍 License URL:', request.uris[0]);
      
      if (hasWidevine) {
        // ✅ Get the plain JWT token (no decryption needed - API returns it plain)
        const customData = data.license_token || '';
        
        console.log('🔐 License token length:', customData.length);
        console.log('🔐 License token preview:', customData.substring(0, 50) + '...');
        
        // ✅ SET THE HEADER - THIS IS CRITICAL!
        if (customData) {
          request.headers['pallycon-customdata-v2'] = customData;
          console.log('✅ pallycon-customdata-v2 header SET!');
        } else {
          console.error('❌ NO CUSTOM DATA FOUND!');
        }
        
        // Essential headers for PallyCon
        request.headers['Content-Type'] = 'application/octet-stream';
        request.headers['Origin'] = 'https://pw.live';
        request.headers['Referer'] = 'https://pw.live/';
        
        console.log('🔐 All license request headers:', request.headers);
        console.log('🔐 ===== LICENSE REQUEST CONFIGURED =====');
      }
    }
  });
  
  // Error handling
  dashEngine.addEventListener('error', (event) => {
    const error = event.detail;
    console.error('❌ Shaka Player Error:', error);
    console.error('❌ Error details:', {
      code: error.code,
      category: error.category,
      severity: error.severity,
      data: error.data
    });
    
    if (error.severity === shaka.util.Error.Severity.RECOVERABLE) {
      dashEngine.retryStreaming().catch(() => {});
    } else {
      let errorMessage = 'Playback Error';
      
      switch (error.code) {
        case 6008:
          errorMessage = 'DRM License Error - Invalid or expired license token';
          console.error('💡 Hint: Check if license_token is valid and not expired');
          break;
        case 6007:
          errorMessage = 'DRM Error - License request failed';
          console.error('💡 Hint: Check license_url and network connectivity');
          break;
        case 6001:
          errorMessage = 'DRM Error - License server rejected the request';
          console.error('💡 Hint: Check pallycon-customdata-v2 header');
          break;
        case 1001:
          errorMessage = 'Network Error - Failed to load video';
          break;
        case 1002:
          errorMessage = 'Network Error - Request timeout';
          break;
        default:
          errorMessage = error.message || 'Unknown playback error';
      }
      
      displayErrorMessage(errorMessage);
    }
  });
  
  // Load the video
  await dashEngine.load(videoUrl);
  
  // Check if live
  if(dashEngine.isLive()) {
    if (!liveMode) {
      liveMode = true;
      liveBadge.classList.add('on');
      liveBadge.style.display = 'flex';
      const liveText = liveBadge.querySelector('.live-text');
      const goLiveText = liveBadge.querySelector('.go-live-text');
      const liveDot = liveBadge.querySelector('.live-dot');
      if (liveText) liveText.style.display = 'block';
      if (goLiveText) goLiveText.style.display = 'none';
      if (liveDot) liveDot.style.display = 'block';
    }
    console.log('🔴 Live stream detected');
  }
  
  // Build quality options
  try {
    const seen = new Set();
    const levels = dashEngine.getVariantTracks()
      .filter(t => {
        if(!t.height || seen.has(t.height)) return false;
        seen.add(t.height);
        return true;
      })
      .sort((a,b) => b.height - a.height)
      .map(t => ({ label: t.height + 'p', value: t.id }));
    
    if(levels.length) generateQualityOptions(levels);
  } catch(e) {
    console.warn('⚠️ Could not build quality options:', e);
  }
  
  // Speed persistence for DRM videos
  let savedSpeed = parseFloat(localStorage.getItem('playerSpeed')) || 1;
  let isSpeedChanging = false;
  
  // Restore speed after adaptation
  dashEngine.addEventListener('adaptation', () => {
    const currentSpeed = parseFloat(localStorage.getItem('playerSpeed')) || 1;
    if (vid.playbackRate !== currentSpeed && !isSpeedChanging) {
      console.log('⚠️ Speed reset on adaptation - restoring to:', currentSpeed);
      vid.playbackRate = currentSpeed;
    }
  });
  
  // Restore speed after buffering
  dashEngine.addEventListener('buffering', (event) => {
    if (!event.buffering) {
      const currentSpeed = parseFloat(localStorage.getItem('playerSpeed')) || 1;
      setTimeout(() => {
        if (vid.playbackRate !== currentSpeed && !isSpeedChanging) {
          console.log('⚠️ Speed reset after buffering - restoring to:', currentSpeed);
          vid.playbackRate = currentSpeed;
        }
      }, 100);
    }
  });
  
  // Restore speed after load
  dashEngine.addEventListener('loaded', () => {
    const currentSpeed = parseFloat(localStorage.getItem('playerSpeed')) || 1;
    setTimeout(() => {
      if (vid.playbackRate !== currentSpeed && !isSpeedChanging) {
        console.log('⚠️ Speed reset after load - restoring to:', currentSpeed);
        vid.playbackRate = currentSpeed;
      }
    }, 100);
  });
  
  // Save speed changes
  vid.addEventListener('ratechange', () => {
    if (!isSpeedChanging) {
      const newSpeed = vid.playbackRate;
      localStorage.setItem('playerSpeed', newSpeed.toString());
      console.log('✅ DRM speed saved:', newSpeed);
    }
  });
  
  // Start playback
  let started = false;
  vid.addEventListener('canplay', () => {
    if(started) return;
    started = true;
    
    // Restore saved speed
    const finalSpeed = parseFloat(localStorage.getItem('playerSpeed')) || 1;
    if (finalSpeed !== 1) {
      isSpeedChanging = true;
      vid.playbackRate = finalSpeed;
      setTimeout(() => { isSpeedChanging = false; }, 500);
    }
    
    beginPlayback();
  }, { once: true });
  
  if(vid.readyState >= 3 && !started){
    started = true;
    
    // Restore saved speed
    const finalSpeed = parseFloat(localStorage.getItem('playerSpeed')) || 1;
    if (finalSpeed !== 1) {
      isSpeedChanging = true;
      vid.playbackRate = finalSpeed;
      setTimeout(() => { isSpeedChanging = false; }, 500);
    }
    
    beginPlayback();
  }
}

function cleanupMediaPlayers(){
  document.body.classList.remove('yt-mode');
  if(streamEngine){ streamEngine.destroy(); streamEngine = null; }
  if(dashEngine){ try { dashEngine.destroy(); } catch {} dashEngine = null; }
  vid.removeAttribute('src'); vid.load();
  const ifr = document.getElementById('vid-box').querySelector('iframe');
  if(ifr) ifr.remove();
  vid.style.display = 'block'; overlay.style.display = ''; tapShield.style.display = '';
  liveMode = false; 
  liveBadgeLocked = false;
  liveBadge.classList.remove('on', 'behind', 'seeking');
  liveBadge.style.display = 'none';
  barFill.style.width = '0%'; barBuf.style.width = '0%'; barThumb.style.left = '0%';
  seekBar.value = 0; curTime.textContent = '0:00'; durTime.textContent = '0:00';
  vid.volume = 1; vid.muted = false; volBar.value = 100; updateVolumeSlider(); refreshVolumeIcon();
  updatePlayState(false);
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isNativeOnly = isIOS || isSafari;

async function initializePlayer(data){
  if(playerReady){ cleanupMediaPlayers(); playerReady = false; }
  playerReady = true; previousMediaConfig = data;
  displayLoadingScreen('Initializing…', 'Detecting stream type');
  try {
    const videoUrl = data.url || data.video_url;
    if(!videoUrl) throw new Error('Video URL not found in data');
    
    if(isNativeOnly){
      if(checkYouTubeUrl(videoUrl)){ loadYouTubePlayer(videoUrl); return; }
      const hlsUrl = (videoUrl.toLowerCase().split('?')[0].endsWith('.m3u8') || videoUrl.toLowerCase().includes('m3u8')) ? videoUrl : (data.m3u8_url || videoUrl);
      loadHlsStream(hlsUrl); return;
    }
    const type = await detectStreamType(videoUrl);
    if(type === 'youtube')    loadYouTubePlayer(videoUrl);
    else if(type === 'hls')   loadHlsStream(videoUrl);
    else if(type === 'progressive') loadProgressiveVideo(videoUrl);
    else {
      try { await loadDashStream(data); }
      catch(err){
        if(dashEngine){ try { await dashEngine.destroy(); } catch {} dashEngine = null; }
        vid.removeAttribute('src'); vid.load();
        if(data.m3u8_url) loadHlsStream(data.m3u8_url);
        else if(checkYouTubeUrl(videoUrl)) loadYouTubePlayer(videoUrl);
        else throw new Error('All playback methods failed: ' + err.message);
      }
    }
  } catch(err){ playerReady = false; displayErrorMessage(err.message || 'Failed to load video.'); }
}

retryBtn.addEventListener('click', () => { if(previousMediaConfig) initializePlayer(previousMediaConfig); else boot(); });
window.addEventListener('beforeunload', () => { if(dashEngine){ try { dashEngine.destroy(); } catch {} } if(streamEngine) streamEngine.destroy(); });

// ==================== GLOBAL KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input/textarea
  if(['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  
  const key = e.key.toLowerCase();
  
  // Space or K - Play/Pause
  if(key === ' ' || key === 'k'){
    e.preventDefault();
    togglePlayback();
  }
  // Arrow Left or J - Rewind 10s
  else if(key === 'arrowleft' || key === 'j'){
    e.preventDefault();
    adjustTime(-10);
    playSeekAnimation(rwBtn, 'anim-l');
    handleUserAction();
  }
  // Arrow Right or L - Forward 10s
  else if(key === 'arrowright' || key === 'l'){
    e.preventDefault();
    adjustTime(10);
    playSeekAnimation(fwBtn, 'anim-r');
    handleUserAction();
  }
  // Arrow Up - Volume Up
  else if(key === 'arrowup'){
    e.preventDefault();
    const newVol = Math.min(100, parseInt(volBar.value) + 5);
    volBar.value = newVol;
    vid.volume = newVol / 100;
    vid.muted = false;
    updateVolumeSlider();
    refreshVolumeIcon();
    handleUserAction();
  }
  // Arrow Down - Volume Down
  else if(key === 'arrowdown'){
    e.preventDefault();
    const newVol = Math.max(0, parseInt(volBar.value) - 5);
    volBar.value = newVol;
    vid.volume = newVol / 100;
    updateVolumeSlider();
    refreshVolumeIcon();
    handleUserAction();
  }
  // M - Mute/Unmute
  else if(key === 'm'){
    e.preventDefault();
    if(vid.muted || vid.volume === 0){
      vid.muted = false;
      vid.volume = 1;
      volBar.value = 100;
    } else {
      vid.muted = true;
      volBar.value = 0;
    }
    updateVolumeSlider();
    refreshVolumeIcon();
    handleUserAction();
  }
  // F - Fullscreen Toggle
  else if(key === 'f'){
    e.preventDefault();
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if(fs){
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.getElementById('shell');
      if(el.requestFullscreen) el.requestFullscreen();
      else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  }
  // T - Toggle Timeline Panel
  else if(key === 't'){
    e.preventDefault();
    if(sidebarVisible && activeTabType === 'tl'){
      hideSidebar();
    } else {
      showSidebar('tl');
    }
  }
  // A - Toggle Attachments Panel
  else if(key === 'a'){
    e.preventDefault();
    if(sidebarVisible && activeTabType === 'att'){
      hideSidebar();
    } else {
      showSidebar('att');
    }
  }
  // Escape - Close panels/settings
  else if(key === 'escape'){
    e.preventDefault();
    if(settingsVisible){
      closeSettingsPanel();
    } else if(sidebarVisible){
      hideSidebar();
    }
  }
  // Numbers 0-9 - Seek to percentage (0=0%, 1=10%, 2=20%, ..., 9=90%)
  else if(key >= '0' && key <= '9'){
    e.preventDefault();
    const percent = parseInt(key) / 10;
    if(vid.duration && isFinite(vid.duration)){
      vid.currentTime = vid.duration * percent;
      handleUserAction();
    }
  }
  // < or , - Decrease playback speed
  else if(key === ',' || key === '<'){
    e.preventDefault();
    const newSpeed = Math.max(0.25, vid.playbackRate - 0.25);
    vid.playbackRate = newSpeed;
    spdBadge.textContent = newSpeed + 'x';
    sSpeedVal.textContent = newSpeed === 1 ? 'Normal' : newSpeed + 'x';
    handleUserAction();
  }
  // > or . - Increase playback speed
  else if(key === '.' || key === '>'){
    e.preventDefault();
    const newSpeed = Math.min(6, vid.playbackRate + 0.25);
    vid.playbackRate = newSpeed;
    spdBadge.textContent = newSpeed + 'x';
    sSpeedVal.textContent = newSpeed === 1 ? 'Normal' : newSpeed + 'x';
    handleUserAction();
  }
  // Home - Jump to start
  else if(key === 'home'){
    e.preventDefault();
    vid.currentTime = 0;
    handleUserAction();
  }
  // End - Jump to end
  else if(key === 'end'){
    e.preventDefault();
    if(vid.duration && isFinite(vid.duration)){
      vid.currentTime = vid.duration - 5;
      handleUserAction();
    }
  }
});

console.log('🎹 Keyboard Shortcuts Enabled:');
console.log('  Space/K: Play/Pause');
console.log('  ←/J: Rewind 10s | →/L: Forward 10s');
console.log('  ↑: Volume Up | ↓: Volume Down');
console.log('  M: Mute/Unmute | F: Fullscreen');
console.log('  T: Timeline | A: Attachments');
console.log('  0-9: Seek to % | ,/.: Speed ±');
console.log('  Home: Start | End: End | Esc: Close');

function boot(){
  displayLoadingScreen('Loading…', '');
  displayControls();
  if(!checkPortraitMode()) scheduleControlsHide();
  try {
    const videoUrl = mediaConfig?.url || mediaConfig?.video_url;
    if(!videoUrl) throw new Error('Video URL not available.');
    
    console.log('🎬 Starting playback with dummy data:');
    console.log('  Video URL:', videoUrl);
    console.log('  Has key_id:', !!mediaConfig?.key_id);
    console.log('  Has key_value:', !!mediaConfig?.key_value);
    console.log('  Has signed_url:', !!mediaConfig?.signed_url);
    console.log('  Has license_url:', !!mediaConfig?.license_url);
    console.log('  Has license_token:', !!mediaConfig?.license_token);
    
    if(checkYouTubeUrl(videoUrl)) document.body.classList.add('yt-mode');
    initializePlayer(mediaConfig);
  } catch(err){ displayErrorMessage(err.message || 'Video not available.'); }
}
boot();
})();

// Slide Doubts Inline Sidebar Logic
window.restoreSlidesList = function() {
  const panels = document.querySelectorAll('.ptab-panel[data-p="tl"]');
  let tlH = '';
  
  if (timelineSlidesLoading) {
    tlH = `
      <div class="no-items" style="padding: 40px 20px; text-align: center;">
        <div class="loading-spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Loading slides...</p>
      </div>
    `;
  } else if (timelineSlides && timelineSlides.length) {
    timelineSlides.forEach((s, i) => {
      tlH += `<div class="tl-card" data-idx="${i}" onclick="jumpToTimestamp(${s.timestamp})">
        <div class="tl-img-wrapper">
          ${s.image ? `<img class="tl-img loaded" src="${s.image}" alt="" loading="lazy" onerror="this.style.background='#1c1c27'">` : '<div class="tl-img"></div>'}
        </div>
        <span class="tl-cur-badge">&#9654; Current</span>
        <span class="tl-slide-number-tag">Slide No. ${i + 1}</span>
        ${s.id ? `<button class="view-doubts-btn" onclick="event.stopPropagation(); openSlideDoubts('${s.id}', '${s.name || 'Slide ' + (i+1)}')">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          View Doubts
        </button>` : ''}
        <div class="tl-ov">
          <span class="tl-ts">${fmt(s.timestamp)}</span>
        </div>
      </div>`;
    });
  } else {
    tlH = '<div class="no-items">No slides available</div>';
  }
  
  panels.forEach(p => {
    p.innerHTML = `<div class="tl-list type-slides-container">${tlH}</div>`;
  });
};

window.openSlideDoubts = async function(slideId, slideName) {
  const panels = document.querySelectorAll('.ptab-panel[data-p="tl"]');
  
  panels.forEach(p => {
    p.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="back-to-doubts" onclick="restoreSlidesList()" style="margin-bottom:4px; margin-top:2px;">
          <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Slides
        </button>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;">${slideName || 'Slide Doubts'}</div>
        <div class="doubts-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:150px;gap:10px;color:rgba(255,255,255,0.6)">
          <div style="width:24px;height:24px;border:3px solid rgba(255,255,255,0.1);border-top-color:#818cf8;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <p style="font-size:12px;margin:0;">Loading doubts...</p>
        </div>
      </div>
    `;
  });
  
  try {
    const videoId = document.getElementById('data-video-id')?.value || mediaConfig.video_id;
    const token = await getValidToken();
    if (!token) throw new Error('No token available');
    
    const apiUrl = `https://api.penpencil.co/v1/doubts/${videoId}/${slideId}/get-common-doubts`;
    console.log('📡 Fetching doubts from URL:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Client-Id': '5eb393ee95fab7468a79d189',
        'Client-Type': 'WEB',
        'Client-Version': '200',
        'Randomid': crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        'Origin': 'https://www.pw.live',
        'Referer': 'https://www.pw.live/'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const result = await response.json();
    
    renderDoubtsList(result.data, slideId, slideName);
  } catch (err) {
    console.error('❌ Error loading doubts:', err);
    panels.forEach(p => {
      p.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <button class="back-to-doubts" onclick="restoreSlidesList()">
            <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to Slides
          </button>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:150px;text-align:center;">
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:12px;">Failed to load doubts</p>
            <button class="att-btn" style="width:auto;padding:8px 16px;font-size:12px;font-weight:600;" onclick="openSlideDoubts('${slideId}', '${slideName}')">Retry</button>
          </div>
        </div>
      `;
    });
  }
};

window.renderDoubtsList = function(doubts, slideId, slideName) {
  const panels = document.querySelectorAll('.ptab-panel[data-p="tl"]');
  
  let html = '';
  if (!doubts || doubts.length === 0) {
    html = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:150px;color:rgba(255,255,255,0.4)">
        <p style="font-size:12px;margin:0;">No doubts posted for this slide</p>
      </div>
    `;
  } else {
    doubts.forEach(doubt => {
      const creator = doubt.createdBy || {};
      const name = (creator.firstName || '') + ' ' + (creator.lastName || '');
      
      let avatar = 'https://static.pw.live/5b09189f7285894d9130ccd0/3987a227-b176-4ec4-b4ed-7be8acab62a0.png';
      if (creator.imageId && creator.imageId.baseUrl && creator.imageId.key) {
        avatar = creator.imageId.baseUrl + creator.imageId.key;
      }
      
      let sharedByLabel = 'Student';
      let badgeClass = 'badge-student';
      if (doubt.sharedBy && doubt.sharedBy.length) {
        sharedByLabel = doubt.sharedBy[0];
        if (sharedByLabel.toLowerCase().includes('sme')) {
          badgeClass = 'badge-sme';
        } else if (sharedByLabel.toLowerCase().includes('ai')) {
          badgeClass = 'badge-ai';
        }
      }
      
      const formattedDate = new Date(doubt.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      
      html += `
        <div class="doubt-card" onclick="viewDoubtAnswers('${doubt._id}', ${JSON.stringify(doubt.description).replace(/"/g, '&quot;')}, '${name}', '${avatar}', '${sharedByLabel}', '${badgeClass}', '${slideId}', '${slideName}')">
          <div class="doubt-meta">
            <div class="doubt-user">
              <img class="doubt-avatar" src="${avatar}" alt="" onerror="this.src='https://static.pw.live/5b09189f7285894d9130ccd0/3987a227-b176-4ec4-b4ed-7be8acab62a0.png'">
              <span class="doubt-username">${name}</span>
            </div>
            <span class="doubt-badge ${badgeClass}">${sharedByLabel}</span>
          </div>
          <div class="doubt-question-box">
            <span class="q-icon">Q</span>
            <p class="doubt-desc" style="margin:0;">${doubt.description}</p>
          </div>
          <div class="doubt-actions">
            <span class="doubt-date">${formattedDate}</span>
            <span class="doubt-replies-trigger">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-2px;margin-right:3px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              ${doubt.commentCount || 0} Replies
            </span>
          </div>
        </div>
      `;
    });
  }
  
  panels.forEach(p => {
    p.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="back-to-doubts" onclick="restoreSlidesList()" style="margin-bottom:4px; margin-top:2px;">
          <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Slides
        </button>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;">${slideName || 'Slide Doubts'}</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${html}
        </div>
      </div>
    `;
  });
  
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
  }
};

window.viewDoubtAnswers = async function(doubtId, doubtDesc, userName, userAvatar, sharedByLabel, badgeClass, slideId, slideName) {
  const panels = document.querySelectorAll('.ptab-panel[data-p="tl"]');
  
  panels.forEach(p => {
    p.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="back-to-doubts" onclick="openSlideDoubts('${slideId}', '${slideName}')" style="margin-bottom:4px; margin-top:2px;">
          <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Doubts
        </button>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:150px;gap:10px;color:rgba(255,255,255,0.6)">
          <div style="width:24px;height:24px;border:3px solid rgba(255,255,255,0.1);border-top-color:#818cf8;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <p style="font-size:12px;margin:0;">Loading solution...</p>
        </div>
      </div>
    `;
  });
  
  try {
    const token = await getValidToken();
    const apiUrl = `https://api.penpencil.co/v1/comments/${doubtId}/solution-comments?limit=20&page=1`;
    console.log('📡 Fetching answers from URL:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Client-Id': '5eb393ee95fab7468a79d189',
        'Client-Type': 'WEB',
        'Client-Version': '200',
        'Randomid': crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        'Origin': 'https://www.pw.live',
        'Referer': 'https://www.pw.live/'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const result = await response.json();
    
    renderDoubtSolutions(result.data, doubtDesc, userName, userAvatar, sharedByLabel, badgeClass, slideId, slideName);
  } catch (err) {
    console.error('❌ Error loading solutions:', err);
    panels.forEach(p => {
      p.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <button class="back-to-doubts" onclick="openSlideDoubts('${slideId}', '${slideName}')">
            <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to Doubts
          </button>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:150px;text-align:center;">
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:12px;">Failed to load solution</p>
            <button class="att-btn" style="width:auto;padding:8px 16px;font-size:12px;font-weight:600;" onclick="viewDoubtAnswers('${doubtId}', ${JSON.stringify(doubtDesc).replace(/"/g, '&quot;')}, '${userName}', '${userAvatar}', '${sharedByLabel}', '${badgeClass}', '${slideId}', '${slideName}')">Retry</button>
          </div>
        </div>
      `;
    });
  }
};

window.renderDoubtSolutions = function(solutions, doubtDesc, userName, userAvatar, sharedByLabel, badgeClass, slideId, slideName) {
  const panels = document.querySelectorAll('.ptab-panel[data-p="tl"]');
  
  let solutionsHtml = '';
  if (!solutions || solutions.length === 0) {
    solutionsHtml = `
      <div style="text-align:center;padding:24px;color:rgba(255,255,255,0.5);font-size:12px;">
        No solutions or answers posted yet.
      </div>
    `;
  } else {
    solutions.forEach(sol => {
      const creator = sol.createdBy || {};
      const solName = (creator.firstName || '') + ' ' + (creator.lastName || '');
      
      let roleLabel = 'Expert';
      if (creator.roles && creator.roles.length) {
        roleLabel = creator.roles[0].name || 'Expert';
      }
      
      solutionsHtml += `
        <div class="answer-card">
          <div class="answer-meta" style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span class="a-icon">A</span>
            <span class="doubt-username" style="font-weight:700;">${solName}</span>
            <span class="answer-role">${roleLabel}</span>
          </div>
          <div class="answer-body">
            ${sol.text}
          </div>
        </div>
      `;
    });
  }
  
  panels.forEach(p => {
    p.innerHTML = `
      <div class="answers-container">
        <button class="back-to-doubts" onclick="openSlideDoubts('${slideId}', '${slideName}')" style="margin-bottom:4px; margin-top:2px;">
          <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Doubts
        </button>
        
        <div class="original-doubt-box" style="margin-top:4px;">
          <div class="doubt-meta">
            <div class="doubt-user">
              <img class="doubt-avatar" src="${userAvatar}" alt="">
              <span class="doubt-username">${userName}</span>
            </div>
            <span class="doubt-badge ${badgeClass}">${sharedByLabel}</span>
          </div>
          <div class="doubt-question-box">
            <span class="q-icon">Q</span>
            <p class="doubt-desc" style="margin:0;font-weight:500;">${doubtDesc}</p>
          </div>
        </div>
        
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-top:8px;">Solutions & Replies</div>
        
        ${solutionsHtml}
      </div>
    `;
  });
  
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
  }
};

let currentPdfUrl = '';
let currentPdfName = '';

function openPdfFullscreen() {
  const url = window.currentPdfUrl || currentPdfUrl;
  const name = window.currentPdfName || currentPdfName;
  if (!url) return;
  const overlay = document.getElementById('pdfFullscreenOverlay');
  const title = document.getElementById('pdfFsTitle');
  const wrap = document.getElementById('pdfFsCanvasWrap');
  
  title.textContent = name;
  overlay.classList.add('show');
  wrap.innerHTML = '<div class="pdf-loading"><div class="spinner"></div><p>Loading fullscreen PDF…</p></div>';
  
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.getDocument({ url: url, cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', cMapPacked: true }).promise.then(pdfDoc => {
    wrap.innerHTML = '';
    const totalPages = pdfDoc.numPages;
    const containerW = Math.min(wrap.clientWidth || window.innerWidth || 960, 960) - 24;
    const dpr = window.devicePixelRatio || 1;
    
    function renderPage(pageNum) {
      if (pageNum > totalPages) return;
      pdfDoc.getPage(pageNum).then(page => {
        const vpNatural = page.getViewport({ scale: 1 });
        const fitScale = containerW / vpNatural.width;
        const vpRender = page.getViewport({ scale: fitScale * dpr });
        
        const canvas = document.createElement('canvas');
        canvas.width = vpRender.width;
        canvas.height = vpRender.height;
        canvas.style.width = (vpRender.width / dpr) + 'px';
        canvas.style.height = (vpRender.height / dpr) + 'px';
        canvas.style.maxWidth = '100%';
        canvas.style.display = 'block';
        wrap.appendChild(canvas);
        
        page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: vpRender
        }).promise.then(() => renderPage(pageNum + 1));
      });
    }
    renderPage(1);
  }).catch(err => {
    wrap.innerHTML = `<div class="pdf-err"><p>Could not load PDF in fullscreen.</p></div>`;
  });
}

function closePdfFullscreen() {
  const overlay = document.getElementById('pdfFullscreenOverlay');
  overlay.classList.remove('show');
  document.getElementById('pdfFsCanvasWrap').innerHTML = '';
}

let turnstileModal = null;
let turnstileWidgetId = null;
let pendingRedirectUrl = null;

function isTurnstileEnabled() {
  const enabledInput = document.getElementById('turnstile_enabled');
  const siteKeyInput = document.getElementById('turnstile_site_key');
  return !!(enabledInput && enabledInput.value === '1' && siteKeyInput && siteKeyInput.value);
}

function showTurnstileModal(targetUrl) {
  pendingRedirectUrl = targetUrl;
  
  if (!turnstileModal) {
    createTurnstileModal();
  }
  turnstileModal.style.display = 'flex';
  
  const siteKeyInput = document.getElementById('turnstile_site_key');
  const siteKey = siteKeyInput ? siteKeyInput.value : '';
  
  if (window.turnstile && siteKey) {
    if (turnstileWidgetId) {
      window.turnstile.reset(turnstileWidgetId);
    } else {
      const container = document.getElementById('turnstile-widget-play');
      if (container) {
        turnstileWidgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          callback: onTurnstileSuccess,
          'error-callback': onTurnstileError,
          theme: 'dark'
        });
      }
    }
  }
}

function createTurnstileModal() {
  turnstileModal = document.createElement('div');
  turnstileModal.id = 'playTurnstileModal';
  turnstileModal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(10, 10, 15, 0.95);
    backdrop-filter: blur(8px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const card = document.createElement('div');
  card.style.cssText = `
    background: #161622;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 28px 24px;
    max-width: 380px;
    width: 90%;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    color: #fff;
    font-family: inherit;
  `;
  
  card.innerHTML = `
    <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 0.3px;">Quick Verification</h3>
    <p style="margin: 0 0 20px; font-size: 13px; color: rgba(255, 255, 255, 0.6); line-height: 1.4;">Verify to continue watching this lecture.</p>
    <div id="turnstile-widget-play" style="display: flex; justify-content: center; margin-bottom: 20px; min-height: 65px;"></div>
    <button onclick="cancelTurnstileVerification()" style="width: 100%; padding: 11px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.03); color: rgba(255,255,255,0.8); border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancel</button>
  `;
  
  turnstileModal.appendChild(card);
  // Append inside #shell so the modal stays visible during browser fullscreen
  // (browser fullscreen only renders the fullscreen element and its children)
  const shell = document.getElementById('shell') || document.body;
  shell.appendChild(turnstileModal);
}

async function onTurnstileSuccess(token) {
  if (!token || !pendingRedirectUrl) return;
  
  const container = document.getElementById('turnstile-widget-play');
  if (container) {
    container.innerHTML = '<div style="color: #6366f1; font-size: 13px; font-weight: 600; padding: 10px 0;"><span class="loading-btn-spinner" style="border-top-color:#6366f1; border-width: 2.5px; width: 14px; height: 14px; margin-right: 8px;"></span>Verifying...</div>';
  }
  
  try {
    const res = await fetch('api/turnstile_verifier.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ token: token })
    });
    const data = await res.json();
    
    if (data && data.success) {
      const target = pendingRedirectUrl;
      pendingRedirectUrl = null;
      if (turnstileModal) turnstileModal.style.display = 'none';
      window.location.replace(target);
    } else {
      alert('Verification failed: ' + (data?.error || 'Invalid response. Please try again.'));
      resetTurnstileWidget();
    }
  } catch (err) {
    console.error('❌ Turnstile verification error:', err);
    alert('Verification server error. Please try again.');
    resetTurnstileWidget();
  }
}

function onTurnstileError() {
  alert('Cloudflare Turnstile encountered an error. Please try again.');
  resetTurnstileWidget();
}

function cancelTurnstileVerification() {
  if (turnstileModal) turnstileModal.style.display = 'none';
  pendingRedirectUrl = null;
  
  // Re-enable playlist elements and load overlay
  playlistVideoLoading = false;
  
  document.querySelectorAll('#playlistContent').forEach(c => {
    c.style.pointerEvents = '';
    c.style.opacity = '';
  });
  
  document.querySelectorAll('#playlistLoadMore').forEach(btn => {
    btn.style.pointerEvents = '';
    btn.style.opacity = '';
  });
}

function resetTurnstileWidget() {
  // Re-render Turnstile widget to allow retry
  const container = document.getElementById('turnstile-widget-play');
  if (container && window.turnstile) {
    container.innerHTML = '';
    const siteKeyInput = document.getElementById('turnstile_site_key');
    const siteKey = siteKeyInput ? siteKeyInput.value : '';
    if (siteKey) {
      turnstileWidgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: onTurnstileSuccess,
        'error-callback': onTurnstileError,
        theme: 'dark'
      });
    }
  }
}

window.closeDoubtsModal = function() {
  const modal = document.getElementById('doubtsModal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
};

// ── Obfuscation-safe global exports ───────────────────────────────────────────
// All functions called from inline onclick="" attributes MUST be on window so
// obfuscators don't rename/mangle them into undefined symbols at runtime.
window.switchTabView            = switchTabView;
window.hideSidebar              = hideSidebar;
window.showSidebar              = showSidebar;
window.openDocumentPreview      = openDocumentPreview;
window.closeDocumentPreview     = closeDocumentPreview;
window.downloadDocument         = downloadDocument;
window.jumpToTimestamp          = jumpToTimestamp;
window.openSlideDoubts          = openSlideDoubts;
window.restoreSlidesList        = restoreSlidesList;
window.viewDoubtAnswers         = viewDoubtAnswers;
window.playPlaylistVideo        = playPlaylistVideo;
window.loadMorePlaylist         = loadMorePlaylist;
window.openPdfFullscreen        = openPdfFullscreen;
window.closePdfFullscreen       = closePdfFullscreen;
window.cancelTurnstileVerification = cancelTurnstileVerification;
window.goBackToContent          = goBackToContent;
window.flashLockIcon            = flashLockIcon;