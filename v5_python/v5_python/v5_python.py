import reflex as rx
from .state import State, Product, CatalogEntry
from .styles import *

def sidebar_item(label: str, icon: str, step_id: int) -> rx.Component:
    return rx.button(
        rx.hstack(
            rx.icon(tag=icon, size=18),
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
        # Logo Area
        rx.hstack(
            rx.box(
                rx.icon(tag="layers", color=primary_color, size=20),
                padding="8px",
                bg="rgba(255, 255, 255, 0.03)",
                border_radius="8px",
            ),
            rx.vstack(
                rx.text("ContentHunter", font_weight="900", font_size="1rem", line_height="1"),
                rx.text("DISMANTLER V5.2", font_size="0.55rem", color=secondary_color, letter_spacing="0.2em", font_weight="700"),
                align_items="start",
                spacing="0",
            ),
            padding_bottom="2.5rem",
            spacing="3",
        ),
        
        # Navigation
        rx.vstack(
            rx.text("PIM ENGINE", font_size="9px", color=muted_text, font_weight="900", letter_spacing="0.1em", margin_bottom="0.5rem"),
            sidebar_item("Dashboard", "layout-dashboard", 0),
            sidebar_item("Catalogazione PDF", "file-up", 1),
            sidebar_item("Asset Matcher", "table-properties", 4),
            sidebar_item("AI Editor Avanzato", "edit-3", 5),
            sidebar_item("EXPORT MASTER ERP", "database", 6),
            align_items="start",
            width="100%",
            spacing="1",
        ),
        
        rx.spacer(),
        
        # Bottom profile removed as per user request
        
        style=style_sidebar,
    )

def catalog_card(catalog: CatalogEntry) -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.box(
                rx.icon(tag="folder", color=primary_color, size=20),
                padding="10px",
                bg="rgba(255, 255, 255, 0.03)",
                border_radius="10px",
            ),
            rx.vstack(
                rx.text(catalog.name, font_weight="800", font_size="1.1rem"),
                rx.text(f"ID: {catalog.id} • {catalog.createdAt}", font_size="0.7rem", color=muted_text),
                align_items="start",
                spacing="0",
            ),
            rx.spacer(),
            rx.badge(catalog.status, variant="outline", size="1"),
            width="100%",
            spacing="4",
        ),
        rx.divider(border_color=border_color, margin_y="1rem"),
        rx.hstack(
            rx.vstack(
                rx.text("PDF", font_size="9px", color=muted_text, font_weight="900"),
                rx.text(f"{catalog.pdf_count}", font_weight="800"),
                align_items="start",
                spacing="0",
            ),
            rx.vstack(
                rx.text("PRODOTTI", font_size="9px", color=muted_text, font_weight="900"),
                rx.text(f"{catalog.product_count}", font_weight="800"),
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
            _hover={"bg": "rgba(255,255,255,0.05)", "transform": "translateY(-1px)"},
            margin_top="1.2rem",
            height="40px",
            font_size="12px",
            transition="all 0.15s ease",
        ),
        style=style_card,
        padding="1.5rem",
    )

def phase_dashboard() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.heading("Dashboard Repository", size="8", font_weight="800"),
                rx.text("Seleziona una collezione per gestire lo smontaggio AI.", color=muted_text, font_size="14px"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                rx.icon(tag="plus", size=16),
                "Nuovo Catalogo",
                bg="transparent",
                border=f"1px solid {border_color}",
                padding="0.8rem 1.5rem",
                border_radius="10px",
                on_click=State.create_catalog,
                _hover={"bg": "rgba(255,255,255,0.05)"},
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.flex(
            rx.foreach(State.catalogs, catalog_card),
            display="grid",
            grid_template_columns="repeat(auto-fill, minmax(300px, 1fr))",
            gap="24px",
            width="100%",
        ),
        width="100%",
    )

