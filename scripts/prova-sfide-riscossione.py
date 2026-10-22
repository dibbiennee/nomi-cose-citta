"""Prova nel browser: riscuotere due sfide una dopo l'altra non deve mai mostrare "Non è andata". Le regole accettano una
sfida ogni 20 secondi: il secondo tocco aspetta da solo e il tasto dice "Un attimo…". Serve l'emulatore e il gioco su URL.
Uso: python3 scripts/prova-sfide-riscossione.py http://localhost:3100 cartella-schermate"""
import asyncio, json, re, sys, time, urllib.request
from datetime import date, datetime
from zoneinfo import ZoneInfo
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
NS = 'ns=demo-ncc-default-rtdb'
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)
def db(path, value=None, method='GET'):
    data = None if value is None else json.dumps(value).encode()
    req = urllib.request.Request(f'http://127.0.0.1:9100/{path}.json?{NS}', data=data, method=method, headers={'Authorization': 'Bearer owner'})
    return json.load(urllib.request.urlopen(req))
oggi = datetime.now(ZoneInfo('Europe/Rome')).date()
N = (oggi - date(1970, 1, 1)).days

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '/?test=1'); await pg.wait_for_timeout(3500)
        await pg.get_by_role('textbox', name='Il tuo nome').fill('Anna')
        await pg.get_by_role('button', name='Account', exact=True).click(); await pg.wait_for_timeout(600)
        email = f'sfide{int(time.time())}@example.com'
        await pg.get_by_role('textbox', name='La tua email').fill(email)
        await pg.get_by_role('button', name='Mandami il link').click(); await pg.wait_for_timeout(1500)
        link = None
        for _ in range(20):
            codes = json.load(urllib.request.urlopen('http://127.0.0.1:9199/emulator/v1/projects/demo-ncc/oobCodes'))
            mine = [c for c in codes['oobCodes'] if c['email'] == email]
            if mine: link = mine[-1]['oobLink']; break
            await pg.wait_for_timeout(500)
        await pg.goto(URL + '/?' + link.split('?', 1)[1]); await pg.wait_for_timeout(5000)
        uid = max(((u, v['createdAt']) for u, v in (db('users') or {}).items() if v.get('createdAt')), key=lambda x: x[1])[0]
        db(f'users/{uid}/createdAt', int((time.time() - 120 * 86400) * 1000), 'PUT')
        db(f'users/{uid}/sfideFatte', {f'd{N}': {f's{i}': True for i in range(1, 9)}}, 'PUT')  # tutte e tre quelle di oggi sono fatte
        await pg.reload(); await pg.wait_for_timeout(4500)
        await pg.get_by_role('button', name=re.compile(r'^Giorno \d+')).first.click(); await pg.wait_for_timeout(700)
        tasti = pg.get_by_role('button', name=re.compile(r'^Prendi le'))
        check('ci sono tre sfide da prendere', await tasti.count() == 3, await tasti.count())
        coins0 = db(f'users/{uid}/coins')
        t0 = time.time()
        await tasti.first.click()
        await pg.wait_for_timeout(1800)
        prese = await pg.get_by_text('Presa', exact=True).count()
        check('la prima sfida è presa subito', prese == 1, prese)
        # la seconda subito dopo: prima delle regole (20 secondi) sarebbe comparso "Non è andata"
        await pg.get_by_role('button', name=re.compile(r'^Prendi le')).first.click()
        await pg.wait_for_timeout(600)
        corpo = (await pg.locator('body').inner_text()).replace(' ', ' ')
        check('il tasto dice "Un attimo…" mentre aspetta', 'Un attimo' in corpo, corpo[-160:])
        errore = False
        for _ in range(110):
            corpo = (await pg.locator('body').inner_text()).replace(' ', ' ')
            if 'Non è andata' in corpo: errore = True; break
            if await pg.get_by_text('Presa', exact=True).count() == 2: break
            await pg.wait_for_timeout(250)
        check('la seconda sfida arriva da sola, senza errori', not errore and await pg.get_by_text('Presa', exact=True).count() == 2, f'{time.time() - t0:.0f} s')
        check('nessun errore JS', not errs, errs[:2])
        await pg.screenshot(path=f'{OUT}/sfide-riscossione.png')
        await br.close()
asyncio.run(main())
print('ESITO: ' + ('TUTTO OK' if ok else 'CI SONO FALLIMENTI'))
sys.exit(0 if ok else 1)
