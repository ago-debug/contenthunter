import reflex as rx
from .state import State, Product, CatalogEntry
from .styles import *

def sidebar_item(label: str, icon: str, step_id: int) -> rx.Component:
    return rx.button(
        rx.hstack(
            rx.icon(tag=icon, size=16),
            rx.text(label),
            spacing="3",
        ),
        on_click=lambda: State.set_step(step_id),
        style=rx.cond(
            State.active_step == step_id,
            {**style_button_sidemenu, **style_active_sidemenu},
            style_button_sidemenu,
        ),
    )

def sidebar() -> rx.Component:
    return rx.vstack(
        rx.vstack(
            rx.text("CONTENTHUNTER", font_weight="900", font_size="1rem", letter_spacing="0.1rem"),
            rx.text("DISMANTLER V5.2", font_size="0.6rem", color=secondary_color, letter_spacing="0.2rem"),
            align_items="start",
            spacing="0",
            padding_bottom="2rem",
            padding_left="0.5rem",
        ),
        rx.vstack(
            sidebar_item("Dashboard", "layout", 0),
            sidebar_item("Importazione PDF", "plus", 1),
            sidebar_item("Master PIM", "database", 6),
            sidebar_item("Asset Matcher", "link", 4),
            align_items="start",
            width="100%",
            spacing="1",
        ),
        rx.spacer(),
        style=style_sidebar,
    )

def top_bar() -> rx.Component:
    return rx.hstack(
        rx.text("INDUSTRIAL DISMANTLER ENGINE V5.5", font_size="9px", font_weight="700", opacity=0.4),
        rx.spacer(),
        rx.badge("CONNECTED", color_scheme="gray", variant="outline", font_size="9px"),
        width="100%", padding="0.8rem 2rem", border_bottom=f"1px solid {border_color}", bg=bg_color,
    )

def phase_dashboard() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.heading("Dashboard Repository", size="7", font_weight="700"),
            rx.spacer(),
            rx.button("nuovo catalogo", size="1", variant="outline", on_click=State.get_catalogs),
            width="100%",
            margin_bottom="2rem",
        ),
        rx.grid(
            rx.foreach(State.catalogs, lambda c: rx.box(
                rx.vstack(
                    rx.text(c.name, font_weight="700", font_size="14px"),
                    rx.text(f"Prodotti: {c.product_count}", font_size="12px", color=muted_text),
                    rx.button("APRI", size="1", width="100%", on_click=lambda: State.select_catalog(c.id), margin_top="0.5rem"),
                    align_items="start",
                    spacing="1",
                ),
                style=style_card,
            )),
            columns="4",
            spacing="4",
            width="100%",
        ),
        width="100%",
    )

def master_product_row(p: rx.Var[dict]) -> rx.Component:
    return rx.table.row(
        rx.table.cell(rx.text(p["sku"], font_size="12px", font_family="monospace")),
        rx.table.cell(rx.text(p["title"], font_size="12px", line_clamp="1")),
        rx.table.cell(rx.text(p["brand"], font_size="12px", color=secondary_color)),
        rx.table.cell(rx.text(f"€ {p['price']}", font_size="12px", font_weight="700")),
        rx.table.cell(
            rx.button(rx.icon(tag="edit", size=12), variant="ghost", on_click=State.open_product_editor(p["sku"])),
            text_align="right"
        ),
    )

def phase_erp() -> rx.Component:
    return rx.vstack(
        rx.heading("Master PIM Library", size="7", margin_bottom="2rem"),
        rx.table.root(
            rx.table.header(
                rx.table.row(
                    rx.table.column_header_cell("SKU"),
                    rx.table.column_header_cell("Nome"),
                    rx.table.column_header_cell("Brand"),
                    rx.table.column_header_cell("Prezzo"),
                    rx.table.column_header_cell(""),
                )
            ),
            rx.table.body(
                rx.foreach(State.master_products, master_product_row)
            ),
            width="100%",
            variant="surface",
        ),
        width="100%",
    )

def index() -> rx.Component:
    return rx.hstack(
        sidebar(),
        rx.vstack(
            top_bar(),
            rx.box(
                rx.match(
                    State.active_step,
                    (0, phase_dashboard()),
                    (6, phase_erp()),
                ),
                width="100%",
                padding="2rem",
            ),
            flex="1",
            margin_left="240px",
            min_height="100vh",
            bg=bg_color,
        ),
        width="100%",
        spacing="0",
    )

app = rx.App(
    style={
        "bg": bg_color,
        "color": "#F0F0F0",
        "font_family": "Inter, sans-serif",
        "& .rx-Badge": {"display": "none !important"},
    },
    theme=rx.theme(appearance="dark", radius="none", accent_color="gray"),
)
app.add_page(index, on_load=State.get_catalogs)
