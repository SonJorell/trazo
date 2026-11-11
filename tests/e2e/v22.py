"""Prueba de punta a punta de v2.2: fondo por página, títulos y vista de páginas, panel de estilo
(paleta única, color personalizado, tamaño y opacidad en %), duplicar, cámaras configurables e
interfaz en escritorio, tablet y celular.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v22.py"""
import os, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
results = []
def check(name, ok):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name)

room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())
rid = room['id']
alive = "(t) => window.__trazo.scene.alive().filter(e => e.type === t)"

def join(b, name, viewport, host=False, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.goto(BASE + '/')
    pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); }", [name])
    if host:
        pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [rid, room['hostKey']])
    pg.goto(f'{BASE}/sala?room={rid}&e2e=1'); pg.wait_for_selector('#status[data-state="online"]')
    return pg

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    host = join(b, 'Anfitrión', {'width': 1366, 'height': 820}, host=True)
    tablet = join(b, 'Tablet', {'width': 820, 'height': 1180}, mobile=True)
    phone = join(b, 'Celular', {'width': 390, 'height': 844}, mobile=True)

    # --- Panel de estilo: paleta única con neón, color personalizado, tamaño y opacidad en %
    host.click('.style-panel .brush-neon')
    check('la paleta brilla con el pincel neón', host.eval_on_selector('#style-panel', 'e => e.classList.contains("neon-on")'))
    host.click('.style-panel .palette .swatch[title="#e03131"]')
    host.eval_on_selector('.sec-width input[type=range]', "e => { e.value = 50; e.dispatchEvent(new Event('input', {bubbles:true})); }")
    host.eval_on_selector('.sec-opacity input[type=range]', "e => { e.value = 70; e.dispatchEvent(new Event('input', {bubbles:true})); }")
    st = host.evaluate("JSON.parse(localStorage.getItem('trazo:style'))")
    check('tamaño 50 % y opacidad 70 %', 23 <= st['strokeWidth'] <= 25 and abs(st['opacity'] - 0.7) < 0.01 and st['brush'] == 'neon' and st['stroke'] == '#e03131')
    check('el panel muestra los porcentajes', '50%' in host.inner_text('.sec-width h3') and '70%' in host.inner_text('.sec-opacity h3'))
    host.eval_on_selector('.style-panel input[type=color]', "e => { e.value = '#12ab34'; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); }")
    check('color personalizado guardado en recientes', host.locator('.swatches.recent .swatch').count() == 1)
    host.mouse.move(500, 400); host.mouse.down()
    for i in range(1, 15): host.mouse.move(500 + i * 20, 400 + (i % 3) * 15)
    host.mouse.up()
    phone.wait_for_function(f"({alive})('pen').length === 1")
    pen = phone.evaluate(f"({alive})('pen')[0]")
    check('trazo neón personalizado llega igual', pen['brush'] == 'neon' and pen['stroke'] == '#12ab34' and abs(pen['opacity'] - 0.7) < 0.01)
    host.screenshot(path=f'{OUT}/v22-1-escritorio.png')

    # --- Duplicar
    host.keyboard.press('v'); host.mouse.click(600, 410)
    host.keyboard.press('Control+d')
    phone.wait_for_function(f"({alive})('pen').length === 2")
    check('Ctrl+D duplica para todos', True)

    # --- Fondo solo para esta página
    host.click('#menu-btn'); host.click('.menu-item:has-text("Fondo de la hoja")')
    host.click('.seg:has-text("Solo la página 1")'); host.click('.bg-tile:has-text("Rayada")'); host.click('.bg-swatch.paper-chalk')
    host.click('.modal .btn:has-text("Listo")')
    tablet.wait_for_function("document.body.dataset.paper === 'chalk'")
    check('fondo de la página 1 sincronizado', True)
    # Página 2: vuelve al fondo general
    host.click('.page-group button[aria-label="Página siguiente"]')
    phone.wait_for_function("window.__trazo.scene.page === 1")
    check('página 2 con el fondo general', phone.evaluate("document.body.dataset.paper") == 'white')
    host.click('.page-group button[aria-label="Página anterior"]')
    phone.wait_for_function("window.__trazo.scene.page === 0 && document.body.dataset.paper === 'chalk'")
    check('al volver, cada uno ve el fondo propio de la página', True)

    # --- Títulos y vista de páginas
    host.click('.page-label')
    host.wait_for_selector('.page-grid .page-card')
    host.fill('.modal input[type=text]', 'Lluvia de ideas')
    host.wait_for_timeout(600)
    host.screenshot(path=f'{OUT}/v22-2-paginas.png')
    host.click('.modal .btn:has-text("Listo")')
    tablet.wait_for_function("document.querySelector('.page-title').textContent === 'Lluvia de ideas'")
    check('título de página visible para todos', True)
    check('la invitada no puede editar títulos', phone.evaluate("(() => { document.querySelector('.page-label').click(); return document.querySelector('.modal input[type=text]').disabled; })()"))
    phone.keyboard.press('Escape'); phone.mouse.click(5, 5)

    # --- Cursor de alguien en otra página no se ve
    check('cursores con página', host.evaluate("window.__trazo.scene.page") == 0)

    # --- Cámaras: burbujas configurables (stream sintético)
    host.evaluate("""async () => {
      const { CameraBubbles } = await import('/js/ui/cameraBubbles.js');
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const g = c.getContext('2d'); let t = 0;
      setInterval(() => { g.fillStyle = `hsl(${t++ % 360},70%,55%)`; g.fillRect(0,0,320,240); g.fillStyle='#fff'; g.font='40px sans-serif'; g.fillText('Cam', 110, 130); }, 50);
      const cams = new CameraBubbles({ getName: (id) => id === 'a' ? 'Tablet' : 'Celular', onClose: () => {} });
      cams.show('a', c.captureStream(10)); cams.show('b', c.captureStream(10));
      window.__cams = cams;
    }""")
    host.click('.cam-settings:not([hidden])')
    host.click('.cam-settings-pop .seg:has-text("Círculo")')
    host.click('.cam-settings-pop .seg:has-text("Columna a la derecha")')
    check('cámaras en círculo y columna', host.evaluate("(() => { const e = window.__cams.layer; return e.classList.contains('shape-circle') && e.classList.contains('layout-column'); })()"))
    host.wait_for_timeout(400)
    host.screenshot(path=f'{OUT}/v22-3-camaras.png')
    host.click('.cam-settings-pop button[aria-label="Cerrar"]')

    # --- Interfaz en tablet y celular
    tablet.click('#style-toggle')
    tablet.wait_for_timeout(300)
    tb = tablet.evaluate("(() => { const a = document.querySelector('#toolbar').getBoundingClientRect(); const b = document.querySelector('.topbar').getBoundingClientRect(); return [a.top, b.bottom]; })()")
    check('tablet: la barra de herramientas no choca con la superior', tb[0] >= tb[1] - 2)
    tablet.screenshot(path=f'{OUT}/v22-4-tablet.png')
    phone.click('#style-toggle')
    phone.wait_for_timeout(300)
    sheet = phone.evaluate("(() => { const r = document.querySelector('#style-panel').getBoundingClientRect(); return [r.left, r.right, r.height, innerWidth, innerHeight]; })()")
    check('celular: el estilo se abre como hoja inferior a lo ancho', sheet[0] <= 1 and sheet[1] >= sheet[3] - 1 and sheet[2] <= sheet[4] * 0.6)
    phone.screenshot(path=f'{OUT}/v22-5-celular.png')
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
