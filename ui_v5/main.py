from nicegui import ui
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

# CONFIGURAZIONE
BACKEND_URL = os.getenv("API_URL", "http://backend:8000")
TITLE = "CONTENTHUNTER PIM | ENTERPRISE"

# STILI TEMA (Bitrix24 Inspired)
def setup_styles():
    ui.colors(primary='#212121', secondary='#757575', accent='#3B82F6', dark='#1D1D1D')
    ui.query('body').style('background-color: #F4F7F9; color: #333333; font-family: "Inter", sans-serif;')
    ui.add_head_html('''
        <style>
            .sidebar-item { border-radius: 12px !important; margin: 4px 0; transition: all 0.2s; font-weight: 700 !important; }
            .sidebar-item:hover { background-color: white !important; color: #3B82F6 !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .sidebar-item.active { background-color: white !important; color: #000 !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08); border: 1px solid #E2E8F0; }
            .q-drawer { background: #EEF2F7 !important; border-right: 1px solid #DFE5ED !important; }
            .group-label { font-size: 10px; font-weight: 800; color: #94A3B8; letter-spacing: 0.15em; padding: 24px 12px 10px 12px; }
            .main-card { border-radius: 20px; border: 1px solid #E2E8F0; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.03); overflow: hidden; }
            .product-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; border: 1px solid #E2E8F0; }
            .product-card:hover { transform: translateY(-4px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border-color: #3B82F6; }
            .badge-red { background: #FF5752; color: white; border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 900; }
            .tab-active { color: #3B82F6 !important; border-bottom: 3px solid #3B82F6 !important; font-weight: 900 !important; }
            .q-table__card { box-shadow: none !important; border: 1px solid #E2E8F0 !important; border-radius: 16px !important; }
            .q-table th { font-weight: 800 !important; color: #94A3B8 !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 0.05em !important; }
        </style>
    ''')

class PIMApp:
    def __init__(self):
        self.active_page = 'dashboard'
        self.data = []
        self.loading = False
        self.selected_product = None
        self.product_detail_loading = False

    async def navigate_to(self, page_name: str):
        self.active_page = page_name
        self.loading = True
        self.selected_product = None # Reset selection
        sidebar_area.refresh()
        content_area.refresh()
        
        endpoint_map = {
            'dashboard': '/api/v5/repositories',
            'products': '/api/v5/products',
            'brands': '/api/v5/brands',
            'categories': '/api/v5/categories',
        }
        
        endpoint = endpoint_map.get(page_name)
        if endpoint:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{BACKEND_URL}{endpoint}", timeout=10)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        self.data = raw_data.get('products', raw_data) if page_name == 'products' else raw_data
            except Exception as e:
                ui.notify(f"Errore DB: {str(e)}", type='negative')
                self.data = []
        
        self.loading = False
        content_area.refresh()

    async def open_product_detail(self, sku: str):
        self.product_detail_loading = True
        product_modal.open()
        modal_content.refresh()
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{BACKEND_URL}/api/v5/products/{sku}", timeout=10)
                if resp.status_code == 200:
                    self.selected_product = resp.json()
                else:
                    ui.notify("Prodotto non trovato", type='negative')
                    product_modal.close()
        except Exception as e:
            ui.notify(f"Errore: {str(e)}", type='negative')
            product_modal.close()
            
        self.product_detail_loading = False
        modal_content.refresh()

app_logic = PIMApp()

@ui.refreshable
def sidebar_area():
    with ui.column().classes('w-full gap-0'):
        ui.label('CORE PIM').classes('group-label')
        sidebar_item('Dash Cataloghi', 'dashboard', 'dashboard')
        sidebar_item('Master ERP', 'database', 'products')
        sidebar_item('Import Lab', 'file_download', 'import', badge='AI')
        
        ui.label('ANAGRAFICHE MASTER').classes('group-label')
        sidebar_item('Brand', 'branding_watermark', 'brands')
        sidebar_item('Categorie', 'layers', 'categories')
        sidebar_item('Bullet Points', 'list', 'bullets')
        sidebar_item('Tags', 'sell', 'tags')

