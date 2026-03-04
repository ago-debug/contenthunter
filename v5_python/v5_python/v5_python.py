import reflex as rx
from .state import State, Product, CatalogEntry
from .styles import *

def sidebar_item(label: str, icon: str, step_id: int) -> rx.Component:
    is_active = State.active_step == step_id
    return rx.button(
        rx.hstack(
            rx.icon(tag=icon, size=18),
            rx.text(label),
            spacing="3",
        ),
        on_click=lambda: State.set_step(step_id),
        style=style_button_sidemenu,
        **(style_active_sidemenu if is_active else {}),
    )

def sidebar() -> rx.Component:
    return rx.vstack(
        # Logo Area
        rx.hstack(
            rx.box(
                rx.icon(tag="layers", color=primary_color, size=22),
                padding="10px",
                bg="rgba(249, 115, 22, 0.1)",
                border_radius="12px",
            ),
            rx.vstack(
                rx.text("ContentHunter", font_weight="900", font_size="1rem", line_height="1"),
                rx.text("DISMANTLER V5.2", font_size="0.55rem", color=primary_color, letter_spacing="0.2em", font_weight="900"),
                align_items="start",
                spacing="0",
            ),
            padding_bottom="3rem",
            spacing="3",
        ),
        
        # Navigation
        rx.vstack(
            rx.text("MAIN MENU", font_size="10px", color=muted_text, font_weight="900", letter_spacing="0.1em", margin_bottom="0.5rem"),
            sidebar_item("Dashboard", "layout-dashboard", 0),
            sidebar_item("Catalogazione PDF", "file-up", 1),
            sidebar_item("Asset Matcher", "table-properties", 4),
            sidebar_item("AI Editor Avanzato", "edit-3", 5),
            align_items="start",
            width="100%",
            spacing="1",
        ),
        
        rx.spacer(),
        
        # Bottom profile
        rx.hstack(
            rx.avatar(fallback="AG", size="2", bg=surface_color, border=f"1px solid {border_color}"),
            rx.vstack(
                rx.text("Augusto G.", font_size="12px", font_weight="700"),
                rx.hstack(
                    rx.box(width="6px", height="6px", bg="#10B981", border_radius="50%"),
                    rx.text("AI Engine Online", font_size="10px", color="#10B981"),
                    spacing="2",
                ),
                align_items="start",
                spacing="0",
            ),
            spacing="3",
            padding_top="2rem",
            border_top=f"1px solid {border_color}",
            width="100%",
        ),
        
        style=style_sidebar,
    )

def catalog_card(catalog: CatalogEntry) -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.box(
                rx.icon(tag="folder", color=primary_color, size=24),
                padding="12px",
                bg="rgba(249, 115, 22, 0.1)",
                border_radius="12px",
            ),
            rx.vstack(
                rx.text(catalog.name, font_weight="900", font_size="1.1rem"),
                rx.text(f"ID: {catalog.id} • {catalog.createdAt}", font_size="0.7rem", color=muted_text),
                align_items="start",
                spacing="0",
            ),
            rx.spacer(),
            rx.badge(catalog.status, color_scheme="orange", variant="surface"),
            width="100%",
            spacing="4",
        ),
        rx.divider(border_color=border_color, margin_y="1rem"),
        rx.hstack(
            rx.vstack(
                rx.text("PDF", font_size="10px", color=muted_text, font_weight="900"),
                rx.text(f"{catalog.pdf_count}", font_weight="900"),
                align_items="start",
                spacing="0",
            ),
            rx.vstack(
                rx.text("PRODOTTI", font_size="10px", color=muted_text, font_weight="900"),
                rx.text(f"{catalog.product_count}", font_weight="900"),
                align_items="start",
                spacing="0",
            ),
            spacing="8",
            width="100%",
        ),
        rx.button(
            "Apri Repository",
            on_click=State.select_catalog(catalog.id),
            width="100%",
            bg="rgba(255,255,255,0.02)",
            border=f"1px solid {border_color}",
            _hover={"bg": primary_color, "color": "white", "transform": "translateY(-2px)"},
            margin_top="1.5rem",
            height="45px",
            transition="all 0.2s ease",
        ),
        style=style_card,
        padding="1.5rem",
    )

