/*!
 * Lampa Download — кнопка «Скачать» в плеере Lampa
 * Версия 0.2.0
 *
 * Установка: Настройки → Расширения → Добавить плагин → URL этого файла → перезапустить Lampa.
 *
 * Что делает:
 *   - добавляет кнопку «Скачать» в панель плеера (на телефоне/планшете она в меню «⋯»);
 *   - берёт ссылку на то, что играет сейчас, с учётом выбранного качества;
 *   - ПК (Chrome / Edge): «Сохранить на компьютер» пишет файл прямо на диск.
 *     Прямые ссылки сохраняются как есть, HLS (.m3u8) скачивается по частям
 *     и собирается в MP4 (через mux.js) или в .ts без конвертации;
 *   - iPad / iPhone: отдаёт файл в VLC на скачивание (vlc-x-callback://x-callback-url/download);
 *   - Android (APK Lampa): открывает ссылку во внешнем приложении (1DM, ADM…) или в браузере;
 *   - везде: копирует ссылку или готовую команду ffmpeg.
 *
 * Синтаксис ES5 без сборки, чтобы файл разбирался и на старых телевизорах.
 * Сохранение на диск включается только там, где есть fetch, Promise и т.п.
 */
(function () {
    'use strict';

    var VERSION = '0.2.0';

    var MUXJS_URLS = [
        'https://cdn.jsdelivr.net/npm/mux.js@6.3.0/dist/mux.min.js',
        'https://unpkg.com/mux.js@6.3.0/dist/mux.min.js'
    ];

    var SEGMENT_CONCURRENCY = 4;   // сколько частей HLS качать одновременно
    var SEGMENT_RETRIES     = 4;   // повторов на одну часть

    var ICON =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M12 3.5v11m0 0l-4.5-4.5m4.5 4.5l4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';

    var button    = null;
    var activeJob = null;

    function noop() {}

    /* ------------------------------------------------------------------ */
    /* Переводы                                                            */
    /* ------------------------------------------------------------------ */

    function addLang() {
        Lampa.Lang.add({
            dl_button:          { ru: 'Скачать', uk: 'Завантажити', en: 'Download' },
            dl_title:           { ru: 'Скачать видео', uk: 'Завантажити відео', en: 'Download video' },
            dl_vlc:             { ru: 'Скачать в VLC', uk: 'Завантажити у VLC', en: 'Download to VLC' },
            dl_vlc_hint:        { ru: 'Файл появится в медиатеке VLC и будет доступен офлайн', uk: 'Файл з’явиться в медіатеці VLC і буде доступний офлайн', en: 'The file appears in the VLC library and works offline' },
            dl_android_app:     { ru: 'Открыть в приложении', uk: 'Відкрити в застосунку', en: 'Open in app' },
            dl_android_app_hint:{ ru: 'Выберите менеджер загрузок: 1DM, ADM…', uk: 'Оберіть менеджер завантажень: 1DM, ADM…', en: 'Pick a download manager: 1DM, ADM…' },
            dl_android_browser: { ru: 'Скачать через браузер', uk: 'Завантажити через браузер', en: 'Download via browser' },
            dl_save:            { ru: 'Сохранить на компьютер', uk: 'Зберегти на комп’ютер', en: 'Save to computer' },
            dl_save_hint_file:  { ru: 'Файл запишется прямо на диск, место выберете в окне сохранения', uk: 'Файл запишеться прямо на диск, місце оберете у вікні збереження', en: 'Written straight to disk, you pick the folder' },
            dl_save_hint_hls:   { ru: 'Скачает поток по частям и соберёт MP4 (или .ts — тип выбирается в окне сохранения)', uk: 'Завантажить потік частинами і збере MP4 (або .ts — тип обирається у вікні збереження)', en: 'Downloads the stream in parts and builds an MP4 (or .ts — pick the type in the save dialog)' },
            dl_save_hint_memory:{ ru: 'В этом браузере файл собирается в памяти — для больших фильмов лучше Chrome или Edge', uk: 'У цьому браузері файл збирається в пам’яті — для великих фільмів краще Chrome або Edge', en: 'This browser builds the file in memory — use Chrome or Edge for big movies' },
            dl_open:            { ru: 'Открыть ссылку на скачивание', uk: 'Відкрити посилання на завантаження', en: 'Open download link' },
            dl_open_hint:       { ru: 'Если видео начнёт играть — «Сохранить как…»', uk: 'Якщо відео почне грати — «Зберегти як…»', en: 'If it starts playing, use “Save as…”' },
            dl_copy_link:       { ru: 'Копировать ссылку', uk: 'Копіювати посилання', en: 'Copy link' },
            dl_copy_ffmpeg:     { ru: 'Копировать команду ffmpeg', uk: 'Копіювати команду ffmpeg', en: 'Copy ffmpeg command' },
            dl_ffmpeg_hint:     { ru: 'Скачать на компьютере одной командой', uk: 'Завантажити на комп’ютері однією командою', en: 'Download on a computer with one command' },
            dl_show_link:       { ru: 'Показать ссылку', uk: 'Показати посилання', en: 'Show link' },
            dl_quality:         { ru: 'Качество', uk: 'Якість', en: 'Quality' },
            dl_quality_hint:    { ru: 'Выбрать другое качество для скачивания', uk: 'Обрати іншу якість для завантаження', en: 'Pick another quality to download' },
            dl_now_playing:     { ru: 'Сейчас играет', uk: 'Зараз грає', en: 'Now playing' },
            dl_unknown_quality: { ru: 'Текущее', uk: 'Поточна', en: 'Current' },
            dl_stream_note:     { ru: 'Это поток HLS: файлом его не скачать, только через ffmpeg', uk: 'Це потік HLS: файлом його не завантажити, лише через ffmpeg', en: 'This is an HLS stream: it can only be saved with ffmpeg' },
            dl_dash_note:       { ru: 'Это поток DASH (.mpd): сохранить его можно только через ffmpeg', uk: 'Це потік DASH (.mpd): зберегти його можна лише через ffmpeg', en: 'This is a DASH stream (.mpd): it can only be saved with ffmpeg' },
            dl_reading:         { ru: 'Читаю плейлист…', uk: 'Читаю плейлист…', en: 'Reading playlist…' },
            dl_choose:          { ru: 'Что сохранить', uk: 'Що зберегти', en: 'What to save' },
            dl_start:           { ru: 'Скачать', uk: 'Завантажити', en: 'Download' },
            dl_parts:           { ru: 'частей', uk: 'частин', en: 'parts' },
            dl_audio_separate:  { ru: 'аудио идёт отдельным потоком — так не сохранить, используйте ffmpeg', uk: 'аудіо йде окремим потоком — так не зберегти, використайте ffmpeg', en: 'audio is a separate stream — use ffmpeg' },
            dl_hevc_note:       { ru: 'HEVC — только в .ts', uk: 'HEVC — лише в .ts', en: 'HEVC — .ts only' },
            dl_busy:            { ru: 'Уже идёт скачивание — дождитесь окончания или отмените его', uk: 'Вже йде завантаження — дочекайтеся завершення або скасуйте його', en: 'A download is already running' },
            dl_prepare:         { ru: 'Подготовка…', uk: 'Підготовка…', en: 'Preparing…' },
            dl_cancel:          { ru: 'Отмена', uk: 'Скасувати', en: 'Cancel' },
            dl_close:           { ru: 'Закрыть', uk: 'Закрити', en: 'Close' },
            dl_cancelled:       { ru: 'Скачивание отменено', uk: 'Завантаження скасовано', en: 'Download cancelled' },
            dl_done:            { ru: 'Сохранено', uk: 'Збережено', en: 'Saved' },
            dl_failed:          { ru: 'Не удалось сохранить', uk: 'Не вдалося зберегти', en: 'Could not save' },
            dl_left:            { ru: 'осталось', uk: 'залишилось', en: 'left' },
            dl_leave_warning:   { ru: 'Идёт скачивание. Если закрыть вкладку, оно прервётся.', uk: 'Йде завантаження. Якщо закрити вкладку, воно перерветься.', en: 'A download is running and will stop if you close the tab.' },
            dl_err_network:     { ru: 'браузер не получил данные: сервер не разрешает скачивание с сайта Lampa (CORS) или http-ссылка открыта на https-странице. Попробуйте «Открыть ссылку» или «Копировать команду ffmpeg».', uk: 'браузер не отримав дані: сервер не дозволяє завантаження з сайту Lampa (CORS) або http-посилання відкрите на https-сторінці. Спробуйте «Відкрити посилання» або «Копіювати команду ffmpeg».', en: 'the browser could not get the data: the server blocks downloads from the Lampa site (CORS) or an http link is opened on an https page. Try “Open link” or “Copy ffmpeg command”.' },
            dl_err_http:        { ru: 'сервер ответил ошибкой', uk: 'сервер відповів помилкою', en: 'the server returned an error' },
            dl_err_expired:     { ru: 'ссылка устарела или доступ запрещён — запустите видео заново и повторите', uk: 'посилання застаріло або доступ заборонено — запустіть відео знову і повторіть', en: 'the link expired or access is denied — restart the video and retry' },
            dl_err_encrypted:   { ru: 'поток зашифрован — такие плагин не сохраняет', uk: 'потік зашифровано — такі плагін не зберігає', en: 'the stream is encrypted and cannot be saved by the plugin' },
            dl_err_byterange:   { ru: 'поток с BYTERANGE пока не поддерживается', uk: 'потік з BYTERANGE поки не підтримується', en: 'BYTERANGE streams are not supported yet' },
            dl_err_codec:       { ru: 'кодек не подходит для MP4', uk: 'кодек не підходить для MP4', en: 'codec is not supported for MP4' },
            dl_err_codec_hint:  { ru: 'запустите снова и выберите тип «MPEG-TS» в окне сохранения', uk: 'запустіть знову і оберіть тип «MPEG-TS» у вікні збереження', en: 'run again and choose the “MPEG-TS” type in the save dialog' },
            dl_err_muxjs:       { ru: 'не удалось загрузить mux.js — сохраните как .ts', uk: 'не вдалося завантажити mux.js — збережіть як .ts', en: 'could not load mux.js — save as .ts' },
            dl_err_playlist:    { ru: 'это не плейлист HLS', uk: 'це не плейлист HLS', en: 'not an HLS playlist' },
            dl_err_empty:       { ru: 'в плейлисте нет частей видео', uk: 'у плейлисті немає частин відео', en: 'the playlist has no segments' },
            dl_copied:          { ru: 'Скопировано', uk: 'Скопійовано', en: 'Copied' },
            dl_copy_failed:     { ru: 'Не удалось скопировать — ссылка показана на экране', uk: 'Не вдалося скопіювати — посилання показано на екрані', en: 'Copy failed — the link is shown on screen' },
            dl_no_url:          { ru: 'Ссылка на видео недоступна', uk: 'Посилання на відео недоступне', en: 'Video link is not available' }
        });
    }

    function t(key) {
        return Lampa.Lang.translate(key);
    }

    /* ------------------------------------------------------------------ */
    /* Утилиты                                                             */
    /* ------------------------------------------------------------------ */

    function pad2(n) {
        n = parseInt(n, 10) || 0;
        return n < 10 ? '0' + n : String(n);
    }

    function stripTags(s) {
        return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function sanitizeFilename(s) {
        var clean = stripTags(s)
            .replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 150);

        return clean || 'video';
    }

    function baseName(filename) {
        return String(filename).replace(/\.[^.]+$/, '');
    }

    function toPlayUrl(url) {
        try {
            if (Lampa.Torserver && Lampa.Torserver.toPlayUrl) return Lampa.Torserver.toPlayUrl(url);
        } catch (e) {}

        return url;
    }

    function resolveUrl(uri, base) {
        try {
            return new URL(uri, base).href;
        } catch (e) {
            return uri;
        }
    }

    /** Путь из URL без query и hash, раскодированный. */
    function urlPath(url) {
        var m = String(url).match(/^[a-z][a-z0-9+.\-]*:\/\/[^\/?#]*([^?#]*)/i);
        var path = m ? m[1] : String(url).split(/[?#]/)[0];

        try {
            return decodeURIComponent(path);
        } catch (e) {
            return path;
        }
    }

    // Так же, как решает сам плеер Lampa: «.m3u8» / «.mpd» в любом месте ссылки
    function isDash(url) {
        return /\.mpd/i.test(url) || /[?&](type|format|ext)=(mpd|dash)(&|$)/i.test(url);
    }

    function isHls(url) {
        return !isDash(url) && (/\.m3u8/i.test(url) || /[?&](type|format|ext)=(m3u8|hls)(&|$)/i.test(url));
    }

    /** HLS / DASH — это плейлист из кусочков, а не один файл. */
    function isStream(url) {
        return isHls(url) || isDash(url);
    }

    function extOf(url) {
        var m = urlPath(url).match(/\.(mp4|m4v|mkv|avi|mov|webm|ts|mpg|mpeg|wmv|flv)$/i);
        return m ? m[1].toLowerCase() : 'mp4';
    }

    function formatBytes(n) {
        if (!n) return '0 МБ';
        if (n >= 1073741824) return (n / 1073741824).toFixed(2).replace('.', ',') + ' ГБ';
        return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1).replace('.', ',') + ' МБ';
    }

    function formatDuration(sec) {
        sec = Math.max(0, Math.round(sec || 0));

        var h = Math.floor(sec / 3600);
        var m = Math.floor(sec % 3600 / 60);
        var s = sec % 60;

        return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s);
    }

    function formatBitrate(bps) {
        if (!bps) return '';
        return (bps / 1000000).toFixed(1).replace('.', ',') + ' Мбит/с';
    }

    function currentCard(data) {
        if (data && data.card) return data.card;

        try {
            var active = Lampa.Activity.active();
            if (active && active.movie) return active.movie;
        } catch (e) {}

        return {};
    }

    /**
     * «Название S01E02 [1080p].mp4» или «Название (2024) [1080p].mp4»
     */
    function buildFilename(data, quality, ext) {
        var card  = currentCard(data);
        var isTv  = Boolean(card.original_name || (card.name && !card.title));
        var title = stripTags(card.title || card.name) || stripTags(data.title) || 'video';
        var parts = [title];

        if (data.season && data.episode) {
            parts.push('S' + pad2(data.season) + 'E' + pad2(data.episode));
        } else if (isTv && data.title && stripTags(data.title) !== title) {
            parts.push(stripTags(data.title));
        } else {
            var year = String(card.release_date || card.first_air_date || '').slice(0, 4);
            if (/^\d{4}$/.test(year)) parts.push('(' + year + ')');
        }

        if (quality) parts.push('[' + quality + ']');

        return sanitizeFilename(parts.join(' ')) + '.' + ext;
    }

    /**
     * Все доступные ссылки: сначала то, что играет сейчас, потом остальные качества по убыванию.
     */
    function collectSources(data) {
        var list = [];
        var seen = {};
        var qualities = data.quality && typeof data.quality === 'object' && !Array.isArray(data.quality) ? data.quality : {};
        var keys = Object.keys(qualities);
        var qualityOf = {};

        function urlOf(value) {
            if (typeof value === 'string') return value;
            if (value && typeof value === 'object' && typeof value.url === 'string') return value.url;
            return '';
        }

        function add(url, quality, current) {
            if (!url || seen[url]) return;

            seen[url] = true;

            var stream = isStream(url);

            list.push({
                url: url,
                quality: quality || '',
                current: current,
                stream: stream,
                dash: isDash(url),
                filename: buildFilename(data, quality, stream ? 'mp4' : extOf(url))
            });
        }

        keys.forEach(function (q) {
            var u = urlOf(qualities[q]);
            if (u) qualityOf[toPlayUrl(u)] = q;
        });

        var current = toPlayUrl(data.url);

        add(current, qualityOf[current] || data.quality_switched || '', true);

        keys.sort(function (a, b) {
            return (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0);
        });

        keys.forEach(function (q) {
            var u = urlOf(qualities[q]);
            if (u) add(toPlayUrl(u), q, false);
        });

        return list;
    }

    /* ------------------------------------------------------------------ */
    /* Платформы                                                           */
    /* ------------------------------------------------------------------ */

    function isIOS() {
        var ua = navigator.userAgent || '';

        return Lampa.Platform.is('apple') ||
            /iphone|ipad|ipod/i.test(ua) ||
            // iPadOS Safari представляется как Mac
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isAndroidApp() {
        return Lampa.Platform.is('android') && Boolean(Lampa.Android);
    }

    function isTV() {
        try {
            return Lampa.Platform.tv();
        } catch (e) {
            return false;
        }
    }

    /** Браузер на компьютере, умеющий качать сам. */
    function canSaveToDisk() {
        return !isIOS() && !isAndroidApp() && !isTV() &&
            typeof window.fetch === 'function' &&
            typeof window.Promise === 'function' &&
            typeof window.Uint8Array === 'function' &&
            typeof window.URL === 'function';
    }

    /** File System Access API: Chrome / Edge на компьютере. */
    function hasFilePicker() {
        return typeof window.showSaveFilePicker === 'function';
    }

    /* ------------------------------------------------------------------ */
    /* Простые действия                                                    */
    /* ------------------------------------------------------------------ */

    function pauseVideo() {
        try {
            Lampa.PlayerVideo.pause();
        } catch (e) {}
    }

    function vlcDownloadUrl(src) {
        return 'vlc-x-callback://x-callback-url/download' +
            '?url=' + encodeURIComponent(src.url) +
            '&filename=' + encodeURIComponent(src.filename);
    }

    function downloadToVLC(src) {
        pauseVideo();
        window.location.assign(vlcDownloadUrl(src));
    }

    function openInAndroidApp(src) {
        pauseVideo();
        Lampa.Android.openPlayer(src.url, { title: baseName(src.filename), url: src.url });
    }

    function openInAndroidBrowser(src) {
        pauseVideo();
        Lampa.Android.openBrowser(src.url);
    }

    function clickLink(href, filename) {
        var a = document.createElement('a');

        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        // Сработает только для своих ссылок и blob:, иначе браузер просто откроет видео
        a.setAttribute('download', filename);

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function openLink(src) {
        pauseVideo();

        // NW.js-версия Lampa для ПК
        if (typeof nw !== 'undefined' && nw.Shell && nw.Shell.openExternal) {
            nw.Shell.openExternal(src.url);
            return;
        }

        clickLink(src.url, src.filename);
    }

    function ffmpegCommand(src) {
        var url  = src.url.replace(/"/g, '%22');
        var name = src.filename.replace(/"/g, "'");

        return 'ffmpeg -hide_banner -i "' + url + '" -c copy "' + name + '"';
    }

    function showText(title, text) {
        var enabled = Lampa.Controller.enabled().name;
        var body = $('<div class="selector" style="word-break:break-all;user-select:text;-webkit-user-select:text;line-height:1.4"></div>');

        body.text(text);

        Lampa.Modal.open({
            title: title,
            html: body,
            size: 'medium',
            onBack: function () {
                Lampa.Modal.close();
                Lampa.Controller.toggle(enabled);
            }
        });
    }

    function copy(text) {
        var done = false;

        function ok() {
            if (done) return;
            done = true;
            Lampa.Noty.show(t('dl_copied'));
        }

        function fail() {
            if (done) return;
            done = true;
            Lampa.Noty.show(t('dl_copy_failed'));
            showText(t('dl_title'), text);
        }

        function legacy() {
            try {
                Lampa.Utils.copyTextToClipboard(text, ok, fail);
            } catch (e) {
                fail();
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(ok, legacy);
        } else {
            legacy();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Сохранение на компьютер: ошибки и сеть                              */
    /* ------------------------------------------------------------------ */

    function dlError(code, detail, fatal) {
        var err = new Error(code + (detail ? ': ' + detail : ''));

        err.code   = code;
        err.detail = detail || '';
        err.fatal  = Boolean(fatal);
        err.lampaDownload = true;

        return err;
    }

    function normalizeError(err) {
        if (err && err.lampaDownload) return err;
        if (err && err.name === 'AbortError') return dlError('cancelled', '', true);
        if (err && err.name === 'TypeError' && /fetch|network|load failed/i.test(err.message || '')) return dlError('network', '', true);

        return dlError('unknown', err && err.message ? err.message : String(err), true);
    }

    function errorText(err) {
        switch (err.code) {
            case 'network':   return t('dl_err_network');
            case 'expired':   return t('dl_err_expired') + ' (' + err.detail + ')';
            case 'http':      return t('dl_err_http') + ' ' + err.detail;
            case 'encrypted': return t('dl_err_encrypted');
            case 'audio':     return t('dl_audio_separate');
            case 'byterange': return t('dl_err_byterange');
            case 'codec':     return t('dl_err_codec') + ': ' + err.detail + ' — ' + t('dl_err_codec_hint');
            case 'muxjs':     return t('dl_err_muxjs');
            case 'playlist':  return t('dl_err_playlist');
            case 'empty':     return t('dl_err_empty');
            case 'cancelled': return t('dl_cancelled');
            default:          return err.detail || err.message || String(err);
        }
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function fetchChecked(url, job) {
        var options = {};

        if (job && job.signal) options.signal = job.signal;

        return fetch(url, options).then(function (res) {
            if (res.ok) return res;

            if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
                throw dlError('expired', 'HTTP ' + res.status, true);
            }

            throw dlError('http', 'HTTP ' + res.status);
        });
    }

    function fetchText(url, job) {
        return fetchChecked(url, job).then(function (res) {
            var finalUrl = res.url || url;

            return res.text().then(function (text) {
                return { text: text, url: finalUrl };
            });
        });
    }

    function fetchBytes(url, job, retries) {
        return fetchChecked(url, job).then(function (res) {
            return res.arrayBuffer();
        }).then(function (buf) {
            job.loaded += buf.byteLength;

            return new Uint8Array(buf);
        }, function (err) {
            err = normalizeError(err);

            if (job.cancelled) throw dlError('cancelled', '', true);
            if (retries <= 0 || (err.fatal && err.code !== 'network')) throw err;

            return delay(1000 * (SEGMENT_RETRIES - retries + 1)).then(function () {
                return fetchBytes(url, job, retries - 1);
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Куда писать: файл на диске или память                               */
    /* ------------------------------------------------------------------ */

    var TYPE_MP4 = { description: 'MP4', accept: { 'video/mp4': ['.mp4'] } };
    var TYPE_TS  = { description: 'MPEG-TS (без конвертации)', accept: { 'video/mp2t': ['.ts'] } };

    function fileTypeFor(ext) {
        if (ext === 'mp4' || ext === 'm4v') return TYPE_MP4;
        if (ext === 'ts') return TYPE_TS;

        var accept = {};
        accept['video/' + (ext === 'mkv' ? 'x-matroska' : ext)] = ['.' + ext];

        return { description: ext.toUpperCase(), accept: accept };
    }

    function joinChunks(chunks) {
        if (chunks.length === 1) return chunks[0];

        var size = 0;
        var i;

        for (i = 0; i < chunks.length; i++) size += chunks[i].byteLength;

        var out = new Uint8Array(size);
        var offset = 0;

        for (i = 0; i < chunks.length; i++) {
            out.set(chunks[i], offset);
            offset += chunks[i].byteLength;
        }

        return out;
    }

    /** Файл на диске через окно «Сохранить как» (Chrome / Edge). */
    function diskTarget(suggestedName, types) {
        return window.showSaveFilePicker({ suggestedName: suggestedName, types: types }).then(function (handle) {
            return handle.createWritable().then(function (writable) {
                return {
                    name: handle.name,
                    memory: false,
                    write: function (chunk) {
                        return writable.write(chunk);
                    },
                    close: function () {
                        return writable.close();
                    },
                    abort: function () {
                        return Promise.resolve(writable.abort()).catch(noop).then(function () {
                            // Убираем пустой файл, который создало окно сохранения (Chrome 110+)
                            if (handle.remove) return handle.remove().catch(noop);
                        });
                    }
                };
            });
        });
    }

    /** Запасной вариант без File System Access: собрать в памяти и отдать браузеру. */
    function memoryTarget(name, mime) {
        var parts = [];
        var target = {
            name: name,
            memory: true,
            mime: mime,
            write: function (chunk) {
                parts.push(chunk);
                return Promise.resolve();
            },
            close: function () {
                var blob = new Blob(parts, { type: target.mime });
                var url  = URL.createObjectURL(blob);

                parts = [];
                clickLink(url, target.name);

                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 60000);

                return Promise.resolve();
            },
            abort: function () {
                parts = [];
                return Promise.resolve();
            }
        };

        return target;
    }

    function pickTarget(suggestedName, types) {
        if (hasFilePicker()) return diskTarget(suggestedName, types);

        var mime = Object.keys(types[0].accept)[0];

        return Promise.resolve(memoryTarget(suggestedName, mime));
    }

    /* ------------------------------------------------------------------ */
    /* Прогресс                                                            */
    /* ------------------------------------------------------------------ */

    function addStyles() {
        if (document.getElementById('lampa-dl-style')) return;

        var css =
            '.lampa-dl-progress{position:fixed;right:24px;bottom:24px;z-index:100000;width:340px;max-width:calc(100vw - 48px);' +
                'box-sizing:border-box;padding:14px 16px;border-radius:14px;background:rgba(22,22,26,.94);color:#fff;' +
                'font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.45)}' +
            '.lampa-dl-progress__name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:10px}' +
            '.lampa-dl-progress__bar{height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden}' +
            '.lampa-dl-progress__fill{height:100%;width:0;background:#fff;transition:width .3s}' +
            '.lampa-dl-progress__info{margin-top:8px;font-size:13px;opacity:.75}' +
            '.lampa-dl-progress__button{margin-top:10px;display:inline-block;padding:5px 14px;border-radius:7px;' +
                'background:rgba(255,255,255,.12);cursor:pointer;user-select:none}' +
            '.lampa-dl-progress__button:hover{background:rgba(255,255,255,.22)}' +
            '.lampa-dl-progress--error .lampa-dl-progress__fill{background:#e5534b}' +
            '.lampa-dl-progress--done .lampa-dl-progress__fill{background:#46c46e}';

        var style = document.createElement('style');

        style.id = 'lampa-dl-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function createProgress(job) {
        addStyles();

        var box = $(
            '<div class="lampa-dl-progress">' +
                '<div class="lampa-dl-progress__name"></div>' +
                '<div class="lampa-dl-progress__bar"><div class="lampa-dl-progress__fill"></div></div>' +
                '<div class="lampa-dl-progress__info"></div>' +
                '<div class="lampa-dl-progress__button"></div>' +
            '</div>'
        );

        var buttonEl = box.find('.lampa-dl-progress__button');

        box.find('.lampa-dl-progress__name').text(job.target.name);
        box.find('.lampa-dl-progress__info').text(t('dl_prepare'));
        buttonEl.text(t('dl_cancel'));

        buttonEl.on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (job.finished) box.remove();
            else job.cancel();
        });

        $('body').append(box);

        return {
            render: function () {
                var percent = 0;
                var info = [];
                var elapsed = (Date.now() - job.started) / 1000;
                var speed = elapsed > 1 ? job.loaded / elapsed : 0;
                var left = 0;

                if (job.parts) {
                    percent = job.partsDone / job.parts;
                    info.push(job.partsDone + ' / ' + job.parts + ' ' + t('dl_parts'));
                    if (job.partsDone) left = (job.parts - job.partsDone) * elapsed / job.partsDone;
                } else if (job.total) {
                    percent = job.loaded / job.total;
                    if (speed) left = (job.total - job.loaded) / speed;
                }

                info.unshift(Math.floor(percent * 100) + '%');
                info.push(formatBytes(job.loaded));
                if (speed) info.push(formatBytes(speed) + '/с');
                if (left > 1) info.push(t('dl_left') + ' ' + formatDuration(left));

                box.find('.lampa-dl-progress__name').text(job.target.name);
                box.find('.lampa-dl-progress__fill').css('width', (percent * 100).toFixed(1) + '%');
                box.find('.lampa-dl-progress__info').text(info.join(' · '));
            },
            finish: function (state, message) {
                box.addClass('lampa-dl-progress--' + state);
                box.find('.lampa-dl-progress__name').text(job.target.name);
                box.find('.lampa-dl-progress__info').text(message);
                buttonEl.text(t('dl_close'));

                if (state === 'done') {
                    box.find('.lampa-dl-progress__fill').css('width', '100%');
                    setTimeout(function () {
                        box.remove();
                    }, 8000);
                }
            }
        };
    }

    function onBeforeUnload(e) {
        if (!activeJob) return;

        e.preventDefault();
        e.returnValue = t('dl_leave_warning');

        return e.returnValue;
    }

    /**
     * Общая обвязка одного скачивания: прогресс, отмена, закрытие файла, ошибки.
     */
    function runJob(target, work) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var job = {
            target: target,
            loaded: 0,
            total: 0,
            parts: 0,
            partsDone: 0,
            started: Date.now(),
            cancelled: false,
            finished: false,
            signal: controller ? controller.signal : undefined,
            lastRender: 0
        };

        job.cancel = function () {
            job.cancelled = true;
            if (controller) controller.abort();
        };

        // Оборвать остальные запросы после ошибки, не выдавая её за отмену
        job.abortNetwork = function () {
            if (controller) controller.abort();
        };

        job.ui = createProgress(job);

        job.update = function (force) {
            var now = Date.now();

            if (!force && now - job.lastRender < 250) return;

            job.lastRender = now;
            job.ui.render();
        };

        activeJob = job;
        window.addEventListener('beforeunload', onBeforeUnload);

        function cleanup() {
            job.finished = true;
            activeJob = null;
            window.removeEventListener('beforeunload', onBeforeUnload);
        }

        return Promise.resolve()
            .then(function () {
                return work(job);
            })
            .then(function () {
                if (job.cancelled) throw dlError('cancelled', '', true);
                return target.close();
            })
            .then(function () {
                cleanup();
                job.ui.finish('done', t('dl_done') + ' · ' + formatBytes(job.loaded));
                Lampa.Noty.show(t('dl_done') + ': ' + target.name);
                return job;
            }, function (err) {
                err = job.cancelled ? dlError('cancelled', '', true) : normalizeError(err);

                return Promise.resolve(target.abort()).catch(noop).then(function () {
                    cleanup();

                    var text = err.code === 'cancelled' ? t('dl_cancelled') : t('dl_failed') + ': ' + errorText(err);

                    job.ui.finish('error', text);
                    Lampa.Noty.show(text);
                    console.log('LampaDownload', 'failed', err.message);

                    job.error = err;
                    return job;
                });
            });
    }

    function isPickerCancel(err) {
        return err && err.name === 'AbortError';
    }

    function reportEarly(err) {
        if (isPickerCancel(err)) return;
        Lampa.Noty.show(t('dl_failed') + ': ' + errorText(normalizeError(err)));
    }

    /* ------------------------------------------------------------------ */
    /* Прямой файл                                                         */
    /* ------------------------------------------------------------------ */

    function downloadDirect(url, job) {
        return fetchChecked(url, job).then(function (res) {
            // Ссылка без «.m3u8», а внутри всё-таки плейлист HLS — качаем как поток
            if (/mpegurl/i.test(res.headers.get('content-type') || '')) {
                return res.text().then(function (text) {
                    return resolveMediaPlaylist(job, parsePlaylist(text, res.url || url));
                }).then(function (pl) {
                    return downloadMediaPlaylist(job, pl, baseName(job.target.name) + '.ts');
                });
            }

            job.total = parseInt(res.headers.get('content-length'), 10) || 0;

            if (!res.body || !res.body.getReader) {
                return res.arrayBuffer().then(function (buf) {
                    job.loaded = buf.byteLength;
                    return job.target.write(new Uint8Array(buf));
                });
            }

            var reader = res.body.getReader();

            function pump() {
                return reader.read().then(function (r) {
                    if (r.done) return;

                    job.loaded += r.value.byteLength;
                    job.update();

                    return Promise.resolve(job.target.write(r.value)).then(pump);
                });
            }

            return pump();
        });
    }

    function saveDirectFile(src) {
        var ext = extOf(src.url);

        pauseVideo();

        return pickTarget(src.filename, [fileTypeFor(ext)]).then(function (target) {
            return runJob(target, function (job) {
                return downloadDirect(src.url, job);
            });
        }, reportEarly);
    }

    /* ------------------------------------------------------------------ */
    /* HLS: плейлист                                                       */
    /* ------------------------------------------------------------------ */

    function parseAttrs(str) {
        var attrs = {};
        var re = /([A-Z0-9\-]+)=("[^"]*"|[^,]*)/g;
        var m;

        while ((m = re.exec(str))) {
            attrs[m[1]] = m[2].charAt(0) === '"' ? m[2].slice(1, -1) : m[2];
        }

        return attrs;
    }

    function parsePlaylist(text, base) {
        var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
        var first = '';
        var i;

        for (i = 0; i < lines.length && !first; i++) first = lines[i].trim();

        if (first.indexOf('#EXTM3U') !== 0) throw dlError('playlist', '', true);

        var pl = {
            master: false,
            variants: [],
            audio: {},
            segments: [],
            encrypted: false,
            byterange: false,
            map: null,
            duration: 0
        };

        var inf = null;
        var segDuration = 0;
        var discontinuity = false;

        for (i = 0; i < lines.length; i++) {
            var l = lines[i].trim();

            if (!l) continue;

            if (l.indexOf('#EXT-X-STREAM-INF:') === 0) {
                pl.master = true;
                inf = parseAttrs(l.slice(18));
            } else if (l.indexOf('#EXT-X-MEDIA:') === 0) {
                var media = parseAttrs(l.slice(13));

                if (media.TYPE === 'AUDIO') {
                    var gid = media['GROUP-ID'] || '';
                    (pl.audio[gid] = pl.audio[gid] || []).push(media);
                }
            } else if (l.indexOf('#EXTINF:') === 0) {
                segDuration = parseFloat(l.slice(8)) || 0;
            } else if (l.indexOf('#EXT-X-KEY:') === 0) {
                var key = parseAttrs(l.slice(11));

                if (key.METHOD && key.METHOD !== 'NONE') pl.encrypted = true;
            } else if (l.indexOf('#EXT-X-MAP:') === 0) {
                var map = parseAttrs(l.slice(11));

                if (map.BYTERANGE) pl.byterange = true;
                if (map.URI && !pl.map) pl.map = { url: resolveUrl(map.URI, base) };
            } else if (l.indexOf('#EXT-X-BYTERANGE') === 0) {
                pl.byterange = true;
            } else if (l === '#EXT-X-DISCONTINUITY') {
                discontinuity = true;
            } else if (l.charAt(0) !== '#') {
                if (inf) {
                    pl.variants.push(makeVariant(inf, resolveUrl(l, base), pl));
                    inf = null;
                } else {
                    pl.segments.push({
                        url: resolveUrl(l, base),
                        duration: segDuration,
                        start: pl.duration,
                        discontinuity: discontinuity
                    });

                    pl.duration += segDuration;
                    segDuration = 0;
                    discontinuity = false;
                }
            }
        }

        if (pl.master) {
            pl.variants.forEach(function (v) {
                var group = pl.audio[v.audioGroup] || [];

                // Основная дорожка лежит в отдельном плейлисте → в видеопотоке звука нет
                v.audioSeparate = group.length > 0 && group.some(function (a) {
                    return a.URI && (a.DEFAULT === 'YES' || group.every(function (b) { return b.URI; }));
                });
            });

            pl.variants.sort(function (a, b) {
                return (b.height - a.height) || (b.bandwidth - a.bandwidth);
            });
        }

        return pl;
    }

    function makeVariant(attrs, url) {
        var res = (attrs.RESOLUTION || '').split('x');

        return {
            url: url,
            width: parseInt(res[0], 10) || 0,
            height: parseInt(res[1], 10) || 0,
            bandwidth: parseInt(attrs.BANDWIDTH, 10) || 0,
            codecs: attrs.CODECS || '',
            audioGroup: attrs.AUDIO || ''
        };
    }

    function validateMedia(pl) {
        if (pl.master) throw dlError('playlist', '', true);
        if (pl.encrypted) throw dlError('encrypted', '', true);
        if (pl.byterange) throw dlError('byterange', '', true);
        if (!pl.segments.length) throw dlError('empty', '', true);
    }

    /* ------------------------------------------------------------------ */
    /* HLS: MPEG-TS → MP4                                                  */
    /* ------------------------------------------------------------------ */

    var STREAM_TYPES = {
        0x01: 'MPEG-1 video', 0x02: 'MPEG-2 video', 0x10: 'MPEG-4 video', 0x1b: 'H.264', 0x24: 'HEVC',
        0x03: 'MP3', 0x04: 'MP3', 0x0f: 'AAC', 0x11: 'AAC-LATM', 0x81: 'AC-3', 0x87: 'E-AC-3'
    };
    var MP4_OK = { 0x1b: true, 0x0f: true, 0x15: true, 0x06: true };

    /** Типы потоков из PMT первого сегмента. */
    function tsStreamTypes(bytes) {
        var pmtPid = -1;
        var types = [];
        var off = 0;

        while (off + 188 <= bytes.length) {
            if (bytes[off] !== 0x47) {
                off++;
                continue;
            }

            var pusi = bytes[off + 1] & 0x40;
            var pid  = ((bytes[off + 1] & 0x1f) << 8) | bytes[off + 2];
            var afc  = (bytes[off + 3] & 0x30) >> 4;
            var p    = off + 4;
            var packetEnd = off + 188;

            off += 188;

            if (!pusi || afc === 2 || afc === 0) continue;
            if (afc === 3) p += bytes[p] + 1;

            p += bytes[p] + 1;  // pointer_field

            if (p + 3 > packetEnd) continue;

            var sectionLength = ((bytes[p + 1] & 0x0f) << 8) | bytes[p + 2];
            var end = Math.min(p + 3 + sectionLength - 4, packetEnd);
            var q;

            if (pid === 0 && pmtPid < 0 && bytes[p] === 0x00) {
                for (q = p + 8; q + 4 <= end; q += 4) {
                    var program = (bytes[q] << 8) | bytes[q + 1];

                    if (program !== 0) {
                        pmtPid = ((bytes[q + 2] & 0x1f) << 8) | bytes[q + 3];
                        break;
                    }
                }
            } else if (pid === pmtPid && bytes[p] === 0x02) {
                var programInfoLength = ((bytes[p + 10] & 0x0f) << 8) | bytes[p + 11];

                for (q = p + 12 + programInfoLength; q + 5 <= end;) {
                    types.push(bytes[q]);
                    q += 5 + (((bytes[q + 3] & 0x0f) << 8) | bytes[q + 4]);
                }

                break;
            }
        }

        return types;
    }

    function checkTsCodecs(bytes) {
        var bad = [];

        tsStreamTypes(bytes).forEach(function (type) {
            if (!MP4_OK[type] && STREAM_TYPES[type] && bad.indexOf(STREAM_TYPES[type]) < 0) bad.push(STREAM_TYPES[type]);
        });

        return { ok: bad.length === 0, names: bad };
    }

    /**
     * Склейка времени после #EXT-X-DISCONTINUITY.
     * mux.js после разрыва начинает время новой части с нуля, поэтому в готовых
     * фрагментах (moof → traf → tfdt) время сдвигается так, чтобы каждая дорожка
     * продолжалась ровно с того места, где закончилась.
     */
    function createTimelineFixer() {
        var tracks = {};   // track_ID → { offset, end, rebase }

        function u32(b, o) {
            return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
        }

        function setU32(b, o, v) {
            b[o]     = (v >>> 24) & 0xff;
            b[o + 1] = (v >>> 16) & 0xff;
            b[o + 2] = (v >>> 8) & 0xff;
            b[o + 3] = v & 0xff;
        }

        function boxes(b, start, end, fn) {
            var o = start;

            while (o + 8 <= end) {
                var size = u32(b, o);
                var type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);

                if (size < 8 || o + size > end) break;

                fn(type, o, o + size);
                o += size;
            }
        }

        function patchTraf(b, start, end) {
            var trackId = 0;
            var defaultDuration = 0;
            var tfdtAt = -1;
            var tfdtVersion = 0;
            var durations = 0;

            boxes(b, start + 8, end, function (type, o) {
                if (type === 'tfhd') {
                    var flags = u32(b, o + 8) & 0xffffff;
                    var p = o + 16;

                    trackId = u32(b, o + 12);

                    if (flags & 0x01) p += 8;
                    if (flags & 0x02) p += 4;
                    if (flags & 0x08) defaultDuration = u32(b, p);
                } else if (type === 'tfdt') {
                    tfdtAt = o;
                    tfdtVersion = b[o + 8];
                } else if (type === 'trun') {
                    var tflags = u32(b, o + 8) & 0xffffff;
                    var count = u32(b, o + 12);
                    var q = o + 16;
                    var step = 0;
                    var i;

                    if (tflags & 0x01) q += 4;
                    if (tflags & 0x04) q += 4;
                    if (tflags & 0x100) step += 4;
                    if (tflags & 0x200) step += 4;
                    if (tflags & 0x400) step += 4;
                    if (tflags & 0x800) step += 4;

                    for (i = 0; i < count; i++) {
                        durations += (tflags & 0x100) ? u32(b, q + i * step) : defaultDuration;
                    }
                }
            });

            if (tfdtAt < 0) return;

            var state = tracks[trackId] || (tracks[trackId] = { offset: 0, end: 0, rebase: false });
            var base = tfdtVersion === 1
                ? u32(b, tfdtAt + 12) * 4294967296 + u32(b, tfdtAt + 16)
                : u32(b, tfdtAt + 12);

            if (state.rebase) {
                state.offset = state.end - base;
                state.rebase = false;
            }

            var fixed = base + state.offset;

            if (state.offset !== 0) {
                if (tfdtVersion === 1) {
                    setU32(b, tfdtAt + 12, Math.floor(fixed / 4294967296));
                    setU32(b, tfdtAt + 16, fixed % 4294967296);
                } else {
                    setU32(b, tfdtAt + 12, fixed);
                }
            }

            state.end = fixed + durations;
        }

        return {
            discontinuity: function () {
                Object.keys(tracks).forEach(function (id) {
                    tracks[id].rebase = true;
                });
            },
            patch: function (bytes) {
                boxes(bytes, 0, bytes.length, function (type, o, end) {
                    if (type !== 'moof') return;

                    boxes(bytes, o + 8, end, function (child, co, cend) {
                        if (child === 'traf') patchTraf(bytes, co, cend);
                    });
                });

                return bytes;
            }
        };
    }

    function loadMuxjs() {
        if (window.muxjs && window.muxjs.mp4) return Promise.resolve(window.muxjs);

        return new Promise(function (resolve, reject) {
            var index = 0;

            function next() {
                if (index >= MUXJS_URLS.length) {
                    reject(dlError('muxjs', '', true));
                    return;
                }

                var script = document.createElement('script');

                script.src = MUXJS_URLS[index++];
                script.async = true;
                script.onload = function () {
                    if (window.muxjs && window.muxjs.mp4) resolve(window.muxjs);
                    else next();
                };
                script.onerror = next;

                document.head.appendChild(script);
            }

            next();
        });
    }

    /**
     * Возвращает функцию (index, bytes) → Promise, которая пишет сегмент в файл.
     * mode: 'raw' — как есть (.ts или fMP4-части), 'mp4' — перепаковка mux.js.
     */
    function createSegmentWriter(job, mode, pl, fallbackName) {
        var target = job.target;

        if (mode === 'raw') {
            return function (index, bytes) {
                return target.write(bytes);
            };
        }

        var transmuxer = new window.muxjs.mp4.Transmuxer({ remux: true, keepOriginalTimestamps: false });
        var timeline = createTimelineFixer();
        var output = [];
        var wroteInit = false;
        var passthrough = false;

        transmuxer.on('data', function (segment) {
            if (!wroteInit && segment.initSegment && segment.initSegment.byteLength) {
                output.push(segment.initSegment);
                wroteInit = true;
            }

            if (wroteInit && segment.data && segment.data.byteLength) output.push(timeline.patch(segment.data));
        });

        return function (index, bytes) {
            if (passthrough) return target.write(bytes);

            if (index === 0) {
                var check = checkTsCodecs(bytes);

                if (!check.ok) {
                    // В памяти ещё ничего не записано — можно тихо перейти на .ts
                    if (target.memory) {
                        passthrough = true;
                        target.name = fallbackName;
                        target.mime = 'video/mp2t';
                        job.ui.render();
                        return target.write(bytes);
                    }

                    throw dlError('codec', check.names.join(', '), true);
                }
            }

            var seg = pl.segments[index];

            if (index > 0 && seg && seg.discontinuity) {
                // Сброс разбора времени в mux.js (иначе он выкинет кадры с «прошлым» временем),
                // а непрерывность восстановит timeline.patch
                transmuxer.setBaseMediaDecodeTime(Math.round(seg.start * 90000));
                timeline.discontinuity();
            }

            transmuxer.push(bytes);
            transmuxer.flush();

            if (index === 0 && !wroteInit) throw dlError('codec', '?', true);

            var chunks = output;
            output = [];

            return chunks.length ? target.write(joinChunks(chunks)) : Promise.resolve();
        };
    }

    /**
     * Качает сегменты параллельно, а пишет строго по порядку.
     */
    function downloadSegments(job, segments, writeSegment) {
        return new Promise(function (resolve, reject) {
            var window_ = SEGMENT_CONCURRENCY * 2;
            var nextFetch = 0;
            var nextWrite = 0;
            var running = 0;
            var ready = {};
            var writing = false;
            var finished = false;

            function fail(err) {
                if (finished) return;
                finished = true;
                job.abortNetwork();
                reject(err);
            }

            function pump() {
                if (finished) return;
                if (job.cancelled) return fail(dlError('cancelled', '', true));

                while (running < SEGMENT_CONCURRENCY && nextFetch < segments.length && nextFetch < nextWrite + window_) {
                    start(nextFetch++);
                }

                writeNext();
            }

            function start(index) {
                running++;

                fetchBytes(segments[index].url, job, SEGMENT_RETRIES).then(function (bytes) {
                    running--;
                    ready[index] = bytes;
                    job.update();
                    pump();
                }, function (err) {
                    running--;
                    fail(err);
                });
            }

            function writeNext() {
                if (writing || finished) return;

                if (nextWrite >= segments.length) {
                    finished = true;
                    resolve();
                    return;
                }

                var bytes = ready[nextWrite];

                if (!bytes) return;

                delete ready[nextWrite];
                writing = true;

                Promise.resolve()
                    .then(function () {
                        return writeSegment(nextWrite, bytes);
                    })
                    .then(function () {
                        writing = false;
                        nextWrite++;
                        job.partsDone = nextWrite;
                        job.update(nextWrite === segments.length);
                        pump();
                    }, fail);
            }

            pump();
        });
    }

    /* ------------------------------------------------------------------ */
    /* HLS: сценарий                                                       */
    /* ------------------------------------------------------------------ */

    /** Из master-плейлиста берём лучшее качество, из media — его самого. */
    function resolveMediaPlaylist(job, pl) {
        if (!pl.master) return Promise.resolve(pl);

        var variant = pl.variants[0];

        if (!variant) throw dlError('empty', '', true);
        if (variant.audioSeparate) throw dlError('audio', '', true);

        return fetchText(variant.url, job).then(function (r) {
            return parsePlaylist(r.text, r.url);
        });
    }

    /** Скачать все части media-плейлиста в job.target. */
    function downloadMediaPlaylist(job, pl, fallbackName) {
        var target = job.target;

        validateMedia(pl);

        job.parts = pl.segments.length;
        job.total = 0;
        job.update(true);

        var mode  = pl.map || /\.ts$/i.test(target.name) ? 'raw' : 'mp4';
        var ready = mode === 'mp4' ? loadMuxjs() : Promise.resolve();

        return ready.then(function () {
            // fMP4-поток: сначала init-сегмент, дальше части как есть
            if (pl.map) {
                return fetchBytes(pl.map.url, job, SEGMENT_RETRIES).then(function (init) {
                    return target.write(init);
                });
            }
        }).then(function () {
            return downloadSegments(job, pl.segments, createSegmentWriter(job, mode, pl, fallbackName));
        });
    }

    function saveHlsVariant(src, variant) {
        var name = baseName(src.filename);

        pauseVideo();

        return pickTarget(name + '.mp4', [TYPE_MP4, TYPE_TS]).then(function (target) {
            return runJob(target, function (job) {
                var playlist = variant.playlist
                    ? Promise.resolve(variant.playlist)
                    : fetchText(variant.url, job).then(function (r) {
                        return parsePlaylist(r.text, r.url);
                    });

                return playlist.then(function (pl) {
                    return downloadMediaPlaylist(job, pl, name + '.ts');
                });
            });
        }, reportEarly);
    }

    function variantItem(variant, index) {
        var title = variant.height ? variant.height + 'p' : (variant.bandwidth ? formatBitrate(variant.bandwidth) : '#' + (index + 1));
        var sub = [];

        if (variant.width && variant.height) sub.push(variant.width + '×' + variant.height);
        if (variant.bandwidth && variant.height) sub.push(formatBitrate(variant.bandwidth));
        if (/hvc1|hev1/i.test(variant.codecs)) sub.push(t('dl_hevc_note'));
        if (variant.audioSeparate) sub.push(t('dl_audio_separate'));

        return {
            title: title,
            subtitle: sub.join(' · '),
            ghost: variant.audioSeparate,
            variant: variant
        };
    }

    function showVariants(src, pl, enabled) {
        var items;

        if (pl.master) {
            items = pl.variants.map(variantItem);
        } else {
            items = [{
                title: t('dl_start') + (src.quality ? ' · ' + src.quality : ''),
                subtitle: formatDuration(pl.duration) + ' · ' + pl.segments.length + ' ' + t('dl_parts'),
                variant: { url: src.url, playlist: pl }
            }];
        }

        if (!hasFilePicker()) items.unshift({ title: t('dl_save_hint_memory'), separator: true });

        Lampa.Select.show({
            title: t('dl_choose'),
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle(enabled);

                if (item.variant.audioSeparate) {
                    Lampa.Noty.show(t('dl_audio_separate'));
                    return;
                }

                saveHlsVariant(src, item.variant);
            },
            onBack: function () {
                Lampa.Controller.toggle(enabled);
            }
        });
    }

    function prepareHls(src) {
        var enabled = Lampa.Controller.enabled().name;

        Lampa.Noty.show(t('dl_reading'));

        return fetchText(src.url).then(function (r) {
            var pl = parsePlaylist(r.text, r.url);

            if (pl.master && !pl.variants.length) throw dlError('empty', '', true);
            if (!pl.master) validateMedia(pl);

            showVariants(src, pl, enabled);
        }).catch(reportEarly);
    }

    function saveToDisk(src) {
        if (activeJob) {
            Lampa.Noty.show(t('dl_busy'));
            return;
        }

        if (src.stream) prepareHls(src);
        else saveDirectFile(src);
    }

    /* ------------------------------------------------------------------ */
    /* Меню                                                                */
    /* ------------------------------------------------------------------ */

    function buildItems(src, sources) {
        var items = [];
        var desktop = canSaveToDisk();

        if (src.dash) {
            items.push({ title: t('dl_dash_note'), separator: true });
        } else if (src.stream) {
            if (desktop) {
                items.push({ title: t('dl_save'), subtitle: t('dl_save_hint_hls'), run: function () { saveToDisk(src); } });
            } else {
                items.push({ title: t('dl_stream_note'), separator: true });
            }
        } else if (isIOS()) {
            items.push({ title: t('dl_vlc'), subtitle: t('dl_vlc_hint'), run: function () { downloadToVLC(src); } });
        } else if (isAndroidApp()) {
            items.push({ title: t('dl_android_app'), subtitle: t('dl_android_app_hint'), run: function () { openInAndroidApp(src); } });

            if (Lampa.Android.openBrowser) {
                items.push({ title: t('dl_android_browser'), run: function () { openInAndroidBrowser(src); } });
            }
        } else if (!isTV()) {
            if (desktop && hasFilePicker()) {
                items.push({ title: t('dl_save'), subtitle: t('dl_save_hint_file'), run: function () { saveToDisk(src); } });
            }

            items.push({ title: t('dl_open'), subtitle: t('dl_open_hint'), run: function () { openLink(src); } });
        }

        items.push({ title: t('dl_copy_link'), subtitle: src.filename, run: function () { copy(src.url); } });
        items.push({ title: t('dl_copy_ffmpeg'), subtitle: t('dl_ffmpeg_hint'), run: function () { copy(ffmpegCommand(src)); } });

        if (isTV()) {
            items.push({ title: t('dl_show_link'), run: function () { showText(src.filename, src.url); } });
        }

        if (sources.length > 1) {
            items.push({
                title: t('dl_quality') + ': ' + (src.quality || t('dl_unknown_quality')),
                subtitle: t('dl_quality_hint'),
                quality_menu: true
            });
        }

        return items;
    }

    function showActions(sources, index, enabled) {
        var src = sources[index];

        Lampa.Select.show({
            title: t('dl_title') + (src.quality ? ' · ' + src.quality : ''),
            items: buildItems(src, sources),
            onSelect: function (item) {
                if (item.quality_menu) {
                    showQualities(sources, index, enabled);
                    return;
                }

                Lampa.Controller.toggle(enabled);

                if (item.run) item.run();
            },
            onBack: function () {
                Lampa.Controller.toggle(enabled);
            }
        });
    }

    function showQualities(sources, index, enabled) {
        Lampa.Select.show({
            title: t('dl_quality'),
            items: sources.map(function (s, i) {
                return {
                    title: s.quality || t('dl_unknown_quality'),
                    subtitle: s.current ? t('dl_now_playing') : '',
                    selected: i === index,
                    index: i
                };
            }),
            onSelect: function (item) {
                showActions(sources, item.index, enabled);
            },
            onBack: function () {
                showActions(sources, index, enabled);
            }
        });
    }

    function openMenu() {
        var data = Lampa.Player.playdata();

        if (!data || typeof data.url !== 'string' || !data.url) {
            Lampa.Noty.show(t('dl_no_url'));
            return;
        }

        var sources = collectSources(data);

        if (!sources.length) {
            Lampa.Noty.show(t('dl_no_url'));
            return;
        }

        showActions(sources, 0, Lampa.Controller.enabled().name);
    }

    /* ------------------------------------------------------------------ */
    /* Кнопка в плеере                                                     */
    /* ------------------------------------------------------------------ */

    function canDownload(data) {
        if (!data || typeof data.url !== 'string' || !data.url) return false;
        if (data.iptv || data.youtube) return false;
        if (/(^|\.)youtube\.com\/|youtu\.be\//i.test(data.url)) return false;

        return true;
    }

    function createButton() {
        button = $(
            '<div class="button selector lampa-download-button hide" data-controller="player_panel">' +
                ICON +
                '<div class="tooltip">' + t('dl_button') + '</div>' +
            '</div>'
        );

        button.on('hover:enter', openMenu);

        var panel  = Lampa.PlayerPanel.render();
        // Кнопка должна быть внутри .player-panel__tv-visible: оттуда же мобильное меню «⋯» собирает пункты
        var anchor = panel.find('.player-panel__tv-visible .player-panel__settings');

        if (anchor.length) anchor.before(button);
        else panel.find('.player-panel__right .player-panel__box-buttons').last().prepend(button);
    }

    function start() {
        if (window.lampa_download_ready) return;
        window.lampa_download_ready = true;

        addLang();
        createButton();

        Lampa.Player.listener.follow('start', function (data) {
            button.toggleClass('hide', !canDownload(data));
        });

        Lampa.Player.listener.follow('destroy', function () {
            button.addClass('hide');
        });

        // Для отладки и тестов
        window.LampaDownload = {
            version: VERSION,
            collectSources: collectSources,
            buildFilename: buildFilename,
            isStream: isStream,
            parsePlaylist: parsePlaylist,
            checkTsCodecs: checkTsCodecs,
            vlcDownloadUrl: vlcDownloadUrl,
            ffmpegCommand: ffmpegCommand,
            openMenu: openMenu,
            activeJob: function () { return activeJob; }
        };

        console.log('LampaDownload', 'ready', VERSION);
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
