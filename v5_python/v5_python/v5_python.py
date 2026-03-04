import reflex as rx
from .state import State, Product, CatalogEntry
from .styles import *

def header() -> rx.Component:
    return rx.hstack(
        rx.hstack(
            rx.box(
                rx.icon(tag="layers", color=primary_color, size=24),
                padding="10px",
                bg="rgba(249, 115, 22, 0.1)",
                border_radius="12px",
            ),
            rx.vstack(
                rx.text("ContentHunter", font_weight="900", font_size="1.2rem", line_height="1", letter_spacing="-0.02em"),
                rx.text("DISMANTLER X1 V5 (PYTHON POWERED)", font_size="0.6rem", color=primary_color, letter_spacing="0.25em", font_weight="900"),
                align_items="start",
                spacing="0",
            ),
            rx.button(
                rx.icon(tag="layout-dashboard", size=16),
                "DASHBOARD",
                variant="ghost",
                on_click=State.back_to_dashboard,
                font_size="10px",
                letter_spacing="0.1em",
                color=muted_text,
                _hover={"color": primary_color, "bg": "transparent"},
            ),
            spacing="4",
        ),
        rx.spacer(),
        rx.hstack(
            rx.button(
                "Export to Master ERP",
                bg=primary_color,
                color="white",
                font_weight="900",
                font_size="10px",
                text_transform="uppercase",
                letter_spacing="0.1em",
                padding="12px 24px",
                border_radius="12px",
                _hover={"transform": "translateY(-2px)", "box_shadow": f"0 10px 20px {primary_color}33"},
                transition="all 0.4s ease",
            ),
            rx.avatar(fallback="AU", size="2", border=f"1px solid {primary_color}44", bg=surface_color),
            spacing="6",
        ),
        width="100%",
        padding="2rem 4rem",
        bg=f"rgba(15, 23, 42, 0.85)",
        backdrop_filter="blur(20px)",
        border_bottom="1px solid rgba(255,255,255,0.03)",
        position="sticky",
        top="0",
        z_index="100",
    )

def step_card(num: int, label: str, active: bool) -> rx.Component:
    return rx.hstack(
        rx.box(
            rx.center(rx.text(num, font_weight="900"), height="100%"),
            width="36px",
            height="36px",
            border_radius="50%",
            bg=rx.cond(active, primary_color, rx.cond(State.active_step > num, "#10B981", surface_color)),
            color="white",
            border=rx.cond(active, "none", "1px solid rgba(255,255,255,0.1)"),
        ),
        rx.vstack(
            rx.text(label, font_weight="900", font_size="11px", color=rx.cond(active, "white", muted_text), letter_spacing="0.1em"),
            align_items="start",
            spacing="0",
        ),
        spacing="4",
        padding="1rem 2rem",
        opacity=rx.cond(active, 1.0, 0.5),
        transition="all 0.5s ease",
    )

def stepper() -> rx.Component:
    return rx.center(
        rx.hstack(
            step_card(1, "ORCHESTRAZIONE", State.active_step == 1),
            rx.box(width="40px", height="1px", bg="rgba(255,255,255,0.05)"),
            step_card(2, "VISION & DISCOVERY", State.active_step == 2),
            rx.box(width="40px", height="1px", bg="rgba(255,255,255,0.05)"),
            step_card(3, "AI EXTRACTION", State.active_step == 3),
            bg=surface_color,
            border_radius="32px",
            border="1px solid rgba(255,255,255,0.05)",
            padding="4px",
            margin="2rem auto",
        ),
    )

