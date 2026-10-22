import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Controller()
export class HomepageController {
  @Get()
  home(@Res() reply: FastifyReply): FastifyReply {
    return reply.type('text/html; charset=utf-8').send(this.page());
  }

  page(): string {
    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>NguồnC</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; }
    main { width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
    h1 { margin: 0; font-size: clamp(1.75rem, 5vw, 2.5rem); }
    .subtitle, .hint, #status { color: #cbd5e1; }
    .subtitle { margin: 8px 0 28px; }
    form { display: flex; gap: 8px; }
    input, button { font: inherit; }
    #query { min-width: 0; flex: 1; padding: 12px 14px; border: 1px solid #475569; border-radius: 8px; background: #1e293b; color: inherit; }
    button { border: 0; border-radius: 8px; padding: 11px 14px; background: #38bdf8; color: #082f49; cursor: pointer; font-weight: 700; }
    button:hover { background: #7dd3fc; }
    button.secondary { background: #334155; color: #f8fafc; }
    #status { min-height: 1.5em; margin: 16px 0; }
    #content { display: grid; gap: 12px; }
    .result, .detail, .source { border: 1px solid #334155; border-radius: 10px; background: #172033; padding: 14px; }
    .result { display: flex; gap: 14px; text-align: left; width: 100%; color: inherit; background: #172033; }
    .result:hover { background: #243047; }
    .poster { width: 72px; height: 100px; border-radius: 6px; object-fit: cover; background: #334155; }
    .result h2, .detail h2 { margin: 0 0 1rem 0; font-size: 1.1rem; }
    .meta { margin: 6px 0 0; color: #cbd5e1; }
    .episodes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .episodes button { background: #334155; color: #f8fafc; }
    .source { display: grid; gap: 8px; }
    .source-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .source label { font-weight: 700; }
    .url-row { display: flex; gap: 8px; }
    .url-row input { min-width: 0; flex: 1; padding: 9px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: #e2e8f0; }
    .empty { color: #cbd5e1; }
    @media (max-width: 520px) { main { width: min(100% - 24px, 900px); padding-top: 28px; } form, .url-row { flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <form id="search-form">
      <input id="query" name="query" type="search" autocomplete="off" required>
      <button type="submit">Tìm</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
    <section id="content" aria-live="polite"></section>
  </main>
  <script>
    (() => {
      const form = document.querySelector('#search-form');
      const queryInput = document.querySelector('#query');
      const status = document.querySelector('#status');
      const content = document.querySelector('#content');
      let requestNumber = 0;
      let lastResults = [];

      function setStatus(message) {
        status.textContent = message;
      }

      function clearContent() {
        content.replaceChildren();
      }

      function isSafeUrl(value) {
        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      }

      function element(name, className, text) {
        const node = document.createElement(name);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      }

      async function api(path) {
        const response = await fetch(path, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Yêu cầu không thành công');
        return response.json();
      }

      function renderResults(results) {
        clearContent();
        if (!results.length) {
          content.append(element('p', 'empty', 'Không tìm thấy'));
          return;
        }

        for (const meta of results) {
          const button = element('button', 'result');
          button.type = 'button';
          if (isSafeUrl(meta.poster)) {
            const poster = document.createElement('img');
            poster.className = 'poster';
            poster.src = meta.poster;
            poster.alt = '';
            button.append(poster);
          }
          const text = element('span');
          text.append(element('h2', '', typeof meta.name === 'string' ? meta.name : 'Không rõ tên'));
          const type = meta.type === 'series' ? 'Phim bộ' : 'Phim lẻ';
          const year = Number.isInteger(meta.year) ? ' · ' + meta.year : '';
          text.append(element('p', 'meta', type + year));
          button.append(text);
          button.addEventListener('click', () => showMeta(meta.type, meta.id));
          content.append(button);
        }
      }

      function addBackButton(container) {
        const back = element('button', 'secondary', 'Quay lại kết quả');
        back.type = 'button';
        back.addEventListener('click', () => {
          setStatus('');
          renderResults(lastResults);
        });
        container.append(back);
      }

      function renderSources(streams, detail) {
        clearContent();
        const heading = element('div', 'detail');
        heading.append(element('h2', '', detail));
        addBackButton(heading);
        content.append(heading);

        const safeStreams = Array.isArray(streams) ? streams.filter((stream) => stream && isSafeUrl(stream.url)) : [];
        if (!safeStreams.length) {
          content.append(element('p', 'empty', 'Không có link khả dụng cho lựa chọn này.'));
          return;
        }
        for (const stream of safeStreams) {
          const card = element('div', 'source');
          const sourceHead = element('div', 'source-head');
          sourceHead.append(element('label', '', typeof stream.name === 'string' ? stream.name : 'Nguồn phát'));
          if (typeof stream.description === 'string' && stream.description) sourceHead.append(element('span', 'meta', stream.description));
          card.append(sourceHead);
          const row = element('div', 'url-row');
          const input = document.createElement('input');
          input.type = 'text';
          input.value = stream.url;
          input.readOnly = true;
          input.setAttribute('aria-label', 'Link');
          const copy = element('button', '', 'Sao chép');
          copy.type = 'button';
          copy.addEventListener('click', async () => {
            try {
              if (!navigator.clipboard) throw new Error('Clipboard unavailable');
              await navigator.clipboard.writeText(stream.url);
              setStatus('Đã sao chép link');
            } catch {
              input.focus();
              input.select();
              setStatus('Không thể sao chép tự động; link đã được chọn để bạn tự sao chép.');
            }
          });
          row.append(input, copy);
          card.append(row);
          content.append(card);
        }
      }

      async function resolveStreams(type, id, title) {
        const request = ++requestNumber;
        setStatus('Đang lấy link...');
        try {
          const payload = await api('/stream/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '.json');
          if (request !== requestNumber) return;
          setStatus('');
          renderSources(payload && payload.streams, title);
        } catch {
          if (request !== requestNumber) return;
          setStatus('Không thể lấy link. Vui lòng thử lại.');
          clearContent();
        }
      }

      function renderSeries(meta) {
        clearContent();
        const detail = element('div', 'detail');
        detail.append(element('h2', '', typeof meta.name === 'string' ? meta.name : 'Chọn tập'));
        addBackButton(detail);
        const episodes = element('div', 'episodes');
        const videos = Array.isArray(meta.videos) ? meta.videos : [];
        for (const video of videos) {
          if (!video || typeof video.id !== 'string') continue;
          const episodeSlug = video.id.slice(video.id.lastIndexOf(':') + 1);
          if (!episodeSlug || !video.id.startsWith(meta.id + ':')) continue;
          const episode = element('button', '', typeof video.title === 'string' ? video.title : 'Tập');
          episode.type = 'button';
          episode.addEventListener('click', () => resolveStreams('series', meta.id + ':' + episodeSlug, meta.name + ' · ' + episode.textContent));
          episodes.append(episode);
        }
        detail.append(episodes);
        content.append(detail);
        if (!episodes.childElementCount) content.append(element('p', 'empty', 'Không tìm thấy tập để chọn.'));
      }

      async function showMeta(type, id) {
        if ((type !== 'movie' && type !== 'series') || typeof id !== 'string') return;
        const request = ++requestNumber;
        setStatus('Đang tải thông tin...');
        clearContent();
        try {
          const payload = await api('/meta/' + encodeURIComponent(type) + '/' + encodeURIComponent(id) + '.json');
          if (request !== requestNumber) return;
          const meta = payload && payload.meta;
          if (!meta || meta.type !== type || typeof meta.id !== 'string') throw new Error('Dữ liệu không hợp lệ');
          setStatus('');
          if (meta.type === 'series') {
            renderSeries(meta);
          } else {
            resolveStreams('movie', meta.id, typeof meta.name === 'string' ? meta.name : 'Phim');
          }
        } catch {
          if (request !== requestNumber) return;
          setStatus('Không thể tải thông tin. Vui lòng thử lại.');
        }
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const query = queryInput.value.trim();
        if (!query) {
          setStatus('Hãy nhập tên để tìm kiếm.');
          queryInput.focus();
          return;
        }
        const request = ++requestNumber;
        setStatus('Đang tìm...');
        clearContent();
        try {
          const encoded = encodeURIComponent(query);
          const responses = await Promise.all([
            api('/catalog/movie/nguonc-latest/search=' + encoded + '.json'),
            api('/catalog/series/nguonc-latest/search=' + encoded + '.json'),
          ]);
          if (request !== requestNumber) return;
          const byId = new Map();
          for (const response of responses) {
            const metas = response && Array.isArray(response.metas) ? response.metas : [];
            for (const meta of metas) {
              if (meta && (meta.type === 'movie' || meta.type === 'series') && typeof meta.id === 'string') byId.set(meta.id, meta);
            }
          }
          lastResults = [...byId.values()];
          setStatus('');
          renderResults(lastResults);
        } catch {
          if (request !== requestNumber) return;
          setStatus('Không thể tìm. Vui lòng thử lại.');
        }
      });
    })();
  </script>
</body>
</html>`;
  }
}