def sidebar_item(label: str, icon: str, page_name: str, badge: str = None):
    is_active = app_logic.active_page == page_name
    with ui.button(on_click=lambda: app_logic.navigate_to(page_name)).classes(f'w-full justify-start py-3 px-4 sidebar-item {"active" if is_active else "text-slate-500"}').props('flat no-caps'):
        with ui.row().classes('items-center gap-3 w-full'):
            ui.icon(icon).classes('text-lg opacity-70')
            ui.label(label).classes('text-[13px] tracking-tight')
            if badge:
                ui.space()
                with ui.element('span').classes('badge-red'):
                    ui.label(badge)

@ui.refreshable
async def content_area():
    if app_logic.loading:
        with ui.column().classes('w-full items-center justify-center p-20'):
            ui.spinner_ios(size='lg', color='primary')
            ui.label('SINCRONIZZAZIONE...').classes('text-slate-400 mt-4 font-black uppercase tracking-[0.2em] text-[10px]')
        return

    page = app_logic.active_page
    
    with ui.column().classes('max-w-7xl mx-auto w-full px-10 py-10 gap-8'):
        if page == 'dashboard':
            with ui.row().classes('w-full justify-between items-center mb-4'):
                with ui.column().classes('gap-1'):
                    ui.label('Dashboard Repository').classes('text-3xl font-black text-slate-900 tracking-tight')
                    ui.label('Collezioni e canali di importazione PDF.').classes('text-slate-400 text-sm font-medium')
                ui.button('NUOVO CATALOGO', icon='add').classes('rounded-xl px-8 py-4 bg-slate-900 text-white font-black text-xs shadow-lg').props('no-caps')
            
            with ui.grid(columns=3).classes('w-full gap-6'):
                for c in app_logic.data:
                    with ui.card().classes('main-card p-6 gap-4 product-card'):
                        with ui.row().classes('w-full justify-between items-start'):
                            ui.avatar('folder', color='blue-50', text_color='blue-600').classes('rounded-xl')
                            ui.badge('STAGING').props('outline color=blue-4')
                        ui.label(c['name']).classes('text-lg font-black text-slate-800 tracking-tight')
                        ui.label(f"Importati: {c.get('product_count', 0)}").classes('text-xs text-slate-400 font-bold')
                        ui.button('GESTISCI', color='primary').classes('w-full rounded-xl mt-2 font-black py-2 text-xs').props('no-caps')

        elif page == 'products':
            with ui.row().classes('w-full justify-between items-center mb-8'):
                with ui.column().classes('gap-1'):
                    ui.label('Master ERP Library').classes('text-3xl font-black text-slate-900 tracking-tight')
                    ui.label('Tutti i prodotti validati e pronti per l\'export.').classes('text-slate-400 text-sm font-medium')
                with ui.row().classes('gap-3'):
                    ui.input(placeholder='Cerca SKU o Nome...').props('rounded outlined dense').classes('w-64 bg-white')
                    ui.button(icon='tune', color='slate-200').props('flat round').classes('text-slate-500')

            # Listato Prodotti (Stile vecchia versione)
            with ui.column().classes('w-full gap-4'):
                if not app_logic.data:
                    ui.label('Nessun prodotto trovato.').classes('text-slate-400 italic py-10 text-center w-full')
                else:
                    for p in app_logic.data:
                        with ui.card().classes('main-card p-0 product-card hover:border-blue-500').on('click', lambda p=p: app_logic.open_product_detail(p['sku'])):
                            with ui.row().classes('items-center w-full p-4 gap-6'):
                                # Image Small Preview
                                with ui.element('div').classes('w-20 h-20 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100'):
                                    if p.get('imageUrl'):
                                        ui.image(p['imageUrl']).classes('w-full h-full object-contain')
                                    else:
                                        ui.icon('inventory_2', size='lg').classes('text-slate-200')
                                
                                with ui.column().classes('flex-1 gap-1'):
                                    ui.label(p['sku']).classes('text-[10px] font-black text-blue-500 tracking-widest uppercase')
                                    ui.label(p['title']).classes('text-sm font-black text-slate-900 truncate max-w-md')
                                    ui.row([
                                        ui.badge(p['brand'] or 'No Brand').props('outline color=slate-4 font-bold text-[10px]').classes('px-2'),
                                        ui.badge(p['category'] or 'Uncategorized').props('outline color=slate-4 font-bold text-[10px]').classes('px-2')
                                    ]).classes('gap-2')
                                
                                with ui.column().classes('items-end gap-1'):
                                    ui.label('PREZZO MSRP').classes('text-[9px] font-black text-slate-400 tracking-widest')
                                    ui.label(f"€ {p['price'] or 0.0:.2f}").classes('text-lg font-black text-slate-900')
                                
                                ui.icon('chevron_right').classes('text-slate-300 ml-4')

