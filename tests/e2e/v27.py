"""Prueba de punta a punta de v2.7: notas que calzan con el texto, grabación de la sesión,
aplicación instalable (PWA) y diseño adaptable en celular, tablet y horizontal.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v27.py"""
import os, re, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name, detail)

def new_room():
    return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())

# Archivos de la PWA servidos con el tipo correcto.
with urllib.request.urlopen(BASE + '/manifest.webmanifest') as r:
    man = json.loads(r.read()); ctype = r.headers.get('content-type', '')
check('manifest servido', man.get('short_name') == 'Trazo' and len(man.get('icons', [])) >= 2, ctype)
with urllib.request.urlopen(BASE + '/sw.js') as r:
    check('service worker servido como JavaScript', 'javascript' in r.headers.get('content-type', ''))

EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿]')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    def join(room, name='Ana', vp=None, host=True):
        ctx = b.new_context(viewport=vp or {'width': 1100, 'height': 760}, accept_downloads=True)
        pg = ctx.new_page()
        pg.goto(BASE + '/')
        pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); localStorage.setItem('trazo:simple','false'); }", [name])
        if host:
            pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [room['id'], room['hostKey']])
        pg.goto(f"{BASE}/sala?room={room['id']}&e2e=1"); pg.wait_for_selector('#status[data-state="online"]')
        return pg

    room = new_room()
    pg = join(room)

    # 1. Notas: el editor ocupa la nota y la nota crece hasta calzar con el texto.
    pg.keyboard.press('n'); pg.mouse.click(500, 300)
    pg.wait_for_selector('.note-editor')
    ed = pg.evaluate("(() => { const t = document.querySelector('.note-editor'); const r = t.getBoundingClientRect(); return { bg: getComputedStyle(t).backgroundColor, w: r.width }; })()")
    check('el editor de la nota tiene el fondo de la nota', ed['bg'] not in ('rgba(0, 0, 0, 0)', 'transparent'), ed['bg'])
    pg.keyboard.type('Ideas para la reunión: revisar presupuesto, calendario y supercalifragilisticoespialidoso.\nSegunda línea con más texto para que la nota tenga que crecer hacia abajo.')
    pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/v27-1-nota-editando.png')
    pg.mouse.click(1000, 700); pg.wait_for_timeout(300)
    note = pg.evaluate("window.__trazo.scene.alive().find(e => e.type === 'note')")
    check('la nota guarda el texto', note and 'supercalifragilistico' in note['text'])
    check('la nota creció para mostrar todo el texto', note and note['h'] > 200, f"h={note and note['h']}")
    check('el editor tenía el mismo ancho que la nota', abs(ed['w'] - note['w']) <= 2, f"{ed['w']} vs {note['w']}")
    pg.screenshot(path=f'{OUT}/v27-2-nota-guardada.png')

    # 2. Grabar la pizarra: se descarga un video no vacío.
    pg.click('#menu-btn'); pg.click('.menu-item:has-text("Grabar la sesión")')
    pg.click('.choice-card:has-text("La pizarra")')
    pg.wait_for_selector('.rec-chip:not([hidden])')
    check('aparece el indicador de grabación', True)
    pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(600, 400, steps=10); pg.mouse.up()
    pg.wait_for_timeout(1500)
    with pg.expect_download(timeout=10000) as dl:
        pg.click('.rec-chip [aria-label="Detener grabación"]')
    path = dl.value.path()
    size = os.path.getsize(path) if path else 0
    check('la grabación se descarga como video', dl.value.suggested_filename.startswith('trazo-') and size > 1000, f"{dl.value.suggested_filename} {size} B")

    # 3. El service worker se registra en localhost.
    pg.goto(BASE + '/')
    ok = pg.evaluate("navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false)")
    check('service worker activo en localhost', ok)
    check('sin emojis en la portada', not EMOJI.search(pg.inner_text('body')))

    # 4. Diseño adaptable.
    for label, vp in [('360', {'width': 360, 'height': 740}), ('390', {'width': 390, 'height': 844})]:
        ph = join(new_room(), vp=vp)
        r = ph.evaluate("(() => { const b = document.querySelector('.bottombar').getBoundingClientRect(); return [b.left, b.right, innerWidth]; })()")
        check(f'barra inferior dentro de la pantalla a {label}px', r[0] >= 0 and r[1] <= r[2] + 0.5, str(r))
        check(f'sin emojis en la sala a {label}px', not EMOJI.search(ph.inner_text('body')))
        ph.screenshot(path=f'{OUT}/v27-3-celular-{label}.png')
        ph.context.close()

    tab = join(new_room(), vp={'width': 900, 'height': 1180})
    tab.click('#menu-btn'); tab.click('.menu-item:has-text("Temporizador")')
    tab.click('.timer-presets .btn:has-text("2 min")')
    tab.wait_for_selector('.timer-chip:not([hidden])')
    ov = tab.evaluate("""(() => { const a = document.querySelector('.timer-chip'), t = document.querySelector('.toolbar');
      if (!a || a.hidden) return null; const r = a.getBoundingClientRect(), s = t.getBoundingClientRect();
      return r.top >= s.bottom || r.bottom <= s.top || r.right <= s.left || r.left >= s.right; })()""")
    check('en tablet el temporizador no tapa las herramientas', ov is True, str(ov))
    tab.context.close()

    land = join(new_room(), vp={'width': 844, 'height': 390})
    hidden = land.evaluate("(() => { const s = document.querySelector('.style-panel'); return !s || getComputedStyle(s).display === 'none' || !s.classList.contains('open') && s.getBoundingClientRect().width === 0; })()")
    check('en horizontal el panel de estilo parte cerrado', hidden)
    land.screenshot(path=f'{OUT}/v27-4-horizontal.png')
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
