# Cursive Fonts in Abundance

This document showcases the cursive/script style fonts available in Abundance for the Text atom.

## Available Cursive Fonts

### 1. AGUAFINA (Original)
- **Font Name:** Aguafina Script
- **Style:** Elegant, flowing script
- **URL:** `https://fonts.gstatic.com/s/aguafinascript/v5/65g7cgMtMGnNlNyq_Z6CvMxLhO8OSNnfAp53LK1_iRs.ttf`
- **Use Case:** Elegant text, invitations, decorative titles

### 2. KAUSHAN_SCRIPT (NEW)
- **Font Name:** Kaushan Script
- **Style:** Bold, lively script with personality
- **URL:** `https://fonts.gstatic.com/s/kaushanscript/v14/vm8vdRfvXFLG3OLnsO15WYS5DF7_ytN3M48a.ttf`
- **Use Case:** Bold headings, energetic designs, creative branding

### 3. PACIFICO (NEW)
- **Font Name:** Pacifico
- **Style:** Surf-inspired brush script
- **URL:** `https://fonts.gstatic.com/s/pacifico/v22/FwZY7-Qmy14u9lezJ96A4sijpFu_.ttf`
- **Use Case:** Retro surf style, beach themes, casual branding

### 4. GREAT_VIBES (NEW)
- **Font Name:** Great Vibes
- **Style:** Elegant, formal script with flourishes
- **URL:** `https://fonts.gstatic.com/s/greatvibes/v15/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf`
- **Use Case:** Formal invitations, elegant branding, sophisticated designs

## How to Use

1. In Abundance, add a **Text** atom to your design
2. In the atom's properties panel, find the **Font Family** dropdown
3. Select one of the cursive fonts:
   - AGUAFINA
   - KAUSHAN_SCRIPT
   - PACIFICO
   - GREAT_VIBES
4. Adjust the font size and text as needed
5. The text will render in 3D with the selected cursive font

## Technical Details

- All fonts are loaded from Google Fonts CDN
- Fonts are loaded on-demand when selected in the Text atom
- Font rendering is handled by the replicad CAD library
- Fonts work in both 2D sketches and can be extruded to 3D

## Example Text

Here's how "Abundance" would look in each font:

```
AGUAFINA:        𝒜𝒷𝓊𝓃𝒹𝒶𝓃𝒸ℯ (elegant, flowing)
KAUSHAN_SCRIPT:  Abundance (bold, energetic)
PACIFICO:        Abundance (bold, surf-style)
GREAT_VIBES:     𝒜𝒷𝓊𝓃𝒹𝒶𝓃𝒸𝑒 (formal, flourished)
```

## Testing

A comprehensive test suite has been added in `tests/fonts.test.js` to ensure:
- All 4 cursive fonts are available
- Font URLs are valid Google Fonts URLs
- Backward compatibility with existing fonts
- Proper font file format (.ttf)
