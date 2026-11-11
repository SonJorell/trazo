import { MSG } from '/shared/protocol.js';
import { h } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { pagesDialog } from '../ui/dialogs.js';

/**
 * Herramientas de la sesión compartida:
 * - Páginas: una por diapositiva (o por hoja de pizarra). Todos ven la misma.
 * - Temporizador: cuenta regresiva visible para todos.
 * - Votación rápida: el anfitrión pregunta, los demás votan y se ven los resultados en vivo.
 */
export function setupSession({ connection, scene, canSteer, isHost, paintThumb = () => {} }) {
  // ---------------- Páginas ----------------
  const prevBtn = h('button', { class: 'icon-btn', title: 'Página anterior', 'aria-label': 'Página anterior' }, '‹');
  const nextBtn = h('button', { class: 'icon-btn', title: 'Página siguiente (crea una nueva al final)', 'aria-label': 'Página siguiente' }, '›');
  const number = h('span', { class: 'page-number' });
  const titleEl = h('span', { class: 'page-title' });
  const label = h('button', { class: 'page-label', title: 'Página actual (toca para ponerle título)' }, number, titleEl);
  const group = h('div', { class: 'group page-group' }, prevBtn, label, nextBtn);
  document.querySelector('.bottombar').append(group);
  let titles = {}; // página → título

  const titleOf = (n) => titles[String(n)] ?? '';
  const paintPages = () => {
    const steer = canSteer();
    number.textContent = `Pág. ${scene.page + 1}/${scene.pageCount()}`;
    titleEl.textContent = titleOf(scene.page);
    titleEl.hidden = !titleOf(scene.page);
    label.title = `${titleOf(scene.page) || 'Página actual'} — toca para ver todas las páginas`;
    prevBtn.disabled = !steer || scene.page === 0;
    nextBtn.disabled = !steer;
    group.classList.toggle('readonly', !steer);
  };
  const goTo = (n) => {
    if (!canSteer() || n < 0) return;
    connection.send({ t: MSG.PAGE, n });
    scene.setPage(n); // se aplica ya; el servidor confirma a todos
  };
  const setTitle = (n, title) => {
    titles = { ...titles, [String(n)]: title };
    if (!title) delete titles[String(n)];
    connection.send({ t: MSG.PAGE_TITLE, n, title });
    paintPages();
  };
  // Vista de páginas: miniaturas, ir a una página y ponerle título.
  label.addEventListener('click', () =>
    pagesDialog({
      count: scene.pageCount(),
      current: scene.page,
      canEdit: canSteer(),
      titleOf,
      paintThumb,
      onGo: goTo,
      onTitle: setTitle,
    }),
  );
  prevBtn.addEventListener('click', () => goTo(scene.page - 1));
  nextBtn.addEventListener('click', () => goTo(scene.page + 1));
  scene.on('change', paintPages);

  // ---------------- Temporizador ----------------
  const timerChip = h('div', { class: 'timer-chip', hidden: true, role: 'timer', 'aria-live': 'off' });
  document.body.append(timerChip);
  let timer = null;
  let doneShownAt = 0;
  const paintTimer = () => {
    if (!timer) {
      timerChip.hidden = true;
      return;
    }
    const left = Math.max(0, timer.endsAt - Date.now());
    if (left === 0) {
      if (!doneShownAt) doneShownAt = Date.now();
      timerChip.textContent = '⏰ ¡Tiempo!';
      timerChip.classList.add('done');
      if (Date.now() - doneShownAt > 8000) timerChip.hidden = true;
      return;
    }
    doneShownAt = 0;
    const s = Math.ceil(left / 1000);
    timerChip.hidden = false;
    timerChip.classList.remove('done');
    timerChip.classList.toggle('ending', s <= 10);
    timerChip.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  setInterval(paintTimer, 250);

  // ---------------- Votación ----------------
  const pollCard = h('div', { class: 'poll-card ov-hit', hidden: true, role: 'region', 'aria-label': 'Votación' });
  document.body.append(pollCard);
  let poll = null;
  let myVote = null;
  const paintPoll = () => {
    if (!poll) {
      pollCard.hidden = true;
      return;
    }
    pollCard.hidden = false;
    const max = Math.max(1, ...poll.counts);
    const children = [
      h('div', { class: 'poll-head' }, h('strong', {}, poll.question || 'Votación'), h('span', { class: 'muted small' }, `${poll.total} voto${poll.total === 1 ? '' : 's'}${poll.open ? '' : ' · cerrada'}`)),
      ...poll.options.map((opt, i) =>
        h(
          'button',
          {
            class: `poll-opt${myVote === i ? ' mine' : ''}`,
            disabled: !poll.open || isHost(),
            onclick: () => {
              myVote = i;
              connection.send({ t: MSG.VOTE, option: i });
              paintPoll();
            },
          },
          h('span', { class: 'poll-bar', style: `width:${(poll.counts[i] / max) * 100}%` }),
          h('span', { class: 'poll-text' }, opt),
          h('span', { class: 'poll-count' }, String(poll.counts[i])),
        ),
      ),
      isHost()
        ? h(
            'div',
            { class: 'row end' },
            poll.open
              ? h('button', { class: 'btn small', onclick: () => connection.send({ t: MSG.POLL_CLOSE }) }, 'Cerrar votación')
              : null,
            h('button', { class: 'btn small ghost', onclick: () => connection.send({ t: MSG.POLL_CLOSE, clear: true }) }, 'Quitar'),
          )
        : null,
    ];
    pollCard.replaceChildren(...children.filter(Boolean));
  };

  connection.on('message', (msg) => {
    if (msg.t === MSG.WELCOME) {
      scene.setPage(msg.page ?? 0);
      titles = msg.pageTitles ?? {};
      timer = msg.timer;
      if (msg.poll?.id !== poll?.id) myVote = null;
      poll = msg.poll;
      paintPages();
      paintTimer();
      paintPoll();
    } else if (msg.t === MSG.PAGE) {
      scene.setPage(msg.n);
    } else if (msg.t === MSG.PAGE_TITLE) {
      titles = { ...titles, [String(msg.n)]: msg.title };
      if (!msg.title) delete titles[String(msg.n)];
      paintPages();
    } else if (msg.t === MSG.TIMER) {
      timer = msg.timer;
      if (timer) toast('Comenzó el temporizador');
      paintTimer();
    } else if (msg.t === MSG.POLL) {
      if (msg.poll && msg.poll.id !== poll?.id) {
        myVote = null;
        if (!isHost()) toast('Nueva votación: elige una opción');
      }
      poll = msg.poll;
      paintPoll();
    }
  });

  // ---------------- Diálogos del anfitrión ----------------
  function modal(content) {
    const backdrop = h('div', { class: 'modal-backdrop' });
    const close = () => backdrop.remove();
    backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());
    backdrop.append(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, content(close)));
    document.body.append(backdrop);
  }

  function timerDialog() {
    const start = (min) => connection.send({ t: MSG.TIMER, endsAt: Date.now() + min * 60_000 });
    modal((close) =>
      h(
        'div',
        { class: 'stack center' },
        h('h2', {}, 'Temporizador'),
        h('p', { class: 'muted' }, 'Todos verán la cuenta regresiva.'),
        h(
          'div',
          { class: 'timer-presets' },
          [1, 2, 3, 5, 10, 15].map((m) => h('button', { class: 'btn', onclick: () => (start(m), close()) }, `${m} min`)),
        ),
        h(
          'div',
          { class: 'row end' },
          timer ? h('button', { class: 'btn danger', onclick: () => (connection.send({ t: MSG.TIMER, endsAt: null }), close()) }, 'Detener') : null,
          h('button', { class: 'btn ghost', onclick: close }, 'Cerrar'),
        ),
      ),
    );
  }

  function pollDialog() {
    const question = h('input', { type: 'text', maxlength: 120, placeholder: 'Pregunta (opcional)' });
    const custom = h('input', { type: 'text', maxlength: 190, placeholder: 'Opciones separadas por coma' });
    const open = (options, close) => {
      connection.send({ t: MSG.POLL, question: question.value.trim(), options });
      close();
    };
    const presets = [
      ['Sí', 'No'],
      ['A', 'B', 'C', 'D'],
      ['👍', '👎'],
      ['😀', '😐', '🙁'],
      ['1', '2', '3', '4', '5'],
    ];
    modal((close) =>
      h(
        'div',
        { class: 'stack' },
        h('h2', {}, 'Votación rápida'),
        question,
        h('p', { class: 'muted small' }, 'Elige un tipo de respuesta:'),
        h('div', { class: 'poll-presets' }, presets.map((p) => h('button', { class: 'btn', onclick: () => open(p, close) }, p.join(' / ')))),
        h(
          'div',
          { class: 'row' },
          custom,
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                const opts = custom.value.split(',').map((s) => s.trim()).filter(Boolean);
                if (opts.length < 2) return toast('Escribe al menos 2 opciones');
                open(opts, close);
              },
            },
            'Abrir',
          ),
        ),
        h('button', { class: 'btn ghost', onclick: close }, 'Cancelar'),
      ),
    );
    requestAnimationFrame(() => question.focus());
  }

  return { timerDialog, pollDialog, goTo, paintPages, titleOf, icons: { timer: ICONS.timer, poll: ICONS.poll } };
}
