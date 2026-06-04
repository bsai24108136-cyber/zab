"""
MediTrace — Progress Report PDF Generator
Strict 1-page A4 layout using reportlab.
"""
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, HRFlowable,
)
from reportlab.platypus.flowables import KeepInFrame


# ── colour palette ────────────────────────────────────────────────────────────
BLUE_DARK  = colors.HexColor("#1352A2")
BLUE_MID   = colors.HexColor("#2563EB")
BLUE_LIGHT = colors.HexColor("#EEF3FF")
BORDER_CLR = colors.HexColor("#C8D8F0")
DIVIDER    = colors.HexColor("#DDE8F5")
MUTED      = colors.HexColor("#64748B")
PURPLE     = colors.HexColor("#7C3AED")
PURPLE_BG  = colors.HexColor("#F5F3FF")
RED_TEXT   = colors.HexColor("#DC2626")
AMBER_TEXT = colors.HexColor("#D97706")
GREEN_TEXT = colors.HexColor("#15803D")
WHITE      = colors.white
BLACK      = colors.HexColor("#1A2B4A")


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    """Safe Paragraph that escapes special XML chars."""
    safe = (text or "—").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, style)


def _style(name, **kw) -> ParagraphStyle:
    s = ParagraphStyle(name)
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def generate_progress_pdf(data: dict) -> bytes:
    """
    Build a 1-page A4 PDF progress report from the data dict
    returned by build_progress_data().

    Returns raw PDF bytes.
    """
    buf     = BytesIO()
    W, H    = A4
    MARGIN  = 15 * mm

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )

    usable_w = W - 2 * MARGIN

    # ── Pull data ─────────────────────────────────────────────────────────────
    patient     = data.get("patient", {})
    period      = data.get("period",  {})
    metrics     = data.get("metrics", {})
    records     = data.get("records",     [])
    changed_rx  = data.get("changed_rx",  [])
    active_rx   = data.get("active_rx",   [])
    labs        = data.get("labs",         [])
    commentary  = data.get("ai_commentary", "No AI commentary generated.")
    ai_model    = data.get("ai_model",      "Gemini 2.5 Flash")
    gen_at      = data.get("generated_at",  datetime.utcnow().isoformat() + "Z")

    try:
        gen_label = datetime.fromisoformat(gen_at.rstrip("Z")).strftime("%d %b %Y %H:%M UTC")
    except Exception:
        gen_label = gen_at

    # ── Styles ────────────────────────────────────────────────────────────────
    s_sect    = _style("sect",  fontSize=9,  fontName="Helvetica-Bold",
                       textColor=BLUE_DARK,  spaceAfter=4,  spaceBefore=6)
    s_th      = _style("th",   fontSize=7.5, fontName="Helvetica-Bold",
                       textColor=BLUE_DARK)
    s_td      = _style("td",   fontSize=8,   textColor=BLACK)
    s_td_red  = _style("tdr",  fontSize=8,   textColor=RED_TEXT,  fontName="Helvetica-Bold")
    s_td_am   = _style("tdam", fontSize=8,   textColor=AMBER_TEXT)
    s_td_gr   = _style("tdgr", fontSize=8,   textColor=GREEN_TEXT)
    s_meta    = _style("meta", fontSize=8,   textColor=MUTED, leading=11)
    s_body    = _style("body", fontSize=8,   textColor=BLACK, leading=12)
    s_foot    = _style("foot", fontSize=7,   textColor=MUTED, alignment=1)
    s_ai      = _style("ai",   fontSize=8,   textColor=BLACK, leading=12)
    s_powered = _style("pw",   fontSize=6.5, textColor=MUTED)
    s_metric_num = _style("mn", fontSize=16, fontName="Helvetica-Bold",
                           textColor=BLUE_DARK,  alignment=1)
    s_metric_lbl = _style("ml", fontSize=6.5, textColor=MUTED, alignment=1)
    s_metric_red = _style("mr", fontSize=16, fontName="Helvetica-Bold",
                           textColor=RED_TEXT, alignment=1)

    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # HEADER TABLE  (blue left, patient name right)
    # ══════════════════════════════════════════════════════════════════════════
    s_hdr_title = _style("ht", fontSize=13, fontName="Helvetica-Bold",
                          textColor=WHITE)
    s_hdr_sub   = _style("hs", fontSize=7.5, textColor=colors.HexColor("#BFD4FF"))
    s_hdr_name  = _style("hn", fontSize=10,  fontName="Helvetica-Bold",
                          textColor=WHITE, alignment=2)
    s_hdr_meta  = _style("hm", fontSize=7.5, textColor=colors.HexColor("#BFD4FF"), alignment=2)

    hdr_left  = [_p("MediTrace", s_hdr_title), _p("Patient Progress Report", s_hdr_sub)]
    hdr_right = [
        _p(patient.get("name", "Unknown Patient"), s_hdr_name),
        _p(f"ID: {patient.get('id','')}  ·  {period.get('label','')}", s_hdr_meta),
    ]

    hdr_table = Table(
        [[hdr_left, hdr_right]],
        colWidths=[usable_w * 0.55, usable_w * 0.45],
    )
    hdr_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLUE_DARK),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (0, -1), 12),
        ("RIGHTPADDING",  (-1, 0), (-1, -1), 12),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(hdr_table)
    story.append(Spacer(1, 6))

    # ══════════════════════════════════════════════════════════════════════════
    # METRICS ROW  (4 coloured boxes)
    # ══════════════════════════════════════════════════════════════════════════
    ab_count = metrics.get("labs_abnormal", 0)
    metrics_data = [
        [
            [_p(str(metrics.get("total_visits", 0)),  s_metric_num),
             _p("Total Visits", s_metric_lbl)],
            [_p(str(metrics.get("active_meds", 0)),   s_metric_num),
             _p("Active Meds", s_metric_lbl)],
            [_p(str(metrics.get("med_changes", 0)),   s_metric_num),
             _p("Med Changes", s_metric_lbl)],
            [_p(str(ab_count),
                s_metric_red if ab_count > 0 else s_metric_num),
             _p("Abnormal Labs", s_metric_lbl)],
        ]
    ]
    box_w = usable_w / 4
    met_table = Table(metrics_data, colWidths=[box_w] * 4, rowHeights=[44])
    met_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), BLUE_LIGHT),
        ("BOX",           (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(met_table)
    story.append(Spacer(1, 5))

    # ══════════════════════════════════════════════════════════════════════════
    # PATIENT INFO ROW  (2 columns)
    # ══════════════════════════════════════════════════════════════════════════
    left_info  = _p(
        f"<b>Age:</b> {patient.get('age','Unknown')}  "
        f"<b>Gender:</b> {patient.get('gender','Unknown')}  "
        f"<b>Blood Group:</b> {patient.get('blood_group','Unknown')}",
        s_meta,
    )
    right_info = _p(
        f"<b>Period:</b> {period.get('label','')}  ·  "
        f"<b>Generated:</b> {gen_label}  ·  "
        f"<b>AI:</b> {ai_model}",
        s_meta,
    )
    info_table = Table([[left_info, right_info]],
                       colWidths=[usable_w * 0.5, usable_w * 0.5])
    info_table.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (0, -1), 0),
        ("RIGHTPADDING",  (-1, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.5,
                             color=DIVIDER, spaceAfter=5))

    # ── shared mini-table style factory ───────────────────────────────────────
    HDR_BG = colors.HexColor("#F0F4FF")

    def mini_table(header_row: list, rows: list[list],
                   col_widths: list, max_rows=8) -> Table:
        """Build a compact table with styled header + alternating rows."""
        hdr_cells = [_p(h, s_th) for h in header_row]
        data = [hdr_cells]
        shown = rows[:max_rows]
        for i, row in enumerate(shown):
            data.append(row)

        t = Table(data, colWidths=col_widths)
        style_cmds = [
            ("BACKGROUND",    (0, 0), (-1, 0), HDR_BG),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, 0), 7.5),
            ("TEXTCOLOR",     (0, 0), (-1, 0), BLUE_DARK),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ("GRID",          (0, 0), (-1, -1), 0.3, BORDER_CLR),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]
        for i in range(1, len(data)):
            if i % 2 == 0:
                style_cmds.append(("BACKGROUND", (0, i), (-1, i),
                                   colors.HexColor("#F8FAFF")))
        t.setStyle(TableStyle(style_cmds))
        return t

    # ══════════════════════════════════════════════════════════════════════════
    # CLINICAL VISITS
    # ══════════════════════════════════════════════════════════════════════════
    if records:
        story.append(_p("Clinical Visits", s_sect))
        cw = [usable_w * 0.15, usable_w * 0.40, usable_w * 0.45]
        rows = [
            [_p(r.get("date", ""), s_td),
             _p(r.get("diagnosis") or "—", s_td),
             _p(r.get("symptoms") or "—", s_td)]
            for r in records
        ]
        story.append(mini_table(["Date", "Diagnosis", "Symptoms"],
                                rows, cw, max_rows=8))
        if len(records) > 8:
            story.append(_p(f"  + {len(records)-8} more visits not shown.", s_meta))
        story.append(Spacer(1, 4))

    # ══════════════════════════════════════════════════════════════════════════
    # MEDICATION CHANGES
    # ══════════════════════════════════════════════════════════════════════════
    if changed_rx:
        story.append(_p("Medication Changes This Period", s_sect))
        cw = [usable_w * 0.40, usable_w * 0.20, usable_w * 0.40]
        rows = [
            [_p(rx.get("name", ""), s_td),
             _p(rx.get("dosage") or "—", s_td),
             _p(rx.get("started", ""), s_td)]
            for rx in changed_rx
        ]
        story.append(mini_table(["Medicine", "Dosage", "Started"],
                                rows, cw, max_rows=6))
        if len(changed_rx) > 6:
            story.append(_p(f"  + {len(changed_rx)-6} more changes not shown.", s_meta))
        story.append(Spacer(1, 4))

    # ══════════════════════════════════════════════════════════════════════════
    # LAB REPORTS
    # ══════════════════════════════════════════════════════════════════════════
    STATUS_STYLE = {
        "normal":             s_td_gr,
        "reviewed_normal":    s_td_gr,
        "abnormal":           s_td_am,
        "reviewed_abnormal":  s_td_am,
        "critical":           s_td_red,
        "reviewed_critical":  s_td_red,
    }

    if labs:
        story.append(_p("Lab Reports", s_sect))
        cw = [usable_w * 0.18, usable_w * 0.22, usable_w * 0.60]
        rows = [
            [_p(l.get("date") or "—", s_td),
             _p((l.get("status") or "").replace("reviewed_", ""), 
                STATUS_STYLE.get(l.get("status", ""), s_td)),
             _p(l.get("note") or "—", s_td)]
            for l in labs
        ]
        story.append(mini_table(["Date", "Result", "Doctor Note"],
                                rows, cw, max_rows=5))
        story.append(Spacer(1, 4))

    # ══════════════════════════════════════════════════════════════════════════
    # AI COMMENTARY BOX
    # ══════════════════════════════════════════════════════════════════════════
    story.append(_p("AI Clinical Commentary", s_sect))

    commentary_para = _p(commentary, s_ai)
    powered_para    = _p(f"Powered by {ai_model}", s_powered)

    ai_inner = Table(
        [[commentary_para], [powered_para]],
        colWidths=[usable_w - 12],
    )
    ai_inner.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PURPLE_BG),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEAFTER",     (0, 0), (0, -1), 0, colors.white),  # no right line
    ]))

    # Purple left border wrapper
    ai_wrapper = Table(
        [[[ai_inner]]],
        colWidths=[usable_w],
    )
    ai_wrapper.setStyle(TableStyle([
        ("LINEBEFORE",    (0, 0), (0, -1), 3, PURPLE),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(ai_wrapper)

    # ══════════════════════════════════════════════════════════════════════════
    # FOOTER
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.3, color=DIVIDER))
    story.append(Spacer(1, 3))
    story.append(_p(
        f"Generated by MediTrace AI  ·  Not a substitute for clinical judgment  ·  {gen_label}",
        s_foot,
    ))

    doc.build(story)
    return buf.getvalue()
