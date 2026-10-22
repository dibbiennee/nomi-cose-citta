"""Generatore delle slide TikTok di Nomi Cose Città (1080x1920) con l'identità del gioco.
Uso:  python3 scripts/slide/crea-slide.py scripts/slide/esempio.json cartella-uscita
Il file JSON è un elenco di "mazzi". Tipi:
  { "nome": "giorno-01", "tipo": "pov",     "slide": ["frase|a capo|per senso", "..."], "cta": true }
  { "nome": "giorno-04", "tipo": "valida",  "parola": "Cobo", "categoria": "Animali", "lettera": "C", "domanda": "L'IA dice che è valida.|Voi?" }
  { "nome": "giorno-02", "tipo": "lettera", "lettera": "M", "frase": "Hai 60 secondi.|Città, animale,|cosa, nome." }
Il segno | va a capo: si spezza per unità di senso, mai a metà di una locuzione. Niente trattini lunghi.
Zona sicura di TikTok: il testo sta dentro un riquadro che evita barre, descrizione e pulsanti laterali."""
import asyncio, html, json, sys, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

RADICE = Path(__file__).resolve().parents[2]
FONT_B = (RADICE / 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2').as_uri()
FONT_F = (RADICE / 'node_modules/@fontsource/figtree/files/figtree-latin-800-normal.woff2').as_uri()
INK, GIALLO, CORALLO, CIELO, LILLA, MENTA, ROSA = '#17122B', '#FFD23F', '#FF8A65', '#5CD0FF', '#B79CFF', '#6EE7A8', '#FF7EB6'
GIRO = [GIALLO, CORALLO, CIELO, LILLA, MENTA]
LINK = 'nomicosecitta.pro'

BASE = f"""
@font-face {{ font-family: 'Bric'; src: url('{FONT_B}'); font-weight: 200 800; }}
@font-face {{ font-family: 'Fig'; src: url('{FONT_F}'); font-weight: 800; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ width: 1080px; height: 1920px; overflow: hidden; font-family: 'Fig', sans-serif; color: {INK}; }}
.tela {{ width: 1080px; height: 1920px; position: relative; }}
/* Zona sicura: 130 sopra, 380 sotto (descrizione e barra), 150 a destra (pulsanti), 90 a sinistra. */
.sicura {{ position: absolute; left: 90px; right: 150px; top: 130px; bottom: 380px; display: flex; flex-direction: column; justify-content: center; }}
.titolo {{ font-family: 'Bric', sans-serif; font-weight: 800; line-height: 1.02; letter-spacing: -0.02em; text-wrap: balance; }}
.titolo span {{ display: block; white-space: nowrap; }}
.tessera {{ border: 7px solid {INK}; border-radius: 36px; box-shadow: 0 12px 0 {INK}; display: flex; align-items: center; justify-content: center; font-family: 'Bric', sans-serif; font-weight: 800; }}
.pillola {{ border: 7px solid {INK}; border-radius: 999px; box-shadow: 0 12px 0 {INK}; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }}
"""

def righe(testo):
    return ''.join(f'<span>{html.escape(r.strip())}</span>' for r in testo.split('|'))

def pagina(corpo, sfondo, extra=''):
    return f"<!doctype html><meta charset='utf-8'><style>{BASE}{extra}</style><body><div class='tela' style='background:{sfondo}'>{corpo}</div>"

# Adatta il testo al riquadro: parte grande e scende finché ci sta (mai fuori dalla zona sicura).
FIT = """() => { for (const el of document.querySelectorAll('[data-fit]')) { const max = +el.dataset.fit; const box = el.closest('.sicura');
  let s = max; el.style.fontSize = s + 'px'; while (s > 40 && (el.scrollWidth > el.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1)) { s -= 4; el.style.fontSize = s + 'px'; } } }"""

def slide_pov(testo, i, totale):
    fondo = GIRO[i % len(GIRO)]
    corpo = f"<div class='sicura'><div class='titolo' data-fit='150' style='text-align:left'>{righe(testo)}</div></div>"
    if i == 0:  # copertina: le quattro tessere del gioco in basso a sinistra, dentro la zona sicura
        corpo += "<div style='position:absolute;left:90px;top:1480px;display:flex;gap:18px'>" + ''.join(
            f"<div class='tessera' style='width:96px;height:106px;font-size:64px;background:{c}'>{l}</div>" for l, c in zip('NOMI', [CORALLO, CORALLO, CORALLO, CORALLO])) + "</div>"
    return pagina(corpo, fondo)

def slide_cta():
    corpo = f"""<div class='sicura' style='gap:48px'>
      <div class='titolo' data-fit='170' style='text-align:left'>{righe('Gioca gratis|con gli amici')}</div>
      <div style='display:flex;gap:18px'>{''.join(f"<div class='tessera' style='width:150px;height:166px;font-size:104px;background:{c}'>{l}</div>" for l, c in zip('ABC', [CORALLO, CIELO, LILLA]))}</div>
      <div class='pillola' style='background:{GIALLO};height:150px;padding:0 64px;font-size:68px;align-self:flex-start'>link in bio</div>
      <div style='font-size:44px;color:{GIALLO};font-weight:800'>{LINK}</div></div>"""
    return pagina(corpo, INK, f".titolo{{color:#FFFFFF}}")

def slide_valida(d):
    corpo = f"""<div class='sicura' style='gap:54px'>
      <div class='titolo' data-fit='96' style='text-align:left'>{righe(d.get('domanda', "L'IA dice che è valida.|Voi?"))}</div>
      <div class='tessera' style='background:#FFFFFF;border-radius:56px;padding:70px 56px;flex-direction:column;gap:22px;box-shadow:0 18px 0 {INK}'>
        <div style='font-size:44px;color:#5E5880'>{html.escape(d['categoria'])}, lettera {html.escape(d['lettera'])}</div>
        <div class='titolo' data-fit='190' style='text-align:center;width:100%'>{html.escape(d['parola'])}</div></div>
      <div style='display:flex;gap:30px'>
        <div class='pillola' style='background:{MENTA};height:160px;flex:1;font-size:64px'>Vale</div>
        <div class='pillola' style='background:{ROSA};height:160px;flex:1;font-size:64px'>Non vale</div></div></div>"""
    return pagina(corpo, LILLA)

def slide_lettera(d):
    corpo = f"""<div class='sicura' style='gap:56px'>
      <div class='tessera' style='background:{CORALLO};width:560px;height:620px;font-size:430px;border-radius:110px;box-shadow:0 22px 0 {INK};align-self:flex-start'>{html.escape(d['lettera'])}</div>
      <div class='titolo' data-fit='110' style='text-align:left'>{righe(d.get('frase', 'Hai 60 secondi.|Città, animale,|cosa, nome.'))}</div></div>"""
    return pagina(corpo, GIALLO)

def schermate(mazzo):
    t = mazzo['tipo']
    if t == 'pov':
        s = mazzo['slide']; out = [slide_pov(x, i, len(s)) for i, x in enumerate(s)]
        if mazzo.get('cta', True): out.append(slide_cta())
        return out
    if t == 'valida': return [slide_valida(mazzo), slide_cta()] if mazzo.get('cta', True) else [slide_valida(mazzo)]
    if t == 'lettera': return [slide_lettera(mazzo)]
    raise SystemExit(f"Tipo sconosciuto: {t}")

async def main(piano, uscita):
    Path(uscita).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page(viewport={'width': 1080, 'height': 1920})
        for mazzo in json.load(open(piano)):
            for n, h in enumerate(schermate(mazzo), 1):
                # Dal file e non da set_content: da about:blank il browser non carica i font da disco.
                tmp = Path(tempfile.gettempdir()) / f"ncc-slide-{mazzo['nome']}-{n}.html"
                tmp.write_text(h, encoding='utf-8')
                await pg.goto(tmp.as_uri()); await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(250)
                await pg.evaluate(FIT)
                dentro = await pg.evaluate("""() => { const s = document.querySelector('.sicura').getBoundingClientRect(); return [...document.querySelectorAll('.sicura *')].every((e) => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1); }); }""")
                piccolo = await pg.evaluate("Math.min(...[...document.querySelectorAll('[data-fit]')].map((e) => parseFloat(e.style.fontSize)))")
                nome = f"{uscita}/{mazzo['nome']}-{n}.png"
                await pg.screenshot(path=nome)
                print(('ok  ' if dentro else 'FUORI ZONA SICURA  ') + ('' if piccolo >= 90 else f'TESTO PICCOLO ({piccolo:.0f}px): accorcia le righe  ') + nome)
        await br.close()

if __name__ == '__main__':
    asyncio.run(main(sys.argv[1], sys.argv[2]))