def phase_source() -> rx.Component:
    return rx.vstack(
        rx.vstack(
            rx.heading("Inizie lo Smontaggio", font_size="2.5rem", font_weight="900", letter_spacing="-0.03em"),
            rx.text("Il motore Python V5 è pronto per l'analisi multimodale.", color=muted_text, font_size="1.1rem"),
            text_align="center",
            spacing="4",
            margin_bottom="3rem",
        ),
        rx.upload(
            rx.vstack(
                rx.icon(tag="upload", size=48, color=primary_color),
                rx.text("Trascina qui il tuo catalogo PDF", font_weight="900", font_size="1.2rem", margin_top="1rem"),
                rx.text("Supportiamo file PDF multi-pagina (MAX 100MB)", color=muted_text, font_size="0.8rem"),
                rx.button(
                    "Sfoglia Computer", 
                    bg="rgba(255,255,255,0.03)", 
                    border=f"1px solid {primary_color}44", 
                    color=primary_color,
                    padding="12px 32px",
                    border_radius="12px",
                    margin_top="1rem",
                ),
                align_items="center",
                spacing="2",
            ),
            id="pdf_uploader",
            multiple=True,
            accept={
                "application/pdf": [".pdf"],
            },
            max_files=5,
            padding="6rem",
            on_drop=State.handle_upload(rx.upload_files(upload_id="pdf_uploader")),
            border=f"2px dashed rgba(249, 115, 22, 0.2)",
            border_radius="48px",
            _hover={"bg": "rgba(249, 115, 22, 0.02)", "border_color": primary_color},
            transition="all 0.4s ease",
            width="100%",
            max_width="800px",
        ),
        width="100%",
        align_items="center",
        padding_top="4rem",
        spacing="6",
    )

def phase_vision() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.text("Analisi Visuale", font_size="2rem", font_weight="900", letter_spacing="-0.01em"),
                rx.text(f"{State.pdf_num_pages} pagine identificate.", color=primary_color, font_weight="900", font_size="0.7rem", letter_spacing="0.1em"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                "Inizia Smontaggio AI",
                on_click=State.run_dismantle,
                bg=primary_color,
                padding="1rem 3rem",
                border_radius="16px",
                font_weight="900",
                text_transform="uppercase",
                loading=State.is_extracting,
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.flex(
            # PDF Thumbnail Grid in Python
            rx.foreach(
                State.page_list,
                lambda i: rx.box(
                    rx.center(
                        rx.text(f"PAG. {i}", font_weight="900", font_size="10px", color=muted_text),
                        height="100%",
                    ),
                    bg="rgba(255,255,255,0.02)",
                    border="1px solid rgba(255,255,255,0.05)",
                    aspect_ratio="1 / 1.4",
                    border_radius="20px",
                    _hover={"border_color": primary_color, "transform": "translateY(-4px)"},
                    transition="all 0.3s ease",
                    cursor="pointer",
                )
            ),
            display="grid",
            grid_template_columns="repeat(auto-fill, minmax(180px, 1fr))",
            gap="24px",
            width="100%",
        ),
        width="100%",
        spacing="6",
    )

