"""Prueba de punta a punta de v2.1: fondos de hoja, adjuntos (foto, PDF, PowerPoint, otro archivo),
documentos con páginas y anotaciones ancladas, trazos en vivo y latencia.
Requiere: pip install playwright reportlab python-pptx pillow && LibreOffice o Microsoft Office en el servidor.
Uso: con el servidor en marcha, TRAZO_URL=http://localhost:3080 python tests/e2e/adjuntos.py"""
import os, json, tempfile, urllib.request
from playwright.sync_api import sync_playwright

OUT = os.environ.get('TRAZO_E2E_OUT', '.')
BASE = os.environ.get('TRAZO_URL', 'http://localhost:3096')
FILES = tempfile.mkdtemp(prefix='trazo-e2e-')


def make_files():
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas
    from pptx import Presentation
    from PIL import Image, ImageDraw
    c = canvas.Canvas(f'{FILES}/prueba.pdf', pagesize=landscape(A4))
    for i in range(1, 4):
        c.setFont('Helvetica-Bold', 60); c.drawString(100, 400, f'Pagina {i} del PDF'); c.rect(80, 80, 600, 250); c.showPage()
    c.save()
    prs = Presentation()
    for i in range(1, 4):
        s = prs.slides.add_slide(prs.slide_layouts[0]); s.shapes.title.text = f'Diapositiva {i}'; s.placeholders[1].text = 'Prueba'
    prs.save(f'{FILES}/prueba.pptx')
    im = Image.new('RGB', (1200, 800), (255, 200, 80)); ImageDraw.Draw(im).ellipse((300, 150, 900, 650), fill=(60, 120, 220)); im.save(f'{FILES}/foto.png')
    open(f'{FILES}/notas.zip', 'wb').write(b'PK\x05\x06' + b'\0' * 18)


results = []
def check(name, ok):
    results.append((name, bool(ok)))
    print(('OK  ' if ok else 'FAIL'), name)

