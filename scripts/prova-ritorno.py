"""Prova nel browser di serie di giorni, sfide, scrigno e traguardi, sull'emulatore (serve `sh scripts/emulatore.sh`
e il gioco su URL, per esempio npm start). Uso: python3 scripts/prova-ritorno.py http://localhost:3100 cartella-schermate"""
import asyncio, json, re, sys, time, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
DB = 'http://127.0.0.1:9100'
NS = 'ns=demo-ncc-default-rtdb'
ok = True

def db(path, value=None, method='GET'):
    data = None if value is None else json.dumps(value).encode()
    req = urllib.request.Request(f'{DB}/{path}.json?{NS}', data=data, method=method, headers={'Authorization': 'Bearer owner'})
    return json.load(urllib.request.urlopen(req))

def day(offset=0):
    return (datetime.now(ZoneInfo('Europe/Rome')) + timedelta(days=offset)).strftime('%Y-%m-%d')

def N(offset=0):
    from datetime import date
    return (date.fromisoformat(day(offset)) - date(1970, 1, 1)).days

def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)

NXT = re.compile(r'^(Prossima categoria|Vedi i punteggi|Vai ai premi|Vai al podio)')
async def solo_game(pg):
    await pg.get_by_role('button', name='Gioca da solo').click()
    await pg.get_by_role('radio', name=re.compile('^Impossibile')).click()
    for _ in range(2): await pg.get_by_role('button', name='Meno round').click()
    await pg.get_by_role('button', name='Inizia la partita').click()
    await pg.wait_for_timeout(14000)
    for _ in range(14):
        if await pg.get_by_text('PARTITA FINITA').count(): break
        b = pg.get_by_role('button', name=NXT)
        if await b.count(): await b.first.click()
        await pg.wait_for_timeout(700)
    await pg.wait_for_timeout(5000)