def phase_dashboard() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.heading("Dashboard Repository", size="8", font_weight="900"),
                rx.text("Seleziona una collezione per gestire lo smontaggio AI.", color=muted_text),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                rx.icon(tag="plus", size=18),
                "Nuovo Catalogo",
                bg=primary_color,
                padding="1rem 2rem",
                border_radius="14px",
                on_click=State.create_catalog,
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.flex(
            rx.foreach(State.catalogs, catalog_card),
            display="grid",
            grid_template_columns="repeat(auto-fill, minmax(320px, 1fr))",
            gap="24px",
            width="100%",
        ),
        width="100%",
    )

def top_bar() -> rx.Component:
    return rx.hstack(
        rx.text("Industrial Dismantler X1", font_size="12px", font_weight="900", opacity=0.3),
        rx.spacer(),
        rx.button(
            "Sync Cloud",
            variant="ghost",
            size="2",
            color=muted_text,
            _hover={"color": primary_color},
        ),
        rx.avatar(fallback="AG", size="1"),
        width="100%",
        padding="1rem 3rem",
        border_bottom=f"1px solid {border_color}",
        bg=f"rgba(11, 15, 26, 0.8)",
        backdrop_filter="blur(10px)",
        position="sticky",
        top="0",
        z_index="900",
    )

def step_card(num: int, label: str, active: bool) -> rx.Component:
    return rx.hstack(
        rx.box(
            rx.center(rx.text(num, font_weight="900"), height="100%"),
            width="32px",
            height="32px",
            border_radius="10px",
            bg=rx.cond(active, primary_color, rx.cond(State.active_step > num, "#10B981", "rgba(255,255,255,0.03)")),
            color="white",
        ),
        rx.vstack(
            rx.text(label, font_weight="900", font_size="10px", color=rx.cond(active, "white", muted_text), letter_spacing="0.1em"),
            align_items="start",
            spacing="0",
        ),
        spacing="3",
        opacity=rx.cond(active, 1.0, 0.5),
    )

def stepper() -> rx.Component:
    return rx.center(
        rx.hstack(
            step_card(1, "SORGENTE", State.active_step == 1),
            rx.box(width="30px", height="1px", bg=border_color),
            step_card(2, "VISION", State.active_step == 2),
            rx.box(width="30px", height="1px", bg=border_color),
            step_card(3, "ESTRAZIONE", State.active_step == 3),
            bg=sidebar_bg,
            border_radius="20px",
            border=f"1px solid {border_color}",
            padding="12px 24px",
            margin_y="2rem",
        ),
    )

def phase_source() -> rx.Component:
    return rx.vstack(
        rx.center(
            rx.vstack(
                rx.heading("Caricamento Documenti", size="8", font_weight="900"),
                rx.text("Configurazione motore di analisi multimodale", color=muted_text),
                text_align="center",
                margin_bottom="3rem",
            ),
            width="100%",
        ),
        rx.upload(
            rx.vstack(
                rx.icon(tag="file-up", size=48, color=primary_color),
                rx.text("Area di Caricamento PDF", font_weight="900", font_size="1.2rem"),
                rx.text("Seleziona i file per il catalogo scelto", color=muted_text),
                align_items="center",
                spacing="3",
            ),
            id="pdf_uploader",
            multiple=True,
            on_drop=State.handle_upload(rx.upload_files(upload_id="pdf_uploader")),
            border=f"1px dashed {primary_color}44",
            border_radius="32px",
            padding="6rem",
            bg="rgba(249, 115, 22, 0.01)",
            _hover={"bg": "rgba(249, 115, 22, 0.03)", "border_color": primary_color},
            width="100%",
            max_width="700px",
            margin="0 auto",
        ),
        width="100%",
    )

