"""Prueba de punta a punta de v2.6: todos ven las cámaras de todos (malla WebRTC en la red local,
con cámara simulada de Chrome), visitas que eligen verlas, gestos y accesorios del monigote.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v26.py"""
import os, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name, detail)

room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())
VIDEOS = "[...document.querySelectorAll('.cam-bubble video')].filter(v => v.readyState >= 2).length"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None,
                          args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    def join(name, host=False, vp=None):
        pg = b.new_context(viewport=vp or {'width': 1100, 'height': 760}, permissions=['camera']).new_page()
        pg.goto(BASE + '/')
        pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); localStorage.setItem('trazo:simple','false'); }", [name])
        if host:
            pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [room['id'], room['hostKey']])
        pg.goto(f"{BASE}/sala?room={room['id']}&e2e=1"); pg.wait_for_selector('#status[data-state="online"]')
        return pg
    host = join('Anfitrión', host=True)
    ana = join('Ana')
    beto = join('Beto')

    ana.click('#cam-btn'); beto.click('#cam-btn')
    host.wait_for_function(f"{VIDEOS} === 2", timeout=15000)
    check('la presentación ve las 2 cámaras', True)
    ana.wait_for_function(f"{VIDEOS} === 1", timeout=15000)
    beto.wait_for_function(f"{VIDEOS} === 1", timeout=15000)
    check('cada participante ve la cámara del otro', True)
    beto.screenshot(path=f'{OUT}/v26-1-camaras-todos.png')

    # Una visita no las ve hasta que lo pide.
    host.click('#menu-btn'); host.click('.menu-item:has-text("Participantes y permisos")')
    host.click('.modal .segmented >> nth=0 >> .seg:has-text("Visita")'); host.click('.modal .btn:has-text("Listo")')
    vale = join('Vale', vp={'width': 390, 'height': 844})
    vale.wait_for_timeout(2500)
    check('la visita no recibe cámaras por defecto', vale.evaluate(VIDEOS) == 0)
    vale.click('#menu-btn'); vale.click('.menu-item:has-text("Ver las cámaras de todos")')
    vale.wait_for_function(f"{VIDEOS} === 2", timeout=15000)
    check('la visita las ve al activarlo', True)
    vale.screenshot(path=f'{OUT}/v26-2-visita-camaras.png')
    vale.click('#menu-btn'); vale.click('.menu-item:has-text("Ocultar las cámaras")')
    vale.wait_for_function("document.querySelectorAll('.cam-bubble').length === 0", timeout=8000)
    ana.wait_for_function("window.__trazo.camera.pcs.size === 2", timeout=8000)
    check('al ocultarlas, Ana deja de enviarle (queda presentación + Beto)', True)

    # Monigote con accesorio y gesto al reaccionar.
    ana.click('#menu-btn'); ana.click('.menu-item:has-text("Mi cámara y avatar")')
    ana.click('.choice-card:has-text("Monigote")'); ana.click('.avatar-body .seg:has-text("Sombrero")')
    ana.click('.modal .btn:has-text("Listo")')
    ana.keyboard.press('h'); ana.mouse.move(500, 500); ana.wait_for_timeout(1200)
    host.wait_for_function("[...window.__trazo.avatars.others.values()].some(o => o.look.acc === 'hat' && o.shown)")
    check('accesorio sincronizado', True)
    ana.click('#react-btn'); ana.click('.react-opt[aria-label="Levantar la mano"]')
    host.wait_for_function("[...window.__trazo.avatars.others.values()].some(o => o.shown?.gesture?.key === 'hand')", timeout=3000)
    check('el monigote hace el gesto al reaccionar', True)
    host.wait_for_timeout(300)
    host.screenshot(path=f'{OUT}/v26-3-gesto.png')
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
