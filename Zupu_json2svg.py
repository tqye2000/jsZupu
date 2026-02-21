#######################################################
# Zupu_json2svg.py
# Convert Zupu JSON export to a strict nuclear-family SVG tree.
# Usage: python Zupu_json2svg.py --input Zhang_tree.json --output Zhang_family.svg --surname 张
# The algorithm:
# 1) Identify root ancestors based on surname and no parent families.
# 2) Traverse descendants and spouses to find included people and families.
# 3) Infer generations by iterative constraint relaxation.
# 4) Determine primary descendant family for each child.
# 5) Recursively compute subtree widths for strict nuclear blocks.
# 6) Place families recursively, anchored on primary descendant families.
# 7) Build marriage and parent-child edges.
# 8) Emit SVG with vertical text and simple styling.
#######################################################
import json
import argparse
from collections import defaultdict, deque
from typing import Dict, List, Tuple, Set

def birth_name(person: dict) -> Tuple[str, str]:
    names = person.get("names", [])
    birth = next((n for n in names if n.get("type") == "birth"), names[0] if names else {})
    return (birth.get("surname", "") or "", birth.get("given", "") or "")


def person_label(person: dict, pid: str) -> str:
    s, g = birth_name(person)
    nm = (s + g).strip() or pid
    gender = person.get("gender")
    if gender == "male":
        return "♂" + nm
    if gender == "female":
        return "♀" + nm
    return nm


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_tree_svg(data: dict, clan_surname: str = "叶") -> str:
    people: Dict[str, dict] = {p["id"]: p for p in data.get("people", [])}
    families: Dict[str, dict] = {f["id"]: f for f in data.get("families", [])}

    # -------------------------
    # 1) Find root ancestors
    # -------------------------
    roots = []
    for pid, p in people.items():
        if not p.get("familiesAsChild"):
            s, _ = birth_name(p)
            if s == clan_surname:
                roots.append(pid)

    # fallback: if no clan-specific root found
    if not roots:
        roots = [pid for pid, p in people.items() if not p.get("familiesAsChild")]

    # -------------------------
    # 2) Traverse descendants + spouses
    # -------------------------
    included_people: Set[str] = set()
    included_families: Set[str] = set()

    q = deque(roots)
    seen = set()

    while q:
        pid = q.popleft()
        if pid in seen:
            continue
        seen.add(pid)
        included_people.add(pid)

        # Add families where this person is a spouse
        for fid in people.get(pid, {}).get("familiesAsSpouse", []):
            if fid not in families:
                continue
            included_families.add(fid)
            fam = families[fid]

            for sp in fam.get("partners", []):
                included_people.add(sp)

            for c in fam.get("children", []):
                included_people.add(c)
                q.append(c)

        # Also add families where this person is a child (to include parent relationships)
        for fid in people.get(pid, {}).get("familiesAsChild", []):
            if fid not in families:
                continue
            included_families.add(fid)
            fam = families[fid]

            for sp in fam.get("partners", []):
                if sp not in included_people:
                    included_people.add(sp)

            for c in fam.get("children", []):
                if c not in included_people:
                    included_people.add(c)
                    q.append(c)

    # prune families to those touching included people
    included_families = {
        fid
        for fid in included_families
        if any(
            x in included_people
            for x in families[fid].get("partners", []) + families[fid].get("children", [])
        )
    }

    # spouse family index
    spouse_fams_of: Dict[str, List[str]] = defaultdict(list)
    for fid in included_families:
        for p in families[fid].get("partners", []):
            if p in included_people:
                spouse_fams_of[p].append(fid)

    # -------------------------
    # 3) Generation inference
    # -------------------------
    gen = {p: 0 for p in included_people}
    for r in roots:
        if r in gen:
            gen[r] = 0

    # iterative constraint relaxation
    for _ in range(100):
        changed = False

        # spouses same generation
        for fid in included_families:
            partners = [p for p in families[fid].get("partners", []) if p in gen]
            if len(partners) >= 2:
                gmax = max(gen[p] for p in partners)
                for p in partners:
                    if gen[p] != gmax:
                        gen[p] = gmax
                        changed = True

        # child >= parent + 1
        for fid in included_families:
            partners = [p for p in families[fid].get("partners", []) if p in gen]
            if not partners:
                continue
            pg = max(gen[p] for p in partners)
            for c in families[fid].get("children", []):
                if c in gen and gen[c] < pg + 1:
                    gen[c] = pg + 1
                    changed = True

        if not changed:
            break

    # normalize to start from 0
    if gen:
        gmin = min(gen.values())
        if gmin:
            for p in gen:
                gen[p] -= gmin

    # -------------------------
    # 4) Primary descendant family per child
    # -------------------------
    primary_desc_fam: Dict[str, str] = {}
    for c in included_people:
        c_fams = [fid for fid in spouse_fams_of.get(c, []) if families[fid].get("children")]
        if c_fams:
            primary_desc_fam[c] = sorted(c_fams)[0]

    # -------------------------
    # 5) Recursive width for strict nuclear blocks
    # -------------------------
    NODE_W, NODE_H = 44, 120      # narrow, tall (vertical text)
    PARTNER_GAP = 12
    CHILD_GAP = 24
    BLOCK_GAP = 34
    ROW_GAP = 86
    PAD = 36
    TITLE_H = 40

    subtree_w: Dict[str, float] = {}
    width_visiting = set()

    def family_width(fid: str) -> float:
        if fid in subtree_w:
            return subtree_w[fid]
        if fid in width_visiting:
            subtree_w[fid] = NODE_W
            return NODE_W

        width_visiting.add(fid)
        fam = families[fid]
        partners = [p for p in fam.get("partners", []) if p in included_people]
        children = [c for c in fam.get("children", []) if c in included_people]

        pw = len(partners) * NODE_W + max(0, len(partners) - 1) * PARTNER_GAP

        slot_widths = []
        for c in children:
            df = primary_desc_fam.get(c)
            if df and df != fid and df in included_families:
                sw = max(NODE_W, family_width(df))
            else:
                sw = NODE_W
            slot_widths.append(sw)

        cw_total = sum(slot_widths) + max(0, len(slot_widths) - 1) * CHILD_GAP
        w = max(NODE_W, pw, cw_total)

        subtree_w[fid] = w
        return w

    # root families = families containing a root partner
    # Primary: families whose partner is a genuine root (matched surname)
    primary_root_fams = [
        fid for fid in included_families
        if any(p in roots for p in families[fid].get("partners", []))
    ]
    
    # Only use fallback if no primary roots found
    root_fams = primary_root_fams
    if not root_fams:
        # fallback: use families with a partner who has no familiesAsChild
        for fid in included_families:
            partners = families[fid].get("partners", [])
            if any(len(people.get(p, {}).get("familiesAsChild", [])) == 0 for p in partners):
                root_fams.append(fid)

    root_fams = sorted(set(root_fams))
    for rf in root_fams:
        family_width(rf)

    # -------------------------
    # 6) Place families recursively
    # -------------------------
    pos: Dict[str, Tuple[float, float]] = {}              # person -> (x,y)
    fam_mid_bottom: Dict[str, Tuple[float, float]] = {}   # family -> (mx, y_bottom_partner_row)

    def place_family(fid: str, x0: float, y0: float, guard: Set[str] = None):
        if guard is None:
            guard = set()
        if fid in guard:
            return
        guard = set(guard)
        guard.add(fid)

        fam = families[fid]
        partners = [p for p in fam.get("partners", []) if p in included_people]
        children = [c for c in fam.get("children", []) if c in included_people]
        total_w = subtree_w.get(fid, NODE_W)

        # partners row centered
        pw = len(partners) * NODE_W + max(0, len(partners) - 1) * PARTNER_GAP
        px = x0 + (total_w - pw) / 2
        py = y0

        for i, p in enumerate(partners):
            pos[p] = (px + i * (NODE_W + PARTNER_GAP), py)

        if partners:
            left = px
            right = px + pw
            mx = (left + right) / 2
        else:
            mx = x0 + total_w / 2
        fam_mid_bottom[fid] = (mx, py + NODE_H)

        # children row
        cy = y0 + NODE_H + ROW_GAP

        child_slots = []
        for c in children:
            df = primary_desc_fam.get(c)
            if df and df != fid and df in included_families:
                sw = max(NODE_W, subtree_w[df])
            else:
                sw = NODE_W
            child_slots.append((c, df, sw))

        cw_total = sum(sw for _, _, sw in child_slots) + max(0, len(child_slots) - 1) * CHILD_GAP
        cx = x0 + (total_w - cw_total) / 2

        for c, df, sw in child_slots:
            child_x = cx + (sw - NODE_W) / 2
            pos[c] = (child_x, cy)

            # recurse descendant family anchored to child partner slot
            if df and df != fid and df in included_families and df not in guard:
                dpartners = [p for p in families[df].get("partners", []) if p in included_people]
                if c in dpartners:
                    idx = dpartners.index(c)
                else:
                    idx = 0

                dpw = len(dpartners) * NODE_W + max(0, len(dpartners) - 1) * PARTNER_GAP
                dtotal = subtree_w[df]
                dpx = (dtotal - dpw) / 2
                target_x = dpx + idx * (NODE_W + PARTNER_GAP)

                desc_x0 = child_x - target_x
                desc_y0 = cy
                place_family(df, desc_x0, desc_y0, guard)

            cx += sw + CHILD_GAP

    # place root families side-by-side
    x_cursor = PAD
    y_start = PAD + TITLE_H
    for rf in root_fams:
        # Skip if this family was already placed as a descendant
        if rf not in fam_mid_bottom:
            place_family(rf, x_cursor, y_start)
            x_cursor += subtree_w[rf] + BLOCK_GAP

    if not pos:
        raise ValueError("No nodes were positioned. Check JSON structure and surname scope.")

    # -------------------------
    # 7) Build edges
    # -------------------------
    marriage_edges = []
    parent_groups = []  # (mx, my, children)

    pos_people = set(pos.keys())

    for fid in included_families:
        fam = families[fid]
        partners = [p for p in fam.get("partners", []) if p in pos_people]
        children = [c for c in fam.get("children", []) if c in pos_people]

        if len(partners) >= 2:
            for i in range(len(partners) - 1):
                marriage_edges.append((partners[i], partners[i + 1]))

        if fid in fam_mid_bottom and children:
            mx, my = fam_mid_bottom[fid]
            parent_groups.append((mx, my, children))

    # canvas size
    max_x = max(x for x, _ in pos.values()) + NODE_W + PAD
    max_y = max(y for _, y in pos.values()) + NODE_H + PAD
    W = int(max_x)
    H = int(max_y)

    # -------------------------
    # 8) Emit SVG
    # -------------------------
    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
    svg.append('<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">'
               '<feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-opacity="0.16"/></filter></defs>')
    svg.append('<rect width="100%" height="100%" fill="white"/>')
    svg.append(f'<text x="{PAD}" y="{PAD}" font-size="18" font-weight="700" '
               f'font-family="Arial, sans-serif">{esc(clan_surname)}氏家族关系图（严格核心家庭分组）</text>')

    # lines
    svg.append('<g stroke="#555" stroke-width="1.4" fill="none">')
    for a, b in marriage_edges:
        ax, ay = pos[a]
        bx, by = pos[b]
        yline = ay + NODE_H / 2
        svg.append(f'<line x1="{ax + NODE_W}" y1="{yline}" x2="{bx}" y2="{yline}"/>')

    for mx, my, children in parent_groups:
        child_tops = [pos[c][1] for c in children]
        jy = my + max(20, (min(child_tops) - my) * 0.52)
        svg.append(f'<line x1="{mx}" y1="{my}" x2="{mx}" y2="{jy}"/>')

        centers = [(pos[c][0] + NODE_W / 2, pos[c][1]) for c in children]
        minx = min(x for x, _ in centers)
        maxx = max(x for x, _ in centers)
        svg.append(f'<line x1="{minx}" y1="{jy}" x2="{maxx}" y2="{jy}"/>')

        for cx, cy in centers:
            svg.append(f'<line x1="{cx}" y1="{jy}" x2="{cx}" y2="{cy}"/>')
    svg.append('</g>')

    # nodes
    svg.append('<g font-family="Arial, sans-serif">')
    for pid, (x, y) in pos.items():
        p = people[pid]
        gender = p.get("gender")
        if gender == "male":
            fill, stroke = "#F2F6FF", "#2F5AA8"
        elif gender == "female":
            fill, stroke = "#FFF2F6", "#A82F5A"
        else:
            fill, stroke = "#F7F7F7", "#666"

        svg.append('<g filter="url(#shadow)">')
        svg.append(f'<rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="10" ry="10" '
                   f'fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')

        # vertical text: one character per line
        txt = person_label(p, pid)
        chars = list(txt)
        top = y + 13
        line_h = 11.0
        max_lines = int((NODE_H - 10) / line_h)

        for i, ch in enumerate(chars[:max_lines]):
            svg.append(f'<text x="{x + NODE_W/2}" y="{top + i*line_h}" '
                       f'text-anchor="middle" font-size="10.5" fill="#111">{esc(ch)}</text>')

        svg.append(f'<text x="{x + NODE_W - 3}" y="{y + 10}" text-anchor="end" '
                   f'font-size="8.5" fill="#666">G{gen.get(pid, 0)+1}</text>')
        svg.append('</g>')
    svg.append('</g>')
    svg.append('</svg>')

    return "\n".join(svg)


def main():
    parser = argparse.ArgumentParser(description="Build strict nuclear-family SVG from JSON.")
    parser.add_argument("--input", required=True, help="Input JSON path")
    parser.add_argument("--output", required=True, help="Output SVG path")
    parser.add_argument("--surname", default="叶", help="Clan surname root filter, default=叶")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    svg = build_tree_svg(data, clan_surname=args.surname)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(svg)

    print(f"SVG generated: {args.output}")


if __name__ == "__main__":
    main()