def phase_vision() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.text("Analisi Visuale", font_size="2rem", font_weight="900"),
                rx.text(f"{State.pdf_num_pages} pagine identificate.", color=primary_color, font_weight="900", font_size="0.7rem"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                "Inizia Smontaggio AI",
                on_click=State.run_dismantle,
                bg=primary_color,
                padding="1rem 3rem",
                loading=State.is_extracting,
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.flex(
            rx.foreach(
                State.page_list,
                lambda i: rx.box(
                    rx.center(rx.text(f"PAG. {i}", font_weight="900", font_size="10px", color=muted_text)),
                    bg="rgba(255,255,255,0.02)",
                    border=f"1px solid {border_color}",
                    aspect_ratio="1 / 1.4",
                    border_radius="16px",
                    _hover={"border_color": primary_color, "transform": "translateY(-4px)"},
                )
            ),
            display="grid",
            grid_template_columns="repeat(auto-fill, minmax(180px, 1fr))",
            gap="24px",
            width="100%",
        ),
        width="100%",
    )

def product_row(product: Product) -> rx.Component:
    return rx.hstack(
        rx.box(
            width="56px", height="56px",
            bg="rgba(255,255,255,0.02)",
            border_radius="12px",
            background_image=f"url({product.image_url})",
            background_size="cover",
        ),
        rx.vstack(
            rx.text(product.sku, font_weight="900", font_size="14px"),
            rx.text(product.title, font_size="12px", color=muted_text),
            align_items="start",
            spacing="0",
        ),
        rx.spacer(),
        rx.badge(f"PAG. {product.page}", variant="outline"),
        rx.button(rx.icon(tag="file-search"), variant="ghost", color=muted_text, on_click=lambda: State.select_product(product.sku)),
        width="100%",
        padding="1rem",
        bg="rgba(255,255,255,0.01)",
        border_radius="16px",
        border=f"1px solid {border_color}",
        _hover={"bg": "rgba(255,255,255,0.03)", "transform": "translateX(5px)"},
    )

def phase_extraction() -> rx.Component:
    return rx.hstack(
        rx.vstack(
            rx.heading("Risultati AI", size="7"),
            rx.vstack(rx.foreach(State.products, product_row), width="100%", spacing="2"),
            width="60%",
            spacing="4",
        ),
        rx.vstack(
            rx.box(
                rx.center(rx.text("Mapping Visuale", color=muted_text)),
                style=style_card,
                height="600px",
                width="100%",
            ),
            width="40%",
        ),
        width="100%",
        align_items="start",
    )

def phase_matcher() -> rx.Component:
    return rx.vstack(
        rx.heading("Asset Matcher", size="8"),
        rx.text("Confronto dati e riconciliazione listini (In fase di sviluppo)", color=muted_text),
        width="100%",
    )

def phase_editor() -> rx.Component:
    return rx.vstack(
        rx.heading("AI Editor Avanzato", size="8"),
        rx.text("Editing granulare e SEO Generation (In fase di sviluppo)", color=muted_text),
        width="100%",
    )

def index() -> rx.Component:
    return rx.hstack(
        sidebar(),
        rx.vstack(
            top_bar(),
            rx.box(
                rx.cond(
                    (State.active_step > 0) & (State.active_step < 4),
                    stepper(),
                ),
                rx.match(
                    State.active_step,
                    (0, phase_dashboard()),
                    (1, phase_source()),
                    (2, phase_vision()),
                    (3, phase_extraction()),
                    (4, phase_matcher()),
                    (5, phase_editor()),
                ),
                width="100%",
                padding="3rem 4rem",
            ),
            flex="1",
            margin_left="280px",
            min_height="100vh",
            align_items="stretch",
            spacing="0",
            bg=bg_color,
        ),
        width="100%",
        spacing="0",
    )

app = rx.App(
    style={
        "bg": bg_color,
        "color": text_color,
    },
    theme=rx.theme(
        appearance="dark", 
        has_background=True, 
        radius="large", 
        accent_color="orange"
    ),
    overlay_component=None,
)
app.add_page(index, title="CONTENTHUNTER | DISMANTLER V5.2", on_load=State.get_catalogs)
