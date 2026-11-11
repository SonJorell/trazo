"""Prueba de punta a punta de v2.4: cámara que sigue al puntero (con cámara simulada), monigote
fluido, sellos y reacciones con íconos, y ningún emoji en la interfaz.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v24.py"""
import os, re, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
EMOJI = re.compile('[\U0001F000-\U0001FFFF☀-➿⬀-⯿⌀-⏿]')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name, detail)

room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None,
                          args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    def join(name, vp, host=False):
        pg = b.new_context(viewport=vp, permissions=['camera']).new_page()
        pg.goto(BASE + '/')
        pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); localStorage.setItem('trazo:simple','false'); }", [name])
        if host:
            pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [room['id'], room['hostKey']])
        pg.goto(f"{BASE}/sala?room={room['id']}&e2e=1"); pg.wait_for_selector('#status[data-state="online"]')
        return pg
    host = join('Anfitrión', {'width': 1366, 'height': 820}, host=True)
    cam = join('Cámara', {'width': 1024, 'height': 768})

    # --- Cámara que sigue al puntero
    cam.click('#cam-btn')
    host.wait_for_selector('.cam-bubble', timeout=10000)
    cam.click('#menu-btn'); cam.click('.menu-item:has-text("Mi cámara y avatar")')
    cam.click('.choice-card:has-text("Sigue mi puntero")'); cam.click('.modal .segmented .seg:has-text("Círculo")')
    cam.click('.modal .btn:has-text("Listo")')
    cam.keyboard.press('h')
    for i in range(25): cam.mouse.move(300 + i * 16, 300 + i * 6); cam.wait_for_timeout(25)
    host.wait_for_timeout(800)
    st = host.evaluate("(() => { const a = window.__trazo.avatars; const id = [...a.others.keys()][0]; const v = a.videoFor(id); return { follows: a.followsPointer(id), ready: v ? v.readyState : 0, hidden: document.querySelector('.cam-bubble').classList.contains('on-board'), shape: a.others.get(id).look.shape }; })()")
    check('la cámara sigue al puntero en la presentación', st['follows'] and st['ready'] >= 2 and st['hidden'] and st['shape'] == 'circle', str(st))
    host.screenshot(path=f'{OUT}/v24-1-camara-puntero.png')

    # --- Monigote neutro y fluido
    cam.click('#menu-btn'); cam.click('.menu-item:has-text("Mi cámara y avatar")')
    cam.click('.choice-card:has-text("Monigote")')
    check('el monigote es neutro por defecto', 'active' in cam.get_attribute('.avatar-body .seg:has-text("Neutro")', 'class'))
    cam.click('.modal .btn:has-text("Listo")')
    cam.mouse.move(200, 500); cam.wait_for_timeout(1500)
    cam.mouse.move(800, 500)
    xs = []
    for _ in range(25):
        host.wait_for_timeout(40)
        xs.append(host.evaluate("(() => { const o = [...window.__trazo.avatars.others.values()][0]; return [o.shown.x, o.shown.amp]; })()"))
    steps = [xs[i + 1][0] - xs[i][0] for i in range(len(xs) - 1)]
    check('avanza sin saltos ni retrocesos', all(s >= -0.5 for s in steps) and max(steps) < 40, f'máx paso {max(steps):.1f}')
    check('las piernas se animan al caminar', max(a for _, a in xs) > 0.5)
    host.screenshot(path=f'{OUT}/v24-2-monigote.png')

    # --- Sellos y reacciones con íconos
    host.click('[data-tool="stamp"]'); host.click('.stamp-opt[aria-label="Sello Estrella"]'); host.mouse.click(700, 300)
    cam.wait_for_function("window.__trazo.scene.alive().some(e => e.type === 'stamp' && e.icon === 'star')")
    check('sello vectorial sincronizado', True)
    cam.click('#react-btn'); cam.click('.react-opt[aria-label="Me gusta"]')
    host.wait_for_selector('.reaction .reaction-icon svg', timeout=3000)
    check('reacción con ícono', True)

    # --- Ningún emoji en la interfaz (textos, títulos y etiquetas)
    for name, pg in (('anfitrión', host), ('participante', cam)):
        pg.click('#menu-btn')
        texts = pg.evaluate("""(() => {
          const out = [document.body.innerText];
          for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) out.push(el.getAttribute('title') || '', el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || '');
          return out.join('\\n');
        })()""")
        found = EMOJI.findall(texts)
        check(f'sin emojis en la interfaz del {name}', not found, ''.join(found))
        pg.keyboard.press('Escape'); pg.mouse.click(5, 400)
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