def top_bar() -> rx.Component:
    return rx.hstack(
        rx.text("INDUSTRIAL DISMANTLER ENGINE", font_size="11px", font_weight="800", opacity=0.3, letter_spacing="0.1em"),
        rx.spacer(),
        rx.button(
            "Sync Cloud",
            variant="ghost",
            size="2",
            color=muted_text,
            _hover={"color": primary_color},
            font_size="11px",
        ),
        rx.avatar(fallback="AG", size="1", bg="rgba(255,255,255,0.05)"),
        width="100%",
        padding="0.8rem 3rem",
        border_bottom=f"1px solid {border_color}",
        bg=f"rgba(10, 10, 11, 0.8)",
        backdrop_filter="blur(15px)",
        position="sticky",
        top="0",
        z_index="900",
    )

def step_card(num: int, label: str, active: bool) -> rx.Component:
    return rx.hstack(
        rx.box(
            rx.center(rx.text(num, font_weight="800"), height="100%"),
            width="28px",
            height="28px",
            border_radius="6px",
            bg=rx.cond(active, "white", "rgba(255,255,255,0.03)"),
            color=rx.cond(active, "black", muted_text),
            font_size="12px",
        ),
        rx.vstack(
            rx.text(label, font_weight="800", font_size="9px", color=rx.cond(active, "white", muted_text), letter_spacing="0.1em"),
            align_items="start",
            spacing="0",
        ),
        spacing="3",
        opacity=rx.cond(active, 1.0, 0.4),
    )

def stepper() -> rx.Component:
    return rx.center(
        rx.hstack(
            step_card(1, "SORGENTE", State.active_step == 1),
            rx.box(width="20px", height="1px", bg=border_color),
            step_card(2, "VISION", State.active_step == 2),
            rx.box(width="20px", height="1px", bg=border_color),
            step_card(3, "ESTRAZIONE", State.active_step == 3),
            bg=sidebar_bg,
            border_radius="12px",
            border=f"1px solid {border_color}",
            padding="8px 20px",
            margin_y="2rem",
        ),
    )

def phase_source() -> rx.Component:
    return rx.vstack(
        rx.center(
            rx.vstack(
                rx.heading("Caricamento Documenti", size="8", font_weight="800"),
                rx.text("Configurazione motore di analisi multimodale", color=muted_text, font_size="14px"),
                text_align="center",
                margin_bottom="3rem",
            ),
            width="100%",
        ),
        rx.upload(
            rx.vstack(
                rx.icon(tag="file-up", size=40, color=secondary_color),
                rx.text("Trascina i PDF del Catalogo", font_weight="800", font_size="1rem"),
                rx.text("Supporto multifile per lotti industriali", color=muted_text, font_size="12px"),
                align_items="center",
                spacing="2",
            ),
            id="pdf_uploader",
            multiple=True,
            on_drop=State.handle_upload(rx.upload_files(upload_id="pdf_uploader")),
            border=f"1px dashed {border_color}",
            border_radius="20px",
            padding="4rem",
            bg="rgba(255, 255, 255, 0.01)",
            _hover={"bg": "rgba(255, 255, 255, 0.02)", "border_color": secondary_color},
            width="100%",
            max_width="600px",
            margin="0 auto",
        ),
        width="100%",
    )

def phase_vision() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.text("Analisi Visuale", font_size="1.8rem", font_weight="800"),
                rx.text(f"{State.pdf_num_pages} pagine identificate.", color=secondary_color, font_weight="700", font_size="12px"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                "Esegui Analisi AI",
                on_click=State.run_dismantle,
                bg="white",
                color="black",
                padding="0.8rem 2rem",
                border_radius="10px",
                loading=State.is_extracting,
                _hover={"opacity": 0.8},
                font_weight="800",
                font_size="13px",
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.flex(
            rx.foreach(
                State.page_list,
                lambda i: rx.box(
                    rx.center(rx.text(f"PAG. {i}", font_weight="800", font_size="10px", color=muted_text)),
                    bg="rgba(255,255,255,0.02)",
                    border=f"1px solid {border_color}",
                    aspect_ratio="1 / 1.4",
                    border_radius="12px",
                    _hover={"border_color": secondary_color, "transform": "translateY(-2px)"},
                    transition="all 0.15s ease",
                )
            ),
            display="grid",
            grid_template_columns="repeat(auto-fill, minmax(160px, 1fr))",
            gap="20px",
            width="100%",
        ),
        width="100%",
    )

