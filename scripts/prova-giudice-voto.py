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
        p1, p2, p3 = info['protette']
        print('lettera', info['L'], '| parole del dizionario', info['protette'], '| parola finta', info['falsa'])
        for _ in range(60):
            if await pg.get_by_text('CORREZIONE').count(): break
            await pg.wait_for_timeout(500)
        check('si arriva alla correzione', await pg.get_by_text('CORREZIONE').count() > 0)
        await pg.wait_for_timeout(3500)  # finisce l'animazione dello STOP, che copre la schermata
        body = (await pg.locator('body').inner_text()).replace('\u00a0', ' ')
        check('le tre parole del dizionario sono presenti', all(w.lower() in body.lower() for w in info['protette']))
        check('nessuna etichetta tecnica sulle righe (dizionario, verificata): la riga è uguale alle altre', 'dizionario' not in body.lower() and 'verificata' not in body.lower())
        tasto = lambda parola, chi: pg.get_by_role('button', name=f'Non vale: {parola} di {chi}')
        vota_falsa = pg.get_by_role('button', name=f"Non vale: {info['falsa']} di Elia")
        check('ogni parola che esiste ha un tasto "Non vale" che spiega ma non vota', await tasto(p1, 'Anna').count() == 1 and await tasto(p2, 'Bea').count() == 1 and await tasto(p3, 'Dani').count() == 1)
        check('la parola finta ha il tasto "Non vale" vero', await vota_falsa.count() == 1)
        await pg.screenshot(path=f'{OUT}/giudice-correzione.png')
        # tre tocchi sulla STESSA parola: spiega, ma non è un avviso
        for k in range(3):
            await tasto(p1, 'Anna').click(force=True); await pg.wait_for_timeout(350)
        t = (await pg.locator('body').inner_text()).replace('\u00a0', ' ')
        check('toccare più volte la stessa parola spiega e non avvisa', 'esiste: vale per tutti' in t and 'Hai provato a bocciare' not in t)
        await tasto(p2, 'Bea').click(force=True); await pg.wait_for_timeout(350)
        t = (await pg.locator('body').inner_text()).replace('\u00a0', ' ')
        check('due parole diverse: ancora nessun avviso', 'Hai provato a bocciare' not in t)
        await tasto(p3, 'Dani').click(force=True); await pg.wait_for_timeout(500)
        t = (await pg.locator('body').inner_text()).replace('\u00a0', ' ')
        check('alla terza parola diversa compare l\'avviso privato', 'Hai provato a bocciare 3 parole che esistono' in t)
        voti = chiedi('voti')
        check('nessun voto scritto contro le parole protette', not voti.get('voti'), voti)
        check('niente scroll laterale a 390px', not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
        await pg.set_viewport_size({'width': 360, 'height': 740}); await pg.wait_for_timeout(500)
        check('niente scroll laterale a 360px', not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
        check('nessun errore JS', not errs, errs[:2])
        await br.close()
    chiedi('fine')
    print('\nESITO:', 'TUTTO OK' if ok else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok else 1)

asyncio.run(main())
