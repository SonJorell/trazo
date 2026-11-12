"""Prueba de punta a punta de v2.5: organizar páginas (duplicar, mover, borrar), bloquear
elementos, notas privadas del presentador y resultados de votación en CSV.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v25.py"""
import os, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name, detail)

room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())
rects = "window.__trazo.scene.allAlive().filter(e => e.type === 'rect').map(e => [e.page, e.stroke]).sort((a,b)=>a[0]-b[0])"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    def join(name, host=False):
        pg = b.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True).new_page()
        pg.goto(BASE + '/')
        pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); localStorage.setItem('trazo:simple','false'); }", [name])
        if host:
            pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [room['id'], room['hostKey']])
        pg.goto(f"{BASE}/sala?room={room['id']}&e2e=1"); pg.wait_for_selector('#status[data-state="online"]')
        return pg
    host = join('Anfitrión', host=True)
    guest = join('Invitada')

    # Tres páginas, cada una con un rectángulo de distinto color.
    for i, color in enumerate(['#e03131', '#2f9e44', '#1971c2']):
        if i: host.click('.page-group button[aria-label="Página siguiente"]')
        host.click(f'.style-panel .palette .swatch[title="{color}"]')
        host.keyboard.press('r'); host.mouse.move(500, 300); host.mouse.down(); host.mouse.move(700, 450, steps=5); host.mouse.up()
    guest.wait_for_function(f"{rects}.length === 3")
    host.click('.page-group button[aria-label="Página anterior"]'); host.click('.page-group button[aria-label="Página anterior"]')

    # Duplicar la página 2 → quedan 4 (la copia en la 3).
    host.click('.page-label'); host.wait_for_selector('.page-card-actions')
    host.wait_for_timeout(300)
    host.screenshot(path=f'{OUT}/v25-1-organizar-paginas.png')
    host.click('button[aria-label="Duplicar (página 2)"]')
    guest.wait_for_function(f"{rects}.length === 4")
    check('duplicar página', guest.evaluate(rects) == [[0, '#e03131'], [1, '#2f9e44'], [2, '#2f9e44'], [3, '#1971c2']], str(guest.evaluate(rects)))

    # Mover la página 4 (azul) antes de la 3.
    host.wait_for_selector('.page-card-actions'); host.click('button[aria-label="Mover antes (página 4)"]')
    guest.wait_for_function(f"{rects}[2][1] === '#1971c2'")
    check('mover página', guest.evaluate(rects) == [[0, '#e03131'], [1, '#2f9e44'], [2, '#1971c2'], [3, '#2f9e44']])

    # Borrar la página 1 (roja) con confirmación.
    host.wait_for_selector('.page-card-actions'); host.click('button[aria-label="Borrar (página 1)"]')
    host.click('.modal .btn:has-text("Borrar página")')
    guest.wait_for_function(f"{rects}.length === 3")
    check('borrar página', guest.evaluate(rects) == [[0, '#2f9e44'], [1, '#1971c2'], [2, '#2f9e44']])
    host.wait_for_selector('.page-card-actions')  # la vista de páginas se vuelve a abrir sola
    host.click('.modal .btn:has-text("Listo")')

    # Bloquear: el rectángulo de la página actual no se selecciona ni se borra.
    host.evaluate("document.querySelector('.page-group button[aria-label=\"Página anterior\"]').click()")
    host.wait_for_timeout(300)
    page_now = host.evaluate("window.__trazo.scene.page")
    host.keyboard.press('v'); host.keyboard.press('Control+a')
    host.click('#lock-btn')
    guest.wait_for_function(f"window.__trazo.scene.allAlive().some(e => e.type === 'rect' && e.page === {page_now} && e.locked)")
    box = host.evaluate(f"(() => {{ const r = window.__trazo.scene.alive().find(e => e.type === 'rect'); const v = window.__trazo.viewport; const a = v.toScreen(r.x, r.y); const c = v.toScreen(r.x + r.w, r.y + r.h); return [a.x, a.y, c.x, c.y]; }})()")
    host.keyboard.press('Control+a')
    host.mouse.click(box[0], (box[1] + box[3]) / 2)
    check('un elemento bloqueado no se selecciona', host.is_hidden('#lock-btn'))
    host.keyboard.press('e'); host.mouse.move(box[0] - 10, box[1] - 10); host.mouse.down(); host.mouse.move(box[2] + 10, box[3] + 10, steps=12); host.mouse.up()
    host.wait_for_timeout(400)
    check('ni se borra con el borrador', host.evaluate(f"window.__trazo.scene.allAlive().some(e => e.type === 'rect' && e.page === {page_now})"))
    host.click('#menu-btn'); host.click('.menu-item:has-text("Desbloquear elementos")')
    guest.wait_for_function(f"!window.__trazo.scene.allAlive().some(e => e.locked)")
    check('desbloquear desde el menú', True)

    # Notas del presentador: solo el anfitrión.
    check('la invitada no tiene notas', guest.is_hidden('#notes-btn'))
    host.click('#notes-btn'); host.fill('.notes-panel textarea', 'Mencionar el presupuesto')
    host.wait_for_timeout(900)
    host.screenshot(path=f'{OUT}/v25-2-notas.png')
    host.reload(); host.wait_for_selector('#status[data-state="online"]')
    host.click('#notes-btn')
    check('las notas se guardan en la sala', host.input_value('.notes-panel textarea') == 'Mencionar el presupuesto')

    # Votación → CSV
    host.click('#menu-btn'); host.click('.menu-item:has-text("Votación")')
    host.click('.poll-presets .btn:has-text("Bien")')
    guest.wait_for_selector('.poll-opt'); guest.click('.poll-opt:has-text("Bien")')
    host.wait_for_function("document.querySelector('.poll-card .poll-count').textContent === '1'")
    with host.expect_download() as dl:
        host.click('.poll-card .btn:has-text("CSV")')
    data = open(dl.value.path(), encoding='utf-8-sig').read()
    check('CSV de la votación', 'Bien";1;100%' in data, data.replace('\r\n', ' | '))
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
