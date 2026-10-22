"""Prova nel browser: /statistiche mostra la sezione del giudice con numeri e costo, e la privacy cita Anthropic.
Prima scrive un giorno di prova sull'emulatore (serve l'emulatore su 9100 e il gioco su URL).
Uso: python3 scripts/prova-statistiche-giudice.py http://localhost:3100 cartella-schermate"""
import asyncio, datetime, json, re, sys, urllib.request
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)

giorno = datetime.datetime.now().strftime('%Y-%m-%d')
dati = {'richieste': 12, 'valide': 150, 'non_valide': 9, 'incerte': 4, 'in_archivio': 60, 'centesimi': 234.5, 'token_in': 1000, 'token_out': 100}
req = urllib.request.Request(f'http://127.0.0.1:9100/giudizi_meta/giorni/{giorno}.json?ns=demo-ncc-default-rtdb', data=json.dumps(dati).encode(),
                             method='PUT', headers={'Authorization': 'Bearer owner'})
urllib.request.urlopen(req).read()

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '/statistiche'); await pg.wait_for_timeout(3500)
        sez = pg.locator('section', has=pg.get_by_role('heading', name='Giudice delle parole'))
        t = (await sez.inner_text()).replace(' ', ' ')
        check('la sezione del giudice c\'è', await sez.count() == 1)
        check('mostra le richieste (12) e il costo del giorno (2,35 $)', '12' in t and '2,35 $' in t, t[:120])
        check('mostra le parole valide, non valide e incerte', all(x in t for x in ['150', '9', '4']) and 'Parole giudicate dall\'IA: 163' in t, t)
        await sez.scroll_into_view_if_needed()
        await sez.screenshot(path=f'{OUT}/stat-giudice.png')
        over = await pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
        check('nessun overflow orizzontale a 390px', not over)
        await pg.goto(URL + '/privacy.html'); await pg.wait_for_timeout(1500)
        corpo = re.sub(r'\s+', ' ', (await pg.locator('body').inner_text()).replace(' ', ' '))
        check('la privacy cita Anthropic e dice "senza nome né identificativo"', 'Anthropic' in corpo and 'senza nome né identificativo' in corpo)
        check('nessun errore JS', not errs, errs)
        await br.close()
asyncio.run(main())
print('ESITO: ' + ('TUTTO OK' if ok else 'CI SONO FALLIMENTI'))
sys.exit(0 if ok else 1)