def product_row(product: Product) -> rx.Component:
    return rx.hstack(
        rx.box(
            width="64px",
            height="64px",
            bg="rgba(255,255,255,0.02)",
            border_radius="14px",
            border="1px solid rgba(255,255,255,0.05)",
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
        rx.text(f"€ {product.price}", font_weight="900", font_size="14px", color=primary_color),
        rx.box(width="40px"),
        rx.badge(f"PAG. {product.page}", color_scheme="orange", variant="soft", padding="4px 12px", border_radius="8px"),
        rx.button(
            rx.icon(tag="file-search"),
            bg="transparent",
            color=muted_text,
            _hover={"color": primary_color, "bg": "rgba(255,255,255,0.05)"},
            on_click=lambda: State.select_product(product.sku),
        ),
        width="100%",
        padding="1rem 2rem",
        bg="rgba(255,255,255,0.01)",
        border_radius="24px",
        border="1px solid rgba(255,255,255,0.03)",
        _hover={"bg": "rgba(255,255,255,0.03)", "border_color": "rgba(255,255,255,0.1)", "transform": "translateX(10px)"},
        transition="all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    )

def phase_extraction() -> rx.Component:
    return rx.hstack(
        # Left: Product List
        rx.vstack(
            rx.hstack(
                rx.vstack(
                    rx.text("Risultati Estrazione", font_size="2rem", font_weight="900"),
                    rx.text(f"{State.total_products_found} prodotti rilevati da Gemini 1.5 Pro.", color=primary_color, font_weight="900", font_size="0.7rem", letter_spacing="0.1em"),
                    align_items="start",
                ),
                rx.spacer(),
                rx.button(
                    "Sync with ERP",
                    bg="#10B981",
                    padding="1rem 3rem",
                    border_radius="16px",
                    font_weight="900",
                    text_transform="uppercase",
                    box_shadow="0 20px 40px rgba(16, 185, 129, 0.2)",
                ),
                width="100%",
                margin_bottom="3rem",
            ),
            rx.vstack(
                rx.foreach(State.products, product_row),
                width="100%",
                spacing="3",
            ),
            width="60%",
            padding_right="4rem",
            border_right="1px solid rgba(255,255,255,0.03)",
            spacing="6",
        ),
        # Right: Visual Verification Pane
        rx.vstack(
            rx.box(
                rx.vstack(
                    rx.hstack(
                        rx.icon(tag="scan-search", color=primary_color),
                        rx.text("VISUAL VERIFICATION", font_weight="900", font_size="10px", letter_spacing="0.2em"),
                        spacing="3",
                    ),
                    rx.divider(border_color="rgba(255,255,255,0.05)"),
                    rx.center(
                        rx.vstack(
                            rx.icon(tag="file-type-2", size=64, color="rgba(255,255,255,0.05)"),
                            rx.text("Seleziona un prodotto per vedere il mapping PDF", color=muted_text, font_size="0.8rem"),
                            spacing="4",
                        ),
                        height="500px",
                    ),
                    spacing="6",
                    width="100%",
                ),
                style=style_card,
                height="700px",
                width="100%",
            ),
            width="40%",
            spacing="6",
        ),
        width="100%",
        align_items="start",
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
                rx.text(f"Creato il: {catalog.createdAt}", font_size="0.7rem", color=muted_text),
                align_items="start",
                spacing="0",
            ),
            rx.spacer(),
            rx.badge(catalog.status, color_scheme="orange", variant="soft"),
            width="100%",
            spacing="4",
        ),
        rx.divider(border_color="rgba(255,255,255,0.03)"),
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
            bg="rgba(255,255,255,0.03)",
            border="1px solid rgba(255,255,255,0.05)",
            _hover={"bg": primary_color, "color": "white", "border_color": primary_color},
            margin_top="1rem",
        ),
        style=style_card,
        padding="2rem",
        transition="all 0.3s ease",
        _hover={"transform": "translateY(-5px)", "border_color": f"{primary_color}44"},
    )

def phase_dashboard() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.heading("I Tuoi Cataloghi", font_size="2.5rem", font_weight="900"),
                rx.text("Seleziona un catalogo per iniziare lo smontaggio o l'analisi.", color=muted_text),
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
            margin_bottom="4rem",
        ),
        rx.flex(
            rx.foreach(State.catalogs, catalog_card),
            display="grid",
            grid_template_columns="repeat(auto-fill, minmax(320px, 1fr))",
            gap="32px",
            width="100%",
        ),
        width="100%",
    )

def index() -> rx.Component:
    return rx.box(
        header(),
        rx.vstack(
            rx.cond(
                State.active_step > 0,
                stepper(),
                rx.spacer()
            ),
            rx.box(
                rx.match(
                    State.active_step,
                    (0, phase_dashboard()),
                    (1, phase_source()),
                    (2, phase_vision()),
                    (3, phase_extraction()),
                ),
                width="100%",
                padding="0 4rem 4rem 4rem",
            ),
            width="100%",
            max_width="1400px",
            margin="0 auto",
            spacing="6",
        ),
        style=style_mission_control,
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
)
app.add_page(index, title="DISMANTLER X1 V5", on_load=State.get_catalogs)
