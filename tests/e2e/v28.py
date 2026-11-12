"""Prueba de punta a punta de v2.8: flechas pegadas a formas (sincronizadas y con deshacer),
guardar la sala en un archivo .trazo y abrirla como sala nueva, y notas sin duplicados al
cerrar el editor con un clic.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/v28.py"""
import os, json, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name, detail)

room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())
TIP = """(() => { const s = window.__trazo.scene; const ar = s.alive().find(e => e.type === 'arrow');
  const el = s.alive().find(e => e.type === 'ellipse'); const p = ar.points.at(-1);
  return { end: [ar.x + p[0], ar.y + p[1]], cy: el.y + el.h / 2, bind: [ar.startBind, ar.endBind] }; })()"""

def drag(pg, a, b, steps=8):
    pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*b, steps=steps); pg.mouse.up()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    def join(name, rid, key=None):
        pg = br.new_context(viewport={'width': 1100, 'height': 760}, accept_downloads=True).new_page()
        pg.goto(BASE + '/')
        pg.evaluate("([n]) => { localStorage.clear(); localStorage.setItem('trazo:name', JSON.stringify(n)); localStorage.setItem('trazo:simple','false'); }", [name])
        if key:
            pg.evaluate("([r,k]) => localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k))", [rid, key])
        pg.goto(f"{BASE}/sala?room={rid}&e2e=1"); pg.wait_for_selector('#status[data-state="online"]')
        return pg
    host = join('Anfitrión', room['id'], room['hostKey'])
    ana = join('Ana', room['id'])

    # 1. Flecha de un rectángulo a una elipse: queda pegada a ambas.
    host.keyboard.press('r'); drag(host, (300, 250), (420, 350))
    host.keyboard.press('o'); drag(host, (650, 420), (790, 520))
    host.keyboard.press('a'); host.mouse.move(360, 300); host.mouse.down(); host.mouse.move(600, 400, steps=6); host.mouse.move(720, 470, steps=6)
    hint = host.evaluate("window.__trazo.ctx().overlay.bindHint?.length ?? 0")
    host.screenshot(path=f'{OUT}/v28-1-flecha-pista.png')
    host.mouse.up()
    check('al dibujar se resaltan las dos formas', hint == 2, str(hint))
    t0 = host.evaluate(TIP)
    check('la flecha queda pegada al inicio y al final', all(t0['bind']), str(t0['bind']))

    # 2. Mover la elipse: la flecha la sigue, en ambos equipos.
    host.keyboard.press('v'); host.keyboard.press('Escape')
    drag(host, (720, 520), (720, 220))
    host.wait_for_timeout(300)
    t1 = host.evaluate(TIP)
    check('al mover la forma, la punta la sigue', t1['end'][1] < t0['end'][1] - 150, f"{t0['end']} -> {t1['end']}")
    ana.wait_for_function(f"(() => {{ const t = {TIP}; return Math.abs(t.end[1] - {t1['end'][1]}) < 0.5; }})()", timeout=5000)
    check('la otra persona ve la flecha en su lugar nuevo', True)
    host.screenshot(path=f'{OUT}/v28-2-flecha-sigue.png')

    # 3. Deshacer devuelve forma y flecha juntas.
    host.keyboard.press('Control+z'); host.wait_for_timeout(300)
    t2 = host.evaluate(TIP)
    check('deshacer devuelve la flecha con la forma', abs(t2['end'][1] - t0['end'][1]) < 0.5, f"{t2['end']}")

    # 4. Mover solo la flecha la despega.
    host.evaluate("window.__trazo.ctx().select([window.__trazo.scene.alive().find(e => e.type === 'arrow').id])")
    mid = host.evaluate("""(() => { const ar = window.__trazo.scene.alive().find(e => e.type === 'arrow'); const v = window.__trazo.viewport;
      const p = ar.points.at(-1); const wx = ar.x + p[0] / 2, wy = ar.y + p[1] / 2;
      const r = document.querySelector('canvas').getBoundingClientRect();
      return [r.left + (wx - v.x) * v.zoom, r.top + (wy - v.y) * v.zoom]; })()""")
    drag(host, mid, (mid[0], mid[1] + 120))
    t3 = host.evaluate(TIP)
    check('mover solo la flecha la despega', not any(t3['bind']), str(t3['bind']))

    # 5. Nota: el clic que cierra el editor no crea otra nota vacía.
    host.keyboard.press('n'); host.mouse.click(860, 250); host.wait_for_selector('.note-editor')
    host.keyboard.type('Para guardar'); host.mouse.click(950, 650); host.wait_for_timeout(300)
    notes = host.evaluate("window.__trazo.scene.alive().filter(e => e.type === 'note').map(e => e.text)")
    check('cerrar el editor con un clic no crea otra nota', notes == ['Para guardar'], str(notes))

    # 6. Guardar la sala y abrirla como sala nueva.
    host.evaluate("window.__trazo.ctx().select([])")
    host.click('#menu-btn')
    with host.expect_download() as dl:
        host.click('.menu-item:has-text("Guardar la sala")')
    path = os.path.join(OUT, 'v28-sala.trazo'); dl.value.save_as(path)
    check('se descarga el archivo .trazo', dl.value.suggested_filename.endswith('.trazo') and os.path.getsize(path) > 200, dl.value.suggested_filename)
    ana.click('#menu-btn')
    check('quien no es anfitrión no ve «Guardar la sala»', not ana.locator('.menu-item:has-text("Guardar la sala")').is_visible())
    ana.keyboard.press('Escape')

    host.goto(BASE + '/')
    host.set_input_files('#open-file', path)
    host.wait_for_url('**/sala?room=*')
    new_id = host.url.split('room=')[1].split('&')[0]
    check('se abre en una sala nueva', new_id != room['id'], new_id)
    host.goto(f"{BASE}/sala?room={new_id}&e2e=1"); host.wait_for_selector('#status[data-state="online"]')
    types = sorted(host.evaluate("window.__trazo.scene.alive().map(e => e.type)"))
    check('la sala abierta trae todo lo dibujado', types == ['arrow', 'ellipse', 'note', 'rect'], str(types))
    check('quien la abre queda como anfitrión',
          host.evaluate("[...document.querySelectorAll('.menu-item')].some(m => m.textContent.includes('Guardar la sala') && !m.hidden)"))
    host.screenshot(path=f'{OUT}/v28-3-sala-abierta.png')
    br.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
