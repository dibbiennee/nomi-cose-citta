"""Misura quanto si scorre in ogni schermata di una partita online con tante persone, e salva uno scatto di ognuna.
Serve l'emulatore (`sh scripts/emulatore.sh`) e il gioco su URL. Uso:
  python3 scripts/audit-schermate.py http://localhost:3100 cartella-schermate [persone=8] [larghezza=390] [altezza=844]"""
import asyncio, json, re, subprocess, sys
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 8
W = int(sys.argv[4]) if len(sys.argv) > 4 else 390
H = int(sys.argv[5]) if len(sys.argv) > 5 else 844

MISURA = """() => {
  const cont = [...document.querySelectorAll('.n-scroll')].filter((e) => getComputedStyle(e).overflowY === 'auto' && e.clientHeight > 40);
  const m = cont.map((e) => ({ scroll: e.scrollHeight - e.clientHeight, visibile: e.clientHeight, contenuto: e.scrollHeight }));
  const pagina = document.documentElement.scrollHeight - innerHeight;
  return { contenitori: m, paginaOltre: pagina, orizzontale: document.documentElement.scrollWidth > innerWidth };
}"""

helper = subprocess.Popen(['node', 'scripts/_prova-giudice-ospite.mjs'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def chiedi(cmd):
    helper.stdin.write(cmd + '\n'); helper.stdin.flush()
    return json.loads(helper.stdout.readline())

visti = []
async def scatto(pg, nome):
    await pg.wait_for_timeout(900)
    m = await pg.evaluate(MISURA)
    da_scorrere = max([c['scroll'] for c in m['contenitori']] + [0])
    print(f"{nome:28s} da scorrere: {da_scorrere:4d}px  (visibile {max([c['visibile'] for c in m['contenitori']] + [0])}px)  orizzontale: {m['orizzontale']}")
    visti.append((nome, da_scorrere))
    await pg.screenshot(path=f'{OUT}/schermata-{len(visti):02d}-{nome.replace(" ", "-")}-{W}x{H}.png')

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2)
        pg = await ctx.new_page()
        await pg.goto(URL + '/'); await pg.wait_for_timeout(3000)
        await pg.get_by_role('textbox', name='Il tuo nome').fill('Ciro')
        await pg.get_by_role('button', name='Gioca online').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button', name='Crea una stanza').click(); await pg.wait_for_timeout(800)
        await scatto(pg, 'impostazioni')
        for _ in range(2): await pg.get_by_role('button', name='Meno round').click()
        await pg.get_by_role('button', name='Crea stanza').click(); await pg.wait_for_timeout(2000)
        code = (await pg.get_by_role('img', name=re.compile('^Codice')).get_attribute('aria-label')).replace('Codice', '').replace(' ', '')
        chiedi(f'folla {code} {N - 1}')
        await pg.wait_for_timeout(1500)
        await scatto(pg, f'sala-con-{N}-persone')
        await pg.get_by_role('button', name='Inizia partita').click()
        await pg.wait_for_timeout(1200)
        await scatto(pg, 'la-lettera')
        for _ in range(60):
            if await pg.get_by_role('textbox').count() >= 2: break
            await pg.wait_for_timeout(400)
        await pg.wait_for_timeout(500)
        campi = pg.get_by_role('textbox')
        for i in range(await campi.count()):
            await campi.nth(i).fill('Prova'); await pg.wait_for_timeout(120)
        await scatto(pg, 'si-scrive')
        chiedi('folla-gioca')
        for _ in range(60):
            if await pg.get_by_text('CORREZIONE').count(): break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(4200)
        for k in range(3):
            await scatto(pg, f'correzione-{k + 1}')
            bottone = pg.get_by_role('button', name=re.compile('^(Prossima categoria|Vedi i punteggi)'))
            if not await bottone.count(): break
            await bottone.first.click(); await pg.wait_for_timeout(1500)
        for nome in ['punteggi-del-round', 'premi', 'podio']:
            await scatto(pg, nome)
            bottone = pg.get_by_role('button', name=re.compile('^(Vai ai premi|Vai al podio|Prossimo round|Avanti)'))
            if not await bottone.count(): break
            await bottone.first.click(); await pg.wait_for_timeout(2500)
        await br.close()
    chiedi('fine')
    peggiori = sorted(visti, key=lambda x: -x[1])[:3]
    print('\nPiù lunghe da scorrere:', ', '.join(f'{n} ({d}px)' for n, d in peggiori))

asyncio.run(main())