@ui.refreshable
def modal_content():
    if app_logic.product_detail_loading:
        with ui.column().classes('w-full h-[600px] items-center justify-center'):
            ui.spinner_ios(size='lg', color='primary')
            ui.label('ACCESSO SCHEDA...').classes('text-slate-400 mt-4 font-black text-[10px] tracking-widest')
        return

    p = app_logic.selected_product
    if not p:
        return

    # LAYOUT VECCHIA SCHEDA PRODOTTO (Bitrix Style Detailed)
    with ui.column().classes('w-full h-full gap-0'):
        # Modal Header Top
        with ui.row().classes('w-full p-8 border-b border-slate-100 bg-slate-50/50 justify-between items-center'):
            with ui.row().classes('items-center gap-5'):
                with ui.element('div').classes('p-4 bg-slate-900 rounded-2xl shadow-xl'):
                    ui.icon('inventory_2', color='white', size='md')
                with ui.column().classes('gap-0'):
                    ui.label(p['sku']).classes('text-[11px] font-black text-blue-500 tracking-[0.3em] uppercase')
                    ui.label(p['translations'].get('it', {}).get('title', 'Untitled Product')).classes('text-2xl font-black text-slate-900 tracking-tighter')
            
            with ui.row().classes('gap-3'):
                ui.button('AI RE-WRITE', icon='auto_awesome').classes('rounded-xl bg-blue-500 text-white font-black px-6').props('no-caps shadow-lg')
                ui.button(on_click=product_modal.close, icon='close').classes('bg-white border text-slate-400').props('flat round')

        # Modal Content with Tabs
        with ui.row().classes('w-full flex-1 overflow-hidden h-[70vh]'):
            # Left Sidebar Tabs
            with ui.column().classes('w-64 bg-slate-50 border-r border-slate-100 p-6 gap-2'):
                ui.button('Informazioni Base', icon='info').classes('w-full justify-start rounded-xl py-4 font-bold active bg-white shadow-sm border').props('no-caps flat')
                ui.button('Media & Asset', icon='image').classes('w-full justify-start rounded-xl py-4 font-bold text-slate-400').props('no-caps flat')
                ui.button('SEO Dashboard', icon='language').classes('w-full justify-start rounded-xl py-4 font-bold text-slate-400').props('no-caps flat')
                ui.button('Attributi EAV', icon='layers').classes('w-full justify-start rounded-xl py-4 font-bold text-slate-400').props('no-caps flat')
                ui.button('Integrazione Woo', icon='sync').classes('w-full justify-start rounded-xl py-4 font-bold text-slate-400').props('no-caps flat')
            
            # Content Right
            with ui.scroll_area().classes('flex-1 p-10 bg-white'):
                with ui.column().classes('w-full gap-10'):
                    # Grid Information
                    with ui.grid(columns=2).classes('w-full gap-10'):
                        with ui.column().classes('gap-6'):
                            ui.label('METADATI GENERALI').classes('text-[10px] font-black text-slate-400 tracking-[0.2em]')
                            with ui.column().classes('w-full gap-4'):
                                ui.input('Titolo Prodotto (IT)', value=p['translations'].get('it', {}).get('title', '')).classes('w-full').props('outlined rounded')
                                ui.textarea('Descrizione (IT)', value=p['translations'].get('it', {}).get('description', '')).classes('w-full').props('outlined rounded')
                        
                        with ui.column().classes('gap-6'):
                            ui.label('ORGANIZZAZIONE').classes('text-[10px] font-black text-slate-400 tracking-[0.2em]')
                            with ui.grid(columns=2).classes('w-full gap-4'):
                                ui.select(options=['Brand 1', 'Brand 2'], label='Brand', value=p.get('brand')).classes('w-full').props('outlined rounded')
                                ui.input('EAN Code', value=p.get('ean', '')).classes('w-full').props('outlined rounded')
                            ui.select(options=['Cat 1', 'Cat 2'], label='Categoria Primaria', value=p.get('category')).classes('w-full').props('outlined rounded')

                    ui.separator()
                    
                    # Bullet Points Area
                    ui.label('CARATTERISTICHE PRINCIPALI (BULLET POINTS)').classes('text-[10px] font-black text-slate-400 tracking-[0.2em]')
                    ui.textarea(value=p['translations'].get('it', {}).get('bulletPoints', '')).classes('w-full').props('outlined rounded autogrow')

        # Modal Footer
        with ui.row().classes('w-full p-8 border-t border-slate-100 justify-between items-center bg-white'):
            ui.label('Draft salvato 2 min fa').classes('text-[10px] font-bold text-slate-300 uppercase italic')
            with ui.row().classes('gap-4'):
                ui.button('CHIUDI', on_click=product_modal.close).classes('bg-slate-50 text-slate-900 border font-black px-8 py-3 rounded-2xl').props('no-caps flat')
                ui.button('ESEGUI SALVATAGGIO', icon='save').classes('bg-slate-900 text-white font-black px-10 py-3 rounded-2xl shadow-xl').props('no-caps')

