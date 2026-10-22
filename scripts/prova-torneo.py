"""Prova nel browser: il riquadro "Torneo delle 21, in arrivo" nella home. Pillola nella barra in alto, foglio con la lista
d'attesa (email e consenso), contatore della richiesta, nessun overflow a 360px. Serve l'emulatore e il gioco su URL.
Uso: python3 scripts/prova-torneo.py http://localhost:3100 cartella-schermate"""
import asyncio, datetime, json, sys, urllib.request
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)
def admin(path):
    req = urllib.request.Request(f'http://127.0.0.1:9100/{path}.json?ns=demo-ncc-default-rtdb', headers={'Authorization': 'Bearer owner'})
    return json.load(urllib.request.urlopen(req))
giorno = datetime.datetime.now().strftime('%Y-%m-%d')
CONTA = """() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  barra: (() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.includes('Torneo')); return b ? Math.round(b.getBoundingClientRect().height) : 0; })() })"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        for w, h in [(360, 640), (390, 844)]:
            ctx = await br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2)
            pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL + '/?test=0'); await pg.wait_for_timeout(3000)
            tasto = pg.get_by_role('button', name='Torneo delle 21, in arrivo')
            check(f'{w}px: la pillola "Torneo 21:00" c\'è', await tasto.count() == 1)
            m = await pg.evaluate(CONTA)
            check(f'{w}px: nessun overflow orizzontale e area di tocco di 44px', not m['over'] and m['barra'] >= 44, m)
            await pg.screenshot(path=f'{OUT}/torneo-home-{w}.png')
            r0 = (admin(f'stats/days/{giorno}/richiesta_torneo_21') or 0)
            await tasto.click(); await pg.wait_for_timeout(700)
            corpo = (await pg.locator('body').inner_text()).replace(' ', ' ')
            foglio = corpo[corpo.index('Ogni sera'):] if 'Ogni sera' in corpo else corpo  # solo il foglio, non la home dietro
            check(f'{w}px: il titolo del foglio è Torneo delle 21', await pg.get_by_role('heading', name='Torneo delle 21').count() == 1)
            check(f'{w}px: il foglio dice che è gratis e non promette premi né soldi', 'gratis' in foglio and 'premi' not in foglio.lower() and 'soldi' not in foglio.lower(), foglio[:160])
            check(f'{w}px: spiega la Home in parole semplici: icona tra le app, niente da scaricare, avvisi', 'Non scarichi niente' in foglio and 'avvisarti' in foglio and 'Mettilo sulla Home' in foglio, foglio[:400])
            check(f'{w}px: il foglio sta nello schermo (si può premere Avvisami senza uscire dalla vista)', await pg.get_by_role('button', name='Avvisami').is_visible())
            check(f'{w}px: la richiesta è contata', (admin(f'stats/days/{giorno}/richiesta_torneo_21') or 0) == r0 + 1)
            if w == 390:
                await pg.get_by_role('textbox', name='La tua email').fill('prova.torneo@example.com')
                invio = pg.get_by_role('button', name='Avvisami')
                await invio.click(force=True); await pg.wait_for_timeout(500)
                check('senza consenso non si invia', 'Fatto' not in (await pg.locator('body').inner_text()))
                await pg.get_by_role('checkbox').check()
                await invio.click(); await pg.wait_for_timeout(1200)
                corpo = (await pg.locator('body').inner_text()).replace(' ', ' ')
                check('dopo il consenso: "ti scriviamo una volta sola, quando parte il torneo"', 'quando parte il torneo' in corpo and 'acquisti' not in corpo.split('Fatto')[-1][:80], corpo[-200:])
                w_all = admin('waitlist') or {}
                check('l\'email è nella lista d\'attesa, con il prodotto torneo_21', any(v.get('email') == 'prova.torneo@example.com' and 'torneo_21' in (v.get('products') or {}) for v in w_all.values()))
                await pg.screenshot(path=f'{OUT}/torneo-fatto.png')
            if w == 360:
                await pg.get_by_role('button', name='Mettilo sulla Home').click(); await pg.wait_for_timeout(700)
                check('360px: "Mettilo sulla Home" apre la guida passo per passo', await pg.get_by_role('heading', name='Mettilo sulla schermata Home').count() == 1)
            check(f'{w}px: nessun errore JS', not errs, errs[:2])
            await ctx.close()
        await br.close()
asyncio.run(main())
print('ESITO: ' + ('TUTTO OK' if ok else 'CI SONO FALLIMENTI'))
sys.exit(0 if ok else 1)
