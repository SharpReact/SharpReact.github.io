/*!
 * Lampa Download — кнопка «Скачать» в плеере Lampa
 * Версия 0.1.0
 *
 * Установка: Настройки → Расширения → Добавить плагин → URL этого файла → перезапустить Lampa.
 *
 * Что делает:
 *   - добавляет кнопку «Скачать» в панель плеера (на телефоне/планшете она в меню «⋯»);
 *   - берёт ссылку на то, что играет сейчас, с учётом выбранного качества;
 *   - iPad / iPhone: отдаёт файл в VLC на скачивание (vlc-x-callback://x-callback-url/download);
 *   - Android (APK Lampa): открывает ссылку во внешнем приложении (1DM, ADM…) или в браузере;
 *   - ПК / браузер: открывает ссылку на скачивание;
 *   - везде: копирует ссылку или готовую команду ffmpeg (нужна для HLS-потоков .m3u8).
 *
 * Написан на ES5 без сборки, чтобы работать и на старых телевизорах.
 */
(function () {
    'use strict';

    var VERSION = '0.1.0';

    var ICON =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M12 3.5v11m0 0l-4.5-4.5m4.5 4.5l4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';

    var button = null;

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
            dl_stream_note:     { ru: 'Это поток HLS/DASH: файлом его не скачать, только через ffmpeg', uk: 'Це потік HLS/DASH: файлом його не завантажити, лише через ffmpeg', en: 'This is an HLS/DASH stream: it can only be saved with ffmpeg' },
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

    function toPlayUrl(url) {
        try {
            if (Lampa.Torserver && Lampa.Torserver.toPlayUrl) return Lampa.Torserver.toPlayUrl(url);
        } catch (e) {}

        return url;
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

    /** HLS / DASH — это плейлист из кусочков, а не один файл. */
    function isStream(url) {
        return /\.(m3u8|mpd)$/i.test(urlPath(url)) ||
            /[?&](type|format|ext)=(m3u8|hls|mpd|dash)(&|$)/i.test(url);
    }

    function extOf(url) {
        var m = urlPath(url).match(/\.(mp4|m4v|mkv|avi|mov|webm|ts|mpg|mpeg|wmv|flv)$/i);
        return m ? m[1].toLowerCase() : 'mp4';
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

    /* ------------------------------------------------------------------ */
    /* Действия                                                            */
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
        Lampa.Android.openPlayer(src.url, { title: src.filename.replace(/\.[^.]+$/, ''), url: src.url });
    }

    function openInAndroidBrowser(src) {
        pauseVideo();
        Lampa.Android.openBrowser(src.url);
    }

    function openLink(src) {
        pauseVideo();

        // NW.js-версия Lampa для ПК
        if (typeof nw !== 'undefined' && nw.Shell && nw.Shell.openExternal) {
            nw.Shell.openExternal(src.url);
            return;
        }

        var a = document.createElement('a');

        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener';
        // Сработает только для ссылок с того же домена, иначе браузер просто откроет видео
        a.setAttribute('download', src.filename);

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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
    /* Меню                                                                */
    /* ------------------------------------------------------------------ */

    function buildItems(src, sources) {
        var items = [];

        if (src.stream) {
            items.push({ title: t('dl_stream_note'), separator: true });
        } else if (isIOS()) {
            items.push({ title: t('dl_vlc'), subtitle: t('dl_vlc_hint'), run: function () { downloadToVLC(src); } });
        } else if (isAndroidApp()) {
            items.push({ title: t('dl_android_app'), subtitle: t('dl_android_app_hint'), run: function () { openInAndroidApp(src); } });

            if (Lampa.Android.openBrowser) {
                items.push({ title: t('dl_android_browser'), run: function () { openInAndroidBrowser(src); } });
            }
        } else if (!isTV()) {
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
            vlcDownloadUrl: vlcDownloadUrl,
            ffmpegCommand: ffmpegCommand,
            openMenu: openMenu
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
