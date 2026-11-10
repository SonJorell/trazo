"""Prueba de punta a punta (opcional). Requiere: pip install playwright && playwright install chromium.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/sellos.py"""
import os
import json, urllib.request
from playwright.sync_api import sync_playwright
OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
req = urllib.request.Request(BASE+'/api/rooms', data=b'{}', method='POST')
room = json.loads(urllib.request.urlopen(req).read())
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    pg = b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True).new_page()
    pg.goto(BASE+'/'); pg.evaluate("localStorage.setItem('trazo:name', JSON.stringify('Ana'))")
    pg.goto(f"{BASE}/sala?room={room['id']}"); pg.wait_for_selector('#status[data-state="online"]')
    pg.click('[data-tool="stamp"]'); pg.mouse.click(200, 300)
    pg.click('#style-toggle'); pg.click('.stamp-opt:has-text("★")')
    pg.click('#style-toggle')
    pg.mouse.click(120, 420)
    pg.wait_for_timeout(500)
    # Borrar mis trazos debe quitar ambos sellos
    pg.screenshot(path=OUT + '/4-sellos.png')
    pg.click('#menu-btn'); pg.click('.menu-item:has-text("Borrar mis trazos")')
    pg.wait_for_selector('.toast')
    print('toast:', pg.inner_text('.toasts'))
    b.close()
