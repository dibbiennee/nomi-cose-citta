"""Prova nel browser: una parola del dizionario non si può votare contro, una che non c'è sì. Serve l'emulatore
(`sh scripts/emulatore.sh`) e il gioco su URL (npm start). Uso: python3 scripts/prova-giudice-voto.py http://localhost:3100 cartella-schermate"""
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

async def main():
    code = chiedi('crea')['code']
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '/'); await pg.wait_for_timeout(3000)
        await pg.get_by_role('textbox', name='Il tuo nome').fill('Ciro')
        await pg.get_by_role('button', name='Gioca online').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button', name='Ho un codice').click(); await pg.wait_for_timeout(500)
        await pg.get_by_role('textbox').last.fill(code)
        await pg.get_by_role('button', name='Entra', exact=True).click(); await pg.wait_for_timeout(3000)
        info = chiedi('via')
        print('lettera', info['L'], '| parola del dizionario', info['protetta'], '| parola finta', info['falsa'])
        for _ in range(60):
            if await pg.get_by_text('CORREZIONE').count(): break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(1500)
        check('si arriva alla correzione', await pg.get_by_text('CORREZIONE').count() > 0)
        body = (await pg.locator('body').inner_text()).replace(' ', ' ')
        check('la parola del dizionario è presente', info['protetta'].lower() in body.lower())
        check('la riga protetta porta l\'etichetta "Nel dizionario"', 'Nel dizionario' in body)
        vota_protetta = pg.get_by_role('button', name=f"Non vale: {info['protetta']} di Anna")
        vota_falsa = pg.get_by_role('button', name=f"Non vale: {info['falsa']} di Bea")
        check('la parola del dizionario non ha il tasto "Non vale"', await vota_protetta.count() == 0)
        check('la parola finta ha il tasto "Non vale"', await vota_falsa.count() == 1)
        await pg.wait_for_timeout(3500)  # finisce l'animazione dello STOP
        await pg.screenshot(path=f'{OUT}/giudice-correzione.png')
        check('niente scroll laterale a 390px', not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
        await pg.set_viewport_size({'width': 360, 'height': 740}); await pg.wait_for_timeout(500)
        check('niente scroll laterale a 360px', not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
        check('nessun errore JS', not errs, errs[:2])
        await br.close()
    chiedi('fine')
    print('\nESITO:', 'TUTTO OK' if ok else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok else 1)

asyncio.run(main())
