"""Prueba de punta a punta (opcional). Requiere: pip install playwright && playwright install chromium.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/sesion_completa.py"""
import os
import json
import urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
OUT = os.environ.get('TRAZO_E2E_OUT', '.')
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('OK   ' if ok else 'FALLA'), name, detail)


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method='POST')
    return json.loads(urllib.request.urlopen(req).read())


room = post('/api/rooms', {'mode': 'blank'})
rid, host_key = room['id'], room['hostKey']

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])

    # ---------- Anfitrión (escritorio)
    hctx = browser.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
    host = hctx.new_page()
    host.goto(BASE + '/')
    host.evaluate(f"""() => {{
      localStorage.setItem('trazo:name', JSON.stringify('Anfitrión'));
      localStorage.setItem('trazo:hostkey:{rid}', JSON.stringify('{host_key}'));
    }}""")
    host.goto(f'{BASE}/sala?room={rid}')
    host.wait_for_selector('#status[data-state="online"]')
    check('Anfitrión conectado y marcado como principal', host.is_visible('#host-chip'))

    # ---------- Participante (celular)
    pctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    part = pctx.new_page()
    part.goto(BASE + '/')
    part.evaluate("() => localStorage.setItem('trazo:name', JSON.stringify('Ana'))")
    part.goto(f'{BASE}/sala?room={rid}')
    part.wait_for_selector('#status[data-state="online"]')
    check('Participante sin la marca de principal', not part.is_visible('#host-chip'))
    check('Modo simple activo por defecto en el celular', part.evaluate("document.body.classList.contains('simple')"))
    visible_tools = part.evaluate("[...document.querySelectorAll('.tool[data-tool]')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.tool)")
    check('Modo simple muestra solo lo esencial', set(visible_tools) == {'pen', 'laser', 'eraser', 'note', 'stamp'}, str(visible_tools))

    # ---------- Pinceles: el anfitrión dibuja con neón
    host.click('[data-tool="pen"]')
    host.click('.style-panel button[title="Neón"]')
    host.mouse.move(300, 300)
    host.mouse.down()
    for i in range(20):
        host.mouse.move(300 + i * 15, 300 + (i % 5) * 8)
    host.mouse.up()
    part.wait_for_timeout(500)
    brushes = part.evaluate("""() => new Promise(r => setTimeout(() => r(true), 10))""")
    host.screenshot(path=f'{OUT}/1-anfitrion.png')

    # ---------- Seguir al presentador: el anfitrión acerca la vista
    host.click('#zoom-in')
    host.click('#zoom-in')
    part.wait_for_timeout(900)
    part_zoom = part.evaluate("document.querySelector('#zoom-label').textContent")
    check('El participante sigue la vista del presentador', part_zoom != '100%', part_zoom)

    # ---------- Notas y sellos (participante)
    part.click('[data-tool="note"]')
    part.mouse.click(200, 400)
    part.wait_for_selector('.text-editor.wrap')
    part.keyboard.type('Idea: revisar el punto 2')
    part.click('#board', position={'x': 50, 'y': 650}) if False else part.evaluate("document.activeElement.blur()")
    part.click('[data-tool="stamp"]')
    part.mouse.click(250, 600)
    part.wait_for_timeout(600)
    n_types = host.evaluate("() => 0")

    # ---------- Páginas: el anfitrión pasa a la página 2
    host.click('.page-group button[aria-label="Página siguiente"]')
    part.wait_for_timeout(500)
    label = part.evaluate("document.querySelector('.page-label').textContent")
    check('El participante pasa a la página 2 con el anfitrión', label.startswith('Pág. 2'), label)
    check('El participante no puede cambiar de página sin permiso', part.evaluate("document.querySelector('.page-group').classList.contains('readonly')"))
    host.click('.page-group button[aria-label="Página anterior"]')
    part.wait_for_timeout(400)

    # ---------- Temporizador
    host.click('#menu-btn')
    host.click('.menu-item:has-text("Temporizador")')
    host.click('.timer-presets button:has-text("3 min")')
    part.wait_for_selector('.timer-chip:not([hidden])')
    check('Temporizador visible para el participante', ':' in part.inner_text('.timer-chip') and part.locator('.timer-chip svg').count() == 1, part.inner_text('.timer-chip'))

    # ---------- Votación
    host.click('#menu-btn')
    host.click('.menu-item:has-text("Votación rápida")')
    host.fill('.modal input[placeholder^="Pregunta"]', '¿Seguimos con el punto 2?')
    host.click('.poll-presets button:has-text("Sí / No")')
    part.wait_for_selector('.poll-card:not([hidden])')
    part.click('.poll-opt:has-text("Sí")')
    host.wait_for_function("document.querySelector('.poll-card .poll-count')?.textContent === '1'")
    check('El voto del participante llega al anfitrión', host.inner_text('.poll-card .poll-count') == '1')

    # ---------- Reacción y láser
    part.click('#react-btn')
    part.click(".react-opt >> nth=1")
    host.wait_for_selector('.reaction', timeout=3000)
    check('La reacción aparece en el anfitrión', 'Ana' in host.inner_text('.reaction-layer'))

    part.wait_for_timeout(300)
    part.screenshot(path=f'{OUT}/2-participante.png')
    host.wait_for_timeout(300)
    host.screenshot(path=f'{OUT}/3-anfitrion-final.png')

    # ---------- Exportar PDF (anfitrión)
    host.click('#menu-btn')
    with host.expect_download() as dl:
        host.click('.menu-item:has-text("Exportar PDF")')
    path = dl.value.path()
    data = open(path, 'rb').read()
    check('PDF exportado válido', data.startswith(b'%PDF-1.4') and b'%%EOF' in data, f'{len(data)} bytes, páginas={data.count(b"/Type /Page ")}')

    errors = []
    for pg in (host, part):
        pg.on('pageerror', lambda e: errors.append(str(e)))
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} comprobaciones correctas')
