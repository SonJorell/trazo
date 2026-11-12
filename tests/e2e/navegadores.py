"""Compatibilidad con otros navegadores: WebKit (el motor de Safari, vía WebKitGTK) o Firefox,
controlados con Selenium, junto a un Chrome (Playwright) en la misma sala para comprobar la
sincronización en ambos sentidos, las notas, la grabación y el diseño en celular.
Requisitos: `pip install selenium`; para WebKit, `WebKitWebDriver` (paquete webkit2gtk-driver);
para Firefox, Firefox y geckodriver. En Linux sin pantalla: `Xvfb :99 &` y DISPLAY=:99.
Uso: TRAZO_BROWSER=webkit|firefox TRAZO_URL=http://localhost:3080 python tests/e2e/navegadores.py"""
import os, re, json, time, urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿]')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name, detail)

def wait(fn, timeout=10, step=0.2):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception:
            pass
        time.sleep(step)
    return None

BROWSER = os.environ.get('TRAZO_BROWSER', 'webkit')
NAME = {'webkit': 'WebKit', 'firefox': 'Firefox'}[BROWSER]

def launch():
    if BROWSER == 'firefox':
        o = webdriver.FirefoxOptions()
        o.add_argument('-headless')
        return webdriver.Firefox(options=o)
    return webdriver.WebKitGTK()

room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())
wk = launch()
wk.set_window_size(1100, 800)
try:
    wk.get(BASE + '/')
    check(f'{NAME}: la portada carga', wait(lambda: wk.find_element(By.CSS_SELECTOR, 'h1')))
    check(f'{NAME}: sin emojis en la portada', not EMOJI.search(wk.find_element(By.TAG_NAME, 'body').text))
    wk.execute_script("localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(arguments[0])); localStorage.setItem('trazo:simple','false');", NAME)
    wk.get(f"{BASE}/sala?room={room['id']}&e2e=1")
    online = wait(lambda: wk.execute_script("return document.querySelector('#status')?.dataset.state === 'online'"), 15)
    check(f'{NAME}: se conecta a la sala', online)
    wk.execute_script("window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push(String(e.reason)));")

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
        ch = b.new_page(viewport={'width': 1100, 'height': 760})
        ch.goto(BASE + '/')
        ch.evaluate("([r,k]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify('Chrome')); localStorage.setItem('trazo:simple','false'); localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k)); }", [room['id'], room['hostKey']])
        ch.goto(f"{BASE}/sala?room={room['id']}&e2e=1"); ch.wait_for_selector('#status[data-state="online"]')

        # Chrome dibuja; WebKit lo ve.
        ch.keyboard.press('r'); ch.mouse.move(450, 300); ch.mouse.down(); ch.mouse.move(650, 420, steps=6); ch.mouse.up()
        got = wait(lambda: wk.execute_script("return window.__trazo.scene.alive().some(e => e.type === 'rect')"))
        check(f'{NAME} recibe lo que dibuja Chrome', got)

        # WebKit dibuja con el lápiz; Chrome lo ve.
        canvas = wk.find_element(By.CSS_SELECTOR, 'canvas')
        ActionChains(wk).send_keys('p').perform()
        ActionChains(wk).move_to_element_with_offset(canvas, 0, 0).click_and_hold().move_by_offset(60, 30).move_by_offset(60, 40).release().perform()
        ch.wait_for_function("window.__trazo.scene.alive().some(e => e.type === 'pen')", timeout=8000)
        check(f'Chrome recibe el trazo hecho en {NAME}', True)

        # Nota escrita en WebKit: crece y llega a Chrome con el texto.
        ActionChains(wk).send_keys('n').perform()
        ActionChains(wk).move_to_element_with_offset(canvas, -250, 150).click().perform()
        ed = wait(lambda: wk.find_element(By.CSS_SELECTOR, '.note-editor'))
        check(f'{NAME}: el editor de nota aparece sobre la nota', ed)
        if ed:
            ed.send_keys('Nota escrita desde OtroNavegador con texto largo para que la nota tenga que crecer hacia abajo sin cortar nada.')
            ActionChains(wk).move_to_element_with_offset(canvas, 400, 300).click().perform()
        ch.wait_for_function("window.__trazo.scene.alive().some(e => e.type === 'note' && e.text.includes('OtroNavegador'))", timeout=8000)
        h = ch.evaluate("window.__trazo.scene.alive().find(e => e.type === 'note').h")
        check(f'la nota de {NAME} llega a Chrome y creció con su texto', h > 160, f'h={h}')

        b.close()

    # Grabación de la pizarra (MediaRecorder + captureStream).
    caps = wk.execute_script("return { mr: typeof MediaRecorder, cs: typeof HTMLCanvasElement.prototype.captureStream, gdm: !!navigator.mediaDevices?.getDisplayMedia }")
    print(f'   capacidades {NAME}:', caps)
    if caps['mr'] == 'function' and caps['cs'] == 'function':
        wk.execute_script("window.__rec = null; const r = window.__trazo.recorder(); const prev = r.onState; r.onState = (on, blob, ext) => { if (!on) window.__rec = { size: blob?.size ?? 0, ext }; prev?.(on, blob, ext); }; r.start('board', { mic: false }).catch(e => window.__rec = { err: String(e) });")
        time.sleep(3)
        wk.execute_script("window.__trazo.recorder().stop()")
        rec = wait(lambda: wk.execute_script("return window.__rec"), 8)
        check(f'{NAME}: graba la pizarra (video real, no solo cabecera)', rec and rec.get('size', 0) > 20000, str(rec))
    else:
        menu_has = wk.execute_script("return [...document.querySelectorAll('.menu-item')].some(m => m.textContent.includes('Grabar') && !m.hidden)")
        check(f'{NAME} sin MediaRecorder: el menú no ofrece grabar', not menu_has)

    # Celular: barra inferior dentro de la pantalla.
    wk.set_window_size(390, 844); time.sleep(0.6)
    r = wk.execute_script("const b = document.querySelector('.bottombar').getBoundingClientRect(); return [b.left, b.right, innerWidth];")
    check(f'{NAME}: barra inferior dentro de la pantalla a 390 px', r[0] >= 0 and r[1] <= r[2] + 0.5, str(r))
    wk.save_screenshot(f'{OUT}/{BROWSER}-celular.png')
    errs = wk.execute_script("return window.__errs")
    check(f'{NAME}: sin errores de JavaScript', not errs, str(errs))
finally:
    wk.quit()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
