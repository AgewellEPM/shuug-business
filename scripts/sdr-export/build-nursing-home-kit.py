"""Regenerate the checked-in campaign PDF with Python, ReportLab and Pillow."""
from pathlib import Path
from io import BytesIO
from xml.sax.saxutils import escape

from PIL import Image
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph


assets = Path(__file__).resolve().parents[2] / "public" / "rideshare-tax-pros"
rl_config.useA85 = False
pdf = Canvas(str(assets / "nursing-home-sales-kit.pdf"), pagesize=letter, invariant=1)
pdf.setTitle("TinkyTown | Nursing Home Sales Kit")
pdf.setAuthor("TinkyTown")
pdf.setCreator("TinkyTown Sales Workspace")
pdf.setSubject("A nursing-home conversation guide and pilot worksheet")
navy, blue, ink = [colors.HexColor(value) for value in ("#092851", "#065CB9", "#223950")]
edge, pale = [colors.HexColor(value) for value in ("#C8DFF3", "#EBF5FD")]
margin, right = 46, letter[0] - 46


def line(value, x, y, size=12, color=ink, bold=False):
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    pdf.drawString(x, y, value)


def paragraph(value, x, top, width, size=11, leading=15):
    style = ParagraphStyle("body", fontName="Helvetica", fontSize=size,
                           leading=leading, textColor=ink)
    block = Paragraph(escape(value), style)
    _, height = block.wrap(width, 700)
    block.drawOn(pdf, x, top - height)
    return top - height


def heading(value, y):
    line(value, margin, y, 17, navy, True)
    return y - 12


def entry(label, body, x, top, width):
    line(label, x, top, 11, blue, True)
    return paragraph(body, x, top - 5, width, 11, 14) - 20


def page(number, title, subtitle):
    pdf.setFillColor(navy)
    pdf.rect(0, 697, letter[0], 95, stroke=0, fill=1)
    line("TinkyTown", margin, 755, 19, colors.white, True)
    line("NURSING HOME SALES KIT", margin, 734, 10, colors.HexColor("#9ED9FF"), True)
    pdf.setStrokeColor(edge)
    pdf.line(margin, 41, right, 41)
    line("TinkyTown  /  Senior care partnerships", margin, 26, 9)
    pdf.drawRightString(right, 26, f"{number} / 3")
    title_size = min(27, (right - margin) / stringWidth(title, "Helvetica-Bold", 1))
    line(title, margin, 657, title_size, navy, True)
    return paragraph(subtitle, margin, 641, right - margin, 12, 16)


page(1, "Accessible communication for nursing homes",
     "Give residents another way to say what they need, make a choice and take part in everyday care.")
encoded_photo = BytesIO()
with Image.open(assets / "sales-campaign-care.webp") as source:
    source.thumbnail((1400, 500))
    source.convert("RGB").save(encoded_photo, "JPEG", quality=86, optimize=True)
encoded_photo.seek(0)
photo = ImageReader(encoded_photo)
width, height = photo.getSize()
pdf.drawImage(photo, margin, 418, width=right - margin, height=(right - margin) * height / width)
heading("The opportunity", 390)
paragraph("When speech is difficult, a familiar symbol board can give a resident time and a way to answer. Start with one routine where being understood would make a difference.", margin, 375, right - margin)
heading("Three moments to demonstrate", 305)
y = entry("Comfort", "Ask what would help. Show how a resident can tap a blanket or drink symbol and hear the message spoken.", margin, 280, right - margin)
y = entry("Choice", "Offer a genuine choice. Try Yes, No and Please wait so the resident can set the pace.", margin, y, right - margin)
entry("Connection", "Choose Call my family. Ask which phrases would be meaningful to this resident and the people close to them.", margin, y, right - margin)
line("Next step", margin, 102, 13, blue, True)
paragraph("Agree on a unit and a care routine, then arrange a demonstration with the people who would use the board.", margin, 92, right - margin)
pdf.showPage()

page(2, "A conversation with the care team",
     "Use these questions with the resident, nursing staff, activities team and the facility’s communication or accessibility lead.")
heading("Discovery questions", 567)
y = 539
for label, body in [
    ("Residents", "Which everyday requests are difficult to express? What ways of communicating already work well?"),
    ("Care team", "What happens when a request is unclear? How do staff pass communication preferences to the next shift?"),
    ("Families", "Which familiar words, routines or activities could family members help the team identify?"),
    ("Access and equipment", "Who will check positioning, charging, cleaning, staff orientation and the resident’s preferred aid?"),
]:
    y = entry(label, body, margin, y, right - margin)
heading("Walk through one scenario", 297)
paragraph("In the nursing-home demo, open the comfort board, try a quick Yes or No response, then choose a family phrase. Give the team time to try each step. Ask which part fits their routine and what they would change.", margin, 282, right - margin)
heading("Accessibility resources", 194)
for label, url, pos in [
    ("U.S. Department of Justice · Effective communication", "https://www.ada.gov/resources/effective-communication/", 166),
    ("42 CFR ` 483.10 · Resident rights", "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-B/section-483.10", 139),
]:
    line(label, margin, pos, 11, blue, True)
    pdf.linkURL(url, (margin, pos - 3, right, pos + 12), relative=0)
pdf.showPage()

page(3, "Pilot worksheet", "Choose one unit, one routine and a date to review what the team learns.")
for label, y in [
    ("Facility / unit", 594), ("Pilot coordinator", 556), ("Start and review dates", 518),
    ("Routine to try", 480), ("Measure and baseline", 442), ("Target and collection method", 404),
]:
    line(label, margin, y, 11, navy, True)
    pdf.setStrokeColor(edge)
    pdf.line(margin, y - 17, right, y - 17)
heading("Illustrative pilot targets", 348)
paragraph("Set targets with the facility using its own baseline. The figures below are examples for planning.", margin, 334, right - margin)
y = 274
for label, body in [
    ("40% higher engagement", "Count opportunities when a resident expresses a choice."),
    ("30% fewer repeated requests", "Count requests that need clarification more than once."),
    ("25% less time to understand a request", "Compare median minutes between a request and staff understanding it."),
    ("50% higher family satisfaction", "Ask the same feedback question before and after the pilot."),
]:
    y = entry(label, body, margin, y, right - margin)
pdf.showPage()
pdf.save()
