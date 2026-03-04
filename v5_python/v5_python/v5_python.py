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
        rx.vstack(
            rx.text("NAVIGAZIONE", font_size="9px", color=muted_text, font_weight="900", letter_spacing="0.1em", margin_bottom="0.5rem"),
            sidebar_item("Dashboard Repository", "layout-dashboard", 0),
            sidebar_item("Smontaggio PDF", "file-up", 1),
            sidebar_item("Master Library PIM", "database", 6),
            sidebar_item("Asset Matcher", "table-properties", 4),
            sidebar_item("Configurazione AI", "settings-2", 5),
            align_items="start",
            width="100%",
            spacing="1",
        ),
        rx.spacer(),
        style=style_sidebar,
    )

def master_product_row(p: rx.Var[dict]) -> rx.Component:
    return rx.table.row(
        rx.table.cell(
            rx.box(
                width="40px", height="40px",
                bg="rgba(255,255,255,0.02)",
                border_radius="6px",
                background_image=f"url({p['imageUrl']})",
                background_size="cover",
            )
        ),
        rx.table.cell(rx.text(p["sku"], font_weight="800", font_family="JetBrains Mono")),
        rx.table.cell(rx.text(p["title"], font_weight="700", line_clamp="1")),
        rx.table.cell(rx.text(p["brand"], color=muted_text)),
        rx.table.cell(rx.text(p["category"], color=muted_text)),
        rx.table.cell(rx.text(f"€ {p['price']}", font_weight="800")),
        rx.table.cell(
            rx.button(
                rx.icon(tag="edit-3", size=14),
                variant="ghost",
                on_click=State.open_product_editor(p["sku"]),
                _hover={"bg": "rgba(255,255,255,0.05)"},
            ),
            text_align="right"
        ),
        _hover={"bg": "rgba(255,255,255,0.01)"},
    )

def editor_modal() -> rx.Component:
    return rx.dialog.root(
        rx.dialog.content(
            rx.vstack(
                rx.hstack(
                    rx.vstack(
                        rx.heading(f"Modifica Prodotto: {State.selected_product_details['sku']}", size="6"),
                        rx.text(State.selected_product_details['brand'], color=muted_text, font_size="12px"),
                        align_items="start",
                    ),
                    rx.spacer(),
                    rx.dialog.close(
                        rx.button(rx.icon(tag="x"), variant="ghost", on_click=State.close_editor)
                    ),
                    width="100%",
                    border_bottom=f"1px solid {border_color}",
                    padding_bottom="1.5rem",
                ),
                
                # Modal Tabs
                rx.tabs.root(
                    rx.tabs.list(
                        rx.tabs.trigger("Generale", value="info"),
                        rx.tabs.trigger("Assets & Media", value="images"),
                        rx.tabs.trigger("SEO & AI", value="seo"),
                        rx.tabs.trigger("Specifiche EAV", value="attributes"),
                    ),
                    rx.tabs.content(
                        rx.vstack(
                            rx.text("Titolo Prodotto", font_weight="700", font_size="13px"),
                            rx.input(
                                value=State.selected_product_details["translations"]["it"]["title"],
                                on_change=lambda val: State.update_product_field("translations", {"it": {"title": val}}),
                                width="100%",
                            ),
                            rx.text("Descrizione Estesa", font_weight="700", font_size="13px", margin_top="1rem"),
                            rx.text_area(
                                value=State.selected_product_details["translations"]["it"]["description"],
                                on_change=lambda val: State.update_product_field("translations", {"it": {"description": val}}),
                                width="100%",
                                height="200px",
                            ),
                            spacing="2",
                            align_items="start",
                        ),
                        value="info",
                        padding_top="1.5rem",
                    ),
                    rx.tabs.content(
                        rx.vstack(
                            rx.heading("Media Management", size="4"),
                            rx.text("Riorganizza o aggiungi immagini per questo SKU.", color=muted_text),
                            width="100%",
                            height="300px",
                            justify_content="center",
                        ),
                        value="images",
                    ),
                    rx.tabs.content(
                        rx.vstack(
                            rx.button(
                                "Rigenera con AI (Pro)",
                                on_click=State.generate_ai_description,
                                loading=State.is_generating_ai,
                                bg="white", color="black",
                            ),
                            rx.text("SEO Meta Text", font_weight="700"),
                            rx.text_area(
                                value=State.selected_product_details["translations"]["it"]["seoAiText"],
                                width="100%", height="150px",
                            ),
                            width="100%",
                        ),
                        value="seo",
                    ),
                    width="100%",
                    default_value="info",
                ),
                
                rx.hstack(
                    rx.spacer(),
                    rx.button("Annulla", variant="ghost", on_click=State.close_editor),
                    rx.button("Salva Modifiche", on_click=State.save_product_changes, bg="white", color="black"),
                    width="100%",
                    border_top=f"1px solid {border_color}",
                    padding_top="1.5rem",
                ),
                spacing="4",
            ),
            bg=surface_color,
            color=text_color,
            border=f"1px solid {border_color}",
            max_width="800px",
        ),
        open=State.is_editor_open,
    )

