# Prova che il gioco si apre e si gioca da soli anche senza rete (service worker), e che con la rete
# arriva subito la versione nuova. Si lancia dalla cartella del progetto:  python3 scripts/prova-offline.py
# Costruisce una build verso l'emulatore in build-prova (con le variabili di .env.development), la serve con
# python -m http.server (npx serve ridireziona .html e confonde la prova), poi spegne il server e prova.
import asyncio, json, os, re, shutil, subprocess, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build-prova')
PORT = 4190
URL = f'http://localhost:{PORT}'
NEED = 'Per giocare con gli amici serve internet'

def build():
    env = dict(os.environ, BUILD_PATH='build-prova', CI='true')
    for line in open(os.path.join(ROOT, '.env.development')):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1); env[k] = v
    subprocess.run(['npx', 'react-scripts', 'build'], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def serve():
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', BUILD], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    return p

async def main():
    results = []
    def check(name, ok): results.append(ok); print(('OK   ' if ok else 'FAIL ') + name)
    build()
    srv = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844})
        pg = await ctx.new_page()
        await pg.goto(URL + '/')
        # La build verso l'emulatore non registra il service worker da sola (src/index.js): lo registro a mano.
        await pg.evaluate("navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)")
        await pg.reload(); await pg.wait_for_timeout(2500)
        srv.terminate(); srv.wait(); time.sleep(0.5)
        # Senza rete davvero: anche Firebase (qui l'emulatore, se acceso) non risponde.
        await ctx.route('**://127.0.0.1:9000/**', lambda route: route.abort())
        await ctx.route('**://127.0.0.1:9099/**', lambda route: route.abort())

        await pg.goto(URL + '/')
        try:
            await pg.get_by_role('button', name='Gioca online').wait_for(timeout=6000); check('senza rete la home del gioco si apre', True)
        except Exception:
            check('senza rete la home del gioco si apre (compare: ' + (await pg.title()) + ')', False)
        try:
            await pg.get_by_role('button', name='Gioca da solo').click(timeout=3000)
            await pg.get_by_role('button', name='Inizia la partita').click(timeout=3000)
            status = None
            for _ in range(30):
                raw = await pg.evaluate("localStorage.getItem('ncc-solo-partita')")
                status = raw and json.loads(raw)['state']['status']
                if status in ('spin', 'play'): break
                await pg.wait_for_timeout(200)
            check(f'senza rete parte una partita da soli (stato {status})', status in ('spin', 'play'))
        except Exception as e:
            check(f'senza rete parte una partita da soli ({str(e)[:80]})', False)
        pg2 = await ctx.new_page()
        await pg2.goto(URL + '/r/ABCD')
        try:
            await pg2.get_by_text(NEED).first.wait_for(timeout=15000); check('senza rete un link a una stanza dice che serve internet', True)
        except Exception:
            check('senza rete un link a una stanza dice che serve internet', False)

        # Versione nuova pubblicata: con la rete, una sola riapertura la mostra già.
        idx = os.path.join(BUILD, 'index.html')
        html = open(idx).read()
        open(idx, 'w').write(re.sub(r'<title>', '<title>VERSIONE2 ', html, count=1))
        srv = serve()
        await pg.goto(URL + '/'); await pg.wait_for_timeout(1000)
        check('con la rete una riapertura mostra la versione nuova', 'VERSIONE2' in await pg.title())
        # Giocatore di ritorno: l'accesso è già salvato, poi la rete smette di rispondere (Wi-Fi senza internet).
        # Un link a una stanza e "Crea una stanza" devono dire che serve internet, non restare sul caricamento.
        import socket
        try:
            socket.create_connection(('127.0.0.1', 9000), timeout=1).close(); emu = True
        except OSError:
            emu = False
        if not emu:
            check('giocatore di ritorno: serve l\'emulatore acceso (sh scripts/emulatore.sh)', False)
        else:
            ctx2 = await b.new_context(viewport={'width': 390, 'height': 844})
            pg3 = await ctx2.new_page()
            pg4 = await ctx2.new_page()
            await pg3.goto(URL + '/'); await pg4.goto(URL + '/')
            await pg3.wait_for_timeout(3000)  # accesso anonimo fatto, motore pronto
            await ctx2.set_offline(True)  # chiude anche la connessione già aperta con Firebase
            await pg3.evaluate("history.pushState(null, '', '/r/ABCD'); dispatchEvent(new PopStateEvent('popstate'))")
            try:
                await pg3.get_by_text(NEED).first.wait_for(timeout=12000); check('giocatore di ritorno senza rete: un link a una stanza dice che serve internet', True)
            except Exception:
                check('giocatore di ritorno senza rete: un link a una stanza dice che serve internet', False)
            await pg4.get_by_role('textbox', name='Il tuo nome').fill('Edo')
            await pg4.get_by_role('button', name='Gioca online').click()
            await pg4.get_by_role('button', name='Crea una stanza').click()
            try:
                await pg4.get_by_role('button', name='Crea stanza').click(timeout=2000)
            except Exception:
                pass
            try:
                await pg4.get_by_text(NEED).first.wait_for(timeout=12000); check('giocatore di ritorno senza rete: "Crea una stanza" dice che serve internet', True)
            except Exception:
                check('giocatore di ritorno senza rete: "Crea una stanza" dice che serve internet', False)
        await b.close()
    srv.terminate()
    shutil.rmtree(BUILD, ignore_errors=True)
    print('ESITO', 'PASS' if all(results) else 'FAIL')
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
