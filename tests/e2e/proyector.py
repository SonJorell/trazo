"""Prueba de punta a punta (opcional). Requiere: pip install playwright && playwright install chromium.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/proyector.py"""
import os
import json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
req = urllib.request.Request(BASE + '/api/rooms', data=json.dumps({'mode': 'live'}).encode(), method='POST')
room = json.loads(urllib.request.urlopen(req).read())
rid, key = room['id'], room['hostKey']
res = []

def check(name, ok, detail=''):
    res.append(ok)
    print('OK   ' if ok else 'FALLA', name, detail)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    ov = b.new_context(viewport={'width': 1366, 'height': 768}).new_page()
    ov.goto(f'{BASE}/sala?room={rid}&overlay=1#host={key}')
    ov.wait_for_selector('.overlay-bar')
    ov.wait_for_timeout(800)
    check('QR grande de invitación visible al iniciar', ov.is_visible('.invite-card img'))
    check('Clave de anfitrión retirada de la URL', '#host=' not in ov.url)
    check('Modo de marcas por defecto: por diapositiva', 'por diapositiva' in ov.inner_text('.overlay-bar'))
    ov.screenshot(path=OUT + '/5-proyector.png')

    cel = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    cel.goto(BASE + '/')
    cel.evaluate("localStorage.setItem('trazo:name', JSON.stringify('Beto'))")
    cel.goto(f'{BASE}/sala?room={rid}')
    cel.wait_for_selector('#status[data-state="online"]')
    check('Celular sin botones de diapositivas al entrar', cel.is_hidden('#slide-pad'))

    # Permitir a todos desde el proyector
    ov.click('.overlay-bar button[title="Quién puede pasar diapositivas"]')
    ov.check('.modal input[type="checkbox"]')
    ov.click('.modal button:has-text("Listo")')
    cel.wait_for_selector('#slide-pad:not([hidden])', timeout=3000)
    check('Con «Permitir a todos» el celular recibe ‹ ›', cel.is_visible('#slide-pad'))

    # Siguiente desde el celular → el proyector pasa a la página 2 (marcas por diapositiva)
    cel.click('#slide-pad [data-slide="next"]')
    ov.wait_for_function("document.querySelector('.page-label')?.textContent.startsWith('Pág. 2')", timeout=3000)
    check('«Siguiente» cambia el proyector a la página 2', True, ov.inner_text('.page-label'))
    cel.wait_for_function("document.querySelector('.page-label')?.textContent.startsWith('Pág. 2')", timeout=3000)
    check('El celular también está en la página 2', True)
    cel.click('#slide-pad [data-slide="prev"]')
    ov.wait_for_function("document.querySelector('.page-label')?.textContent.startsWith('Pág. 1')", timeout=3000)
    check('«Anterior» vuelve a la página 1', True)
    b.close()

print(f'{sum(res)}/{len(res)} correctas')
