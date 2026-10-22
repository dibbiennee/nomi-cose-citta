"""Prova nel browser: andare avanti nella correzione non deve mai sembrare bloccato, nemmeno con il giudice lento. Il server
finto risponde dopo 20 secondi. Un tocco su "Prossima categoria" avanza subito; su "Vedi i punteggi" il tasto dice
"Un attimo…", ignora i tocchi ripetuti e dopo al massimo 10 secondi porta ai punteggi. Serve l'emulatore e il gioco su URL.
Uso: python3 scripts/prova-avanti.py http://localhost:3100 cartella-schermate"""
import asyncio, json, re, subprocess, sys, time, urllib.request
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


def chiave_parola(testo): return chiave(testo)

async def main():
    async with async_playwright() as p:
        db_put('giudizi', None)
        db_put('giudizi_meta/attivo', True)
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
            chiamate.append(corpo.get('parole', []))
            await asyncio.sleep(20)  # giudice lentissimo
            try: await route.fulfill(status=200, content_type='application/json', body='{"stato":"ok"}')
            except Exception: pass
        await pg.route('**/api/giudica', api)
        await pg.goto(URL + '/?test=1'); await pg.wait_for_timeout(3000)
        await pg.get_by_role('textbox', name='Il tuo nome').fill('Ciro')
        await pg.get_by_role('button', name='Gioca online').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button', name='Crea una stanza').click(); await pg.wait_for_timeout(800)
        await pg.get_by_role('button', name='Crea stanza').click(); await pg.wait_for_timeout(2000)
        code = (await pg.get_by_role('img', name=re.compile('^Codice')).get_attribute('aria-label')).replace('Codice', '').replace(' ', '')
        chiedi(f'unisciti {code}'); await pg.wait_for_timeout(1500)
        await pg.get_by_role('button', name='Inizia partita').click()
        chiedi('gioca')
        for _ in range(80):
            if await pg.get_by_text('CORREZIONE').count(): break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(4200)  # animazione dello STOP
        corpo = lambda: pg.locator('body').inner_text()
        testo = (await corpo()).replace('\u00a0', ' ')
        m = re.search(r'CORREZIONE · (\d) DI (\d)', testo)
        check('si arriva alla correzione', bool(m), testo[:80])
        # 1) un tocco su "Prossima categoria": avanza subito, senza aspettare il giudice
        t0 = time.time()
        await pg.get_by_role('button', name='Prossima categoria').click()
        for _ in range(30):
            if f'CORREZIONE · 2 DI {m.group(2)}' in (await corpo()).replace('\u00a0', ' '): break
            await pg.wait_for_timeout(100)
        dt = time.time() - t0
        check('un solo tocco su "Prossima categoria" avanza in meno di 2,5 secondi (giudice ancora in corso)', dt < 2.5, f'{dt:.1f} s')
        # fino all'ultima categoria
        for _ in range(int(m.group(2))):
            if await pg.get_by_role('button', name='Vedi i punteggi').count(): break
            await pg.get_by_role('button', name='Prossima categoria').click(); await pg.wait_for_timeout(1200)
        ultimo = pg.get_by_role('button', name='Vedi i punteggi')
        check('siamo all\'ultima categoria', await ultimo.count() == 1)
        # 2) "Vedi i punteggi" con il giudice lento: feedback subito, tocchi ripetuti ignorati, punteggi entro 12 secondi
        t0 = time.time()
        await ultimo.click(); await pg.wait_for_timeout(150)
        attesa = pg.locator('button', has_text='Un attimo')  # il tasto cambia nome: i tocchi ripetuti vanno su questo
        for _ in range(3):
            if await attesa.count(): await attesa.first.click(force=True, timeout=2000)
        await pg.wait_for_timeout(400)
        check('il tasto mostra "Un attimo…" mentre aspetta', 'Un attimo' in (await corpo()))
        for _ in range(130):
            if await pg.get_by_role('button', name=re.compile('^(Prossima lettera|Vai ai premi)')).count(): break
            await pg.wait_for_timeout(100)
        dt = time.time() - t0
        check('i punteggi arrivano entro 12 secondi anche con il giudice lentissimo', await pg.get_by_role('button', name=re.compile('^(Prossima lettera|Vai ai premi)')).count() == 1 and dt < 12, f'{dt:.1f} s')
        check('nessun errore JS', not errs, errs[:2])
        await pg.screenshot(path=f'{OUT}/avanti-punteggi.png')
        chiedi('fine')
        await br.close()
    print('\nESITO:', 'TUTTO OK' if ok else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok else 1)

asyncio.run(main())
