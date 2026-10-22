"""Prova nel browser: le visite con ?s=tiktok finiscono nei contatori della fonte, un telefono con ?test=1 non conta, e il
gioco si apre dal browser interno di TikTok. Serve l'emulatore (9100) e il gioco su URL.
Uso: python3 scripts/prova-origini.py http://localhost:3100 cartella-schermate"""
import asyncio, datetime, json, sys, urllib.request
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
ok = True
def check(label, cond, extra=''):
    global ok
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra != '' else ''))
    ok = ok and bool(cond)

giorno = datetime.datetime.now().strftime('%Y-%m-%d')
def stat(k):
    try:
        v = json.load(urllib.request.urlopen(f'http://127.0.0.1:9100/stats/days/{giorno}/{k}.json?ns=demo-ncc-default-rtdb'))
    except Exception:
        v = None
    return v or 0

UA_TIKTOK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_36.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/it Region/IT BytedanceWebview/d8a21c6'

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        # 1) visita da TikTok: aperture, nuovi, fonte
        a0, f0, n0 = stat('aperture'), stat('fonte_tiktok'), stat('nuovi_tiktok')
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, user_agent=UA_TIKTOK, is_mobile=True)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '/?s=tiktok'); await pg.wait_for_timeout(3500)
        check('dal browser di TikTok la home si apre', await pg.get_by_role('button', name='Gioca online').count() == 1)
        check('apertura contata', stat('aperture') == a0 + 1, (a0, stat('aperture')))
        check('fonte TikTok contata', stat('fonte_tiktok') == f0 + 1, (f0, stat('fonte_tiktok')))
        check('telefono nuovo da TikTok contato', stat('nuovi_tiktok') == n0 + 1, (n0, stat('nuovi_tiktok')))
        await pg.screenshot(path=f'{OUT}/home-tiktok.png')
        # dentro la stessa sessione, passando a una pagina senza ?s= la fonte resta quella di prima
        f1 = stat('fonte_tiktok')
        await pg.goto(URL + '/'); await pg.wait_for_timeout(3000)
        check('senza ?s= nella stessa sessione resta TikTok', stat('fonte_tiktok') == f1 + 1, (f1, stat('fonte_tiktok')))
        check('il browser di TikTok è riconosciuto come app (guida "Apri nel browser")', await pg.evaluate("/TikTok|musical_ly|BytedanceWebview/.test(navigator.userAgent)"))
        check('nessun errore JS dal browser di TikTok', not errs, errs[:2])
        await ctx.close()
        # 2) telefono di prova: ?test=1 non conta, e continua a non contare dopo
        a1, l1 = stat('aperture'), stat('fonte_instagram')
        ctx2 = await br.new_context(viewport={'width': 390, 'height': 844})
        pg2 = await ctx2.new_page()
        await pg2.goto(URL + '/?test=1&s=instagram'); await pg2.wait_for_timeout(3500)
        await pg2.goto(URL + '/'); await pg2.wait_for_timeout(3000)
        check('con ?test=1 le aperture non salgono', stat('aperture') == a1, (a1, stat('aperture')))
        check('con ?test=1 nemmeno la fonte', stat('fonte_instagram') == l1)
        live = json.load(urllib.request.urlopen('http://127.0.0.1:9100/live.json?ns=demo-ncc-default-rtdb')) or {}
        check('con ?test=1 niente presenza dal vivo', len(live) == 0, len(live))
        await pg2.goto(URL + '/?test=0'); await pg2.wait_for_timeout(3500)
        check('con ?test=0 torna a contare', stat('aperture') == a1 + 1, (a1, stat('aperture')))
        await br.close()
asyncio.run(main())
print('ESITO: ' + ('TUTTO OK' if ok else 'CI SONO FALLIMENTI'))
sys.exit(0 if ok else 1)
