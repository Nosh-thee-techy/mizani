"""Generate a sample multipage PDF invoice document for batch ingestion testing."""

import sys
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

def generate_test_invoice_pdf(output_path: str):
    c = canvas.Canvas(output_path, pagesize=letter)
    
    # ── PAGE 1: Maisha Supermarket ────────────────────────────
    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, 750, "INVOICE")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 700, "FROM: Mizani Wholesalers Ltd")
    c.drawString(50, 680, "TO: Maisha Supermarket")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, 650, "Invoice Date: 2026-07-20")
    c.drawString(50, 630, "Due Date: 2026-07-27")
    c.drawString(50, 610, "Status: Unpaid")
    
    # Draw table outline
    c.rect(50, 450, 500, 120, stroke=1, fill=0)
    c.drawString(60, 550, "ITEM")
    c.drawString(300, 550, "QTY")
    c.drawString(450, 550, "AMOUNT")
    
    c.drawString(60, 520, "Premium Maize Flour (Cartons)")
    c.drawString(300, 520, "20")
    c.drawString(450, 520, "KES 30,000")
    
    c.drawString(60, 490, "Cooking Oil 3L (Cartons)")
    c.drawString(300, 490, "12")
    c.drawString(450, 490, "KES 18,000")
    
    # Total
    c.setFont("Helvetica-Bold", 14)
    c.drawString(350, 400, "TOTAL AMOUNT: KES 48,000")
    
    c.setFont("Helvetica", 8)
    c.drawString(50, 50, "Page 1 of 2 — Mizani Bookkeeping Systems")
    
    # Show page
    c.showPage()
    
    # ── PAGE 2: Kariuki Agrovet ───────────────────────────────
    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, 750, "INVOICE")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 700, "FROM: Mizani Wholesalers Ltd")
    c.drawString(50, 680, "TO: Kariuki Agrovet")
    
    c.setFont("Helvetica", 10)
    c.drawString(50, 650, "Invoice Date: 2026-07-21")
    c.drawString(50, 630, "Due Date: 2026-07-28")
    c.drawString(50, 610, "Status: Unpaid")
    
    # Draw table outline
    c.rect(50, 450, 500, 120, stroke=1, fill=0)
    c.drawString(60, 550, "ITEM")
    c.drawString(300, 550, "QTY")
    c.drawString(450, 550, "AMOUNT")
    
    c.drawString(60, 520, "Animal Feed Bags (50kg)")
    c.drawString(300, 520, "50")
    c.drawString(450, 520, "KES 25,000")
    
    c.drawString(60, 490, "Crop Fertilizer (50kg)")
    c.drawString(300, 490, "7")
    c.drawString(450, 490, "KES 10,500")
    
    # Total
    c.setFont("Helvetica-Bold", 14)
    c.drawString(350, 400, "TOTAL AMOUNT: KES 35,500")
    
    c.setFont("Helvetica", 8)
    c.drawString(50, 50, "Page 2 of 2 — Mizani Bookkeeping Systems")
    
    # Save the PDF file
    c.save()
    print(f"Generated sample multipage invoice PDF at: {output_path}")

if __name__ == "__main__":
    path = "sample_data/batch_invoices.pdf"
    if len(sys.argv) > 1:
        path = sys.argv[1]
    generate_test_invoice_pdf(path)