async def row_text(pg):
    return (await pg.get_by_role('button', name=re.compile(r'^Giorno \d+')).first.inner_text()).replace('\n', ' ')

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        A = await ctx.new_page()
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto(URL + '/'); await A.wait_for_timeout(3500)
        # senza account: anteprima, niente serie
        check('senza account: anteprima dei premi', await A.get_by_text("Con l'account ricevi premi ogni giorno").count() == 1)
        check('senza account: nessuna riga Giorno', await A.get_by_role('button', name=re.compile(r'^Giorno \d+')).count() == 0)
        # registrazione con il link dell'email
        await A.get_by_role('textbox', name='Il tuo nome').fill('Anna')
        await A.get_by_role('button', name='Account', exact=True).click(); await A.wait_for_timeout(600)
        email = f'ritorno{int(time.time())}@example.com'
        await A.get_by_role('textbox', name='La tua email').fill(email)
        await A.get_by_role('button', name='Mandami il link').click(); await A.wait_for_timeout(1500)
        link = None
        for _ in range(20):
            codes = json.load(urllib.request.urlopen('http://127.0.0.1:9199/emulator/v1/projects/demo-ncc/oobCodes'))
            mine = [c for c in codes['oobCodes'] if c['email'] == email]
            if mine: link = mine[-1]['oobLink']; break
            await A.wait_for_timeout(500)
        check('email inviata', bool(link))
        await A.goto(URL + '/?' + link.split('?', 1)[1]); await A.wait_for_timeout(5000)
        uid = max(((u, v['createdAt']) for u, v in (db('users') or {}).items() if v.get('createdAt')), key=lambda x: x[1])[0]
        db(f'users/{uid}/createdAt', int((time.time() - 120 * 86400) * 1000), 'PUT')  # account "vecchio": i tetti legati all'età non bloccano
        await A.reload(); await A.wait_for_timeout(4500)
        u = db(f'users/{uid}')
        check('primo giorno: serie 1 nel profilo', u.get('streak') == 1 and u.get('lastDay') == N(), {k: u.get(k) for k in ('streak', 'lastDay')})
        check('la home mostra il Giorno 1', (await row_text(A)).startswith('Giorno 1'), await row_text(A))
        await A.screenshot(path=f'{OUT}/1-home.png')
        # dettagli
        await A.get_by_role('button', name=re.compile(r'^Giorno \d+')).first.click(); await A.wait_for_timeout(600)
        sheet = await A.locator('body').inner_text()
        check('dettagli: tre sfide e il prossimo premio', sheet.count('monete') >= 4 and 'Al giorno 3 ricevi 50' in sheet.replace(' ', ' '))
        await A.screenshot(path=f'{OUT}/2-oggi.png')
        await A.get_by_role('button', name='Chiudi').click(); await A.wait_for_timeout(400)
        # partita: scrigno e sfide
        coins0 = db(f'users/{uid}/coins')
        await solo_game(A)
        body = (await A.locator('body').inner_text()).replace(' ', ' ')
        u = db(f'users/{uid}')
        check('scrigno sul podio', 'monete di partita' in body and ('dallo scrigno' in body or 'un raro' in body), body[body.find('+'):body.find('+') + 80].replace('\n', ' '))
        check('conto degli scrigni a 1', (u.get('scrigni') or {}).get('n') == 1, u.get('scrigni'))
        check('monete salite', u['coins'] > coins0, f"{coins0} -> {u['coins']}")
        await A.screenshot(path=f'{OUT}/3-podio.png')
        done = list(((u.get('sfideFatte') or {}).get(f'd{N()}') or {}).keys())
        # riscossione, con doppio clic
        await A.get_by_role('button', name=re.compile('^Esci|^Torna|Home')).first.click() if await A.get_by_role('button', name=re.compile('^Esci|^Torna alla home')).count() else None
        await A.wait_for_timeout(1500)
        if await A.get_by_role('button', name=re.compile(r'^Giorno \d+')).count():
            await A.get_by_role('button', name=re.compile(r'^Giorno \d+')).first.click(); await A.wait_for_timeout(600)
            take = A.get_by_role('button', name=re.compile('^Prendi le'))
            if done and await take.count():
                before = db(f'users/{uid}/coins')
                await take.first.dblclick(); await A.wait_for_timeout(2500)
                after = db(f'users/{uid}/coins')
                check('sfida presa una volta sola, anche col doppio clic', 0 < after - before <= 60 + 50, f'+{after - before}')
                check('segno di riscossione scritto', any(k.startswith('s_') for k in (db(f'claims/{uid}') or {})))
            else:
                print('nota: nessuna sfida di oggi completata da una partita da soli')
            await A.get_by_role('button', name='Chiudi').click(); await A.wait_for_timeout(300)
        # il giorno dopo: la serie continua
        db(f'users/{uid}', {**db(f'users/{uid}'), 'lastDay': N(-1), 'lastDaily': day(-1)}, 'PUT')
        await A.reload(); await A.wait_for_timeout(4500)
        check('il giorno dopo: Giorno 2', (await row_text(A)).startswith('Giorno 2'), await row_text(A))
        # traguardo dei 3 giorni
        cur = db(f'users/{uid}')
        db(f'users/{uid}', {**cur, 'lastDay': N(-1), 'streak': 2}, 'PUT')
        before = db(f'users/{uid}/coins')
        await A.reload(); await A.wait_for_timeout(5000)
        t = (await A.locator('body').inner_text()).replace(' ', ' ')
        check('traguardo 3: foglio di festa', '3 giorni di fila!' in t)
        await A.screenshot(path=f'{OUT}/4-festa.png')
        check('traguardo 3: +50 monete', db(f'users/{uid}/coins') >= before + 50, f"{before} -> {db(f'users/{uid}/coins')}")
        if await A.get_by_role('button', name='Continua').count(): await A.get_by_role('button', name='Continua').click()
        # un giorno saltato: lo scudo tiene la serie
        cur = db(f'users/{uid}')
        cur.pop('scudo', None)
        db(f'users/{uid}', {**cur, 'lastDay': N(-2), 'streak': 5, 'migliorSerie': 5, 'serieId': N(-6)}, 'PUT')
        await A.reload(); await A.wait_for_timeout(4500)
        u = db(f'users/{uid}')
        check('scudo: la serie continua a 6', u.get('streak') == 6 and u.get('scudo') == day()[:7], {k: u.get(k) for k in ('streak', 'scudo')})
        # due giorni saltati: riparte
        db(f'users/{uid}', {**u, 'lastDay': N(-3), 'streak': 8, 'migliorSerie': 8}, 'PUT')
        await A.reload(); await A.wait_for_timeout(4500)
        u = db(f'users/{uid}')
        check('due giorni saltati: la serie riparte da 1, il record resta', u.get('streak') == 1 and u.get('migliorSerie') == 8, {k: u.get(k) for k in ('streak', 'migliorSerie')})
        # 360px: una riga, niente scroll laterale
        await ctx.close()
        small = await br.new_context(viewport={'width': 360, 'height': 740}, device_scale_factor=2)
        B = await small.new_page()
        await B.goto(URL + '/'); await B.wait_for_timeout(3000)
        check('360px: niente scroll laterale', not await B.evaluate('document.documentElement.scrollWidth > innerWidth'))
        check('360px: Gioca online ancora visibile nella prima schermata', await B.get_by_role('button', name='Gioca online').is_visible())
        await B.screenshot(path=f'{OUT}/5-home-360.png')
        check('nessun errore JS', not errs, errs[:2])
        await br.close()
    print('\nESITO:', 'TUTTO OK' if ok else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok else 1)

asyncio.run(main())
