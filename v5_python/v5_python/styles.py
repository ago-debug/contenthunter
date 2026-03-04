import reflex as rx

# Colors - Pure Original Grayscale (Professional Industrial)
bg_color = "#080808"           # Sfondo quasi nero
surface_color = "#101010"      # Superficie card
sidebar_bg = "#000000"         # Sidebar nera pura
primary_color = "#FFFFFF"      # Testo bianco
secondary_color = "#666666"    # Testo grigio
muted_text = "#444444"         # Testo molto spento
border_color = "#1A1A1A"       # Bordi sottili
accent_gray = "#222222"

# Styles
style_sidebar = {
    "width": "240px",
    "height": "100vh",
    "bg": sidebar_bg,
    "border_right": f"1px solid {border_color}",
    "padding": "1.5rem 1rem",
    "position": "fixed",
    "left": "0",
    "top": "0",
    "z_index": "1000",
}

style_card = {
    "bg": surface_color,
    "border": f"1px solid {border_color}",
    "border_radius": "4px",
    "padding": "1.5rem",
}

style_button_sidemenu = {
    "width": "100%",
    "justify_content": "start",
    "padding": "0.8rem 1rem",
    "border_radius": "4px",
    "font_size": "13px",
    "font_weight": "500",
    "color": secondary_color,
    "bg": "transparent",
    "_hover": {"bg": "#111111", "color": primary_color},
    "transition": "none", # Niente animazioni pesanti, deve essere istantaneo
}

style_active_sidemenu = {
    "bg": "#111111",
    "color": primary_color,
    "border": f"1px solid {accent_gray}",
}
