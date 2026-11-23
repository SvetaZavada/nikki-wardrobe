#!/usr/bin/env python3
"""Infinity Nikki Wiki score extraction pilot.
Usage:
  python -m pip install beautifulsoup4
  python tools/wiki_scores_pilot.py
Produces wiki-scores-pilot.json and wiki-scores-pilot-report.json.
Does not touch wardrobe ownership or analytics.
"""
from __future__ import annotations
import json, re, time, urllib.parse, urllib.request
from html import unescape
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = "https://infinitynikki.wiki"
FALLBACK = "https://infinity-nikki.fandom.com"
STYLES = ("Elegant", "Fresh", "Sweet", "Sexy", "Cool")
# 15 distinct types/rarities; titles deliberately public, no user information.
TITLES = [
    "Breezy Melody", "Heartfelt Blues", "Entering Glow", "With Efficiency",
    "The World as a Score", "Free Will", "Above the Web", "New Designs",
    "History & Present", "Perfect Start", "Searching for Dreams",
    "Immeasurable Findings", "Guide of No Return", "Dancing Heart",
    "Living Colors",
]
OUT = Path(__file__).resolve().parents[1]

def get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent":"NikkiWardrobeResearch/0.1 (personal noncommercial catalog verification)",
        "Accept":"application/json,text/html;q=0.9,*/*;q=0.5"})
    with urllib.request.urlopen(req, timeout=18) as resp:
        return resp.read().decode("utf-8", "replace")

def page_html(base,title):
    params = urllib.parse.urlencode({
        "action":"parse", "page":title, "prop":"text", "format":"json", "formatversion":2
    })
    api_url = base+"/api.php?"+params
    api_error = None
    try:
        raw = json.loads(get(api_url))
        text = raw.get("parse",{}).get("text")
        if text:
            return text, "api", api_url
        api_error = str(raw.get("error","No parse text"))
    except Exception as exc:
        api_error = str(exc)
    url = base+("/wiki/" if "fandom.com" in base else "/")+urllib.parse.quote(title.replace(" ","_"),safe="")
    try:
        return get(url), "html", url
    except Exception as exc:
        raise RuntimeError("API: "+api_error[:160]+"; HTML: "+str(exc)[:160])

def score_number(text):
    text = text.replace(",","").replace(" ","").strip()
    m = re.search(r"(?<!\d)\d{1,7}(?!\d)",text)
    return int(m.group()) if m else None

def identify_style(cell):
    # Wiki templates often store style names in image alt/title attributes.
    hints = [cell.get_text(" ",strip=True)]
    hints += [img.get("alt","") for img in cell.select("img")]
    hints += [img.get("title","") for img in cell.select("img")]
    for hint in hints:
        for style in STYLES:
            if re.search(r"(?<![a-z])"+style+r"(?![a-z])",hint,re.I):
                return style
    return None

def score_rows(soup):
    """Extract scores ONLY from the Base Score / Max Glow Up table.
    Style names might be image-only; use order when all five rows are present.
    """
    candidate = {}
    for table in soup.select("table"):
        headers = " ".join(th.get_text(" ",strip=True) for th in table.select("th")).lower()
        if "score" not in headers or "glow" not in headers:
            continue
        rows=[]
        for tr in table.select("tr"):
            cells=tr.find_all(["td","th"],recursive=False)
            if len(cells)<3 or cells[0].name=="th":continue
            base=score_number(cells[1].get_text(" ",strip=True))
            max_score=score_number(cells[2].get_text(" ",strip=True))
            if base is None or max_score is None or max_score<base:continue
            rows.append((identify_style(cells[0]),base,max_score))
        if len(rows)!=5: continue
        named=[style for style,_,_ in rows if style is not None]
        if named and len(named)!=5:continue
        if named and set(named)!=set(STYLES):continue
        scores={}
        for i,(style,base,max_score) in enumerate(rows):
            key=style or STYLES[i]
            scores[key]={"base":base,"max":max_score}
        if len(scores)==5:return scores
        candidate=scores
    return candidate

def parse_item(html,title,url,method):
    soup=BeautifulSoup(html,"html.parser")
    # Do not guess fields when the wiki template is missing.
    scores=score_rows(soup)
    text=soup.get_text(" ",strip=True)
    rarity=re.search(r"\b([2-5])-star\b",text,re.I)
    kind=re.search(r"\b(Hair|Dresses|Outerwear|Tops|Bottoms|Socks|Shoes|Handhelds|Accessories)\s+Item\b",text,re.I)
    outfit=re.search(r"\bincluded in the Set\s+(.{3,90}?)(?:[. ]|$)",text,re.I)
    return {
        "title":title,"wiki_url":url,"method":method,
        "rarity":int(rarity.group(1)) if rarity else None,
        "type":kind.group(1) if kind else None,
        "set_hint":outfit.group(1).strip() if outfit else None,
        "scores":scores,
        "complete":len(scores)==5
    }

def main():
    results=[];report=[]
    for i,title in enumerate(TITLES):
        errors=[]
        for source in (ROOT,FALLBACK):
            try:
                html,method,url=page_html(source,title)
                item=parse_item(html,title,url,method)
                if not item["scores"]:
                    errors.append(source+": no score rows detected")
                    continue
                results.append(item)
                report.append({"title":title,"status":"complete" if item["complete"] else "partial",
                               "source":source,"styles_found":len(item["scores"])})
                break
            except Exception as exc:
                errors.append(source+": "+str(exc)[:250])
        else:
            report.append({"title":title,"status":"failed","errors":errors})
        if i<len(TITLES)-1:time.sleep(1.2)
    (OUT/"wiki-scores-pilot.json").write_text(json.dumps({"source":"wiki","records":results},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (OUT/"wiki-scores-pilot-report.json").write_text(json.dumps({"tested":len(TITLES),"complete":sum(r["status"]=="complete" for r in report),"partial":sum(r["status"]=="partial" for r in report),"failed":sum(r["status"]=="failed" for r in report),"results":report},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Tested",len(TITLES),"completed",sum(r["status"]=="complete" for r in report),
          "partial",sum(r["status"]=="partial" for r in report))
    print("Outputs: wiki-scores-pilot.json, wiki-scores-pilot-report.json")
if __name__=="__main__":main()