with ui.dialog().classes('w-full max-w-[1200px]') as product_modal:
    with ui.card().classes('p-0 w-full overflow-hidden rounded-[2.5rem] bg-white'):
        modal_content()

@ui.page('/')
async def main_page():
    setup_styles()
    
    with ui.header().classes('bg-white/80 backdrop-blur-md text-slate-800 border-b border-slate-200 px-10 py-3 flex justify-between items-center z-10'):
        ui.label('INDUSTRIAL DATA ENGINE V5').classes('text-[9px] font-black opacity-30 uppercase tracking-[0.3em]')
        with ui.row().classes('items-center gap-6'):
            ui.avatar('AG').classes('text-[10px] bg-slate-900 text-white font-black shadow-md border-2 border-slate-100')

    with ui.left_drawer(value=True, fixed=True).classes('p-6 flex flex-col gap-0 shadow-sm overflow-hidden'):
        with ui.row().classes('items-center gap-4 mb-8 px-2'):
            with ui.element('div').classes('w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-white shadow-lg'):
                ui.label('CH').classes('text-xs')
            with ui.column().classes('gap-0'):
                ui.label('ContentHunter').classes('text-lg font-black tracking-tighter text-slate-900 leading-none')
                ui.label('PIM SYSTEM V.5').classes('text-[8px] font-bold text-blue-500 mt-1 tracking-[0.2em] uppercase')
        sidebar_area()
        ui.space()
        with ui.card().classes('bg-slate-900 p-4 rounded-2xl mb-4 cursor-pointer hover:bg-slate-800 transition-all'):
            with ui.row().classes('items-center gap-3'):
                ui.avatar('memory', color='white', text_color='slate-900').classes('rounded-lg shadow-sm')
                with ui.column().classes('gap-0'):
                    ui.label('AI Hub').classes('text-[11px] font-black text-white')
                    ui.label('GPT-4o Ready').classes('text-[8px] font-bold text-blue-400 uppercase tracking-widest')

    with ui.column().classes('flex-1 w-full bg-[#F4F7F9] min-h-screen'):
        await content_area()
        if not app_logic.data and not app_logic.loading:
            await app_logic.navigate_to('dashboard')

ui.run(title=TITLE, port=3001, host='0.0.0.0')
