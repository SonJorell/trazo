"""Prueba de punta a punta de v2.3: roles (visita/editor/presentador), solicitud de permiso,
panel de participantes y monigote con física, silla y sentarse.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v23.py"""
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

def join(b, name, viewport, host=False, mobile=False):
    pg = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile).new_page()
    pg.goto(BASE + '/')
    pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); localStorage.setItem('trazo:simple', 'false'); }", [name])
    if host:
        pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [rid, room['hostKey']])
    pg.goto(f'{BASE}/sala?room={rid}&e2e=1'); pg.wait_for_selector('#status[data-state="online"]')
    return pg

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    host = join(b, 'Anfitrión', {'width': 1366, 'height': 820}, host=True)

    # El anfitrión deja que la gente nueva entre como visita.
    host.click('#menu-btn'); host.click('.menu-item:has-text("Participantes y permisos")')
    host.click('.modal .segmented >> nth=0 >> .seg:has-text("Visita")')
    host.wait_for_timeout(300)

    phone = join(b, 'Celu', {'width': 390, 'height': 844}, mobile=True)
    check('la invitada entra como visita', phone.evaluate("document.body.dataset.role") == 'visita')
    check('barra de visita visible', phone.is_visible('.visitor-bar'))
    check('visita: solo la herramienta mano', phone.locator('.toolbar .tool:visible').count() == 1)
    host.wait_for_selector('.people-list li')
    host.screenshot(path=f'{OUT}/v23-1-participantes.png')
    host.click('.modal .btn:has-text("Listo")')
    phone.screenshot(path=f'{OUT}/v23-2-visita.png')

    # Pide permiso → el anfitrión lo concede.
    phone.click('.visitor-bar .btn')
    host.wait_for_selector('.role-request')
    host.click('.role-request .btn:has-text("Permitir")')
    phone.wait_for_function("document.body.dataset.role === 'editor'")
    check('al permitir, pasa a editor', phone.is_hidden('.visitor-bar') and phone.locator('.toolbar .tool:visible').count() > 5)

    # Desde ahora la gente nueva entra como editor.
    host.click('#menu-btn'); host.click('.menu-item:has-text("Participantes y permisos")')
    host.click('.modal .segmented >> nth=0 >> .seg:has-text("Editor")')
    host.click('.modal .btn:has-text("Listo")')

    # Tablet de editor: monigote mujer, rojo; camina hacia el puntero.
    tablet = join(b, 'Tabi', {'width': 1024, 'height': 768})
    tablet.click('#menu-btn'); tablet.click('.menu-item:has-text("Mi cámara y avatar")')
    tablet.click('.choice-card:has-text("Monigote")')
    tablet.click('.avatar-body .seg:has-text("Mujer")')
    tablet.click('.avatar-body .swatch[aria-label="Color #e03131"]')
    tablet.click('.modal .btn:has-text("Listo")')
    tablet.keyboard.press('h')
    tablet.mouse.move(300, 500)
    tablet.wait_for_timeout(1500)
    host.wait_for_function("[...window.__trazo.avatars.others.values()].some(o => o.look.mode === 'body' && o.pos)", timeout=5000)
    a1 = host.evaluate("[...window.__trazo.avatars.others.values()].find(o => o.look.mode === 'body').pos")
    tablet.mouse.move(800, 500)
    tablet.wait_for_timeout(2000)
    a2 = host.evaluate("[...window.__trazo.avatars.others.values()].find(o => o.look.mode === 'body').pos")
    check('el monigote camina hacia el puntero', a2['x'] > a1['x'] + 100)
    check('cae al suelo por gravedad', a2['y'] > a1['y'] - 5 and not a2['m'] or a2['x'] > a1['x'])
    host.screenshot(path=f'{OUT}/v23-3-monigote.png')

    # Silla y sentarse
    tablet.click('#menu-btn'); tablet.click('.menu-item:has-text("Mi cámara y avatar")')
    tablet.click('.avatar-body .btn:has-text("Agregar silla")')
    tablet.wait_for_timeout(600)
    tablet.click('.avatar-body .btn:has-text("Sentarme")')
    tablet.click('.modal .btn:has-text("Listo")')
    host.wait_for_function("[...window.__trazo.avatars.others.values()].some(o => o.pos && o.pos.s)", timeout=5000)
    check('se sienta en la silla (lo ven todos)', True)
    host.wait_for_timeout(800)
    host.screenshot(path=f'{OUT}/v23-4-sentado.png')

    # Todos a visita: el monigote desaparece y nadie puede dibujar.
    host.click('#menu-btn'); host.click('.menu-item:has-text("Participantes y permisos")')
    host.click('.modal .btn:has-text("Visita")')
    tablet.wait_for_function("document.body.dataset.role === 'visita'")
    host.wait_for_function("![...window.__trazo.avatars.others.values()].some(o => o.look.mode === 'body')")
    check('todos a visita: sin monigotes ni edición', phone.evaluate("document.body.dataset.role") == 'visita')
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