def product_row(product: Product) -> rx.Component:
    return rx.hstack(
        rx.box(
            width="48px", height="48px",
            bg="rgba(255,255,255,0.02)",
            border_radius="8px",
            background_image=f"url({product.image_url})",
            background_size="cover",
        ),
        rx.vstack(
            rx.text(product.sku, font_weight="800", font_size="13px"),
            rx.text(product.title, font_size="11px", color=muted_text, line_clamp="1"),
            align_items="start",
            spacing="0",
        ),
        rx.spacer(),
        rx.badge(f"PAG. {product.page}", variant="outline", size="1"),
        rx.button(rx.icon(tag="file-search", size=14), variant="ghost", color=muted_text, on_click=lambda: State.select_product(product.sku)),
        width="100%",
        padding="0.8rem",
        bg="rgba(255,255,255,0.01)",
        border_radius="12px",
        border=f"1px solid {border_color}",
        _hover={"bg": "rgba(255,255,255,0.02)", "transform": "translateX(2px)"},
        transition="all 0.15s ease",
    )

def phase_extraction() -> rx.Component:
    return rx.hstack(
        rx.vstack(
            rx.heading("Risultati AI", size="6", font_weight="800"),
            rx.vstack(rx.foreach(State.products, product_row), width="100%", spacing="2"),
            width="60%",
            spacing="4",
        ),
        rx.vstack(
            rx.box(
                rx.center(rx.text("Mapping Visuale", color=muted_text, font_size="12px")),
                style=style_card,
                height="500px",
                width="100%",
            ),
            width="40%",
        ),
        width="100%",
        align_items="start",
    )

def phase_matcher() -> rx.Component:
    return rx.vstack(
        rx.heading("Asset Matcher", size="8", font_weight="800"),
        rx.text("Confronto dati e riconciliazione listini industriali", color=muted_text, font_size="14px"),
        width="100%",
    )

def phase_editor() -> rx.Component:
    return rx.vstack(
        rx.heading("AI Editor Avanzato", size="8", font_weight="800"),
        rx.text("Editing granulare e SEO Generation", color=muted_text, font_size="14px"),
        width="100%",
    )

def phase_erp() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.heading("Sync Master ERP", size="8", font_weight="800"),
                rx.text("Esporta i records validati verso il sistema centrale", color=muted_text, font_size="14px"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                rx.icon(tag="refresh-cw", size=16),
                "Sincronizza Ora",
                bg="white",
                color="black",
                padding="0.8rem 2rem",
                border_radius="10px",
                font_weight="800",
                _hover={"opacity": 0.8},
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.box(
            rx.center(
                rx.vstack(
                    rx.icon(tag="database", size=48, color=secondary_color, opacity=0.3),
                    rx.text("Pronto per l'esportazione", font_weight="800", opacity=0.5),
                    spacing="4",
                ),
                height="300px",
            ),
            width="100%",
            style=style_card,
        ),
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
                    (6, phase_erp()),
                ),
                width="100%",
                padding="2rem 3rem",
            ),
            flex="1",
            margin_left="260px",
            min_height="100vh",
            align_items="stretch",
            spacing="0",
            bg=bg_color,
        ),
        width="100%",
        spacing="0",
        style={
            ".rx-Badge": {"display": "none !important"}, # Fallback hiding of reflex badge
            "position": "relative",
            "z_index": "0"
        }
    )

app = rx.App(
    style={
        "bg": bg_color,
        "color": text_color,
        # Force removal of reflex branding via global CSS
        "& .rx-Badge": {"display": "none !important"}
    },
    theme=rx.theme(
        appearance="dark", 
        has_background=True, 
        radius="medium", 
        accent_color="gray"
    ),
    overlay_component=None,
)
app.add_page(index, title="CONTENTHUNTER | DISMANTLER V5.2", on_load=State.get_catalogs)
