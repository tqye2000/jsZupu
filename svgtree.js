//----------------------------------------------------------------
// File svgtree.js  –  Strict nuclear-family SVG tree builder
//                     (ported from Zupu_json2svg.py)
//----------------------------------------------------------------
window.Zupu = window.Zupu || {};

/**
 * Build a strict nuclear-family SVG tree from Zupu JSON data.
 * @param {object} data - The familyData object (people, families, events, …)
 * @param {string} clanSurname - Preferred root surname for filtering
 * @param {string} [startPersonId] - Optional person ID to use as the root (downstream subtree)
 * @returns {string} SVG markup
 */
window.Zupu.buildTreeSvg = function (data, clanSurname, startPersonId) {
    if (!clanSurname) clanSurname = '';

    const people = {};
    for (const p of (data.people || [])) people[p.id] = p;
    const families = {};
    for (const f of (data.families || [])) families[f.id] = f;

    // Build birth/death year lookup from events
    const events = data.events || [];
    const birthYear = {};
    const deathYear = {};
    for (const ev of events) {
        const pref = ev.personRef || '';
        const dateStr = (ev.date || {}).value || '';
        const yr = extractYear(dateStr);
        if (!yr || !pref) continue;
        if (ev.type === 'birth') birthYear[pref] = yr;
        else if (ev.type === 'death') deathYear[pref] = yr;
    }

    // Build notes lookup: personId -> [noteText, ...]
    const notes = data.notes || [];
    const notesById = {};
    for (const n of notes) notesById[n.id] = n.text || '';
    const personNotes = {};
    for (const p of (data.people || [])) {
        const refs = p.noteRefs || [];
        if (refs.length === 0) continue;
        personNotes[p.id] = refs.map(ref => notesById[ref] || ref).filter(Boolean);
    }

    function birthName(person) {
        const names = person.names || [];
        const birth = names.find(n => n.type === 'birth') || names[0] || {};
        return [birth.surname || '', birth.given || ''];
    }

    function personLabel(person, pid) {
        const [s, g] = birthName(person);
        const nm = (s + g).trim() || pid;
        const gender = person.gender;
        if (gender === 'male') return '♂' + nm;
        if (gender === 'female') return '♀' + nm;
        return nm;
    }

    function svgEsc(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function extractYear(dateVal) {
        if (!dateVal) return '';
        return dateVal.replace(/\//g, '-').split('-')[0];
    }

    // 1) Find root ancestors (or use startPersonId as the single root)
    let roots = [];
    if (startPersonId && people[startPersonId]) {
        roots = [startPersonId];
    } else {
        for (const pid of Object.keys(people)) {
            const p = people[pid];
            if (!p.familiesAsChild || p.familiesAsChild.length === 0) {
                const [s] = birthName(p);
                if (s === clanSurname) roots.push(pid);
            }
        }
        if (roots.length === 0) {
            roots = Object.keys(people).filter(pid => {
                const p = people[pid];
                return !p.familiesAsChild || p.familiesAsChild.length === 0;
            });
        }
    }

    // 2) Traverse descendants + spouses
    const includedPeople = new Set();
    const includedFamilies = new Set();
    const queue = [...roots];
    const seen = new Set();

    while (queue.length > 0) {
        const pid = queue.shift();
        if (seen.has(pid)) continue;
        seen.add(pid);
        includedPeople.add(pid);

        for (const fid of (people[pid] || {}).familiesAsSpouse || []) {
            if (!families[fid]) continue;
            includedFamilies.add(fid);
            const fam = families[fid];
            for (const sp of (fam.partners || [])) includedPeople.add(sp);
            for (const c of (fam.children || [])) {
                includedPeople.add(c);
                queue.push(c);
            }
        }

        // Only traverse upward (familiesAsChild) when NOT building a downstream subtree
        if (!startPersonId) {
            for (const fid of (people[pid] || {}).familiesAsChild || []) {
                if (!families[fid]) continue;
                includedFamilies.add(fid);
                const fam = families[fid];
                for (const sp of (fam.partners || [])) {
                    if (!includedPeople.has(sp)) includedPeople.add(sp);
                }
                for (const c of (fam.children || [])) {
                    if (!includedPeople.has(c)) {
                        includedPeople.add(c);
                        queue.push(c);
                    }
                }
            }
        }
    }

    // prune families
    const prunedFamilies = new Set();
    for (const fid of includedFamilies) {
        const fam = families[fid];
        const all = [...(fam.partners || []), ...(fam.children || [])];
        if (all.some(x => includedPeople.has(x))) prunedFamilies.add(fid);
    }
    const incFams = prunedFamilies;

    // spouse family index
    const spouseFamsOf = {};
    for (const fid of incFams) {
        for (const p of (families[fid].partners || [])) {
            if (includedPeople.has(p)) {
                if (!spouseFamsOf[p]) spouseFamsOf[p] = [];
                spouseFamsOf[p].push(fid);
            }
        }
    }

    // 3) Generation inference
    const gen = {};
    for (const p of includedPeople) gen[p] = 0;
    for (const r of roots) { if (r in gen) gen[r] = 0; }

    for (let iter = 0; iter < 100; iter++) {
        let changed = false;

        // spouses same generation
        for (const fid of incFams) {
            const partners = (families[fid].partners || []).filter(p => p in gen);
            if (partners.length >= 2) {
                const gmax = Math.max(...partners.map(p => gen[p]));
                for (const p of partners) {
                    if (gen[p] !== gmax) { gen[p] = gmax; changed = true; }
                }
            }
        }

        // child >= parent + 1
        for (const fid of incFams) {
            const partners = (families[fid].partners || []).filter(p => p in gen);
            if (partners.length === 0) continue;
            const pg = Math.max(...partners.map(p => gen[p]));
            for (const c of (families[fid].children || [])) {
                if (c in gen && gen[c] < pg + 1) { gen[c] = pg + 1; changed = true; }
            }
        }

        if (!changed) break;
    }

    // normalize
    const genVals = Object.values(gen);
    if (genVals.length > 0) {
        const gmin = Math.min(...genVals);
        if (gmin) { for (const p of Object.keys(gen)) gen[p] -= gmin; }
    }

    // 4) Primary descendant family per child
    const primaryDescFam = {};
    const childlessSpouseFam = {};
    for (const c of includedPeople) {
        const cFams = (spouseFamsOf[c] || []).filter(fid => (families[fid].children || []).length > 0);
        if (cFams.length > 0) {
            primaryDescFam[c] = cFams.sort()[0];
        } else {
            const cSpouseFams = (spouseFamsOf[c] || []).filter(fid =>
                incFams.has(fid) && (families[fid].partners || []).length >= 2
            );
            if (cSpouseFams.length > 0) {
                childlessSpouseFam[c] = cSpouseFams.sort()[0];
            }
        }
    }

    // 5) Recursive width for strict nuclear blocks
    const NODE_W = 44, NODE_H = 100;
    const PARTNER_GAP = 12;
    const CHILD_GAP = 24;
    const BLOCK_GAP = 34;
    const ROW_GAP = 86;
    const PAD = 36;
    const TITLE_H = 40;

    const subtreeW = {};
    const widthVisiting = new Set();

    function childSlotMinWidth(childId, parentFid) {
        let coupleW = NODE_W;
        for (const sfid of (spouseFamsOf[childId] || [])) {
            if (sfid === parentFid || !incFams.has(sfid)) continue;
            const sp = (families[sfid].partners || []).filter(p => includedPeople.has(p));
            const pw = sp.length * NODE_W + Math.max(0, sp.length - 1) * PARTNER_GAP;
            coupleW = Math.max(coupleW, pw);
        }
        return coupleW;
    }

    function familyWidth(fid) {
        if (fid in subtreeW) return subtreeW[fid];
        if (widthVisiting.has(fid)) { subtreeW[fid] = NODE_W; return NODE_W; }

        widthVisiting.add(fid);
        const fam = families[fid];
        const partners = (fam.partners || []).filter(p => includedPeople.has(p));
        const children = (fam.children || []).filter(c => includedPeople.has(c));

        const pw = partners.length * NODE_W + Math.max(0, partners.length - 1) * PARTNER_GAP;

        const slotWidths = [];
        for (const c of children) {
            const df = primaryDescFam[c];
            const minW = childSlotMinWidth(c, fid);
            if (df && df !== fid && incFams.has(df)) {
                slotWidths.push(Math.max(minW, familyWidth(df)));
            } else {
                slotWidths.push(minW);
            }
        }

        const cwTotal = slotWidths.reduce((a, b) => a + b, 0) + Math.max(0, slotWidths.length - 1) * CHILD_GAP;
        const w = Math.max(NODE_W, pw, cwTotal);
        subtreeW[fid] = w;
        return w;
    }

    // root families
    let rootFams = [];
    for (const fid of incFams) {
        if ((families[fid].partners || []).some(p => roots.includes(p))) {
            rootFams.push(fid);
        }
    }
    if (rootFams.length === 0) {
        for (const fid of incFams) {
            const partners = families[fid].partners || [];
            if (partners.some(p => !(people[p] || {}).familiesAsChild || (people[p] || {}).familiesAsChild.length === 0)) {
                rootFams.push(fid);
            }
        }
    }
    rootFams = [...new Set(rootFams)].sort();
    for (const rf of rootFams) familyWidth(rf);

    // 6) Place families recursively
    const pos = {};
    const famMidBottom = {};

    function placeFamily(fid, x0, y0, guard) {
        if (!guard) guard = new Set();
        if (guard.has(fid)) return;
        guard = new Set(guard);
        guard.add(fid);

        const fam = families[fid];
        const partners = (fam.partners || []).filter(p => includedPeople.has(p));
        const children = (fam.children || []).filter(c => includedPeople.has(c));
        const totalW = subtreeW[fid] || NODE_W;

        // partners row centered
        const pw = partners.length * NODE_W + Math.max(0, partners.length - 1) * PARTNER_GAP;
        const px = x0 + (totalW - pw) / 2;
        const py = y0;

        for (let i = 0; i < partners.length; i++) {
            pos[partners[i]] = [px + i * (NODE_W + PARTNER_GAP), py];
        }

        let mx;
        if (partners.length > 0) {
            mx = (px + px + pw) / 2;
        } else {
            mx = x0 + totalW / 2;
        }
        famMidBottom[fid] = [mx, py + NODE_H];

        // children row
        const childY = y0 + NODE_H + ROW_GAP;

        const childSlots = [];
        for (const c of children) {
            const df = primaryDescFam[c];
            const minW = childSlotMinWidth(c, fid);
            let sw;
            if (df && df !== fid && incFams.has(df)) {
                sw = Math.max(minW, subtreeW[df]);
            } else {
                sw = minW;
            }
            childSlots.push([c, df, sw]);
        }

        const cwTotal = childSlots.reduce((acc, s) => acc + s[2], 0) + Math.max(0, childSlots.length - 1) * CHILD_GAP;
        let cx = x0 + (totalW - cwTotal) / 2;

        for (const [c, df, sw] of childSlots) {
            const childX = cx + (sw - NODE_W) / 2;
            pos[c] = [childX, childY];

            if (df && df !== fid && incFams.has(df) && !guard.has(df)) {
                const dpartners = (families[df].partners || []).filter(p => includedPeople.has(p));
                let idx = dpartners.indexOf(c);
                if (idx < 0) idx = 0;

                const dpw = dpartners.length * NODE_W + Math.max(0, dpartners.length - 1) * PARTNER_GAP;
                const dtotal = subtreeW[df];
                const dpx = (dtotal - dpw) / 2;
                const targetX = dpx + idx * (NODE_W + PARTNER_GAP);

                let descX0 = childX - targetX;
                const slotLeft = cx;
                const slotRight = cx + sw;
                if (descX0 < slotLeft) descX0 = slotLeft;
                if (descX0 + dtotal > slotRight) descX0 = slotRight - dtotal;

                placeFamily(df, descX0, childY, guard);

            } else if (c in childlessSpouseFam) {
                const csfid = childlessSpouseFam[c];
                if (!(csfid in famMidBottom)) {
                    const cspartners = (families[csfid].partners || []).filter(p => includedPeople.has(p));
                    if (cspartners.includes(c)) {
                        const cpw = cspartners.length * NODE_W + Math.max(0, cspartners.length - 1) * PARTNER_GAP;
                        const cpx = cx + (sw - cpw) / 2;
                        for (let ci = 0; ci < cspartners.length; ci++) {
                            pos[cspartners[ci]] = [cpx + ci * (NODE_W + PARTNER_GAP), childY];
                        }
                        const left = cpx;
                        const right = cpx + cpw;
                        famMidBottom[csfid] = [(left + right) / 2, childY + NODE_H];
                    }
                }
            }

            cx += sw + CHILD_GAP;
        }
    }

    // place root families side-by-side
    let xCursor = PAD;
    const yStart = PAD + TITLE_H;
    for (const rf of rootFams) {
        if (!(rf in famMidBottom)) {
            placeFamily(rf, xCursor, yStart);
            xCursor += subtreeW[rf] + BLOCK_GAP;
        }
    }

    if (Object.keys(pos).length === 0) {
        throw new Error('No nodes were positioned. Check JSON structure and surname scope.');
    }

    // 7) Build edges
    const marriageEdges = [];
    const parentGroups = [];
    const posPeople = new Set(Object.keys(pos));

    for (const fid of incFams) {
        const fam = families[fid];
        const partners = (fam.partners || []).filter(p => posPeople.has(p));
        const children = (fam.children || []).filter(c => posPeople.has(c));

        if (partners.length >= 2) {
            for (let i = 0; i < partners.length - 1; i++) {
                marriageEdges.push([partners[i], partners[i + 1]]);
            }
        }

        if (fid in famMidBottom && children.length > 0) {
            const [fmx, fmy] = famMidBottom[fid];
            parentGroups.push([fmx, fmy, children]);
        }
    }

    // canvas size
    const allX = Object.values(pos).map(p => p[0]);
    const allY = Object.values(pos).map(p => p[1]);
    const W = Math.ceil(Math.max(...allX) + NODE_W + PAD);
    const H = Math.ceil(Math.max(...allY) + NODE_H + PAD);

    // 8) Emit SVG
    const svg = [];
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    svg.push('<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">' +
             '<feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-opacity="0.16"/></filter></defs>');
    svg.push('<rect width="100%" height="100%" fill="white"/>');
    svg.push(`<text x="${PAD}" y="${PAD}" font-size="18" font-weight="700" ` +
             `font-family="Arial, sans-serif">${svgEsc(Zupu.i18n.t('svgChartTitle', { surname: clanSurname }))}</text>`);

    // lines
    svg.push('<g stroke="#555" stroke-width="1.4" fill="none">');
    for (const [a, b] of marriageEdges) {
        const [ax, ay] = pos[a];
        const [bx, by] = pos[b];
        const yline = ay + NODE_H / 2;
        svg.push(`<line x1="${ax + NODE_W}" y1="${yline}" x2="${bx}" y2="${yline}"/>`);
    }

    for (const [fmx, fmy, children] of parentGroups) {
        const childTops = children.map(c => pos[c][1]);
        const jy = fmy + Math.max(20, (Math.min(...childTops) - fmy) * 0.52);
        svg.push(`<line x1="${fmx}" y1="${fmy}" x2="${fmx}" y2="${jy}"/>`);

        const centers = children.map(c => [pos[c][0] + NODE_W / 2, pos[c][1]]);
        const minCx = Math.min(...centers.map(c => c[0]));
        const maxCx = Math.max(...centers.map(c => c[0]));
        svg.push(`<line x1="${minCx}" y1="${jy}" x2="${maxCx}" y2="${jy}"/>`);

        for (const [ccx, ccy] of centers) {
            svg.push(`<line x1="${ccx}" y1="${jy}" x2="${ccx}" y2="${ccy}"/>`);
        }
    }
    svg.push('</g>');

    // nodes
    svg.push('<g font-family="Arial, sans-serif">');
    for (const pid of Object.keys(pos)) {
        const [x, y] = pos[pid];
        const p = people[pid];
        const gender = p.gender;
        let fill, stroke;
        if (gender === 'male') { fill = '#F2F6FF'; stroke = '#2F5AA8'; }
        else if (gender === 'female') { fill = '#FFF2F6'; stroke = '#A82F5A'; }
        else { fill = '#F7F7F7'; stroke = '#666'; }

        svg.push('<g filter="url(#shadow)">');
        svg.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10" ` +
                 `fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`);

        const txt = personLabel(p, pid);
        const chars = [...txt];
        const top = y + 18;
        const lineH = 16.5;

        const by = birthYear[pid] || '';
        const dy = deathYear[pid] || '';
        const yearLines = (by ? 1 : 0) + (dy ? 1 : 0);
        const yearBlockH = yearLines * 9;
        const availableH = NODE_H - 10 - yearBlockH;
        const maxLines = Math.floor(availableH / lineH);

        for (let i = 0; i < Math.min(chars.length, maxLines); i++) {
            svg.push(`<text x="${x + NODE_W / 2}" y="${top + i * lineH}" ` +
                     `text-anchor="middle" font-size="15" fill="#111">${svgEsc(chars[i])}</text>`);
        }

        let yearY = y + NODE_H - 4 - (yearLines - 1) * 9;
        if (by) {
            svg.push(`<text x="${x + NODE_W / 2}" y="${yearY}" ` +
                     `text-anchor="middle" font-size="7.5" fill="#888">b.${svgEsc(by)}</text>`);
            yearY += 9;
        }
        if (dy) {
            svg.push(`<text x="${x + NODE_W / 2}" y="${yearY}" ` +
                     `text-anchor="middle" font-size="7.5" fill="#888">d.${svgEsc(dy)}</text>`);
        }

        svg.push(`<text x="${x + NODE_W - 3}" y="${y + 10}" text-anchor="end" ` +
                 `font-size="8.5" fill="#666">G${(gen[pid] || 0) + 1}</text>`);

        // Note indicator
        const pNotes = personNotes[pid];
        if (pNotes && pNotes.length > 0) {
            svg.push(`<text x="${x + 4}" y="${y + 10}" font-size="9" fill="#C62828">※</text>`);
            svg.push(`<title>${svgEsc(pNotes.join('\n'))}</title>`);
        }

        svg.push('</g>');
    }
    svg.push('</g>');
    svg.push('</svg>');

    return svg.join('\n');
};
