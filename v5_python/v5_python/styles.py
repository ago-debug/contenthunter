import reflex as rx

# Colors
bg_color = "#0F172A"
surface_color = "#1E293B"
primary_color = "#F97316"
secondary_color = "#38BDF8"
text_color = "#F8FAFC"
muted_text = "rgba(255, 255, 255, 0.4)"

# Styles
style_mission_control = {
    "bg": bg_color,
    "min_height": "100vh",
    "color": text_color,
    "font_family": "Inter, sans-serif",
}

style_card = {
    "bg": surface_color,
    "border": "1px solid rgba(255, 255, 255, 0.05)",
    "border_radius": "32px",
    "box_shadow": "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    "padding": "2rem",
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
