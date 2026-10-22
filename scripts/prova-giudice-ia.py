"""Prova nel browser del giudice con IA: il telefono vero è l'host, tre robot giocano via motore e un finto /api/giudica
scrive i verdetti nell'archivio come farebbe il server. Due scenari: servizio acceso e servizio spento. Serve l'emulatore
(`sh scripts/emulatore.sh`) e il gioco su URL (npm start).
Uso: python3 scripts/prova-giudice-ia.py http://localhost:3100 cartella-schermate"""
import asyncio, json, re, subprocess, sys, urllib.request
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)

def db_put(path, valore):
    req = urllib.request.Request(f'http://127.0.0.1:9100/{path}.json?ns=demo-ncc-default-rtdb', data=json.dumps(valore).encode(), method='PUT', headers={'Authorization': 'Bearer owner'})
    urllib.request.urlopen(req).read()

def chiave(testo):
    return testo.lower().replace(' ', '_')

async def scenario(p, acceso):
    nome = 'ACCESO' if acceso else 'SPENTO'
    print(f'\n--- servizio {nome} ---')
    db_put('giudizi', None)  # archivio vuoto: nessun verdetto rimasto da prove precedenti
    helper = subprocess.Popen(['node', 'scripts/_prova-giudice-ospite.mjs'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    def chiedi(cmd):
        helper.stdin.write(cmd + '\n'); helper.stdin.flush()
        return json.loads(helper.stdout.readline())
    br = await p.chromium.launch()
    ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    chiamate = []
    async def api(route, request):
        corpo = json.loads(request.post_data or '{}')
        chiamate.append({'auth': request.headers.get('authorization', ''), 'parole': corpo.get('parole', [])})
        if not acceso:
            await route.fulfill(status=202, content_type='application/json', body='{"stato":"spento"}'); return
        await asyncio.sleep(1.0)
        for parola in corpo.get('parole', []):
            v = 'valida' if parola['testo'].endswith('oxqa') else 'non_valida' if parola['testo'].endswith('zzzx') else 'incerta'
            db_put(f"giudizi/{parola['cat']}/{chiave(parola['testo'])}", {'v': v, 'm': 'entrambi' if v == 'non_valida' else 'haiku', 'at': 1792000000000, 'p': 1})
        await route.fulfill(status=200, content_type='application/json', body='{"stato":"ok"}')
    await pg.route('**/api/giudica', api)
    await pg.goto(URL + '/'); await pg.wait_for_timeout(3000)
    await pg.get_by_role('textbox', name='Il tuo nome').fill('Ciro')
    await pg.get_by_role('button', name='Gioca online').click(); await pg.wait_for_timeout(600)
    await pg.get_by_role('button', name='Crea una stanza').click(); await pg.wait_for_timeout(800)
    await pg.get_by_role('button', name='Crea stanza').click(); await pg.wait_for_timeout(2000)
    nome_codice = await pg.get_by_role('img', name=re.compile('^Codice')).get_attribute('aria-label')
    code = nome_codice.replace('Codice', '').replace(' ', '')
    print('codice stanza', repr(nome_codice), '->', code)
    chiedi(f'unisciti {code}')
    await pg.wait_for_timeout(1500)
    await pg.get_by_role('button', name='Inizia partita').click()
    info = chiedi('gioca')
    print('lettera', info['L'], '| città del dizionario', info['vera'], '| parola nuova', info['nuova'], '| parola falsa', info['falsa'])
    for _ in range(80):
        if await pg.get_by_text('CORREZIONE').count(): break
        await pg.wait_for_timeout(500)
    check('si arriva alla correzione', await pg.get_by_text('CORREZIONE').count() > 0)
    await pg.wait_for_timeout(6500)  # animazione dello STOP e arrivo dei verdetti
    # la prima categoria della stanza è Nomi: si va avanti fino a Città
    for _ in range(3):
        if await pg.get_by_role('heading', name='Città').count(): break
        await pg.get_by_role('button', name='Prossima categoria').click(); await pg.wait_for_timeout(1500 if acceso else 800)
        await pg.wait_for_timeout(1200)
    await pg.wait_for_timeout(1500)
    corpo = (await pg.locator('body').inner_text()).replace(' ', ' ')
    check('la correzione di Città è aperta', await pg.get_by_role('heading', name='Città').count() > 0)
    check('l\'host ha chiamato /api/giudica con il token', bool(chiamate) and chiamate[0]['auth'].startswith('Bearer ') and len(chiamate[0]['auth']) > 30, len(chiamate))
    if chiamate:
        mandate = {x['testo'] for x in chiamate[0]['parole']}
        check('ha mandato le parole nuove e non quella del dizionario', info['nuova'] in mandate and info['falsa'] in mandate and info['vera'] not in mandate, sorted(mandate))
    check('la città del dizionario ha l\'etichetta "Nel dizionario"', 'Nel dizionario' in corpo)
    if acceso:
        check('la parola valida per il giudice ha l\'etichetta "Verificata"', 'Verificata' in corpo)
        check('la parola inesistente è "bocciata dal giudice" ("Non esiste" è anche una reazione: si controlla la scritta di riga)', 'bocciata dal giudice' in corpo and await pg.locator('span', has_text=re.compile('^Non esiste$')).count() >= 1)
        tasto_falsa = pg.get_by_role('button', name=re.compile(f"Non vale: {info['falsa']} di Elia"))
        check('la parola inesistente ha il tasto spento che spiega', await tasto_falsa.count() == 1 and (await tasto_falsa.get_attribute('aria-disabled')) == 'true')
        await tasto_falsa.click(force=True); await pg.wait_for_timeout(400)
        check('il tocco spiega che il voto non cambia niente', 'bocciata dal giudice: il voto non cambia niente' in (await pg.locator('body').inner_text()).replace(' ', ' '))
    else:
        check('spento: nessuna etichetta "Verificata" né "bocciata dal giudice"', 'Verificata' not in corpo and 'bocciata dal giudice' not in corpo)
        check('spento: le parole nuove si votano come sempre', await pg.get_by_role('button', name=re.compile(f"Non vale: {info['nuova']} di Dani")).count() == 1
              and await pg.get_by_role('button', name=re.compile(f"Non vale: {info['falsa']} di Elia")).count() == 1)
    await pg.screenshot(path=f'{OUT}/giudice-ia-{nome.lower()}.png')
    check('niente scroll laterale a 390px', not await pg.evaluate('document.documentElement.scrollWidth > innerWidth'))
    check('nessun errore JS', not errs, errs[:2])
    chiedi('fine')
    await br.close()

async def main():
    async with async_playwright() as p:
        await scenario(p, True)
        await scenario(p, False)
    print('\nESITO:', 'TUTTO OK' if ok else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok else 1)

asyncio.run(main())
