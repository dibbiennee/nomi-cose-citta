"""Prova nel browser: andando avanti nella correzione la lista riparte dalla prima parola in alto. Serve l'emulatore e il
gioco su URL. Uso: python3 scripts/prova-correzione-scroll.py http://localhost:3100 cartella-schermate"""
import asyncio, json, subprocess, sys
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)

helper = subprocess.Popen(['node', 'scripts/_prova-giudice-stanza.mjs'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def chiedi(cmd):
    helper.stdin.write(cmd + '\n'); helper.stdin.flush()
    return json.loads(helper.stdout.readline())

ALTEZZA = """() => { const c = [...document.querySelectorAll('.n-scroll')].find((e) => e.scrollHeight > 0 && getComputedStyle(e).overflowY === 'auto'); return c ? { top: Math.round(c.scrollTop), max: c.scrollHeight - c.clientHeight } : null; }"""

async def main():
    code = chiedi('crea')['code']
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 520}, device_scale_factor=2)  # schermo basso: la lista deve scorrere
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '/'); await pg.wait_for_timeout(3000)
        await pg.get_by_role('textbox', name='Il tuo nome').fill('Ciro')
        await pg.get_by_role('button', name='Gioca online').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button', name='Ho un codice').click(); await pg.wait_for_timeout(500)
        await pg.get_by_role('textbox').last.fill(code)
        await pg.get_by_role('button', name='Entra', exact=True).click(); await pg.wait_for_timeout(3000)
        chiedi('via')
        for _ in range(60):
            if await pg.get_by_text('CORREZIONE').count(): break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(4000)  # finisce l'animazione dello STOP
        check('si arriva alla correzione della prima categoria', 'CORREZIONE · 1 DI 2' in (await pg.locator('body').inner_text()).replace(' ', ' '))
        prima = await pg.evaluate(ALTEZZA)
        check('la lista scorre (schermo basso)', prima and prima['max'] > 20, prima)
        # chi legge scende fino in fondo alla lista...
        await pg.evaluate("""() => { const c = [...document.querySelectorAll('.n-scroll')].find((e) => getComputedStyle(e).overflowY === 'auto'); c.scrollTop = c.scrollHeight; }""")
        await pg.wait_for_timeout(300)
        giu = await pg.evaluate(ALTEZZA)
        check('in fondo alla prima categoria', giu and giu['top'] > 0, giu)
        # ...l'host va avanti: la categoria successiva riparte dall'alto
        chiedi('avanti')
        await pg.wait_for_timeout(1500)
        check('si è passati alla seconda categoria', 'CORREZIONE · 2 DI 2' in (await pg.locator('body').inner_text()).replace(' ', ' '))
        dopo = await pg.evaluate(ALTEZZA)
        check('la seconda categoria riparte dalla prima parola in alto', dopo and dopo['top'] == 0, dopo)
        await pg.screenshot(path=f'{OUT}/correzione-seconda.png')
        check('nessun errore JS', not errs, errs[:2])
        await br.close()
    chiedi('fine')
    print('\nESITO:', 'TUTTO OK' if ok else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok else 1)

asyncio.run(main())
