import reflex as rx

# Colors
bg_color = "#0B0F1A"
surface_color = "#161B2E"
sidebar_bg = "#111625"
primary_color = "#F97316"
secondary_color = "#38BDF8"
text_color = "#F8FAFC"
muted_text = "rgba(255, 255, 255, 0.4)"
border_color = "rgba(255, 255, 255, 0.05)"

# Styles
style_mission_control = {
    "bg": bg_color,
    "min_height": "100vh",
    "color": text_color,
    "font_family": "Inter, sans-serif",
}

style_sidebar = {
    "width": "280px",
    "height": "100vh",
    "bg": sidebar_bg,
    "border_right": f"1px solid {border_color}",
    "padding": "2rem 1.5rem",
    "position": "fixed",
    "left": "0",
    "top": "0",
    "z_index": "1000",
}

style_card = {
    "bg": surface_color,
    "border": f"1px solid {border_color}",
    "border_radius": "24px",
    "box_shadow": "0 20px 40px -12px rgba(0, 0, 0, 0.6)",
    "padding": "2rem",
}

style_button_sidemenu = {
    "width": "100%",
    "justify_content": "start",
    "padding": "1.2rem 1.5rem",
    "border_radius": "14px",
    "font_size": "13px",
    "font_weight": "600",
    "color": muted_text,
    "bg": "transparent",
    "_hover": {"bg": "rgba(249, 115, 22, 0.05)", "color": primary_color},
    "transition": "all 0.2s ease",
}

style_active_sidemenu = {
    "bg": "rgba(249, 115, 22, 0.1)",
    "color": primary_color,
    "border": f"1px solid {primary_color}33",
}

style_button = {
    "bg": primary_color,
    "color": "white",
    "font_weight": "900",
    "text_transform": "uppercase",
    "letter_spacing": "0.15em",
    "padding": "1.5rem 3rem",
    "border_radius": "16px",
    "_hover": {"transform": "scale(1.02)", "bg": "#EA580C"},
    "transition": "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
}

style_stat_box = {
    "bg": "rgba(255, 255, 255, 0.02)",
    "border": "1px solid rgba(255, 255, 255, 0.05)",
    "border_radius": "20px",
    "padding": "1.5rem",
    "text_align": "center",
}
