#!/usr/bin/env python3
"""Incremental full-catalog Infinity Nikki Wiki score collector.

Input: public Gongeo catalog index/items + English item names.
Output: data/wiki-scores.json, data/wiki-scores-status.json.
No personal/account data. Conservatively accepts ONLY tables with explicit
style labels and score headers; never assumes style order.
Usage: python tools/wiki_scores_all.py --limit 100
       python tools/wiki_scores_all.py --limit 0  # every unresolved entry
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

REPO = Path(__file__).resolve().parents[1]
CATALOG = "https://raw.githubusercontent.com/dastrokes/gongeo.us-nikki-tracker/master/"
SITES = (("independent", "https://infinitynikki.wiki/"),
         ("fandom", "https://infinity-nikki.fandom.com/wiki/"))
STYLES = ("Elegant", "Fresh", "Sweet", "Sexy", "Cool")
OUTPUT = REPO / "data/wiki-scores.json"
STATUS = REPO / "data/wiki-scores-status.json"
UA = "NikkiWardrobeResearch/0.2 (public wiki catalog, gentle incremental requests)"
LAST_REQUEST = 0.0
DELAY = 2.0

class RateLimited(Exception):
    pass

def download(url):
    global LAST_REQUEST
    wait = DELAY-(time.monotonic()-LAST_REQUEST)
    if wait > 0: time.sleep(wait)
    LAST_REQUEST=time.monotonic()
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/json"})
    try:
        with urllib.request.urlopen(req,timeout=22) as response:
            return response.read().decode("utf-8","replace")
    except urllib.error.HTTPError as exc:
        if exc.code in (429, 503):
            raise RateLimited(f"Host returned {exc.code}") from exc
        raise

def read_json(path, default):
    if not path.exists(): return default
    return json.loads(path.read_text(encoding="utf-8"))

def write_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+".tmp")
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    temp.replace(path)

def catalog_entries():
    manifest=json.loads(download(CATALOG+"public/catalog/index.json"))
    item_file=manifest["files"]["items"]["path"].lstrip("/")
    rows=json.loads(download(CATALOG+"public/"+item_file))
    names=json.loads(download(CATALOG+"app/locales/en/item.json"))
    unique=defaultdict(list)
    for row in rows:
        ids=row[0]
        if not isinstance(ids,list) or not ids:continue
        # Lookup across all recolor IDs; prefer name associated with base variant.
        candidate=[(int(x),names.get("item."+str(x)+".name","").strip()) for x in ids]
        named=[(i,n) for i,n in candidate if n]
        if not named:continue
        base_id=int(row[-1]) if isinstance(row[-1],int) else int(ids[0])
        title=next((n for i,n in named if i==base_id),named[0][1])
        entry={"id":str(base_id),"title":title,"variantIds":[int(x) for x in ids],
               "rarity":row[1] if len(row)>1 else None,
               "categoryId":row[2] if len(row)>2 else None}
        unique[title.casefold()].append(entry)
    return [v for group in unique.values() for v in group],manifest.get("gameVersion")

def header_text(cell):
    attrs=" ".join(str(el.get("alt",""))+" "+str(el.get("title","")) for el in cell.select("img"))
    return (cell.get_text(" ",strip=True)+" "+attrs).strip().lower()

def style_from_cell(cell):
    labels=" ".join([cell.get_text(" ",strip=True)] +
         [e.get("alt","")+" "+e.get("title","") for e in cell.select("img")])
    hits=[s for s in STYLES if re.search(r"(?<![A-Za-z])"+s+r"(?![A-Za-z])",labels,re.I)]
    return hits[0] if len(hits)==1 else None

def numeric(cell):
    text=cell.get_text(" ",strip=True).replace(",","").replace(" ","")
    return int(text) if re.fullmatch(r"\d{1,7}",text) else None

def score_table(soup):
    """No positional style guesses or unknown column assumptions."""
    for table in soup.find_all("table"):
        trs=table.find_all("tr")
        head=next((tr for tr in trs if "base" in tr.get_text(" ",strip=True).lower() and
                     ("glow" in tr.get_text(" ",strip=True).lower() or
                      "max" in tr.get_text(" ",strip=True).lower())),None)
        if not head:continue
        cells=head.find_all(["td","th"],recursive=False)
        labels=[header_text(c) for c in cells]
        base_col=next((i for i,x in enumerate(labels) if "base" in x and "score" in x),None)
        max_col=next((i for i,x in enumerate(labels) if ("glow" in x or "max" in x) and ("score" in x or "glow" in x)),None)
        if base_col is None or max_col is None or base_col==max_col:continue
        style_col=next((i for i,x in enumerate(labels) if "style" in x),0)
        result={}
        for tr in trs[trs.index(head)+1:]:
            tds=tr.find_all(["td","th"],recursive=False)
            if len(tds)<=max(base_col,max_col,style_col):continue
            style=style_from_cell(tds[style_col])
            base=numeric(tds[base_col]); maximum=numeric(tds[max_col])
            if style and base is not None and maximum is not None and maximum>=base:
                if style in result: result={};break
                result[style]={"base":base,"max":maximum}
        if len(result)==5:return result
    return None

def get_scores(title, sites, allow_fallback=True):
    errors=[]
    for name,root in sites:
        url=root+urllib.parse.quote(title.replace(" ","_"),safe="()'-")
        try:
            body=download(url)
            if len(body)<1000:errors.append(name+": response too small");continue
            scores=score_table(BeautifulSoup(body,"html.parser"))
            if scores:return scores,{"source":name,"url":url}
            errors.append(name+": score table not detected")
        except RateLimited:raise
        except Exception as exc:
            errors.append(name+": "+type(exc).__name__+" "+str(exc)[:100])
        if not allow_fallback:break
    return None,errors

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--limit",type=int,default=100,help="New entries this run; 0 means all")
    parser.add_argument("--delay",type=float,default=2.0)
    parser.add_argument("--retry-missing",action="store_true")
    parser.add_argument("--one-source",action="store_true",help="Test independent Wiki only")
    args=parser.parse_args()
    global DELAY
    DELAY=max(1.5,args.delay)
    old=read_json(OUTPUT,{"schemaVersion":1,"items":{}})
    history=read_json(STATUS,{"schemaVersion":1,"items":{}})
    old.setdefault("items",{})
    history.setdefault("items",{})
    try:
        entries,version=catalog_entries()
    except Exception as exc:
        print("Catalog unavailable:",exc,file=sys.stderr)
        raise SystemExit(2)
    counts=Counter(x["title"].casefold() for x in entries)
    todo=[]
    for e in entries:
        key=e["id"]
        if key in old["items"]:continue
        if key in history["items"] and not args.retry_missing:continue
        # Duplicate titles cannot be assigned to distinct IDs without a proof.
        if counts[e["title"].casefold()]>1:
            history["items"][key]={"title":e["title"],"status":"ambiguous_title","reason":"duplicate English title in catalog"}
            continue
        todo.append(e)
    if args.limit>0:todo=todo[:args.limit]
    print(f"Catalog {len(entries)} groups, version {version}; resolving {len(todo)} in this run",flush=True)
    sites=SITES[:1] if args.one_source else SITES
    done=0
    for e in todo:
        key=e["id"]
        try:
            scores,metadata=get_scores(e["title"],sites,not args.one_source)
            if scores:
                old["items"][key]={**e,"scores":scores,**metadata}
                history["items"].pop(key,None)
                done+=1
            else:
                history["items"][key]={"title":e["title"],"status":"not_found_or_unparsed",
                                      "details":metadata}
        except RateLimited as exc:
            print("Paused after rate limit:",exc,flush=True)
            break
        # Checkpoint on each item to recover incomplete runs.
        write_json(OUTPUT,old)
        write_json(STATUS,history)
    summary=Counter(r["status"] for r in history["items"].values())
    history["gameVersion"]=version
    history["totalCatalogEntries"]=len(entries)
    history["matchedEntries"]=len(old["items"])
    history["unattempted"]=len(entries)-len(old["items"])-len(history["items"])
    history["lastRunUTC"]=datetime.now(timezone.utc).isoformat()
    history["summary"]=dict(summary)
    write_json(OUTPUT,old)
    write_json(STATUS,history)
    print("New matches:",done,"Total matches:",len(old["items"]),
          "Unattempted:",history["unattempted"],"Status:",dict(summary),flush=True)

if __name__=="__main__":
    main()