def phase_erp() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.heading("PIM Master Library", size="8", font_weight="800"),
                rx.text(f"Totale records validati: {State.total_master_products}", color=muted_text, font_size="14px"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                rx.icon(tag="plus", size=16),
                "Nuovo Prodotto",
                bg="white", color="black",
                padding="0.8rem 1.5rem",
                border_radius="10px",
                font_weight="800",
            ),
            width="100%",
            margin_bottom="2rem",
        ),
        
        # Filtri Guru Style
        rx.hstack(
            rx.input(
                placeholder="Cerca per SKU o Titolo...",
                on_change=lambda val: State.set_filter("search", val),
                width="400px",
                bg="rgba(255,255,255,0.02)",
                border=f"1px solid {border_color}",
                padding_left="1rem",
            ),
            rx.select(
                ["all"] + [b["name"] for b in State.available_brands],
                placeholder="Tutti i Brand",
                on_change=lambda val: State.set_filter("brand", val),
                width="200px",
                bg="rgba(255,255,255,0.02)",
                border=f"1px solid {border_color}",
            ),
            rx.select(
                ["all"] + [c["name"] for c in State.available_categories],
                placeholder="Tutte Categorie",
                on_change=lambda val: State.set_filter("category", val),
                width="200px",
                bg="rgba(255,255,255,0.02)",
                border=f"1px solid {border_color}",
            ),
            spacing="4",
            width="100%",
            margin_bottom="1.5rem",
        ),

        # Tabella Platinum
        rx.table.root(
            rx.table.header(
                rx.table.row(
                    rx.table.column_header_cell("Asset"),
                    rx.table.column_header_cell("SKU"),
                    rx.table.column_header_cell("Denominazione"),
                    rx.table.column_header_cell("Brand"),
                    rx.table.column_header_cell("Categoria"),
                    rx.table.column_header_cell("Prezzo"),
                    rx.table.column_header_cell(""),
                )
            ),
            rx.table.body(
                rx.foreach(State.master_products, master_product_row)
            ),
            width="100%",
            variant="surface",
            style=style_card,
            padding="0",
        ),
        
        width="100%",
    )

def phase_dashboard() -> rx.Component:
    return rx.vstack(
        rx.hstack(
            rx.vstack(
                rx.heading("Dashboard Repository", size="8", font_weight="800"),
                rx.text("Collezioni PDF in elaborazione Staging.", color=muted_text, font_size="14px"),
                align_items="start",
            ),
            rx.spacer(),
            rx.button(
                rx.icon(tag="folder-plus", size=16),
                "Nuovo Catalogo",
                bg="transparent",
                border=f"1px solid {border_color}",
                padding="0.8rem 1.5rem",
                border_radius="10px",
            ),
            width="100%",
            margin_bottom="3rem",
        ),
        rx.flex(
            rx.foreach(State.catalogs, lambda c: rx.box(
                rx.vstack(
                    rx.hstack(
                        rx.box(rx.icon(tag="folder", size=20), padding="10px", bg="rgba(255,255,255,0.03)", border_radius="10px"),
                        rx.vstack(
                            rx.text(c.name, font_weight="800", font_size="1.1rem"),
                            rx.text(f"{c.createdAt}", font_size="0.7rem", color=muted_text),
                            align_items="start", spacing="0",
                        ),
                        rx.spacer(),
                        rx.badge(c.status, variant="outline"),
                        width="100%",
                    ),
                    rx.divider(border_color=border_color, margin_y="1rem"),
                    rx.button("GESTISCI REPOSITORY", width="100%", on_click=lambda: State.select_catalog(c.id), bg="rgba(255,255,255,0.02)"),
                ),
                style=style_card, width="300px",
            )),
            gap="24px", wrap="wrap", width="100%",
        )
    )

def top_bar() -> rx.Component:
    return rx.hstack(
        rx.text("INDUSTRIAL DISMANTLER ENGINE V5.5", font_size="10px", font_weight="800", opacity=0.3, letter_spacing="0.1em"),
        rx.spacer(),
        rx.button("Sync Status: OK", variant="ghost", size="1", color=secondary_color),
        rx.avatar(fallback="AG", size="1", bg="rgba(255,255,255,0.05)"),
        width="100%", padding="1rem 3rem", border_bottom=f"1px solid {border_color}", bg=bg_color,
    )

def phase_source() -> rx.Component:
    return rx.vstack(
        rx.heading("Caricamento Cataloghi", size="8", margin_bottom="2rem"),
        rx.upload(
            rx.vstack(
                rx.icon(tag="upload-cloud", size=40, color=secondary_color),
                rx.text("Upload PDF Source", font_weight="800"),
                align_items="center",
            ),
            border=f"1px dashed {border_color}",
            padding="4rem", width="100%", max_width="600px", border_radius="20px",
        )
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
                    (1, phase_source()),
                    (6, phase_erp()), # PIM Master
                ),
                width="100%",
                padding="3rem",
            ),
            editor_modal(),
            flex="1",
            margin_left="260px",
            min_height="100vh",
            bg=bg_color,
        ),
        width="100%",
        spacing="0",
    )

app = rx.App(
    style={"bg": bg_color, "color": text_color, "& .rx-Badge": {"display": "none !important"}},
    overlay_component=None,
)
app.add_page(index, title="CONTENTHUNTER PIM V5.5", on_load=State.get_catalogs)