make_files()
room = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/api/rooms', data=b'{}', method='POST')).read())
rid = room['id']
els = "(t) => [...window.__trazo.scene.map.values()].filter(e => !e.isDeleted && e.type === t)"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--no-sandbox'])
    host = b.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    host.goto(BASE + '/')
    host.evaluate("([r,k]) => { localStorage.setItem('trazo:name', JSON.stringify('Anfitrión')); localStorage.setItem('trazo:hostkey:'+r, JSON.stringify(k)); }", [rid, room['hostKey']])
    host.goto(f'{BASE}/sala?room={rid}&e2e=1'); host.wait_for_selector('#status[data-state="online"]')
    guest = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    guest.goto(BASE + '/'); guest.evaluate("localStorage.setItem('trazo:name', JSON.stringify('Invitada'))")
    guest.goto(f'{BASE}/sala?room={rid}&e2e=1'); guest.wait_for_selector('#status[data-state="online"]')

    # Latencia
    host.wait_for_selector('#latency:not([hidden])', timeout=8000)
    check('indicador de latencia', 'ms' in host.inner_text('#latency'))

    # Fondo de hoja (anfitrión) → lo ve la invitada
    host.click('#menu-btn'); host.click('.menu-item:has-text("Fondo de la hoja")')
    host.click('.bg-tile:has-text("Cuadriculada")'); host.click('.bg-swatch.paper-dark'); host.click('.modal .btn:has-text("Listo")')
    guest.wait_for_function("document.body.dataset.paper === 'dark'", timeout=5000)
    check('fondo sincronizado', True)
    host.screenshot(path=f'{OUT}/v21-1-fondo.png')
    # La invitada no puede cambiarlo
    guest.click('#menu-btn'); guest.click('.menu-item:has-text("Fondo de la hoja")')
    check('invitada sin permiso de fondo', guest.is_disabled('.bg-tile >> nth=0'))
    guest.click('.modal .btn:has-text("Listo")')
    host.click('#menu-btn'); host.click('.menu-item:has-text("Fondo de la hoja")')
    host.click('.bg-tile:has-text("Puntos")'); host.click('.bg-swatch.paper-white'); host.click('.modal .btn:has-text("Listo")')

    # Foto
    host.set_input_files('input[type=file]', f'{FILES}/foto.png')
    guest.wait_for_function(f"({els})('image').length === 1", timeout=10000)
    check('foto en la pizarra de la invitada', True)

    # PDF como documento
    host.set_input_files('input[type=file]', f'{FILES}/prueba.pdf')
    host.click('.choice-card:has-text("Documento para hojear")')
    guest.wait_for_function(f"({els})('doc').length === 1", timeout=20000)
    doc = guest.evaluate(f"({els})('doc')[0]")
    check('PDF de 3 páginas como documento', len(doc['pages']) == 3 and doc.get('source'))
    host.wait_for_selector('.doc-bar:not([hidden])')
    host.wait_for_timeout(600)
    host.screenshot(path=f'{OUT}/v21-2-documento.png')

    # Anotación anclada a la página 1 del documento
    box = host.evaluate(f"(() => {{ const d = ({els})('doc')[0]; const v = window.__trazo.viewport; const a = v.toScreen(d.x + d.w*0.3, d.y + d.h*0.5); const c = v.toScreen(d.x + d.w*0.6, d.y + d.h*0.6); return [a.x, a.y, c.x, c.y]; }})()")
    host.keyboard.press('p')
    host.mouse.move(box[0], box[1]); host.mouse.down()
    steps = 12
    for i in range(1, steps + 1):
        host.mouse.move(box[0] + (box[2] - box[0]) * i / steps, box[1] + (box[3] - box[1]) * i / steps)
        host.wait_for_timeout(25)
    live_seen = guest.evaluate("window.__trazo.live.map.size")
    host.mouse.up()
    check('trazo en vivo visible antes de soltar', live_seen >= 1)
    guest.wait_for_function(f"({els})('pen').length === 1", timeout=5000)
    pen = guest.evaluate(f"({els})('pen')[0]")
    check('trazo anclado a la página 1', pen.get('anchor') == doc['id'] and pen.get('anchorPage') == 0)
    check('trazo en vivo descartado al llegar el final', guest.evaluate("window.__trazo.live.map.size") == 0)
    # Pasar de página: la anotación se oculta para todos
    host.click('.doc-bar button[aria-label="Página siguiente"]')
    guest.wait_for_function(f"({els})('doc')[0].docPage === 1", timeout=5000)
    hidden = guest.evaluate("window.__trazo.scene.alive().every(e => e.type !== 'pen')")
    check('anotación oculta en la página 2', hidden)
    host.wait_for_timeout(500)
    host.screenshot(path=f'{OUT}/v21-3-pagina2.png')
    host.click('.doc-bar button[aria-label="Página anterior"]')

    # PowerPoint → PDF en el servidor → una diapositiva por página
    host.set_input_files('input[type=file]', f'{FILES}/prueba.pptx')
    host.wait_for_selector('.choice-card:has-text("Una página por diapositiva")', timeout=120000)
    host.click('.choice-card:has-text("Una página por diapositiva")')
    guest.wait_for_function(f"({els})('image').filter(e => e.page > 0).length === 3", timeout=30000)
    pages = guest.evaluate(f"({els})('image').filter(e => e.page > 0).map(e => e.page)")
    check('PowerPoint en 3 páginas de Trazo', sorted(pages) == [1, 2, 3])
    guest.wait_for_function("window.__trazo.scene.page === 1", timeout=5000)
    check('la sala salta a la primera diapositiva', True)
    host.wait_for_timeout(800)
    host.screenshot(path=f'{OUT}/v21-4-diapositiva.png')
    guest.screenshot(path=f'{OUT}/v21-5-celular.png')

    # Otro archivo → tarjeta descargable
    host.set_input_files('input[type=file]', f'{FILES}/notas.zip')
    guest.wait_for_function(f"({els})('file').length === 1", timeout=10000)
    f = guest.evaluate(f"({els})('file')[0]")
    r = urllib.request.urlopen(BASE + f['src'] + '?name=notas.zip')
    check('tarjeta de archivo descargable', 'attachment' in (r.headers.get('Content-Disposition') or ''))
    b.close()

print(f"\n{sum(ok for _, ok in results)}/{len(results)} comprobaciones")
raise SystemExit(0 if all(ok for _, ok in results) else 1)
