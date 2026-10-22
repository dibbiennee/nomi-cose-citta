"""Prova nel browser: il regalo di 100 monete per chi apre il gioco dall'icona sulla Home con il suo account. Serve l'emulatore
e il gioco su URL. Uso: python3 scripts/prova-home-bonus.py http://localhost:3100 cartella-schermate"""
import asyncio, json, sys, time, urllib.request
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
NS = 'ns=demo-ncc-default-rtdb'
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)
def db(path):
    req = urllib.request.Request(f'http://127.0.0.1:9100/{path}.json?{NS}', headers={'Authorization': 'Bearer owner'})
    return json.load(urllib.request.urlopen(req))
STANDALONE = "const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (/display-mode:\\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null } : mm(q));"

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '/?test=1'); await pg.wait_for_timeout(3500)
        await pg.get_by_role('textbox', name='Il tuo nome').fill('Anna')
        await pg.get_by_role('button', name='Account', exact=True).click(); await pg.wait_for_timeout(600)
        email = f'home{int(time.time())}@example.com'
        await pg.get_by_role('textbox', name='La tua email').fill(email)
        await pg.get_by_role('button', name='Mandami il link').click(); await pg.wait_for_timeout(1500)
        link = None
        for _ in range(20):
            codes = json.load(urllib.request.urlopen('http://127.0.0.1:9199/emulator/v1/projects/demo-ncc/oobCodes'))
            mine = [c for c in codes['oobCodes'] if c['email'] == email]
            if mine: link = mine[-1]['oobLink']; break
            await pg.wait_for_timeout(500)
        check('email inviata', bool(link))
        await pg.goto(URL + '/?' + link.split('?', 1)[1]); await pg.wait_for_timeout(5000)
        uid = max(((u, v['createdAt']) for u, v in (db('users') or {}).items() if v.get('createdAt')), key=lambda x: x[1])[0]
        await pg.reload(); await pg.wait_for_timeout(4000)
        check('dal browser normale non arriva nessun regalo', not (db(f'claims/{uid}') or {}).get('h_home'))
        coins0 = db(f'users/{uid}/coins')
        # ora come se fosse aperto dall'icona sulla Home
        await ctx.add_init_script(STANDALONE)
        await pg.reload()
        corpo = ''
        for _ in range(30):  # il messaggio resta a schermo pochi secondi: si guarda a intervalli
            corpo = (await pg.locator('body').inner_text()).replace('\u00a0', ' ')
            if '+100 monete' in corpo: break
            await pg.wait_for_timeout(300)
        check('dall\'icona: compare "+100 monete: hai messo il gioco sulla Home"', '+100 monete' in corpo and 'sulla Home' in corpo, corpo[-200:])
        await pg.screenshot(path=f'{OUT}/home-bonus.png')
        check('le monete sono salite di 100', db(f'users/{uid}/coins') == coins0 + 100, (coins0, db(f'users/{uid}/coins')))
        check('il segno h_home è scritto', db(f'claims/{uid}/h_home') is True)
        await pg.reload(); await pg.wait_for_timeout(3500)
        check('riaprendo non arriva una seconda volta', db(f'users/{uid}/coins') == coins0 + 100 and '+100 monete: hai messo' not in (await pg.locator('body').inner_text()))
        check('nessun errore JS', not errs, errs[:2])
        await br.close()
asyncio.run(main())
print('ESITO: ' + ('TUTTO OK' if ok else 'CI SONO FALLIMENTI'))
sys.exit(0 if ok else 1)
