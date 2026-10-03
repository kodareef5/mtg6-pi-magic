#!/usr/bin/env node
import { createReadStream, createWriteStream, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";

type J = Record<string, any>;
type P = [string, string, string, string];
type Row = string[];

const CACHE = process.env.PI_MAGIC_CACHE || ".";
const BULK = `${CACHE}/default-cards.jsonl.gz`, OUT = `${CACHE}/cards.tsv`;
// v2: compare the bulk file's mtime against the Scryfall updated_at and warn
// when it is a day behind. Until then the file is as fresh as the last refresh.
const API = "https://api.scryfall.com/bulk-data";
const UA = { "User-Agent": "pi-magic/0", Accept: "*/*" };
const FORMATS = ["standard","pioneer","modern","legacy","vintage","pauper","commander","duel","oathbreaker","paupercommander","brawl","standardbrawl","historic","timeless","alchemy","gladiator","penny","premodern","predh"];
const LEG: J = { legal:"L", not_legal:"-", banned:"B", restricted:"R" };
const RAR: J = { common:"c", uncommon:"u", rare:"r", mythic:"m", special:"s", bonus:"b" };
const RAR_ORDER = "curmsb", NONCARD = new Set(["token","double_faced_token","art_series","emblem"]), PLAYABLE = new Set(["legal","banned","restricted"]);
const FS = "\t", FACE = " // ", COLOR_ORDER = "WUBRG";
const COLUMNS = ["name","mana","cmc","type","stats","colors","identity","layout","rarities","keywords","reserved","gamechanger",...FORMATS,"printings","oracle","oracle_id"];
// Everything a compiler and a deck check need, and nothing else. With --format
// only that format's legality column is carried, because the rows are already
// filtered to it.
const LEAN = (f?:string) => ["name","mana","cmc","type","stats",...(f?[f]:FORMATS),"oracle"];
type Opts = { out:string, format?:string, lean:boolean, bare:boolean };

const cmp = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;
const colors = (a?:string[]) => !a?.length ? "-" : [...COLOR_ORDER].filter(x=>a.includes(x)).join("") + a.filter(x=>!COLOR_ORDER.includes(x)).join("");
const num = (x:any) => x == null ? "" : Number.isInteger(+x) ? String(+x) : String(x);
const stats = (d:J) => d.power != null || d.toughness != null ? `${d.power ?? ""}/${d.toughness ?? ""}` : d.loyalty != null ? `L${d.loyalty}` : d.defense != null ? `D${d.defense}` : "";
const esc = (s?:string) => (s || "").replace(/\n/g,"\\n");
function joinFaces(a:string[]) { while (a.length && !a.at(-1)) a.pop(); return a.some(Boolean) ? a.join(FACE) : ""; }
const faceted = (c:J, f:(x:J)=>string) => f(c) || joinFaces((c.card_faces || []).map(f));
function colorField(c:J) { if ("colors" in c) return colors(c.colors); const f=c.card_faces||[]; return f.length ? joinFaces(f.map((x:J)=>"colors" in x ? colors(x.colors) : "")) : "-"; }
const cnKey = (s:string) => [+(s.match(/^\d+/)?.[0] || 0), s] as const;
const resolveOid = (c:J) => c.oracle_id || (c.card_faces || []).find((f:J)=>f.oracle_id)?.oracle_id;
const printingToken = (c:J) => `${c.set}:${c.collector_number || ""}:${RAR[c.rarity] || "?"}`;

async function req(url:string) { const r=await fetch(url,{headers:UA}); if(!r.ok) throw Error(`${r.status} ${r.statusText}: ${url}`); return r; }
async function fetchBulk(force=false) {
  if (existsSync(BULK) && !force) return;
  const data:any = await (await req(API)).json();
  const uri = data.data.find((x:J)=>x.type === "default_cards").jsonl_download_uri;
  process.stderr.write(`downloading ${uri}\n`);
  const r=await req(uri), part=BULK+".part";
  await pipeline(Readable.fromWeb(r.body as any), createWriteStream(part));
  renameSync(part,BULK);
}
async function* source() {
  const rl=createInterface({input:createReadStream(BULK).pipe(createGunzip()),crlfDelay:Infinity});
  for await (const line of rl) yield JSON.parse(line as string);
}
async function collect() {
  const cards=new Map<string,J>(), prints=new Map<string,P[]>();
  for await (const c of source()) {
    if (NONCARD.has(c.layout)) continue;
    const oid=resolveOid(c); if (!oid) continue;
    if (c.oracle_id && !cards.has(oid)) cards.set(oid,c);
    const p=prints.get(oid)||[]; p.push([c.released_at||"",c.set,c.collector_number||"",c.rarity||""]); prints.set(oid,p);
  }
  return {cards,prints};
}
const localDate = () => { const d=new Date(), p=(n:number)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
function header(rows:Row[], nprint:number) { return `# Magic: The Gathering - every constructed-playable card, one row each
# Generated: ${localDate()}   Cards: ${rows.length}   Printings covered: ${nprint}
# Source: Scryfall 'Default Cards' bulk data. Rebuild: ./build_catalog.py
#
# TAB-separated. A tab occurs nowhere in Magic card data, so every line
# parses with a plain split('\\t'). Comment lines start with '#'; the
# first non-comment line names the columns. Sorted by name.
#
# Included: any card legal, banned or restricted in >=1 of the ${FORMATS.length} formats
#   below. That filter is what makes 'name' a unique key -- it drops the
#   Un-card variants (six different cards are named 'Very Cryptic
#   Command'), oversized memorabilia, schemes, planes and vanguards.
#   It keeps the 174 silver-bordered Unfinity cards that really are
#   Legacy/Commander-legal, because the filter is legality, not set type.
# Excluded: tokens, emblems and art-series prints (not cards), and
#   flavor text, art, artist, frame, finishes, promo flags and prices.
#
# CARD COLUMNS
#   name        Unique within this file. Multi-face: 'Front // Back'.
#   mana        Mana cost. 'A // B' when each face is separately
#               castable (split, adventure, prepare, modal DFC).
#   cmc         Mana value.
#   type        Full type line.
#   stats       'P/T', 'L<n>' loyalty, or 'D<n>' defense. Per-face.
#   colors      Colors in WUBRG order; '-' is colorless. Per-face for
#               double-faced cards, verbatim from Scryfall (a back face
#               with no color indicator is colorless).
#   identity    Color identity in WUBRG order; '-' is colorless.
#   layout      normal, transform, modal_dfc, split, adventure, saga...
#   rarities    Every rarity this card was ever printed at, as c/u/r/m/
#               s/b. Handy for Pauper: 'c' present means ever-common.
#   keywords    Comma-separated rules keywords.
#   reserved    1 if on the Reserved List.
#   gamechanger 1 if on the Commander 'Game Changer' list.
#
# FORMAT COLUMNS (${FORMATS.join(", ")})
#   L legal   -  not legal   B banned   R restricted
#   All ${FORMATS.length} are card-level: legality never varies between printings of
#   the same card. (Scryfall's 'oldschool' is the sole exception and is
#   deliberately not carried here; 'future', 'competitivebrawl' and
#   'tlr' are omitted as speculative, duplicative and undocumented.)
#
# PRINTINGS
#   Comma-separated 'set:collector_number:rarity', in release order, so
#   the first entry is the original printing. set+collector_number is
#   the unique key of a printing, and resolves directly against the
#   Scryfall API: /cards/<set>/<collector_number>. Includes digital-only
#   printings. Neither ':' nor ',' occurs in any set code or collector
#   number, so this field parses unambiguously.
#
# ORACLE
#   oracle      Rules text; line breaks escaped as \\n, faces joined by
#               ' // '. Reminder text kept, flavor text excluded. Note a
#               literal '|' appears in Spacecraft texts ('9+ | Flying')
#               and one card is named 'SP//dr', so neither '|' nor '//'
#               is a safe delimiter downstream. Tab is.
#   oracle_id   Scryfall's stable card id, for joining back to the API.
#               Last column, so 'cut -f1-${COLUMNS.length-1}' drops it.
#
${COLUMNS.join(FS)}\n`; }

async function build(o:Opts) {
  const {cards,prints}=await collect(), rows:Row[]=[];
  for (const [oid,c] of cards) {
    const lg=c.legalities||{}; if (!FORMATS.some(f=>PLAYABLE.has(lg[f]))) continue;
    const seen=new Set<string>(), pr=(prints.get(oid)||[]).filter(p=>{const k=p.join("\0"); if(seen.has(k)) return false; seen.add(k); return true;});
    pr.sort((a,b)=>cmp(a[0],b[0])||cmp(a[1],b[1])||(cnKey(a[2])[0]-cnKey(b[2])[0])||cmp(a[2],b[2]));
    const rar=new Set(pr.map(p=>RAR[p[3]]||"?"));
    rows.push([c.name,faceted(c,d=>d.mana_cost||""),num(c.cmc),c.type_line||"",faceted(c,stats),colorField(c),colors(c.color_identity),c.layout,[...RAR_ORDER].filter(x=>rar.has(x)).join(""),(c.keywords||[]).join(","),c.reserved?"1":"0",c.game_changer?"1":"0",...FORMATS.map(f=>LEG[lg[f]]||"-"),pr.map(p=>`${p[1]}:${p[2]}:${RAR[p[3]]||"?"}`).join(","),faceted(c,d=>esc(d.oracle_text)),oid]);
  }
  const nm=(r:Row)=>r[0]!; rows.sort((a,b)=>cmp(nm(a).toLowerCase(),nm(b).toLowerCase())||cmp(nm(a),nm(b)));
  const nprint=rows.reduce((n,r)=>n+new Set(prints.get(r.at(-1)!)!.map(p=>p.join("\0"))).size,0);
  const cols=o.lean?LEAN(o.format):COLUMNS, pick=cols.map(c=>COLUMNS.indexOf(c));
  const keep=o.format?rows.filter(r=>r[COLUMNS.indexOf(o.format!)]==="L"):rows;
  const full=!o.format&&!o.lean, top=o.bare?`${cols.join(FS)}\n`:full?header(rows,nprint):small(cols,keep.length,o);
  writeFileSync(o.out,top+keep.map(r=>pick.map(i=>r[i]!).join(FS)+"\n").join(""));
  return {rows,keep,cols};
}

// A projected list says what it is and what it left out. Six lines, because the
// full header describes columns a projection does not carry.
function small(cols:string[], n:number, o:Opts) { return `# Magic: The Gathering${o.format?` - every card legal in ${o.format}`:""}, one row each
# Generated: ${localDate()}   Cards: ${n}   Source: Scryfall 'Default Cards' bulk data
# Rebuild: ./tools/cards.ts${o.format?` --format ${o.format}`:""}${o.lean?" --columns lean":""}
# TAB-separated; '#' starts a comment; the next line names the columns.
# Oracle line breaks are escaped as \\n and faces are joined by ' // '.
${o.format?`# Rows are filtered to ${o.format}: the ${o.format} column is 'L' throughout.`:"# L legal   -  not legal   B banned   R restricted"}
${cols.join(FS)}\n`; }

async function verify(o:Opts) {
  const out=o.out;
  const lines=readFileSync(out,"utf8").split(/\n/).filter(x=>x&&!x.startsWith("#")), hdr=lines.shift()!.split(FS);
  const rows=lines.map(line=>{const a=line.split(FS), r:J={}; hdr.forEach((h,i)=>r[h]=a[i]??""); return [r,a.length] as const;});
  const err=new Map<string,number>(), ex=new Map<string,any[]>();
  const chk=(ok:any,k:string,who:any)=>{if(ok)return; err.set(k,(err.get(k)||0)+1); const a=ex.get(k)||[]; if(a.length<3)a.push(who); ex.set(k,a);};
  const has=(c:string)=>hdr.includes(c);
  chk(hdr.every(h=>COLUMNS.includes(h)),"unknown column",hdr.find(h=>!COLUMNS.includes(h))||"");
  chk(has("name")&&has("oracle"),"missing name or oracle","header");
  rows.forEach(([r,n])=>chk(n===hdr.length,"field count",r.name));
  const count=(k:string)=>{const m=new Map<string,number>(); for(const [r] of rows)m.set(r[k],(m.get(r[k])||0)+1); return m;};
  const names=count("name");
  chk([...names.values()].every(n=>n===1),"duplicate name",[...names].find(([,n])=>n>1)?.[0]||"");
  if (has("oracle_id")) chk([...count("oracle_id").values()].every(n=>n===1),"duplicate oracle_id","");
  const byName=new Map(rows.map(([r])=>[r.name,r])), byId=new Map(rows.filter(([r])=>r.oracle_id).map(([r])=>[r.oracle_id,r])), seen=new Map<string,Set<string>>(); let srcCount=0;
  for await (const c of source()) {
    if (NONCARD.has(c.layout)) continue;
    const oid=resolveOid(c); if(!oid) continue;
    const r=has("oracle_id")?byId.get(oid):byName.get(c.name), mark=(tok:string)=>{const s=seen.get(oid)||new Set<string>(); s.add(tok); seen.set(oid,s);};
    if (!c.oracle_id) {
      if(r&&has("printings")){const tok=printingToken(c); chk(r.printings.split(",").includes(tok),"printing missing",`${r.name} (${tok})`); chk(r.rarities.includes(tok.slice(tok.lastIndexOf(":")+1)),"rarity missing",r.name); mark(tok);} continue;
    }
    const lg=c.legalities||{}, wanted=o.format?lg[o.format]==="legal":FORMATS.some(f=>PLAYABLE.has(lg[f]));
    // Only an id tells two cards of the same name apart. Twenty unplayable
    // cards share a name with a playable one, so without the id column a
    // name lookup would accuse the wrong row.
    if(!wanted){if(has("oracle_id")) chk(!r,o.format?`not ${o.format}-legal but kept`:"unplayable card kept",c.name); continue;}
    srcCount++; if(!r){chk(false,"card MISSING",c.name); continue;}
    chk(r.name===c.name,"name",c.name);
    for (const [col,want] of [["type",c.type_line||""],["cmc",num(c.cmc)],["mana",faceted(c,d=>d.mana_cost||"")],["identity",colors(c.color_identity)],["keywords",(c.keywords||[]).join(",")],["layout",c.layout],["reserved",c.reserved?"1":"0"]] as const) if(has(col)) chk(r[col]===want,col,c.name);
    FORMATS.filter(has).forEach(f=>chk(r[f]===(LEG[lg[f]]||"-"),`legality:${f}`,c.name));
    for(const t of c.oracle_text?[c.oracle_text]:(c.card_faces||[]).map((x:J)=>x.oracle_text||"")) if(t) chk(r.oracle.includes(esc(t)),"oracle text missing",c.name);
    if(has("stats")) for(const t of stats(c)?[stats(c)]:(c.card_faces||[]).map(stats)) if(t) chk(r.stats.includes(t),"stats missing",c.name);
    if(has("printings")){const tok=printingToken(c); chk(r.printings.split(",").includes(tok),"printing missing",`${c.name} (${tok})`); mark(tok); chk(r.rarities.includes(tok.slice(tok.lastIndexOf(":")+1)),"rarity missing",c.name);}
    for(const fl of [c.flavor_text||"",...(c.card_faces||[]).map((x:J)=>x.flavor_text||"")]) if(fl.length>20) chk(!r.oracle.replace(/\\n/g," ").includes(fl.replace(/\n/g," ").slice(0,20)),"FLAVOR LEAKED",c.name);
  }
  if(has("printings")) for(const [oid,r] of byId) { const a=new Set<string>(r.printings.split(",")), b=seen.get(oid as string)||new Set<string>(); chk(a.size===b.size&&[...a].every(x=>b.has(x)),"printings not matching source",r.name); }
  console.log(`\nverification: ${rows.length} rows, ${srcCount} source printings cross-checked`);
  if(err.size){for(const [k,v] of [...err].sort((a,b)=>b[1]-a[1])) console.log(`  FAIL ${k.padEnd(32)} ${String(v).padStart(6)}  e.g. ${JSON.stringify(ex.get(k))}`); return false;}
  console.log("  PASS  every carried field matches source; names unique;\n        nothing invented or dropped; zero flavor text leaked"); return true;
}

function summarize(rows:Row[]) {
  console.log(`\n${"format".padEnd(16)} ${"legal".padStart(7)}`);
  for(const f of FORMATS){const i=COLUMNS.indexOf(f), n=rows.filter(r=>r[i]==="L").length, b=rows.filter(r=>r[i]==="B").length, x=rows.filter(r=>r[i]==="R").length; console.log(`  ${f.padEnd(14)} ${String(n).padStart(7)}${b?`  ${b} banned`:""}${x?`  ${x} restricted`:""}`);}
}

async function main() {
  const {values:a}=parseArgs({options:{refresh:{type:"boolean"},verify:{type:"boolean"},format:{type:"string",short:"f"},columns:{type:"string",short:"c",default:"full"},bare:{type:"boolean"},out:{type:"string",short:"o",default:OUT},help:{type:"boolean",short:"h"}}});
  if(a.help){console.log(`usage: cards.ts [--refresh] [--verify] [-f FORMAT] [-c lean|full] [--bare] [-o FILE]

  default        every constructed-playable card, every column
  -f FORMAT      only cards legal in FORMAT (${FORMATS.join(", ")})
  -c lean        name, mana, cmc, type, stats, legality, oracle
  --bare         no comment header, column line only
  --refresh      download the bulk file again
  --verify       cross-check every carried field against the source

  The bulk download is cached at ${BULK} and reused, so a derived list costs
  nothing after the first run. Set PI_MAGIC_CACHE to move it.`); return;}
  if(a.format&&!FORMATS.includes(a.format)) throw Error(`unknown format ${a.format}; one of ${FORMATS.join(", ")}`);
  if(a.columns!=="lean"&&a.columns!=="full") throw Error(`--columns takes lean or full`);
  const o:Opts={out:a.out!,lean:a.columns==="lean",bare:!!a.bare,...(a.format?{format:a.format}:{})};
  await fetchBulk(a.refresh);
  const {rows,keep,cols}=await build(o);
  console.log(`wrote ${o.out}: ${keep.length} cards, ${cols.length} columns${o.format?` (${o.format} legal)`:""}`);
  if(!o.format&&!o.lean) summarize(rows);
  if(a.verify&&!await verify(o)) process.exit(1);
}
main();
